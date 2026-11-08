import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

const repoRoot = resolve(fileURLToPath(new URL('../../../', import.meta.url)))
const defaultStorageDir = resolve(repoRoot, '.runtime/storage')

const envSchema = z
	.object({
		NODE_ENV: z
			.enum(['development', 'test', 'production'])
			.default('development'),
		PORT: z.coerce.number().int().min(1).max(65535).default(3001),
		WEB_ORIGIN: z
			.url()
			.refine((value) => {
				const url = new URL(value)
				return (
					['http:', 'https:'].includes(url.protocol) &&
					!url.username &&
					!url.password &&
					url.pathname === '/' &&
					!url.search &&
					!url.hash
				)
			}, 'Укажите HTTP(S) origin без пути и credentials')
			.default('http://localhost:3000'),
		DATABASE_URL: z
			.url()
			.refine((value) =>
				['postgres:', 'postgresql:'].includes(new URL(value).protocol)
			),
		TOTP_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/),
		STORAGE_DIR: z
			.string()
			.default(defaultStorageDir)
			.transform((value) => resolve(value)),
		S3_ENDPOINT: z.url().optional(),
		S3_ACCESS_KEY_ID: z.string().min(1).optional(),
		S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
		S3_BUCKET: z.string().min(1).optional(),
		S3_PUBLIC_URL: z.url().optional(),
	})
	.superRefine((value, context) => {
		const configured = [
			value.S3_ENDPOINT,
			value.S3_ACCESS_KEY_ID,
			value.S3_SECRET_ACCESS_KEY,
			value.S3_BUCKET,
		].filter(Boolean).length
		if (configured > 0 && configured < 4)
			context.addIssue({
				code: 'custom',
				path: ['S3_ENDPOINT'],
				message:
					'Для S3 укажите одновременно endpoint, access key, secret key и bucket',
			})
	})

export const env = envSchema.parse(process.env)
export const s3Enabled = Boolean(
	env.S3_ENDPOINT &&
		env.S3_ACCESS_KEY_ID &&
		env.S3_SECRET_ACCESS_KEY &&
		env.S3_BUCKET
)
