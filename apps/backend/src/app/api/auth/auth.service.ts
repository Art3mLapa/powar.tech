import {
	type registerSchema,
	roleSchema,
	usernameSchema,
} from '@bscp/contracts'
import { db } from '@bscp/database'
import type { z } from 'zod'
import { env } from '../../../env'
import {
	decrypt,
	encrypt,
	hash,
	newSecret,
	token,
	verifyTotp,
} from '../../../lib/crypto'
import { ApiError, requireValue } from '../../../lib/errors'
import {
	audit,
	expires,
	lock,
	publicAccount,
	type Transaction,
} from '../../../lib/security'

const totpUri = (username: string, secret: string) => {
	const label = `bscp:${username}`
	const encodedLabel = encodeURIComponent(label)
	return `otpauth://totp/${encodedLabel}?secret=${secret}&issuer=bscp&algorithm=SHA1&digits=6&period=30`
}

export async function invite(
	inputUsername: string,
	role: string,
	actorId: number | null
) {
	const username = usernameSchema.parse(inputUsername)
	if (!roleSchema.safeParse(role).success)
		throw new ApiError(400, 'Недопустимая роль')
	const raw = token()
	await db.transaction(async (tx) => {
		await lock(tx, 'invitations')
		if (role === 'OWNER') {
			if (await tx.orm.public.User.where({ role: 'OWNER' }).first())
				throw new ApiError(409, 'Владелец уже зарегистрирован')
			if (await tx.orm.public.Invitation.where({ ownerSlot: 1 }).first())
				throw new ApiError(409, 'Приглашение владельца уже выпущено')
		}
		if (await tx.orm.public.User.first({ username }))
			throw new ApiError(409, 'Аккаунт уже существует')
		if (await tx.orm.public.Invitation.first({ username }))
			throw new ApiError(
				409,
				'Приглашение уже существует; отзовите его перед повторной отправкой'
			)
		await tx.orm.public.Invitation.create({
			id: crypto.randomUUID(),
			tokenHash: hash(raw),
			username,
			role,
			ownerSlot: role === 'OWNER' ? 1 : null,
			expiresAt: expires(86400),
			usedAt: null,
		})
		await audit(tx, actorId, 'invitation.create', username)
	})
	const fragment = new URLSearchParams({ token: raw, username })
	return {
		url: `${env.WEB_ORIGIN}/auth/register#${fragment.toString()}`,
		expiresIn: 86400,
	}
}
function isMigratedInvitationUsername(id: string, username: string) {
	const compact = id.replaceAll('-', '')
	if (username === `invite_${compact.slice(0, 25)}`) return true
	return (
		username.startsWith(`invite_${compact.slice(0, 20)}`) &&
		/^invite_[a-f0-9]{20,25}(?:_\d+)?$/.test(username)
	)
}
function assertInvitation(
	invitation: {
		id: string
		usedAt: string | null
		username: string
		expiresAt: string
	},
	username: string
) {
	if (invitation.usedAt)
		throw new ApiError(
			400,
			'Приглашение уже использовано. Если аккаунт создан, войдите и завершите подключение 2FA.'
		)
	if (Date.parse(invitation.expiresAt) <= Date.now())
		throw new ApiError(
			400,
			'Срок действия приглашения истёк. Запросите новое.'
		)
	if (
		invitation.username !== username &&
		!isMigratedInvitationUsername(invitation.id, invitation.username)
	)
		throw new ApiError(
			400,
			`Приглашение выпущено для username «${invitation.username}».`
		)
}
export async function register(input: z.infer<typeof registerSchema>) {
	const pending = requireValue(
		await db.orm.public.Invitation.first({ tokenHash: hash(input.token) }),
		400,
		'Приглашение недействительно'
	)
	assertInvitation(pending, input.username)
	const passwordHash = await Bun.password.hash(input.password, {
		algorithm: 'argon2id',
		memoryCost: 65536,
		timeCost: 3,
	})
	const secret = newSecret(),
		raw = token()
	return db.transaction(async (tx) => {
		const invitation = requireValue(
			await tx.orm.public.Invitation.where({
				tokenHash: hash(input.token),
			})
				.forUpdate()
				.first(),
			400,
			'Приглашение недействительно'
		)
		assertInvitation(invitation, input.username)
		const role = roleSchema.safeParse(invitation.role)
		if (!role.success)
			throw new ApiError(400, 'Приглашение недействительно')
		if (await tx.orm.public.User.first({ username: input.username }))
			throw new ApiError(409, 'Аккаунт уже существует')
		if (
			invitation.username !== input.username &&
			(await tx.orm.public.Invitation.first({
				username: input.username,
			}))
		)
			throw new ApiError(
				409,
				'Приглашение для этого username уже существует'
			)
		const user = await tx.orm.public.User.create({
			username: input.username,
			role: role.data,
			passwordHash,
			totpSecret: encrypt(secret),
		})
		await tx.orm.public.Invitation.where({ id: invitation.id }).update({
			usedAt: new Date().toISOString(),
			...(invitation.username === input.username
				? {}
				: { username: input.username }),
		})
		await tx.orm.public.AuthChallenge.create({
			id: hash(raw),
			userId: user.id,
			kind: 'ENROLL',
			expiresAt: expires(1800),
		})
		await audit(tx, user.id, 'account.register', user.username)
		return { challenge: raw, secret, uri: totpUri(input.username, secret) }
	})
}
const dummyHash = Bun.password.hash('invalid-password-dummy-timing', {
	algorithm: 'argon2id',
	memoryCost: 65536,
	timeCost: 3,
})
export async function login(inputUsername: string, password: string) {
	const username = usernameSchema.parse(inputUsername)
	const snapshot = await db.orm.public.User.first({ username })
	const valid = await Bun.password.verify(
		password,
		snapshot?.passwordHash || (await dummyHash)
	)
	if (!valid || !snapshot || snapshot.disabled)
		throw new ApiError(401, 'Неверный username или пароль')
	return db.transaction(async (tx) => {
		const user = requireValue(
			await tx.orm.public.User.where({ id: snapshot.id })
				.forNoKeyUpdate()
				.first(),
			401
		)
		if (user.disabled || user.passwordHash !== snapshot.passwordHash)
			throw new ApiError(401, 'Войдите заново')
		await tx.orm.public.AuthChallenge.where({ userId: user.id }).deleteAll()
		const raw = token()
		await tx.orm.public.AuthChallenge.create({
			id: hash(raw),
			userId: user.id,
			kind: user.totpEnabled ? 'LOGIN' : 'ENROLL',
			expiresAt: expires(600),
		})
		if (!user.totpEnabled) {
			const secret = decrypt(requireValue(user.totpSecret))
			return {
				challenge: raw,
				enrollment: true,
				secret,
				uri: totpUri(username, secret),
			}
		}
		return { challenge: raw, enrollment: false }
	})
}
async function makeSession(tx: Transaction, userId: number) {
	const raw = token()
	await tx.orm.public.Session.create({
		id: hash(raw),
		userId,
		expiresAt: expires(86400 * 7),
	})
	return raw
}
export async function factor(challenge: string, code: string) {
	return db.transaction(async (tx) => {
		const snapshot = requireValue(
			await tx.orm.public.AuthChallenge.first({ id: hash(challenge) }),
			401,
			'Войдите заново'
		)
		const user = requireValue(
			await tx.orm.public.User.where({ id: snapshot.userId })
				.forNoKeyUpdate()
				.first(),
			401
		)
		const row = requireValue(
			await tx.orm.public.AuthChallenge.where({ id: snapshot.id })
				.forUpdate()
				.first(),
			401,
			'Войдите заново'
		)
		if (Date.parse(row.expiresAt) <= Date.now())
			throw new ApiError(401, 'Войдите заново')
		if (user.disabled) throw new ApiError(403, 'Аккаунт отключён')
		if (
			!['LOGIN', 'ENROLL'].includes(row.kind) ||
			(row.kind === 'ENROLL' && user.totpEnabled)
		)
			throw new ApiError(401, 'Войдите заново')
		const step = verifyTotp(
			decrypt(requireValue(user.totpSecret)),
			code,
			user.lastTotpStep
		)
		const recovery =
			step === null && row.kind === 'LOGIN' && user.totpEnabled
				? await tx.orm.public.RecoveryCode.first({
						id: hash(`${user.id}:${code}`),
						userId: user.id,
					})
				: null
		if (recovery)
			await tx.orm.public.RecoveryCode.where({ id: recovery.id }).delete()
		else if (step !== null)
			await tx.orm.public.User.where({ id: user.id }).update({
				lastTotpStep: step,
				totpEnabled: true,
			})
		else throw new ApiError(401, 'Неверный или уже использованный код')
		let recoveryCodes: string[] = []
		if (row.kind === 'ENROLL') {
			await tx.orm.public.RecoveryCode.where({
				userId: user.id,
			}).deleteAll()
			recoveryCodes = Array.from({ length: 10 }, () =>
				token().slice(0, 24)
			)
			for (const recoveryCode of recoveryCodes)
				await tx.orm.public.RecoveryCode.create({
					id: hash(`${user.id}:${recoveryCode}`),
					userId: user.id,
				})
		}
		await tx.orm.public.AuthChallenge.where({ userId: user.id }).deleteAll()
		const session = await makeSession(tx, user.id)
		await audit(
			tx,
			user.id,
			recovery ? 'auth.recovery' : 'auth.login',
			user.username
		)
		return { session, user: publicAccount(user), recoveryCodes }
	})
}
