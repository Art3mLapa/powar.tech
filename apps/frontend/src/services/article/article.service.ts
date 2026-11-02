import type { Article, ArticleInput } from '@bscp/contracts'
import { apiClient } from '../api'
export const articleService = {
	list: async (page = 1, search = '') =>
		(
			await apiClient.get<{ items: Article[]; hasMore: boolean }>(
				'/articles',
				{ params: { page, search } }
			)
		).data,
	public: async (slug: string) =>
		(
			await apiClient.get<Article>(
				`/articles/public/${encodeURIComponent(slug)}`
			)
		).data,
	mine: async () => (await apiClient.get<Article[]>('/articles/mine')).data,
	get: async (id: string) =>
		(await apiClient.get<Article>(`/articles/${id}`)).data,
	create: async () => (await apiClient.post<Article>('/articles', {})).data,
	save: async (id: string, input: ArticleInput) =>
		(await apiClient.put<Article>(`/articles/${id}`, input)).data,
	status: async (id: string, action: string, version: number, note = '') =>
		(
			await apiClient.post<Article>(`/articles/${id}/status`, {
				action,
				version,
				note,
			})
		).data,
	image: async (id: string, file: File) => {
		const data = new FormData()
		data.set('file', file)
		return (
			await apiClient.post<{ id: string; url: string }>(
				`/articles/${id}/image`,
				data
			)
		).data
	},
}
