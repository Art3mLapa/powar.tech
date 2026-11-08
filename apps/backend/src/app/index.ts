import { db } from '@bscp/database'
import { Elysia, NotFound, ParseError, ValidationError } from 'elysia'
import { ZodError } from 'zod'
import { env } from '../env'
import { ApiError } from '../lib/errors'
import { checkOrigin, rateLimit } from '../lib/security'
import { adminRoutes } from './api/admin'
import { articlesRoutes } from './api/articles'
import { authRoutes } from './api/auth'
import { filesRoutes } from './api/files'
import { patchesRoutes } from './api/patches'

export function createApp() {
	return new Elysia({ serve: { maxRequestBodySize: 12 * 1024 * 1024 } })
		.onRequest(async ({ request, set, server }) => {
			set.headers['x-request-id'] = crypto.randomUUID()
			set.headers['x-content-type-options'] = 'nosniff'
			set.headers['cache-control'] = 'no-store'
			set.headers.vary = 'Origin'
			if (
				request.headers.get('origin') === new URL(env.WEB_ORIGIN).origin
			) {
				set.headers['access-control-allow-origin'] = new URL(
					env.WEB_ORIGIN
				).origin
				set.headers['access-control-allow-credentials'] = 'true'
				set.headers['access-control-allow-methods'] =
					'GET, POST, PUT, PATCH, DELETE, OPTIONS'
				set.headers['access-control-allow-headers'] = 'Content-Type'
			}
			if (request.method === 'OPTIONS') {
				if (
					request.headers.get('origin') !==
					new URL(env.WEB_ORIGIN).origin
				)
					throw new ApiError(
						403,
						'Недопустимый источник запроса',
						'CSRF'
					)
				set.status = 204
				return ''
			}
			checkOrigin(request)
			if (
				request.method === 'POST' &&
				new URL(request.url).pathname.startsWith('/api/v1/auth/')
			) {
				const ip = server?.requestIP(request)?.address ?? 'local'
				await rateLimit(`auth-ip:${ip}`, 100, 600)
			}
		})
		.onError(({ error, set }) => {
			if (error instanceof ApiError) {
				set.status = error.status
				return { error: { code: error.code, message: error.message } }
			}
			if (
				error instanceof ZodError ||
				error instanceof ValidationError ||
				error instanceof ParseError
			) {
				set.status = 422
				return {
					error: {
						code: 'VALIDATION',
						message: 'Проверьте поля запроса',
					},
				}
			}
			if (error instanceof NotFound) {
				set.status = 404
				return { error: { code: 'NOT_FOUND', message: 'Не найдено' } }
			}
			console.error(
				'Request failed',
				error instanceof Error ? error.name : 'UnknownError'
			)
			set.status = 500
			return {
				error: {
					code: 'INTERNAL',
					message: 'Не удалось выполнить запрос',
				},
			}
		})
		.get('/health', () => ({ status: 'ok' }))
		.get('/ready', async () => {
			await db.orm.public.User.select('id').limit(1).all()
			return { status: 'ok' }
		})
		.group('/api/v1', (app) =>
			app
				.use(authRoutes)
				.use(articlesRoutes)
				.use(adminRoutes)
				.use(filesRoutes)
				.use(patchesRoutes)
		)
}
