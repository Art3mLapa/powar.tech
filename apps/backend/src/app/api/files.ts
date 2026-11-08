import { db } from '@bscp/database'
import { Elysia } from 'elysia'
import { z } from 'zod'
import { ApiError } from '../../lib/errors'
import { prepareUploadedFile } from '../../lib/file-upload'
import { account, admin, lock, rateLimit } from '../../lib/security'
import { readStoredAsset, writeStoredAsset } from '../../lib/storage'

const assetParams = z.object({ assetId: z.uuid() })
const descriptionBody = z.object({ description: z.string().trim().max(1000) })

function publicFileUrl(id: string) {
	return `/api/v1/files/${id}`
}

function downloadHeaders(mime: string, name: string) {
	return {
		'content-type': mime,
		'content-disposition': `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(name.replaceAll('"', ''))}`,
		'cache-control': 'public, max-age=3600',
	}
}

export const filesRoutes = new Elysia()
	.get(
		'/files/:assetId',
		{ params: assetParams },
		async ({ params, set }) => {
			const asset = await db.orm.public.StoredAsset.first({
				id: params.assetId,
				postId: null,
				public: true,
			})
			if (!asset) throw new ApiError(404, 'Файл не найден')
			const file = await readStoredAsset(asset.storageKey, asset.mime)
			if (!file) throw new ApiError(404, 'Файл не найден')
			Object.assign(
				set.headers,
				downloadHeaders(asset.mime, asset.originalName)
			)
			return file
		}
	)
	.get('/admin/files', async ({ request }) => {
		admin(await account(request))
		const assets = await db.orm.public.StoredAsset.where({
			postId: null,
			public: true,
		})
			.orderBy((asset) => asset.createdAt.desc())
			.limit(200)
			.all()
		return assets.map((asset) => ({
			id: asset.id,
			name: asset.originalName,
			description: asset.description,
			mime: asset.mime,
			size: Number(asset.size),
			createdAt: asset.createdAt,
			url: publicFileUrl(asset.id),
		}))
	})
	.post('/admin/files', async ({ request }) => {
		const user = await account(request)
		admin(user)
		await rateLimit(`file-upload:${user.id}`, 60, 3600)
		let data: FormData
		try {
			data = await request.formData()
		} catch {
			throw new ApiError(422, 'Неверная форма загрузки')
		}
		const file = data.get('file')
		if (!(file instanceof File))
			throw new ApiError(422, 'Выберите файл размером до 10 МБ')
		const descriptionValue = data.get('description')
		if (
			typeof descriptionValue === 'string' &&
			descriptionValue.trim().length > 1000
		)
			throw new ApiError(
				422,
				'Описание не должно превышать 1000 символов'
			)
		const prepared = await prepareUploadedFile(file, 'standalone')
		if (!prepared)
			throw new ApiError(422, 'Выберите файл размером до 10 МБ')
		const description =
			typeof descriptionValue === 'string' ? descriptionValue.trim() : ''
		await writeStoredAsset(
			prepared.storageKey,
			prepared.encoded,
			prepared.mime
		)
		const asset = await db.transaction(async (tx) => {
			await lock(tx, `asset:${prepared.storageKey}`)
			const existing = await tx.orm.public.StoredAsset.first({
				storageKey: prepared.storageKey,
			})
			if (existing)
				return tx.orm.public.StoredAsset.where({
					id: existing.id,
				}).update({
					description,
					public: true,
				})
			return tx.orm.public.StoredAsset.create({
				id: crypto.randomUUID(),
				storageKey: prepared.storageKey,
				mime: prepared.mime,
				size: BigInt(prepared.encoded.length),
				originalName: prepared.originalName,
				description,
				postId: null,
				public: true,
			})
		})
		if (!asset) throw new ApiError(500, 'Не удалось сохранить файл')
		return {
			id: asset.id,
			name: asset.originalName,
			description: asset.description,
			mime: asset.mime,
			size: Number(asset.size),
			createdAt: asset.createdAt,
			url: publicFileUrl(asset.id),
		}
	})
	.patch(
		'/admin/files/:assetId',
		{ params: assetParams, body: descriptionBody },
		async ({ params, body, request }) => {
			admin(await account(request))
			const asset = await db.orm.public.StoredAsset.first({
				id: params.assetId,
				postId: null,
				public: true,
			})
			if (!asset) throw new ApiError(404, 'Файл не найден')
			const updated = await db.orm.public.StoredAsset.where({
				id: asset.id,
			}).update({ description: body.description })
			if (!updated) throw new ApiError(404, 'Файл не найден')
			return {
				id: updated.id,
				name: updated.originalName,
				description: updated.description,
				mime: updated.mime,
				size: Number(updated.size),
				createdAt: updated.createdAt,
				url: publicFileUrl(updated.id),
			}
		}
	)
