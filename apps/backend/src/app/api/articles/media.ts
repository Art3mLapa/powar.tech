import { createHash } from 'node:crypto'
import { mkdir, rename, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { db } from '@bscp/database'
import { Elysia } from 'elysia'
import sharp from 'sharp'
import { z } from 'zod'
import { env } from '../../../env'
import { ApiError, requireValue } from '../../../lib/errors'
import { account, lock, rateLimit } from '../../../lib/security'
import { getOwned } from './articles.service'

export const mediaRoutes = new Elysia()
	.post(
		'/:id/image',
		{
			params: z.object({
				id: z.coerce.number().int().positive().max(2147483647),
			}),
		},
		async ({ params, request }) => {
			const user = await account(request)
			const post = await getOwned(params.id, user)
			if (post.status === 'PUBLISHED')
				throw new ApiError(409, 'Сначала снимите статью с публикации')
			await rateLimit(`upload:${user.id}`, 60, 3600)
			let data: FormData
			try {
				data = await request.formData()
			} catch {
				throw new ApiError(422, 'Неверная форма загрузки')
			}
			const file = data.get('file')
			if (
				!(file instanceof File) ||
				file.size === 0 ||
				file.size > 10 * 1024 * 1024
			)
				throw new ApiError(422, 'Выберите изображение до 10 МБ')
			let encoded: Buffer
			try {
				const image = sharp(Buffer.from(await file.arrayBuffer()), {
					limitInputPixels: 40_000_000,
				})
				const metadata = await image.metadata()
				if (
					!['png', 'jpeg', 'webp'].includes(metadata.format ?? '') ||
					(metadata.pages ?? 1) > 1
				)
					throw new Error('Unsupported image')
				encoded = await image
					.rotate()
					.resize({
						width: 2400,
						height: 2400,
						fit: 'inside',
						withoutEnlargement: true,
					})
					.webp({ quality: 88 })
					.toBuffer()
			} catch {
				throw new ApiError(
					422,
					'Поддерживаются корректные статические PNG, JPEG и WebP до 40 мегапикселей'
				)
			}
			const digest = createHash('sha256').update(encoded).digest('hex')
			const storageKey = `${params.id}-${digest}.webp`
			const root = resolve(env.STORAGE_DIR)
			await mkdir(root, { recursive: true })
			const temporary = resolve(root, `${crypto.randomUUID()}.tmp`)
			try {
				await Bun.write(temporary, encoded)
				await rename(temporary, resolve(root, storageKey))
				const asset = await db.transaction(async (tx) => {
					await lock(tx, `asset:${storageKey}`)
					const existing = await tx.orm.public.StoredAsset.first({
						storageKey,
					})
					if (existing) return existing
					return tx.orm.public.StoredAsset.create({
						id: crypto.randomUUID(),
						storageKey,
						mime: 'image/webp',
						size: BigInt(encoded.length),
						originalName:
							file.name
								.replaceAll('\\', '/')
								.split('/')
								.pop()
								?.slice(0, 200) || 'image.webp',
						postId: params.id,
					})
				})
				return {
					id: asset.id,
					url: `/api/v1/articles/media/${asset.id}`,
				}
			} finally {
				await rm(temporary, { force: true })
			}
		}
	)
	.get(
		'/media/:assetId',
		{ params: z.object({ assetId: z.uuid() }) },
		async ({ params, request, set }) => {
			const asset = requireValue(
				await db.orm.public.StoredAsset.first({ id: params.assetId })
			)
			const post = requireValue(
				await db.orm.public.Post.first({
					id: requireValue(asset.postId),
				})
			)
			if (post.status !== 'PUBLISHED')
				await getOwned(post.id, await account(request))
			if (
				!new RegExp(`^${post.id}-[a-f0-9]{64}\\.webp$`).test(
					asset.storageKey
				)
			)
				throw new ApiError(404, 'Файл не найден')
			const file = Bun.file(resolve(env.STORAGE_DIR, asset.storageKey))
			if (!(await file.exists()))
				throw new ApiError(404, 'Файл не найден')
			set.headers['content-type'] = 'image/webp'
			set.headers['cache-control'] = 'no-store'
			return file
		}
	)
