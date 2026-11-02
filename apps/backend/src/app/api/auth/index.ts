import {
	factorSchema,
	inviteSchema,
	loginSchema,
	registerSchema,
} from '@bscp/contracts'
import { db } from '@bscp/database'
import { Elysia } from 'elysia'
import { hash } from '../../../lib/crypto'
import { ApiError } from '../../../lib/errors'
import {
	account,
	admin,
	audit,
	publicAccount,
	rateLimit,
	sessionCookie,
	sessionToken,
} from '../../../lib/security'
import { factor, invite, login, register } from './auth.service'

export const authRoutes = new Elysia({ prefix: '/auth' })
	.post('/register', { body: registerSchema }, async ({ body }) => {
		await rateLimit(`register:${hash(body.token)}`, 5)
		return register(body)
	})
	.post('/login', { body: loginSchema }, async ({ body }) => {
		await rateLimit(`login:${body.username}`, 10)
		return login(body.username, body.password)
	})
	.post('/factor', { body: factorSchema }, async ({ body, set }) => {
		await rateLimit(`factor:${hash(body.challenge)}`, 5)
		const result = await factor(body.challenge, body.code)
		set.headers['set-cookie'] = sessionCookie(result.session)
		return { user: result.user, recoveryCodes: result.recoveryCodes }
	})
	.get('/me', async ({ request }) => publicAccount(await account(request)))
	.post('/logout', async ({ request, set }) => {
		await db.orm.public.Session.where({
			id: hash(sessionToken(request)),
		}).deleteAll()
		set.headers['set-cookie'] = sessionCookie('', 0)
		return { ok: true }
	})
	.post('/logout-all', async ({ request, set }) => {
		const user = await account(request)
		await db.transaction(async (tx) => {
			await tx.orm.public.User.where({ id: user.id })
				.forNoKeyUpdate()
				.first()
			await tx.orm.public.Session.where({ userId: user.id }).deleteAll()
			await tx.orm.public.AuthChallenge.where({
				userId: user.id,
			}).deleteAll()
			await audit(tx, user.id, 'auth.logout-all', user.username)
		})
		set.headers['set-cookie'] = sessionCookie('', 0)
		return { ok: true }
	})
	.post('/invitations', { body: inviteSchema }, async ({ request, body }) => {
		const user = await account(request)
		admin(user)
		if (body.role === 'ADMIN' && user.role !== 'OWNER')
			throw new ApiError(
				403,
				'Приглашать администраторов может только владелец'
			)
		await rateLimit(`invite:${user.id}`, 20, 3600)
		return invite(body.username, body.role, user.id)
	})
