import { db } from '@bscp/database'
import {
	diffManifests,
	fetchBuffer,
	type Manifest,
	type ManifestFile,
	parseTorrentData,
} from '@bscp/game-assets'
import { assertPatchUpdateLimit, patchUpdateBytes } from './patch-limits'
import { storeAsset } from './storage'

const tokens = new Map<string, string>()
export async function launcherToken(region: string, renew = false) {
	const key = region === 'GLOBAL' ? 'GLOBAL_AUTH_LINK' : 'AUTH_LINK',
		link = process.env[key]
	if (!link) throw new Error(`${key} is not configured`)
	if (!renew) {
		const cached = tokens.get(region)
		if (cached) return cached
	}
	const data = JSON.parse((await fetchBuffer(link, 1024 * 1024)).toString())
	if (typeof data.token !== 'string')
		throw new Error('Launcher did not return token')
	tokens.set(region, data.token)
	return data.token
}
export async function syncPatch(region: string) {
	const login = process.env[region === 'GLOBAL' ? 'GLOBAL_LOGIN' : 'LOGIN']
	if (!login) throw new Error('Launcher login not configured')
	const host =
		region === 'GLOBAL'
			? 'launcher-global.stalcraft.net'
			: 'launcher.stalcraft.net'
	let bytes: Buffer | null = null
	for (const renew of [false, true]) {
		try {
			const token = await launcherToken(region, renew)
			const url = new URL(`http://${host}/torrentData`)
			url.search = new URLSearchParams({
				id: 'stalcraft',
				token,
				login,
			}).toString()
			bytes = await fetchBuffer(url.href)
			break
		} catch {
			if (renew)
				throw new Error('Launcher authentication/download failed')
		}
	}
	if (!bytes) throw new Error('Empty torrentData')
	const manifest = parseTorrentData(bytes)
	return ingestManifest(manifest, region, bytes, { enforceUpdateLimit: true })
}
export async function ingestManifest(
	manifest: Manifest,
	region: string,
	source?: Buffer,
	options: { enforceUpdateLimit?: boolean } = {}
) {
	const result = await db.transaction(async (tx) => {
		await tx.query(
			tx.raw
				.sql`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`patch:${region}`}))`
				.returnsRow({ locked: 'pg/int4@1' })
				.build()
		)
		const exists = await tx.orm.public.GameSnapshot.first({
			region,
			manifestHash: manifest.hash,
		})
		if (exists) return { snapshotId: exists.id, unchanged: true }
		const previous = await tx.orm.public.GameSnapshot.where({ region })
			.orderBy((s) => s.createdAt.desc())
			.first()
		const oldFiles: ManifestFile[] = previous
			? (
					await tx.orm.public.GameFile.where({
						snapshotId: previous.id,
					}).all()
				).map((f) => ({ ...f, size: String(f.size) }))
			: []
		const changes = diffManifests(oldFiles, manifest.files)
		if (options.enforceUpdateLimit)
			assertPatchUpdateLimit(patchUpdateBytes(oldFiles, manifest.files))
		const id = crypto.randomUUID()
		await tx.orm.public.GameSnapshot.create({
			id,
			region,
			manifestHash: manifest.hash,
			previousId: previous?.id ?? null,
		})
		const files = manifest.files.map((file) => ({
			...file,
			id: crypto.randomUUID(),
			snapshotId: id,
			size: BigInt(file.size),
		}))
		for (let offset = 0; offset < files.length; offset += 1000)
			await tx.execute(
				tx.sql.public.GameFile.insert(
					files.slice(offset, offset + 1000)
				).build()
			)
		for (let offset = 0; offset < changes.length; offset += 1000) {
			const rows = changes.slice(offset, offset + 1000).map((change) => ({
				id: crypto.randomUUID(),
				snapshotId: id,
				path: change.path,
				kind: change.kind,
				category: change.category,
				oldValue: change.oldValue
					? JSON.stringify(change.oldValue)
					: null,
				newValue: change.newValue
					? JSON.stringify(change.newValue)
					: null,
			}))
			await tx.execute(tx.sql.public.GameChange.insert(rows).build())
		}
		const changed = new Set(
				changes.filter((c) => c.kind !== 'REMOVED').map((c) => c.path)
			),
			jobs = new Map<
				string,
				{ id: string; kind: string; dedupeKey: string; payload: string }
			>()
		for (const file of files) {
			if (!changed.has(file.path)) continue
			const kind =
				file.category === 'localization'
					? 'LOCALIZATION'
					: /\.(mcsb|mcsa|mcvd|mcmtl)$/i.test(file.path)
						? 'ASSET'
						: null
			if (!kind) continue
			const dedupeKey =
				kind === 'LOCALIZATION'
					? `lang:${id}:${file.path}`
					: `asset:v1:${id}:${file.hash}`
			jobs.set(dedupeKey, {
				id: crypto.randomUUID(),
				kind,
				dedupeKey,
				payload: JSON.stringify(
					kind === 'LOCALIZATION'
						? { snapshotId: id, path: file.path }
						: { fileId: file.id }
				),
			})
		}
		const rows = [...jobs.values()]
		for (let offset = 0; offset < rows.length; offset += 1000)
			await tx.execute(
				tx.sql.public.Job.insert(
					rows.slice(offset, offset + 1000)
				).build()
			)
		return { snapshotId: id, changes: changes.length, files: files.length }
	})
	if (source)
		await storeAsset(
			source,
			`${region}-torrentData`,
			'application/octet-stream',
			result.snapshotId
		)
	return result
}
