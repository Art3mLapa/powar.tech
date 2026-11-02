import { db } from '@bscp/database'
import { z } from 'zod'
import { processAsset } from './assets'
import {
	buildMap,
	buildMapDiff,
	syncBalance,
	syncLocalization,
	syncServers,
} from './data'
import { syncPatch } from './patches'
import { processRender } from './render'

const id = z.uuid().parse(process.argv[2]),
	job = await db.orm.public.Job.first({ id })
try {
	if (job?.state !== 'RUNNING') throw new Error('Job not running')
	const payload = JSON.parse(job.payload)
	let result: unknown
	switch (job.kind) {
		case 'PATCH':
			result = await syncPatch(
				z.enum(['RU', 'GLOBAL']).parse(payload.region)
			)
			break
		case 'BALANCE':
			result = await syncBalance()
			break
		case 'SERVERS':
			result = await syncServers(
				z.enum(['RU', 'GLOBAL']).parse(payload.region)
			)
			break
		case 'ASSET':
			result = await processAsset(z.uuid().parse(payload.fileId))
			break
		case 'LOCALIZATION':
			result = await syncLocalization(
				z.uuid().parse(payload.snapshotId),
				z.string().max(1000).parse(payload.path)
			)
			break
		case 'MAP': {
			const snapshotId = z.uuid().parse(payload.snapshotId),
				preset = z
					.string()
					.max(64)
					.parse(payload.preset ?? '')
			result = payload.diff
				? await buildMapDiff(
						snapshotId,
						z
							.enum(['added', 'removed', 'changed'])
							.parse(payload.diff),
						preset
					)
				: await buildMap(
						snapshotId,
						preset,
						z
							.array(z.string().max(1000))
							.max(500)
							.optional()
							.parse(payload.paths)
					)
			break
		}
		case 'RENDER':
			result = await processRender()
			break
		default:
			throw new Error('Unknown job kind')
	}
	console.info(JSON.stringify(result))
} catch (error) {
	console.error(error instanceof Error ? error.name : 'Task failed')
	process.exitCode = 1
} finally {
	await db.close()
}
