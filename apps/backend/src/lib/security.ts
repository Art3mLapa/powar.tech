import { db } from '@bscp/database'
import { env } from '../env'
import { hash } from './crypto'
import { ApiError } from './errors'

const sessionCookieName = 'bscp_session'

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
export async function lock(tx: Transaction, key: string) {
	await tx.query(
		tx.raw
			.sql`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${key}))`
			.returnsRow({ locked: 'pg/int4@1' })
			.build()
	)
}
export const expires = (seconds: number) =>
	new Date(Date.now() + seconds * 1000).toISOString()
export async function audit(
	tx: Transaction,
	actorId: number | null,
	action: string,
	subject: string
) {
	await tx.orm.public.AuditEvent.create({
		id: crypto.randomUUID(),
		actorId,
		action,
		subject,
	})
}
export async function rateLimit(key: string, max = 10, seconds = 600) {
	const attempts = await db.transaction(async (tx) => {
		const id = hash(key)
		await lock(tx, `rate:${id}`)
		const row = await tx.orm.public.RateLimit.first({ id })
		if (!row) {
			await tx.orm.public.RateLimit.create({
				id,
				attempts: 1,
				expiresAt: expires(seconds),
			})
			return 1
		}
		const count =
			Date.parse(row.expiresAt) <= Date.now() ? 1 : row.attempts + 1
		await tx.orm.public.RateLimit.where({ id }).update({
			attempts: count,
			...(count === 1 ? { expiresAt: expires(seconds) } : {}),
		})
		return count
	})
	if (attempts > max)
		throw new ApiError(
			429,
			'Слишком много попыток. Попробуйте позже.',
			'RATE_LIMIT'
		)
}
export function checkOrigin(request: Request) {
	if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return
	if (request.headers.get('origin') !== new URL(env.WEB_ORIGIN).origin)
		throw new ApiError(403, 'Недопустимый источник запроса', 'CSRF')
	if (request.method === 'DELETE' && request.body === null) return
	const contentType = request.headers
		.get('content-type')
		?.split(';')[0]
		?.trim()
		.toLowerCase()
	if (
		!['application/json', 'multipart/form-data'].includes(contentType ?? '')
	)
		throw new ApiError(415, 'Неподдерживаемый формат запроса')
}
export function sessionToken(request: Request) {
	const prefix = `${sessionCookieName}=`
	return (
		request.headers
			.get('cookie')
			?.split(';')
			.map((s) => s.trim())
			.find((s) => s.startsWith(prefix))
			?.slice(prefix.length) ?? ''
	)
}
export async function account(request: Request) {
	const raw = sessionToken(request)
	if (!/^[a-f0-9]{64}$/.test(raw))
		throw new ApiError(401, 'Войдите в аккаунт')
	const session = await db.orm.public.Session.first({ id: hash(raw) })
	if (!session || Date.parse(session.expiresAt) <= Date.now())
		throw new ApiError(401, 'Сессия истекла')
	const user = await db.orm.public.User.first({ id: session.userId })
	if (!user || user.disabled || !user.totpEnabled)
		throw new ApiError(401, 'Необходима двухфакторная аутентификация')
	return user
}
export function admin(user: { role: string }) {
	if (!['OWNER', 'ADMIN'].includes(user.role))
		throw new ApiError(403, 'Недостаточно прав')
}
export const publicAccount = (u: {
	id: number
	username: string
	role: string
}) => ({ id: u.id, username: u.username, role: u.role })
export const sessionCookie = (value: string, age = 86400 * 7) =>
	`${sessionCookieName}=${value}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${age}${env.NODE_ENV === 'production' ? '; Secure' : ''}`
