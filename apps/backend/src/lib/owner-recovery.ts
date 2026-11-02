import { usernameSchema } from '@bscp/contracts'
import { db } from '@bscp/database'
import { env } from '../env'
import { encrypt, hash, newSecret, token } from './crypto'
import { ApiError, requireValue } from './errors'
import { audit, expires, lock } from './security'

export async function recoverOwner(inputUsername: string, password: string) {
	const username = usernameSchema.parse(inputUsername)
	const passwordHash = await Bun.password.hash(password, {
			algorithm: 'argon2id',
			memoryCost: 65536,
			timeCost: 3,
		}),
		secret = newSecret(),
		challenge = token()
	await db.transaction(async (tx) => {
		await lock(tx, 'invitations')
		const owner = requireValue(
			await tx.orm.public.User.where({ username, role: 'OWNER' })
				.forNoKeyUpdate()
				.first(),
			404,
			'Владелец не найден'
		)
		await tx.orm.public.User.where({ id: owner.id }).update({
			passwordHash,
			totpSecret: encrypt(secret),
			totpEnabled: false,
			lastTotpStep: -1n,
			disabled: false,
		})
		await tx.orm.public.Session.where({ userId: owner.id }).deleteAll()
		await tx.orm.public.AuthChallenge.where({
			userId: owner.id,
		}).deleteAll()
		await tx.orm.public.RecoveryCode.where({ userId: owner.id }).deleteAll()
		await tx.orm.public.AuthChallenge.create({
			id: hash(challenge),
			userId: owner.id,
			kind: 'ENROLL',
			expiresAt: expires(1800),
		})
		await audit(tx, null, 'owner.recovery-cli', username)
	})
	return { secret, url: `${env.WEB_ORIGIN}/auth#challenge=${challenge}` }
}
export async function renewOwnerInvitation(inputUsername: string) {
	const username = usernameSchema.parse(inputUsername)
	const raw = token()
	await db.transaction(async (tx) => {
		await lock(tx, 'invitations')
		if (await tx.orm.public.User.where({ role: 'OWNER' }).first())
			throw new ApiError(
				409,
				'Владелец уже существует; используйте recover-owner'
			)
		const row = requireValue(
			await tx.orm.public.Invitation.where({ ownerSlot: 1 })
				.forUpdate()
				.first()
		)
		await tx.orm.public.Invitation.where({ id: row.id }).update({
			username,
			tokenHash: hash(raw),
			expiresAt: expires(86400),
			usedAt: null,
		})
		await audit(tx, null, 'owner.invitation-renew', username)
	})
	return { url: `${env.WEB_ORIGIN}/auth/register#token=${raw}` }
}
