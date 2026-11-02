import { ArticleView } from '@/views/articles/articles-view'
export default async function Page({
	params,
}: {
	params: Promise<{ slug: string }>
}) {
	const { slug } = await params
	return <ArticleView slug={slug} />
}
