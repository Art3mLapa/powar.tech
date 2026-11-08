import { mkdir, rename, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { env, s3Enabled } from '../env'

const s3 = s3Enabled
	? new Bun.S3Client({
			accessKeyId: env.S3_ACCESS_KEY_ID,
			secretAccessKey: env.S3_SECRET_ACCESS_KEY,
			bucket: env.S3_BUCKET,
			endpoint: env.S3_ENDPOINT,
		})
	: null

export async function writeStoredAsset(
	storageKey: string,
	data: Uint8Array,
	mime: string
) {
	if (s3) {
		await s3.write(storageKey, data, { type: mime })
		return
	}

	const root = resolve(env.STORAGE_DIR)
	await mkdir(root, { recursive: true })
	const temporary = resolve(root, `${crypto.randomUUID()}.tmp`)
	try {
		await Bun.write(temporary, data)
		await rename(temporary, resolve(root, storageKey))
	} finally {
		await rm(temporary, { force: true })
	}
}

export async function readStoredAsset(storageKey: string, mime: string) {
	if (s3) {
		const file = s3.file(storageKey, { type: mime })
		return (await file.exists()) ? file : null
	}

	const file = Bun.file(resolve(env.STORAGE_DIR, storageKey), { type: mime })
	return (await file.exists()) ? file : null
}

export function publicStoredAssetUrl(storageKey: string) {
	if (!env.S3_PUBLIC_URL) return null
	const base = env.S3_PUBLIC_URL.replace(/\/+$/, '')
	const path = storageKey.split('/').map(encodeURIComponent).join('/')
	return `${base}/${path}`
}
