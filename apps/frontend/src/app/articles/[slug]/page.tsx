import type { Article } from '@bscp/contracts'
import type { Metadata } from 'next'
import { ArticleView } from '@/views/articles/articles-view'

const backendOrigin = process.env.BACKEND_ORIGIN ?? 'http://localhost:3001'
const siteOrigin =
	process.env.WEB_ORIGIN ??
	process.env.NEXT_PUBLIC_SITE_URL ??
	'http://localhost:3000'

async function getArticle(slug: string) {
	try {
		const response = await fetch(
			`${backendOrigin}/api/v1/articles/public/${encodeURIComponent(slug)}`,
			{ next: { revalidate: 60 } }
		)
		if (!response.ok) return null
		return (await response.json()) as Article
	} catch {
		return null
	}
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ slug: string }>
}): Promise<Metadata> {
	const { slug } = await params
	const article = await getArticle(slug)
	if (!article) return { title: 'Статья — БСЗП' }

	const title = `${article.title} — БСЗП`
	const description = article.excerpt || 'Статья Билдерс СЗ Продакшн'
	const articleUrl = new URL(`/articles/${slug}`, siteOrigin).toString()
	const coverUrl = article.coverId
		? new URL(
				`/api/v1/articles/media/${article.coverId}`,
				siteOrigin
			).toString()
		: undefined

	return {
		metadataBase: new URL(siteOrigin),
		title,
		description,
		openGraph: {
			type: 'article',
			locale: 'ru_RU',
			title,
			description,
			url: articleUrl,
			...(coverUrl
				? {
						images: [
							{
								url: coverUrl,
								width: 1200,
								height: 675,
								alt: article.title,
							},
						],
					}
				: {}),
		},
		twitter: {
			card: coverUrl ? 'summary_large_image' : 'summary',
			title,
			description,
			...(coverUrl ? { images: [coverUrl] } : {}),
		},
	}
}

export default async function Page({
	params,
}: {
	params: Promise<{ slug: string }>
}) {
	const { slug } = await params
	return <ArticleView slug={slug} />
}
