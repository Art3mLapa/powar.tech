import { createHash } from 'node:crypto'
import { db } from '@bscp/database'
import {
	type BalanceRegistries,
	balanceCategory,
	defaultBalanceRegistries,
	diffValues,
	fetchBuffer,
	mergeMap,
	parseBalanceItem,
	parseLang,
	parseServersResponse,
	readZip,
	regionCoordinates,
	selectMapRegions,
} from '@bscp/game-assets'
import { launcherToken } from './patches'
import { loadGameFile } from './source'
import { storeAsset } from './storage'

const downloadAsset = (url: string, size: bigint, hash: string) =>
	loadGameFile({ url, size, hash })

async function dataSnapshot(
	kind: string,
	region: string,
	sourceHash: string,
	data: unknown,
	extra: Record<string, unknown> = {}
) {
	return db.transaction(async (tx) => {
		await tx.query(
			tx.raw
				.sql`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`data:${kind}:${region}`}))`
				.returnsRow({ locked: 'pg/int4@1' })
				.build()
		)
		const current = await tx.orm.public.DataSnapshot.first({
			kind,
			region,
			sourceHash,
		})
		if (current) return { id: current.id, unchanged: true }
		const previous = await tx.orm.public.DataSnapshot.where({
			kind,
			region,
		})
			.orderBy((s) => s.createdAt.desc())
			.first()
		const before = previous ? JSON.parse(previous.data).value : undefined
		const result = {
			...extra,
			value: data,
			changes: diffValues(before ?? {}, data),
		}
		const row = await tx.orm.public.DataSnapshot.create({
			id: crypto.randomUUID(),
			kind,
			region,
			sourceHash,
			data: JSON.stringify(result),
			previousId: previous?.id ?? null,
		})
		return { id: row.id, changes: result.changes.length }
	})
}
export async function syncLocalization(snapshotId: string, path: string) {
	const file = await db.orm.public.GameFile.first({ snapshotId, path })
	if (!file) throw new Error('Localization file not found')
	const snapshot = await db.orm.public.GameSnapshot.first({ id: snapshotId })
	if (!snapshot) throw new Error('Snapshot missing')
	const data = await downloadAsset(file.url, file.size, file.hash)
	return dataSnapshot(
		'LOCALIZATION',
		`${snapshot.region}:${path}`,
		file.hash,
		parseLang(data.toString('utf8'))
	)
}
export async function syncBalance() {
	const commit = JSON.parse(
		(
			await fetchBuffer(
				'https://api.github.com/repos/EXBO-Studio/stalcraft-database/commits?per_page=1',
				1024 * 1024
			)
		).toString()
	)[0]?.sha
	if (typeof commit !== 'string' || !/^[a-f0-9]{40}$/.test(commit))
		throw new Error('Invalid database commit')
	const current = await db.orm.public.DataSnapshot.first({
		kind: 'BALANCE',
		region: 'RU',
		sourceHash: commit,
	})
	if (current) return { id: current.id, unchanged: true }
	const zip = await fetchBuffer(
		`https://codeload.github.com/EXBO-Studio/stalcraft-database/zip/${commit}`,
		200 * 1024 * 1024
	)
	const entries = readZip(
			zip,
			(path) =>
				/\/ru\/items\/.*\.json$/.test(path) &&
				balanceCategory(path) !== null
		),
		items: Record<string, unknown> = {}
	const previous = await db.orm.public.DataSnapshot.where({
		kind: 'BALANCE',
		region: 'RU',
	})
		.orderBy((s) => s.createdAt.desc())
		.first()
	const registries: BalanceRegistries = previous
		? (JSON.parse(previous.data).registries ?? {})
		: {}
	for (const entry of entries) {
		const path = entry.path.split('/ru/')[1]
		if (!path) continue
		const kind = balanceCategory(path)
		if (!kind) continue
		let registry = registries[kind]
		if (!registry) {
			registry = { ...defaultBalanceRegistries[kind] }
			registries[kind] = registry
		}
		items[path.replace(/^items\//, '')] = parseBalanceItem(
			JSON.parse(entry.data.toString()),
			kind,
			'ru',
			registry
		)
	}
	if (!entries.length)
		throw new Error('Database archive contains no supported items')
	return dataSnapshot('BALANCE', 'RU', commit, items, {
		registries,
		parserVersion: 2,
	})
}
export async function syncServers(region: string) {
	const login = process.env[region === 'GLOBAL' ? 'GLOBAL_LOGIN' : 'LOGIN']
	if (!login) throw new Error('Launcher login not configured')
	const host =
		region === 'GLOBAL'
			? 'launcher-global.stalcraft.net'
			: 'launcher.stalcraft.net'
	for (const renew of [false, true]) {
		try {
			const token = await launcherToken(region, renew),
				url = new URL(`http://${host}/listServers`)
			url.search = new URLSearchParams({
				full: 'true',
				token,
				login,
			}).toString()
			const data = parseServersResponse(
					JSON.parse(
						(
							await fetchBuffer(url.href, 4 * 1024 * 1024)
						).toString()
					)
				),
				row = await db.orm.public.ServerSample.create({
					id: crypto.randomUUID(),
					region,
					data: JSON.stringify(data),
				})
			return { id: row.id, servers: data.length }
		} catch {
			if (renew)
				throw new Error('Launcher authentication/server list failed')
		}
	}
	throw new Error('Server list unavailable')
}
export async function buildMap(
	snapshotId: string,
	preset: string,
	paths?: string[]
) {
	const files = await db.orm.public.GameFile.where({ snapshotId }).all(),
		requested = paths ? new Set(paths) : null
	const candidates = files.filter((file) => {
		if (
			!regionCoordinates(file.path) ||
			!/\.(ol|mic|png|jpe?g)$/i.test(file.path)
		)
			return false
		if (requested) return requested.has(file.path)
		return file.category === 'maps' || /\/pda\/map[^/]*\//i.test(file.path)
	})
	if (requested && candidates.length !== requested.size)
		throw new Error('Requested map regions are missing')
	const selected = selectMapRegions(candidates, preset),
		coordinates = new Set(selected.map((file) => `${file.x},${file.z}`))
	if (!selected.length || selected.length > 500)
		throw new Error('Map must contain 1–500 regions')
	if (coordinates.size !== selected.length)
		throw new Error('Map contains duplicate regions')
	const regions: { path: string; data: Buffer }[] = []
	for (const file of selected)
		regions.push({
			path: file.path,
			data: await downloadAsset(file.url, file.size, file.hash),
		})
	const image = await mergeMap(regions, preset, false),
		name = `map-${preset || 'full'}.png`,
		assetId = await storeAsset(image, name, 'image/png', snapshotId)
	return {
		snapshotId,
		preset,
		assetId,
		name,
		hash: createHash('sha256').update(image).digest('hex'),
	}
}
export async function buildMapDiff(
	snapshotId: string,
	mode: 'added' | 'removed' | 'changed',
	preset = ''
) {
	const snapshot = await db.orm.public.GameSnapshot.first({ id: snapshotId })
	if (!snapshot) throw new Error('Snapshot missing')
	const kind =
		mode === 'added' ? 'ADDED' : mode === 'removed' ? 'REMOVED' : 'CHANGED'
	const changes = await db.orm.public.GameChange.where({
		snapshotId,
		kind,
	}).all()
	const paths = [
		...new Set(
			changes
				.filter(
					(c) =>
						regionCoordinates(c.path) &&
						/\/pda\/map[^/]*\//i.test(c.path)
				)
				.map((c) => c.path)
		),
	]
	if (!paths.length) throw new Error('No map changes for this mode')
	if (mode === 'added')
		return { mode, after: await buildMap(snapshotId, preset, paths) }
	if (!snapshot.previousId) throw new Error('Previous map snapshot missing')
	const before = await buildMap(snapshot.previousId, preset, paths)
	return mode === 'removed'
		? { mode, before }
		: { mode, before, after: await buildMap(snapshotId, preset, paths) }
}
