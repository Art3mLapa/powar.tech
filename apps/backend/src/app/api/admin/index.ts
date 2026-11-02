import { db } from '@bscp/database'
import { Elysia } from 'elysia'
import { z } from 'zod'
import { ApiError, requireValue } from '../../../lib/errors'
import { account, admin, audit } from '../../../lib/security'

const invitationParams = z.object({ id: z.uuid() })
const userParams = z.object({
	id: z.coerce.number().int().positive().max(2147483647),
})
export const adminRoutes = new Elysia({ prefix: '/admin' })
	.get('/users', async ({ request }) => {
		admin(await account(request))
		return db.orm.public.User.select(
			'id',
			'username',
			'role',
			'disabled',
			'totpEnabled',
			'createdAt'
		)
			.orderBy((u) => u.id.asc())
			.limit(200)
			.all()
	})
	.get('/audit', async ({ request }) => {
		admin(await account(request))
		return db.orm.public.AuditEvent.orderBy((a) => a.createdAt.desc())
			.limit(200)
			.all()
	})
	.get('/invitations', async ({ request }) => {
		admin(await account(request))
		return db.orm.public.Invitation.select(
			'id',
			'username',
			'role',
			'expiresAt',
			'usedAt'
		)
			.orderBy((i) => i.createdAt.desc())
			.limit(200)
			.all()
	})
	.delete(
		'/invitations/:id',
		{ params: invitationParams },
		async ({ request, params }) => {
			const user = await account(request)
			admin(user)
			return db.transaction(async (tx) => {
				const row = requireValue(
					await tx.orm.public.Invitation.where({ id: params.id })
						.forUpdate()
						.first()
				)
				if (
					row.role === 'OWNER' ||
					row.usedAt ||
					(row.role === 'ADMIN' && user.role !== 'OWNER')
				)
					throw new ApiError(403, 'Это приглашение нельзя удалить')
				await tx.orm.public.Invitation.where({ id: row.id }).delete()
				await audit(tx, user.id, 'invitation.revoke', row.username)
				return { ok: true }
			})
		}
	)
	.patch(
		'/users/:id',
		{
			params: userParams,
			body: z.object({
				disabled: z.boolean(),
				role: z.enum(['ADMIN', 'AUTHOR']),
			}),
		},
		async ({ request, params, body }) => {
			const actor = await account(request)
			if (actor.role !== 'OWNER')
				throw new ApiError(
					403,
					'Только владелец может управлять доступами'
				)
			return db.transaction(async (tx) => {
				const user = requireValue(
					await tx.orm.public.User.where({ id: params.id })
						.forNoKeyUpdate()
						.first()
				)
				if (user.role === 'OWNER')
					throw new ApiError(403, 'Нельзя отключить владельца')
				await tx.orm.public.User.where({ id: user.id }).update(body)
				await tx.orm.public.Session.where({
					userId: user.id,
				}).deleteAll()
				await tx.orm.public.AuthChallenge.where({
					userId: user.id,
				}).deleteAll()
				await audit(tx, actor.id, 'account.access', user.username)
				return { ok: true }
			})
		}
	)
