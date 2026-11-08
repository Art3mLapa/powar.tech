import { createHash } from 'node:crypto'
import { db } from '@bscp/database'
import { Elysia } from 'elysia'
import sharp from 'sharp'
import { z } from 'zod'
import { ApiError, requireValue } from '../../../lib/errors'
import { prepareUploadedFile } from '../../../lib/file-upload'
import { account, lock, rateLimit } from '../../../lib/security'
import { readStoredAsset, writeStoredAsset } from '../../../lib/storage'
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
			await writeStoredAsset(storageKey, encoded, 'image/webp')
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
		}
	)
	.post(
		'/:id/file',
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
			if (!(file instanceof File))
				throw new ApiError(422, 'Выберите файл размером до 10 МБ')
			const prepared = await prepareUploadedFile(file, String(params.id))
			if (!prepared)
				throw new ApiError(422, 'Выберите файл размером до 10 МБ')
			const { encoded, mime, originalName, storageKey } = prepared
			await writeStoredAsset(storageKey, encoded, mime)
			const asset = await db.transaction(async (tx) => {
				await lock(tx, `asset:${storageKey}`)
				const existing = await tx.orm.public.StoredAsset.first({
					storageKey,
				})
				if (existing) return existing
				return tx.orm.public.StoredAsset.create({
					id: crypto.randomUUID(),
					storageKey,
					mime,
					size: BigInt(encoded.length),
					originalName,
					postId: params.id,
				})
			})
			return {
				id: asset.id,
				name: asset.originalName,
				mime: asset.mime,
				size: Number(asset.size),
				url: `/api/v1/articles/media/${asset.id}`,
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
				!new RegExp(`^${post.id}-[a-f0-9]{64}\\.[a-z0-9]{1,10}$`).test(
					asset.storageKey
				)
			)
				throw new ApiError(404, 'Файл не найден')
			const file = await readStoredAsset(asset.storageKey, asset.mime)
			if (!file) throw new ApiError(404, 'Файл не найден')
			set.headers['content-type'] = asset.mime
			set.headers['content-disposition'] =
				asset.mime === 'image/webp'
					? 'inline'
					: `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(asset.originalName.replaceAll('"', ''))}`
			set.headers['cache-control'] = 'no-store'
			return file
		}
	)
