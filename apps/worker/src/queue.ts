import { db } from '@bscp/database'

const owner = crypto.randomUUID()
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
export async function claim() {
	return db.transaction(async (tx) => {
		const now = new Date().toISOString()
		const expired = await tx.orm.public.Job.where({ state: 'RUNNING' })
			.where((j) => j.leaseUntil.lt(now))
			.forUpdate({ skipLocked: true })
			.limit(50)
			.all()
		for (const job of expired)
			await tx.orm.public.Job.where({ id: job.id }).update({
				state: job.attempts < 3 ? 'QUEUED' : 'FAILED',
				leaseOwner: null,
				leaseUntil: null,
				error: 'Worker lease expired',
			})
		const job = await tx.orm.public.Job.where({ state: 'QUEUED' })
			.where((j) => j.availableAt.lte(now))
			.orderBy((j) => j.createdAt.asc())
			.forUpdate({ skipLocked: true })
			.first()
		if (!job) return null
		return tx.orm.public.Job.where({ id: job.id }).update({
			state: 'RUNNING',
			attempts: job.attempts + 1,
			leaseOwner: owner,
			leaseUntil: new Date(Date.now() + 90000).toISOString(),
		})
	})
}
export async function heartbeat(id: string) {
	return db.orm.public.Job.where({
		id,
		leaseOwner: owner,
		state: 'RUNNING',
	}).update({ leaseUntil: new Date(Date.now() + 90000).toISOString() })
}
export async function finish(id: string, result: unknown) {
	await db.orm.public.Job.where({
		id,
		leaseOwner: owner,
		state: 'RUNNING',
	}).update({
		state: 'SUCCEEDED',
		progress: 100,
		result: JSON.stringify(result),
		leaseUntil: null,
		leaseOwner: null,
		error: null,
	})
}
export async function fail(id: string, attempts: number, cancelled: boolean) {
	await db.orm.public.Job.where({
		id,
		leaseOwner: owner,
		state: 'RUNNING',
	}).update({
		state: cancelled ? 'CANCELLED' : attempts < 3 ? 'QUEUED' : 'FAILED',
		availableAt: new Date(Date.now() + attempts * 30000).toISOString(),
		error: cancelled
			? 'Задача отменена'
			: 'Обработка не завершена; проверьте источник и формат ресурса',
		leaseUntil: null,
		leaseOwner: null,
	})
}
