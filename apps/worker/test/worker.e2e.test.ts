import { expect, test } from 'bun:test'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const databaseUrl =
	process.env.WORKER_TEST_DATABASE_URL ?? process.env.TEST_DATABASE_URL
const verificationRoot =
	process.env.WORKER_TEST_ROOT ??
	resolve(
		import.meta.dir,
		'../../../.runtime/worker-verification',
		randomUUID()
	)
const storageRoot = resolve(verificationRoot, 'storage')
const realAssetRoot = process.env.WORKER_ASSET_FIXTURE_ROOT ?? ''
const modelFixture = resolve(
	realAssetRoot,
	'weapons/models/weapons/6p62/6p62.mcsb'
)
const textureFixtures = [
	'6p62_1_diff.ol',
	'6p62_1_nrm.ol',
	'6p62_1_spek.ol',
	'6p62_2_diff.ol',
	'6p62_2_nrm.ol',
	'6p62_2_spek.ol',
].map((name) => resolve(realAssetRoot, 'weapons/models/weapons/6p62', name))
const mapFixtures = [
	resolve(realAssetRoot, 'pda/map/r.-11.-2.ol'),
	resolve(realAssetRoot, 'pda/map/r.-11.-3.ol'),
	resolve(realAssetRoot, 'pda/map/r.-11.-4.ol'),
]
const sha1 = (data: Buffer) => createHash('sha1').update(data).digest('hex')
const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex')
const pngDimensions = (data: Buffer) => {
	if (data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a')
		throw new Error('Expected PNG')
	return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) }
}

async function readBytes(path: string) {
	return Buffer.from(await Bun.file(path).arrayBuffer())
}
async function cacheSource(path: string) {
	const data = await readBytes(path),
		hash = sha1(data),
		target = resolve(storageRoot, 'sources', hash)
	await Bun.write(target, data)
	return {
		data,
		hash,
		size: String(data.length),
		url: `https://exbo.b-cdn.net/stalcraft/${hash}`,
	}
}
async function runCli(args: string[], env: Record<string, string>) {
	const child = Bun.spawn(
		[
			process.execPath,
			new URL('../src/cli.ts', import.meta.url).pathname,
			...args,
		],
		{ env: { ...process.env, ...env }, stdout: 'pipe', stderr: 'pipe' }
	)
	const stdout = await new Response(child.stdout).text(),
		stderr = await new Response(child.stderr).text(),
		code = await child.exited
	if (code !== 0)
		throw new Error(`CLI failed (${code}): ${stderr}\n${stdout}`)
	const line = stdout.trim().split('\n').at(-1)
	if (!line) throw new Error(`CLI produced no JSON: ${stderr}`)
	return JSON.parse(line) as { snapshotId: string }
}
async function storedBytes(
	db: typeof import('@bscp/database').db,
	assetId: string
) {
	const row = await db.orm.public.StoredAsset.first({ id: assetId })
	if (!row) throw new Error(`StoredAsset ${assetId} missing`)
	const data = await readBytes(resolve(storageRoot, row.storageKey))
	expect(BigInt(data.length)).toBe(row.size)
	expect(sha256(data)).toBe(row.storageKey.replace(/^game-/, ''))
	return { row, data }
}

test.skipIf(!databaseUrl || !realAssetRoot)(
	'worker isolated database E2E: queue, imports, real asset, maps and public endpoints',
	async () => {
		if (!databaseUrl || !realAssetRoot)
			throw new Error(
				'A fresh WORKER_TEST_DATABASE_URL and WORKER_ASSET_FIXTURE_ROOT are required'
			)
		process.env.DATABASE_URL = databaseUrl
		process.env.STORAGE_DIR = storageRoot
		await mkdir(resolve(storageRoot, 'sources'), { recursive: true })
		const { db } = await import('@bscp/database')
		const { claim, enqueue, fail, finish, heartbeat } = await import(
			'../src/queue'
		)
		const { ingestManifest } = await import('../src/patches')
		const { processAsset } = await import('../src/assets')
		const { buildMap, buildMapDiff } = await import('../src/data')
		const { category } = await import('@bscp/game-assets')
		try {
			if (
				(await db.orm.public.Job.first()) ||
				(await db.orm.public.GameSnapshot.first())
			)
				throw new Error(
					'Worker E2E requires an empty migrated database; create a separate database. Existing data was not modified.'
				)
			const retryId = randomUUID(),
				retryKey = `e2e:retry:${retryId}`
			await db.orm.public.Job.create({
				id: retryId,
				kind: 'E2E',
				dedupeKey: retryKey,
				payload: '{}',
				state: 'RUNNING',
				attempts: 1,
				leaseOwner: 'expired-owner',
				leaseUntil: new Date(Date.now() - 1000).toISOString(),
			})
			let claimed = await claim()
			expect(claimed?.id).toBe(retryId)
			expect(claimed?.state).toBe('RUNNING')
			expect(claimed?.attempts).toBe(2)
			expect(claimed?.leaseOwner).toBeTruthy()
			if (!claimed) throw new Error('Expired job was not reclaimed')
			await fail(claimed.id, claimed.attempts, false)
			await db.orm.public.Job.where({ id: claimed.id }).update({
				availableAt: new Date(Date.now() - 1000).toISOString(),
			})
			claimed = await claim()
			expect(claimed?.id).toBe(retryId)
			expect(claimed?.attempts).toBe(3)
			if (!claimed) throw new Error('Retry job was not reclaimed')
			await fail(claimed.id, claimed.attempts, false)
			const failed = await db.orm.public.Job.first({ id: retryId })
			expect(failed?.state).toBe('FAILED')
			expect(failed?.attempts).toBe(3)

			const done = await enqueue('E2E', `e2e:finish:${randomUUID()}`, {
					check: 'finish',
				}),
				doneClaim = await claim()
			expect(doneClaim?.id).toBe(done.id)
			if (!doneClaim) throw new Error('Finish job was not claimed')
			expect(await heartbeat(doneClaim.id)).toBeTruthy()
			await finish(doneClaim.id, { ok: true })
			const finished = await db.orm.public.Job.first({ id: doneClaim.id })
			expect(finished?.state).toBe('SUCCEEDED')
			expect(JSON.parse(finished?.result ?? '{}')).toEqual({ ok: true })

			const rollbackSnapshot = randomUUID(),
				rollbackKey = `e2e:rollback:${randomUUID()}`
			try {
				await db.transaction(async (tx) => {
					await tx.orm.public.GameSnapshot.create({
						id: rollbackSnapshot,
						region: 'ROLLBACK',
						manifestHash: rollbackKey,
					})
					await tx.orm.public.Job.create({
						id: randomUUID(),
						kind: 'E2E',
						dedupeKey: rollbackKey,
						payload: '{}',
					})
					throw new Error('forced transaction failure')
				})
			} catch (error) {
				expect(String(error)).toContain('forced transaction failure')
			}
			expect(
				await db.orm.public.GameSnapshot.first({ id: rollbackSnapshot })
			).toBeNull()
			expect(
				await db.orm.public.Job.first({ dedupeKey: rollbackKey })
			).toBeNull()

			const fixtureDir = resolve(verificationRoot, 'fixtures')
			await mkdir(fixtureDir, { recursive: true })
			const legacyA = Buffer.from('legacy-a'),
				legacyB = Buffer.from('legacy-b'),
				hashA = sha1(legacyA),
				hashB = sha1(legacyB)
			const legacyJson = resolve(fixtureDir, 'legacy.json')
			await Bun.write(
				legacyJson,
				JSON.stringify({
					'assets/e2e/test.mic': {
						File_Size: String(legacyA.length),
						File_Hash: hashA,
						File_URL: `https://exbo.b-cdn.net/stalcraft/${hashA}`,
					},
				})
			)
			const cliEnv = {
				DATABASE_URL: databaseUrl,
				STORAGE_DIR: storageRoot,
			}
			const imported = await runCli(
					['import-json', legacyJson, 'RU'],
					cliEnv
				),
				importedSnapshot = await db.orm.public.GameSnapshot.first({
					id: imported.snapshotId,
				})
			expect(importedSnapshot?.region).toBe('RU')
			expect(
				await db.orm.public.GameFile.where({
					snapshotId: imported.snapshotId,
				}).all()
			).toHaveLength(1)
			const archiveJson = resolve(fixtureDir, 'archive.json'),
				hashC = sha1(Buffer.from('legacy-c'))
			await Bun.write(
				archiveJson,
				JSON.stringify({
					changed: [
						{
							path: 'assets/e2e/test.mic',
							new: {
								File_Size: String(legacyB.length),
								File_Hash: hashB,
								File_URL: `https://exbo.b-cdn.net/stalcraft/${hashB}`,
							},
						},
					],
					added: [
						{
							path: 'assets/e2e/new.lang',
							new: {
								File_Size: '8',
								File_Hash: hashC,
								File_URL: `https://exbo.b-cdn.net/stalcraft/${hashC}`,
							},
						},
					],
					removed: [],
				})
			)
			const archived = await runCli(
					['import-archive', archiveJson, 'RU'],
					cliEnv
				),
				archiveSnapshot = await db.orm.public.GameSnapshot.first({
					id: archived.snapshotId,
				})
			expect(archiveSnapshot?.previousId).toBe(imported.snapshotId)
			expect(
				(
					await db.orm.public.GameChange.where({
						snapshotId: archived.snapshotId,
					}).all()
				)
					.map((change) => change.kind)
					.sort()
			).toEqual(['ADDED', 'CHANGED'])

			const modelSource = await cacheSource(modelFixture),
				textureSources = await Promise.all(
					textureFixtures.map(cacheSource)
				),
				modelPath = 'assets/weapons/models/weapons/6p62/6p62.mcsb',
				modelManifestFiles = [
					{
						path: modelPath,
						size: modelSource.size,
						hash: modelSource.hash,
						url: modelSource.url,
						category: category(modelPath),
					},
					...textureSources.map((source, index) => {
						const path = `assets/weapons/models/weapons/6p62/${textureFixtures[index].split('/').pop() ?? `texture-${index}.ol`}`
						return {
							path,
							size: source.size,
							hash: source.hash,
							url: source.url,
							category: category(path),
						}
					}),
				]
			const modelManifest = {
					hash: sha256(
						Buffer.from(JSON.stringify(modelManifestFiles))
					),
					name: 'e2e-6p62',
					comment: '',
					reserved: '',
					files: modelManifestFiles,
				},
				modelIngest = await ingestManifest(modelManifest, 'RU'),
				modelFile = (
					await db.orm.public.GameFile.where({
						snapshotId: modelIngest.snapshotId,
					}).all()
				).find((file) => file.path === modelPath)
			if (!modelFile) throw new Error('Real model GameFile missing')
			const assetJobs = (await db.orm.public.Job.all()).filter(
				(job) =>
					job.kind === 'ASSET' &&
					JSON.parse(job.payload).fileId === modelFile.id
			)
			expect(assetJobs).toHaveLength(1)
			let assetJob = await claim()
			while (assetJob && assetJob.id !== assetJobs[0]?.id) {
				await finish(assetJob.id, { drained: true })
				assetJob = await claim()
			}
			expect(assetJob?.id).toBe(assetJobs[0]?.id)
			if (!assetJob) throw new Error('Real ASSET job was not claimed')
			const assetResult = await processAsset(modelFile.id)
			await finish(assetJob.id, assetResult)
			const assetFinished = await db.orm.public.Job.first({
				id: assetJob.id,
			})
			expect(assetFinished?.state).toBe('SUCCEEDED')
			const assetNames = assetResult.outputs.map((output) => output.name)
			expect(assetNames).toContain('6p62.mcsb')
			expect(assetNames).toContain('6p62.glb')
			expect(
				assetNames.filter(
					(name) => name.endsWith('.png') && !name.includes('collage')
				)
			).toHaveLength(2)
			expect(assetNames.some((name) => name.includes('collage'))).toBe(
				true
			)
			for (const output of assetResult.outputs) {
				const asset = await storedBytes(db, output.assetId)
				if (output.name === '6p62.mcsb')
					expect(sha1(asset.data)).toBe(modelSource.hash)
				if (output.name === '6p62.glb')
					expect(asset.data.subarray(0, 4).toString()).toBe('glTF')
				if (
					output.name.endsWith('.png') &&
					!output.name.includes('collage')
				)
					expect(pngDimensions(asset.data)).toEqual({
						width: 1024,
						height: 1024,
					})
			}

			const mapSources = await Promise.all(mapFixtures.map(cacheSource)),
				mapPath = (index: number) =>
					`assets/pda/map/${mapFixtures[index].split('/').pop() ?? `r.-11.-${index + 2}.ol`}`,
				mapManifest = (
					entries: {
						path: string
						source: {
							data: Buffer
							hash: string
							size: string
							url: string
						}
					}[],
					name: string
				) => ({
					hash: sha256(
						Buffer.from(
							name +
								JSON.stringify(
									entries.map((entry) => [
										entry.path,
										entry.source.hash,
									])
								)
						)
					),
					name,
					comment: '',
					reserved: '',
					files: entries.map((entry) => ({
						path: entry.path,
						size: entry.source.size,
						hash: entry.source.hash,
						url: entry.source.url,
						category: 'maps',
					})),
				}),
				mapA = { path: mapPath(0), source: mapSources[0] },
				mapB = { path: mapPath(0), source: mapSources[1] },
				mapC = { path: mapPath(1), source: mapSources[2] }
			if (!mapA.source || !mapB.source || !mapC.source)
				throw new Error('Map fixture missing')
			const previousMap = await ingestManifest(
					mapManifest([mapA], 'map-before'),
					'GLOBAL'
				),
				changedMap = await ingestManifest(
					mapManifest([mapB], 'map-changed'),
					'GLOBAL'
				),
				fullMap = await buildMap(changedMap.snapshotId, '')
			expect(
				(await storedBytes(db, fullMap.assetId)).data
					.subarray(0, 8)
					.toString('hex')
			).toBe('89504e470d0a1a0a')
			const presetMap = await buildMap(changedMap.snapshotId, 'zone')
			expect(
				pngDimensions((await storedBytes(db, presetMap.assetId)).data)
					.width
			).toBeLessThan(
				pngDimensions((await storedBytes(db, fullMap.assetId)).data)
					.width
			)
			const changedDiff = await buildMapDiff(
				changedMap.snapshotId,
				'changed'
			)
			expect(changedDiff.mode).toBe('changed')
			if (!('before' in changedDiff) || !('after' in changedDiff))
				throw new Error('Changed map diff missing old/new')
			expect(
				(await storedBytes(db, changedDiff.before.assetId)).data
					.subarray(0, 8)
					.toString('hex')
			).toBe('89504e470d0a1a0a')
			expect(
				(await storedBytes(db, changedDiff.after.assetId)).data
					.subarray(0, 8)
					.toString('hex')
			).toBe('89504e470d0a1a0a')
			const addedMap = await ingestManifest(
					mapManifest([mapB, mapC], 'map-added'),
					'GLOBAL'
				),
				addedDiff = await buildMapDiff(addedMap.snapshotId, 'added')
			expect(addedDiff.mode).toBe('added')
			const removedMap = await ingestManifest(
					mapManifest([mapB], 'map-removed'),
					'GLOBAL'
				),
				removedDiff = await buildMapDiff(
					removedMap.snapshotId,
					'removed'
				)
			expect(removedDiff.mode).toBe('removed')
			if (!('before' in removedDiff))
				throw new Error('Removed map diff missing before')
			expect(
				(await storedBytes(db, removedDiff.before.assetId)).data
					.subarray(0, 8)
					.toString('hex')
			).toBe('89504e470d0a1a0a')
			expect(previousMap.snapshotId).not.toBe(changedMap.snapshotId)

			const controller = new AbortController()
			const timeout = setTimeout(() => controller.abort(), 10000)
			let githubStatus = 'blocked'
			try {
				const response = await fetch(
					'https://api.github.com/repos/EXBO-Studio/stalcraft-database/commits?per_page=1',
					{
						headers: { accept: 'application/vnd.github+json' },
						signal: controller.signal,
					}
				)
				githubStatus = String(response.status)
				if (response.ok) {
					const body = (await response.json()) as Array<{
						sha?: string
					}>
					expect(body[0]?.sha).toMatch(/^[a-f0-9]{40}$/)
				}
			} catch (error) {
				githubStatus = `blocked:${error instanceof Error ? error.name : 'unknown'}`
			} finally {
				clearTimeout(timeout)
			}
			console.info(
				`[worker-e2e] public balance endpoint: ${githubStatus}`
			)
			const serverController = new AbortController(),
				serverTimeout = setTimeout(
					() => serverController.abort(),
					10000
				)
			let serverStatus = 'blocked'
			try {
				const response = await fetch(
					'http://launcher.stalcraft.net/listServers?full=true',
					{ signal: serverController.signal }
				)
				serverStatus = String(response.status)
			} catch (error) {
				serverStatus = `blocked:${error instanceof Error ? error.name : 'unknown'}`
			} finally {
				clearTimeout(serverTimeout)
			}
			console.info(
				`[worker-e2e] launcher unauthenticated endpoint: ${serverStatus}; credentials blocker=LOGIN/AUTH_LINK absent`
			)
		} finally {
			await db.close()
		}
	},
	300000
)
