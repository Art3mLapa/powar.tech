import { createHash } from 'node:crypto'
import { mkdir, readdir, rename } from 'node:fs/promises'
import { extname, relative, resolve } from 'node:path'
import { db } from '@bscp/database'
import {
	category,
	type Manifest,
	type ManifestFile,
	parseTorrentData,
	safeGamePath,
} from '@bscp/game-assets'
import { ingestManifest } from './patches'
import { processRender } from './render'
import { storageRoot } from './storage'

const [command, input, ...rest] = process.argv.slice(2),
	prefixInput = rest[0] ?? 'assets/local',
	region = (command === 'import-directory' ? rest[1] : rest[0]) ?? 'RU'
const supportedCommands = [
	'import-directory',
	'import-torrent',
	'import-json',
	'import-archive',
	'render-spike',
]
function legacyFile(path: string, meta: Record<string, unknown>): ManifestFile {
	const hashRaw = String(meta.File_Hash ?? meta.hash ?? '')
		.toLowerCase()
		.replace(/^0x/, '')
	if (!/^[a-f0-9]{1,40}$/.test(hashRaw))
		throw new Error(`Invalid legacy hash for ${path}`)
	const hash = hashRaw.padStart(40, '0'),
		size = String(meta.File_Size ?? meta.size ?? '')
	if (!/^\d+$/.test(size)) throw new Error(`Invalid legacy size for ${path}`)
	const url = String(
		meta.File_URL ?? meta.url ?? `https://exbo.b-cdn.net/stalcraft/${hash}`
	)
	return {
		path: safeGamePath(path),
		size,
		hash,
		url,
		category: category(path),
	}
}
function flattenLegacy(value: unknown, prefix = ''): ManifestFile[] {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return []
	const result: ManifestFile[] = []
	for (const [key, child] of Object.entries(value)) {
		const path = prefix ? `${prefix}/${key}` : key
		if (
			child &&
			typeof child === 'object' &&
			!Array.isArray(child) &&
			('File_URL' in child || 'File_Hash' in child || 'hash' in child)
		)
			result.push(legacyFile(path, child as Record<string, unknown>))
		else result.push(...flattenLegacy(child, path))
	}
	return result
}
function manifestFromLegacy(payload: unknown): ManifestFile[] {
	if (
		payload &&
		typeof payload === 'object' &&
		!Array.isArray(payload) &&
		Array.isArray((payload as Record<string, unknown>).files)
	)
		return ((payload as Record<string, unknown>).files as unknown[]).map(
			(item) => {
				if (!item || typeof item !== 'object')
					throw new Error('Invalid legacy file entry')
				const value = item as Record<string, unknown>
				return legacyFile(String(value.path ?? ''), value)
			}
		)
	return flattenLegacy(payload)
}
function makeManifest(files: ManifestFile[], name: string): Manifest {
	return {
		hash: createHash('sha256').update(JSON.stringify(files)).digest('hex'),
		name,
		comment: 'Legacy JSON import',
		reserved: '',
		files: files.sort((a, b) => a.path.localeCompare(b.path)),
	}
}
try {
	if (command === 'render-spike')
		console.info(JSON.stringify(await processRender()))
	else {
		if (!input || !supportedCommands.includes(command ?? ''))
			throw new Error(
				'Usage: import-directory <directory> [game-prefix] [RU|GLOBAL] | import-torrent <torrentData> [RU|GLOBAL] | import-json <json> [RU|GLOBAL] | import-archive <json> [RU|GLOBAL] | render-spike'
			)
		if (!['RU', 'GLOBAL'].includes(region))
			throw new Error('Invalid region')
		if (command === 'import-torrent') {
			const inputFile = Bun.file(resolve(input))
			if (inputFile.size > 64 * 1024 * 1024)
				throw new Error('torrentData exceeds limit')
			const bytes = Buffer.from(await inputFile.arrayBuffer())
			console.info(
				JSON.stringify(
					await ingestManifest(parseTorrentData(bytes), region, bytes)
				)
			)
		} else if (command === 'import-json' || command === 'import-archive') {
			const payload = JSON.parse(await Bun.file(resolve(input)).text()),
				files = manifestFromLegacy(payload)
			if (files.length) {
				console.info(
					JSON.stringify(
						await ingestManifest(
							makeManifest(files, command),
							region
						)
					)
				)
			} else {
				if (
					command !== 'import-archive' ||
					!payload ||
					typeof payload !== 'object'
				)
					throw new Error('Legacy JSON contains no file entries')
				const archive = payload as Record<string, unknown>,
					previous = await db.orm.public.GameSnapshot.where({
						region,
					})
						.orderBy((snapshot) => snapshot.createdAt.desc())
						.first()
				if (!previous)
					throw new Error('Archive diff requires a previous snapshot')
				const current = new Map(
					(
						await db.orm.public.GameFile.where({
							snapshotId: previous.id,
						}).all()
					).map((file) => [
						file.path,
						{
							path: file.path,
							size: String(file.size),
							hash: file.hash,
							url: file.url,
							category: file.category,
						},
					])
				)
				const apply = (entries: unknown) => {
					for (const entry of Array.isArray(entries) ? entries : []) {
						if (!entry || typeof entry !== 'object') continue
						const item = entry as Record<string, unknown>,
							value = (item.new ?? item.file ?? item) as Record<
								string,
								unknown
							>,
							path = String(item.path ?? value.path ?? '')
						if (!path) continue
						current.set(path, legacyFile(path, value))
					}
				}
				apply(archive.added)
				apply(archive.changed)
				for (const entry of Array.isArray(
					archive.removed ?? archive.deleted
				)
					? ((archive.removed ?? archive.deleted) as unknown[])
					: []) {
					const item =
						entry && typeof entry === 'object'
							? (entry as Record<string, unknown>)
							: {}
					if (typeof item.path === 'string') current.delete(item.path)
				}
				if (!current.size)
					throw new Error('Archive diff produced no files')
				console.info(
					JSON.stringify(
						await ingestManifest(
							makeManifest(
								[...current.values()],
								'legacy-archive'
							),
							region
						)
					)
				)
			}
		} else {
			const root = resolve(input),
				prefix = safeGamePath(prefixInput),
				files: ManifestFile[] = []
			await mkdir(resolve(storageRoot, 'sources'), { recursive: true })
			async function visit(dir: string, depth = 0) {
				if (depth > 20) throw new Error('Directory nesting limit')
				for (const entry of await readdir(dir, {
					withFileTypes: true,
				})) {
					const path = resolve(dir, entry.name)
					if (entry.isDirectory()) {
						await visit(path, depth + 1)
						continue
					}
					if (
						!entry.isFile() ||
						![
							'.mcsb',
							'.mcsa',
							'.mcvd',
							'.ol',
							'.mic',
							'.texarr',
							'.lang',
							'.png',
							'.jpg',
							'.webp',
						].includes(extname(entry.name).toLowerCase())
					)
						continue
					const file = Bun.file(path)
					if (file.size > 512 * 1024 * 1024)
						throw new Error('Source exceeds size limit')
					const data = Buffer.from(await file.arrayBuffer()),
						hash = createHash('sha1').update(data).digest('hex'),
						gamePath = safeGamePath(
							`${prefix}/${relative(root, path).replaceAll('\\', '/')}`
						)
					const tmp = resolve(
						storageRoot,
						'sources',
						`${crypto.randomUUID()}.tmp`
					)
					await Bun.write(tmp, data)
					await rename(tmp, resolve(storageRoot, 'sources', hash))
					files.push({
						path: gamePath,
						size: String(data.length),
						hash,
						url: `https://exbo.b-cdn.net/stalcraft/${hash}`,
						category: category(gamePath),
					})
					if (files.length > 100000)
						throw new Error('Import file limit')
				}
			}
			await visit(root)
			files.sort((a, b) => a.path.localeCompare(b.path))
			if (!files.length) throw new Error('No supported assets found')
			const hash = createHash('sha256')
				.update(JSON.stringify(files))
				.digest('hex')
			console.info(
				JSON.stringify(
					await ingestManifest(
						{
							hash,
							name: 'local-import',
							comment: 'Local asset import',
							reserved: '',
							files,
						},
						region
					)
				)
			)
		}
	}
} finally {
	await db.close()
}
