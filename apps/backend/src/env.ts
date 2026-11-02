import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

const repoRoot = resolve(fileURLToPath(new URL('../../../', import.meta.url)))
const defaultStorageDir = resolve(repoRoot, '.runtime/storage')

export const env = z
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
	})
	.parse(process.env)
