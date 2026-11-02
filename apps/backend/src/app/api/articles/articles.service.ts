import type { ArticleInput } from '@bscp/contracts'
import { db } from '@bscp/database'
import { ApiError, requireValue } from '../../../lib/errors'
import { audit, lock } from '../../../lib/security'

export const canManage = (
	user: { id: number; role: string },
	post: { authorId: number }
) => user.role === 'OWNER' || user.role === 'ADMIN' || user.id === post.authorId
export async function getOwned(id: number, user: { id: number; role: string }) {
	const post = requireValue(await db.orm.public.Post.first({ id }))
	if (!canManage(user, post)) throw new ApiError(403, 'Недостаточно прав')
	return post
}
export async function save(
	id: number,
	input: ArticleInput,
	user: { id: number; role: string }
) {
	return db.transaction(async (tx) => {
		const post = requireValue(
			await tx.orm.public.Post.where({ id }).forNoKeyUpdate().first()
		)
		if (!canManage(user, post)) throw new ApiError(403, 'Недостаточно прав')
		if (post.version !== input.version)
			throw new ApiError(
				409,
				'Статья изменена в другом окне. Обновите страницу, сохранив свой текст.',
				'VERSION_CONFLICT'
			)
		if (post.status === 'PUBLISHED')
			throw new ApiError(409, 'Сначала снимите статью с публикации')
		await lock(tx, `article-slug:${input.slug}`)
		if (
			await tx.orm.public.Post.where({ slug: input.slug })
				.where((p) => p.id.neq(id))
				.first()
		)
			throw new ApiError(409, 'Этот адрес уже занят')
		if (
			input.coverId &&
			!(await tx.orm.public.StoredAsset.first({
				id: input.coverId,
				postId: id,
			}))
		)
			throw new ApiError(422, 'Обложка должна принадлежать этой статье')
		await tx.orm.public.PostRevision.create({
			id: crypto.randomUUID(),
			postId: id,
			version: post.version,
			title: post.title,
			content: post.content ?? '',
		})
		const result = await tx.orm.public.Post.where({ id }).update({
			...input,
			version: post.version + 1,
			status: 'DRAFT',
			reviewNote: null,
		})
		await audit(tx, user.id, 'article.save', String(id))
		return result
	})
}
export async function transition(
	id: number,
	action: 'submit' | 'publish' | 'reject' | 'unpublish',
	version: number,
	note: string,
	user: { id: number; role: string }
) {
	return db.transaction(async (tx) => {
		const post = requireValue(
			await tx.orm.public.Post.where({ id }).forNoKeyUpdate().first()
		)
		if (!canManage(user, post)) throw new ApiError(403, 'Недостаточно прав')
		if (post.version !== version)
			throw new ApiError(
				409,
				'Статья уже изменена. Обновите страницу.',
				'VERSION_CONFLICT'
			)
		if (action !== 'submit' && !['OWNER', 'ADMIN'].includes(user.role))
			throw new ApiError(403, 'Недостаточно прав')
		if (action === 'submit' && !['DRAFT', 'REJECTED'].includes(post.status))
			throw new ApiError(409, 'Статья уже отправлена')
		if (action === 'publish' && post.status !== 'REVIEW')
			throw new ApiError(409, 'Сначала отправьте статью на проверку')
		if (
			(action === 'publish' || action === 'submit') &&
			(!post.title.trim() || !post.content?.trim() || !post.slug)
		)
			throw new ApiError(422, 'Заполните название, адрес и текст')
		if (action === 'reject' && post.status !== 'REVIEW')
			throw new ApiError(409, 'Статья не на проверке')
		if (action === 'unpublish' && post.status !== 'PUBLISHED')
			throw new ApiError(409, 'Статья не опубликована')
		const status = {
			submit: 'REVIEW',
			publish: 'PUBLISHED',
			reject: 'REJECTED',
			unpublish: 'DRAFT',
		}[action]
		const result = await tx.orm.public.Post.where({ id }).update({
			status,
			version: post.version + 1,
			reviewNote: action === 'reject' ? note : null,
			publishedAt: action === 'publish' ? new Date().toISOString() : null,
		})
		await audit(tx, user.id, `article.${action}`, String(id))
		return result
	})
}
