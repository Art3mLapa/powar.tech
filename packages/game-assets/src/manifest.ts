import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { BinaryReader, safeGamePath } from './binary'

export type ManifestFile = {
	path: string
	size: string
	hash: string
	url: string
	category: string
}
export type Manifest = {
	hash: string
	name: string
	comment: string
	reserved: string
	files: ManifestFile[]
}
export function category(path: string) {
	if (
		/(?:^|\/)pda\/map[^/]*\/(?:.*\/)?r\.-?\d+\.-?\d+\.(ol|mic)$/i.test(path)
	)
		return 'maps'
	if (/\.(mcsb|mcsa|mcvd|glb)$/i.test(path)) return 'models'
	if (/\.(ol|dds|texarr)$/i.test(path)) return 'textures'
	if (/\.lang$/i.test(path)) return 'localization'
	if (/(?:map|region).*\.(mic|png|jpg)$/i.test(path)) return 'maps'
	if (/\.(png|jpg|webp|mic)$/i.test(path)) return 'images'
	return 'other'
}
export function parseTorrentData(input: Buffer): Manifest {
	if (input.length < 5 || input.length > 64 * 1024 * 1024)
		throw new Error('Invalid torrentData size')
	const buffer = gunzipSync(input.subarray(4), {
			maxOutputLength: 256 * 1024 * 1024,
		}),
		r = new BinaryReader(buffer)
	const total = r.u64(),
		comment = r.string(),
		trackers = r.count(1000)
	for (let i = 0; i < trackers; i++) r.string()
	const reserved = r.string()
	r.u32()
	const name = r.string(),
		count = r.count(),
		files: ManifestFile[] = [],
		paths = new Set<string>()
	let sizeSum = 0n
	for (let i = 0; i < count; i++) {
		const path = safeGamePath(r.string()),
			size = r.i64(),
			hash = r.bytes(20).toString('hex')
		if (size < 0n || paths.has(path))
			throw new Error('Invalid manifest file')
		paths.add(path)
		sizeSum += size
		files.push({
			path,
			size: String(size),
			hash,
			url: `${reserved}${name}/${hash.replace(/^0+/, '') || '0'}`,
			category: category(path),
		})
	}
	const pieceCount = r.count(20_000_000)
	if (r.buffer.length - r.offset !== pieceCount * 20)
		throw new Error('Invalid torrent piece hashes')
	r.bytes(pieceCount * 20)
	if (sizeSum !== total) throw new Error('Manifest total size mismatch')
	return {
		hash: createHash('sha256').update(input).digest('hex'),
		name,
		comment,
		reserved,
		files,
	}
}
export function diffManifests(
	oldFiles: ManifestFile[],
	newFiles: ManifestFile[]
) {
	const previous = new Map(oldFiles.map((f) => [f.path, f])),
		next = new Map(newFiles.map((f) => [f.path, f]))
	const result: {
		path: string
		kind: 'ADDED' | 'REMOVED' | 'CHANGED'
		category: string
		oldValue: ManifestFile | null
		newValue: ManifestFile | null
	}[] = []
	for (const file of newFiles) {
		const old = previous.get(file.path)
		if (!old)
			result.push({
				path: file.path,
				kind: 'ADDED',
				category: file.category,
				oldValue: null,
				newValue: file,
			})
		else if (old.hash !== file.hash || old.size !== file.size)
			result.push({
				path: file.path,
				kind: 'CHANGED',
				category: file.category,
				oldValue: old,
				newValue: file,
			})
	}
	for (const file of oldFiles)
		if (!next.has(file.path))
			result.push({
				path: file.path,
				kind: 'REMOVED',
				category: file.category,
				oldValue: file,
				newValue: null,
			})
	return result.sort((a, b) => a.path.localeCompare(b.path))
}
