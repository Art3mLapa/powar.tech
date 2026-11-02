import { resolve } from 'node:path'
import { db } from '@bscp/database'
import { Elysia } from 'elysia'
import { z } from 'zod'
import { env } from '../../../env'
import { ApiError, requireValue } from '../../../lib/errors'
import {
	changeJob,
	enqueue,
	parsePublicData,
	publicJob,
} from '../../../lib/jobs'
import { account, admin, audit, rateLimit } from '../../../lib/security'

const idParams = z.object({ id: z.uuid() })
const querySchema = z.object({
	page: z.coerce.number().int().min(1).max(100000).default(1),
	search: z.string().max(120).default(''),
	category: z.string().max(32).default(''),
})
const regionSchema = z.object({
	region: z.enum(['RU', 'GLOBAL']).default('RU'),
})
const pageSize = 50
const searchPattern = (value: string) =>
	`%${value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
const jobSchema = z.object({
	kind: z.enum(['PATCH', 'BALANCE', 'SERVERS', 'MAP', 'LOCALIZATION']),
	region: z.enum(['RU', 'GLOBAL']).default('RU'),
	snapshotId: z.uuid().optional(),
	preset: z
		.string()
		.regex(/^[a-zA-Z0-9_-]{0,64}$/)
		.default(''),
	path: z.string().min(1).max(1000).optional(),
	paths: z.array(z.string().min(1).max(1000)).min(1).max(500).optional(),
	diff: z.enum(['added', 'removed', 'changed']).optional(),
})

export const patchesRoutes = new Elysia({ prefix: '/patches' })
	.get(
		'',
		{
			query: regionSchema.extend({
				page: z.coerce.number().int().min(1).max(100000).default(1),
			}),
		},
		async ({ query }) =>
			db.orm.public.GameSnapshot.where({ region: query.region })
				.orderBy((s) => s.createdAt.desc())
				.offset((query.page - 1) * 24)
				.limit(24)
				.all()
	)
	.get('/snapshots/:id', { params: idParams }, async ({ params }) =>
		requireValue(await db.orm.public.GameSnapshot.first({ id: params.id }))
	)
	.get(
		'/snapshots/:id/changes',
		{ params: idParams, query: querySchema },
		async ({ params, query }) => {
			requireValue(
				await db.orm.public.GameSnapshot.first({ id: params.id })
			)
			const collection = db.orm.public.GameChange.where({
				snapshotId: params.id,
			}).where((f) => f.path.ilike(searchPattern(query.search)))
			const scoped = query.category
				? collection.where({ category: query.category })
				: collection
			const rows = await scoped
				.orderBy((f) => f.path.asc())
				.offset((query.page - 1) * pageSize)
				.limit(pageSize + 1)
				.all()
			return {
				items: rows
					.slice(0, pageSize)
					.map((r) => ({
						...r,
						oldValue: parsePublicData(r.oldValue),
						newValue: parsePublicData(r.newValue),
					})),
				hasMore: rows.length > pageSize,
			}
		}
	)
	.get(
		'/snapshots/:id/files',
		{ params: idParams, query: querySchema },
		async ({ params, query }) => {
			requireValue(
				await db.orm.public.GameSnapshot.first({ id: params.id })
			)
			const collection = db.orm.public.GameFile.where({
				snapshotId: params.id,
			}).where((f) => f.path.ilike(searchPattern(query.search)))
			const scoped = query.category
				? collection.where({ category: query.category })
				: collection
			const rows = await scoped
				.select('id', 'path', 'hash', 'size', 'category')
				.orderBy((f) => f.path.asc())
				.offset((query.page - 1) * pageSize)
				.limit(pageSize + 1)
				.all()
			return {
				items: rows
					.slice(0, pageSize)
					.map((r) => ({ ...r, size: String(r.size) })),
				hasMore: rows.length > pageSize,
			}
		}
	)
	.get('/files/:id', { params: idParams }, async ({ params }) => {
		const file = requireValue(
			await db.orm.public.GameFile.select(
				'id',
				'snapshotId',
				'path',
				'hash',
				'size',
				'category'
			).first({ id: params.id })
		)
		const job = await db.orm.public.Job.first({
			dedupeKey: `asset:v1:${file.snapshotId}:${file.hash}`,
		})
		return {
			file: { ...file, size: String(file.size) },
			job: job ? publicJob(job) : null,
		}
	})
	.post(
		'/files/:id/process',
		{ params: idParams },
		async ({ params, request }) => {
			const user = await account(request)
			admin(user)
			await rateLimit(`asset-process:${user.id}`, 60, 3600)
			const file = requireValue(
				await db.orm.public.GameFile.first({ id: params.id })
			)
			const job = await enqueue(
				'ASSET',
				`asset:v1:${file.snapshotId}:${file.hash}`,
				{ fileId: file.id }
			)
			return publicJob(job)
		}
	)
	.get('/assets/:id', { params: idParams }, async ({ params, set }) => {
		const asset = requireValue(
			await db.orm.public.StoredAsset.first({
				id: params.id,
				public: true,
			})
		)
		if (!/^game-[a-f0-9]{64}$/.test(asset.storageKey))
			throw new ApiError(404, 'Файл не найден')
		const file = Bun.file(resolve(env.STORAGE_DIR, asset.storageKey))
		if (!(await file.exists())) throw new ApiError(404, 'Файл не найден')
		const name =
			asset.originalName.replaceAll('\\', '/').split('/').pop() || 'asset'
		const safeName =
			[...name]
				.filter((character) => {
					const code = character.charCodeAt(0)
					return code > 31 && code !== 127
				})
				.join('') || 'asset'
		set.headers['content-type'] = asset.mime
		set.headers['content-disposition'] =
			`${asset.mime === 'image/png' ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(safeName)}`
		set.headers['cache-control'] = 'public, max-age=31536000, immutable'
		return file
	})
	.get(
		'/data',
		{
			query: z.object({
				kind: z.enum(['BALANCE', 'LOCALIZATION']).default('BALANCE'),
			}),
		},
		async ({ query }) =>
			db.orm.public.DataSnapshot.where({ kind: query.kind })
				.select(
					'id',
					'kind',
					'region',
					'sourceHash',
					'previousId',
					'createdAt'
				)
				.orderBy((s) => s.createdAt.desc())
				.limit(100)
				.all()
	)
	.get(
		'/data/:id',
		{ params: idParams, query: querySchema },
		async ({ params, query }) => {
			const row = requireValue(
				await db.orm.public.DataSnapshot.first({ id: params.id })
			)
			const data = JSON.parse(row.data) as { changes: { path: string }[] }
			const changes = data.changes.filter((c) =>
				c.path.toLowerCase().includes(query.search.toLowerCase())
			)
			return {
				id: row.id,
				kind: row.kind,
				region: row.region,
				createdAt: row.createdAt,
				items: parsePublicData(
					JSON.stringify(
						changes.slice(
							(query.page - 1) * pageSize,
							query.page * pageSize
						)
					)
				),
				hasMore: changes.length > query.page * pageSize,
			}
		}
	)
	.get('/servers', { query: regionSchema }, async ({ query }) =>
		(
			await db.orm.public.ServerSample.where({ region: query.region })
				.orderBy((s) => s.createdAt.desc())
				.limit(96)
				.all()
		).map((row) => ({ ...row, data: parsePublicData(row.data) }))
	)
	.get('/jobs', async ({ request }) => {
		admin(await account(request))
		return (
			await db.orm.public.Job.orderBy((j) => j.createdAt.desc())
				.limit(100)
				.all()
		).map(publicJob)
	})
	.post('/jobs', { body: jobSchema }, async ({ request, body }) => {
		const user = await account(request)
		admin(user)
		await rateLimit(`job-create:${user.id}`, 30, 3600)
		if (body.kind === 'MAP' || body.kind === 'LOCALIZATION') {
			const snapshotId = requireValue(
				body.snapshotId,
				422,
				'Выберите снимок'
			)
			requireValue(
				await db.orm.public.GameSnapshot.first({ id: snapshotId })
			)
			if (body.kind === 'LOCALIZATION')
				requireValue(
					await db.orm.public.GameFile.first({
						snapshotId,
						path: requireValue(
							body.path,
							422,
							'Выберите файл локализации'
						),
					})
				)
			if (body.kind === 'MAP' && body.paths) {
				const files = await db.orm.public.GameFile.where({
					snapshotId,
					category: 'maps',
				})
					.where((f) => f.path.in(body.paths ?? []))
					.select('path')
					.all()
				if (
					new Set(files.map((f) => f.path)).size !==
					new Set(body.paths).size
				)
					throw new ApiError(
						422,
						'Выберите файлы карты из этого снимка'
					)
			}
		}
		const job = await enqueue(
			body.kind,
			`manual:${body.kind}:${crypto.randomUUID()}`,
			body
		)
		await db.transaction((tx) => audit(tx, user.id, 'job.enqueue', job.id))
		return { id: job.id }
	})
	.post(
		'/jobs/:id/:action',
		{
			params: z.object({
				id: z.uuid(),
				action: z.enum(['retry', 'cancel']),
			}),
		},
		async ({ request, params }) => {
			const user = await account(request)
			admin(user)
			await rateLimit(`job-control:${user.id}`, 100, 3600)
			return changeJob(params.id, params.action, user.id)
		}
	)
	.get(
		'/maps/:snapshotId',
		{ params: z.object({ snapshotId: z.uuid() }) },
		async ({ params }) => {
			requireValue(
				await db.orm.public.GameSnapshot.first({
					id: params.snapshotId,
				})
			)
			return (
				await db.orm.public.Job.where({
					kind: 'MAP',
					state: 'SUCCEEDED',
				})
					.where((j) =>
						j.payload.like(`%"snapshotId":"${params.snapshotId}"%`)
					)
					.orderBy((j) => j.createdAt.desc())
					.limit(30)
					.all()
			).map((j) => ({ id: j.id, result: parsePublicData(j.result) }))
		}
	)
