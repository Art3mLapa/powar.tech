import { articleService } from '@/services/article/article.service'
export const articleQueries = {
	list: (page = 1, search = '') => ({
		queryKey: ['articles', page, search],
		queryFn: () => articleService.list(page, search),
	}),
	public: (slug: string) => ({
		queryKey: ['article-public', slug],
		queryFn: () => articleService.public(slug),
	}),
	get: (id: string) => ({
		queryKey: ['article', id],
		queryFn: () => articleService.get(id),
	}),
	mine: () => ({ queryKey: ['articles-mine'], queryFn: articleService.mine }),
}
