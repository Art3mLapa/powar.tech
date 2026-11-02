import { db } from '@bscp/database'
import { ApiError, requireValue } from './errors'
import { audit } from './security'

export async function enqueue(
	kind: string,
	dedupeKey: string,
	payload: unknown
) {
	const existing = await db.orm.public.Job.first({ dedupeKey })
	if (existing) return existing
	try {
		return await db.orm.public.Job.create({
			id: crypto.randomUUID(),
			kind,
			dedupeKey,
			payload: JSON.stringify(payload),
		})
	} catch (error) {
		const row = await db.orm.public.Job.first({ dedupeKey })
		if (row) return row
		throw error
	}
}

export async function changeJob(
	id: string,
	action: 'retry' | 'cancel',
	actorId: number
) {
	return db.transaction(async (tx) => {
		const row = requireValue(
			await tx.orm.public.Job.where({ id }).forUpdate().first()
		)
		if (action === 'retry') {
			if (!['FAILED', 'CANCELLED'].includes(row.state))
				throw new ApiError(409, 'Задача уже выполняется или завершена')
			if (row.leaseUntil && Date.parse(row.leaseUntil) > Date.now())
				throw new ApiError(409, 'Дождитесь освобождения задачи worker')
			await tx.orm.public.Job.where({ id }).update({
				state: 'QUEUED',
				attempts: 0,
				progress: 0,
				error: null,
				result: null,
				leaseOwner: null,
				leaseUntil: null,
				availableAt: new Date().toISOString(),
			})
		} else {
			if (!['QUEUED', 'RUNNING'].includes(row.state))
				throw new ApiError(409, 'Задачу уже нельзя отменить')
			await tx.orm.public.Job.where({ id }).update({
				state: 'CANCELLED',
				leaseOwner: null,
				error: null,
				result: null,
			})
		}
		await audit(tx, actorId, `job.${action}`, id)
		return { ok: true }
	})
}

const privateDataKey =
	/^(?:url|authLinks?|sourceUrls?|downloadUrls?|signedUrls?|storageKey|leaseOwner|leaseUntil|password|passwordHash|totpSecret|token|tokenHash|session|challenge)$/i

export function publicData(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(publicData)
	if (value && typeof value === 'object')
		return Object.fromEntries(
			Object.entries(value)
				.filter(([key]) => !privateDataKey.test(key))
				.map(([key, item]) => [key, publicData(item)])
		)
	return value
}

export const parsePublicData = (value: string | null): unknown =>
	value ? publicData(JSON.parse(value)) : null

export function publicJob(row: {
	id: string
	kind: string
	state: string
	progress: number
	attempts: number
	error: string | null
	result: string | null
	createdAt: string
	updatedAt: string
	availableAt: string
}) {
	return {
		id: row.id,
		kind: row.kind,
		state: row.state,
		progress: row.progress,
		attempts: row.attempts,
		error: row.error ? 'Обработка не завершена' : null,
		result: parsePublicData(row.result),
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		availableAt: row.availableAt,
	}
}
