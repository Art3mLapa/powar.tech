import { articleSchema, pageSchema } from '@bscp/contracts'
import { db } from '@bscp/database'
import { Elysia } from 'elysia'
import { z } from 'zod'
import { requireValue } from '../../../lib/errors'
import { account, admin, rateLimit } from '../../../lib/security'
import { getOwned, save, transition } from './articles.service'
import { mediaRoutes } from './media'

const idSchema = z.object({
	id: z.coerce.number().int().positive().max(2147483647),
})
export const articlesRoutes = new Elysia({ prefix: '/articles' })
	.use(mediaRoutes)
	.get('', { query: pageSchema }, async ({ query }) => {
		const rows = await db.orm.public.Post.where({ status: 'PUBLISHED' })
			.where((p) =>
				p.title.ilike(
					`%${query.search.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
				)
			)
			.select(
				'id',
				'slug',
				'title',
				'excerpt',
				'tags',
				'publishedAt',
				'coverId'
			)
			.orderBy((p) => p.publishedAt.desc())
			.offset((query.page - 1) * 24)
			.limit(25)
			.all()
		return { items: rows.slice(0, 24), hasMore: rows.length > 24 }
	})
	.get('/public/:slug', async ({ params }) =>
		requireValue(
			await db.orm.public.Post.where({
				status: 'PUBLISHED',
				slug: params.slug,
			}).first()
		)
	)
	.get('/mine', { query: pageSchema }, async ({ request, query }) => {
		const user = await account(request)
		const base = db.orm.public.Post
		const scoped = ['OWNER', 'ADMIN'].includes(user.role)
			? base
			: base.where({ authorId: user.id })
		return scoped
			.orderBy((p) => p.updatedAt.desc())
			.offset((query.page - 1) * 24)
			.limit(24)
			.all()
	})
	.post('', async ({ request }) => {
		const user = await account(request)
		await rateLimit(`article-create:${user.id}`, 30, 3600)
		return db.orm.public.Post.create({
			title: 'Новая статья',
			content: '',
			authorId: user.id,
			slug: `draft-${crypto.randomUUID()}`,
		})
	})
	.get('/:id', { params: idSchema }, async ({ params, request }) =>
		getOwned(params.id, await account(request))
	)
	.put(
		'/:id',
		{ params: idSchema, body: articleSchema },
		async ({ params, body, request }) =>
			save(params.id, body, await account(request))
	)
	.post(
		'/:id/status',
		{
			params: idSchema,
			body: z.object({
				action: z.enum(['submit', 'publish', 'reject', 'unpublish']),
				version: z.number().int().positive(),
				note: z.string().max(1000).default(''),
			}),
		},
		async ({ params, body, request }) =>
			transition(
				params.id,
				body.action,
				body.version,
				body.note,
				await account(request)
			)
	)
	.get('/admin/review', async ({ request }) => {
		admin(await account(request))
		return db.orm.public.Post.where({ status: 'REVIEW' })
			.orderBy((p) => p.updatedAt.asc())
			.limit(100)
			.all()
	})
