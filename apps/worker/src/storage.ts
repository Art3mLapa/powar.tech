import { createHash } from 'node:crypto'
import { mkdir, rename } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import { db } from '@bscp/database'

const configuredRoot = process.env.STORAGE_DIR?.trim() || undefined
if (configuredRoot && !isAbsolute(configuredRoot))
	throw new Error('STORAGE_DIR must be absolute')
export const storageRoot = resolve(
	configuredRoot ?? resolve(import.meta.dir, '../../../.runtime/storage')
)
export async function storeAsset(
	bytes: Buffer,
	name: string,
	mime: string,
	snapshotId: string | null = null
) {
	const hash = createHash('sha256').update(bytes).digest('hex'),
		key = `game-${hash}`
	const existing = await db.orm.public.StoredAsset.first({ storageKey: key })
	if (existing) return existing.id
	await mkdir(storageRoot, { recursive: true })
	const temp = resolve(storageRoot, `${crypto.randomUUID()}.tmp`)
	await Bun.write(temp, bytes)
	await rename(temp, resolve(storageRoot, key))
	try {
		const row = await db.orm.public.StoredAsset.create({
			id: crypto.randomUUID(),
			storageKey: key,
			mime,
			size: BigInt(bytes.length),
			originalName: name,
			snapshotId,
			public: true,
		})
		return row.id
	} catch (error) {
		const row = await db.orm.public.StoredAsset.first({ storageKey: key })
		if (row) return row.id
		throw error
	}
}
