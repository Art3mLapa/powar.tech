'use client'

import { useQuery } from '@tanstack/react-query'
import Image from 'next/image'
import Link from 'next/link'
import { useDeferredValue, useState } from 'react'
import { ArticleMarkdown } from '@/components/content/markdown'
import { ContentNav } from '@/components/content/nav'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { articleQueries } from '@/queries/article/article.queries'
import { errorMessage } from '@/services/api'

export function ArticlesView() {
	const [page, setPage] = useState(1)
	const [search, setSearch] = useState('')
	const deferredSearch = useDeferredValue(search)
	const query = useQuery(articleQueries.list(page, deferredSearch))
	return (
		<>
			<ContentNav />
			<main className="mx-auto max-w-[1200px] px-4 py-12 pb-24 wrap-anywhere sm:px-6">
				<h1 className="type-display mb-8 text-5xl sm:text-7xl">
					Статьи
				</h1>
				<label
					className="text-muted mb-8 grid max-w-[480px] gap-2 text-sm"
					htmlFor="article-search"
				>
					Найти статью
					<Input
						id="article-search"
						maxLength={120}
						onChange={(event) => {
							setSearch(event.target.value)
							setPage(1)
						}}
						type="search"
						value={search}
					/>
				</label>
				{query.isPending ? (
					<p role="status">Загружаем статьи…</p>
				) : query.error ? (
					<div>
						<p
							className="mb-4 border-l-2 border-red-400 px-3 py-2 text-red-200"
							role="alert"
						>
							{errorMessage(query.error)}
						</p>
						<Button onClick={() => void query.refetch()}>
							Повторить загрузку
						</Button>
					</div>
				) : (
					<>
						<div className="grid gap-8">
							{query.data.items.length ? (
								query.data.items.map((article) => (
									<article
										className="border-border-default min-w-0 border-b pb-8"
										key={article.id}
									>
										<time
											className="text-muted text-sm"
											dateTime={
												article.publishedAt ?? undefined
											}
										>
											{article.publishedAt
												? new Date(
														article.publishedAt
													).toLocaleDateString(
														'ru-RU'
													)
												: ''}
										</time>
										<h2 className="my-2 text-2xl leading-tight">
											<Link
												className="hover:text-accent transition-colors"
												href={`/articles/${article.slug}`}
											>
												{article.title}
											</Link>
										</h2>
										<p className="leading-relaxed">
											{article.excerpt}
										</p>
										<p className="text-muted text-sm">
											{article.tags.join(', ')}
										</p>
									</article>
								))
							) : (
								<p>
									{search
										? 'Статьи не найдены. Измените запрос или очистите поиск.'
										: 'Статей пока нет. Загляните позже.'}
								</p>
							)}
						</div>
						<nav
							aria-label="Страницы статей"
							className="mt-8 flex flex-wrap items-center gap-4"
						>
							<Button
								disabled={page === 1}
								onClick={() => setPage(page - 1)}
							>
								Назад
							</Button>
							<span
								aria-live="polite"
								className="text-muted text-sm"
							>
								Страница {page}
							</span>
							<Button
								disabled={!query.data.hasMore}
								onClick={() => setPage(page + 1)}
							>
								Далее
							</Button>
						</nav>
					</>
				)}
			</main>
		</>
	)
}

export function ArticleView({ slug }: { slug: string }) {
	const query = useQuery(articleQueries.public(slug))
	return (
		<>
			<ContentNav />
			<main className="content-shell reading-shell">
				<p>
					<Link href="/articles">Все статьи</Link>
				</p>
				{query.isPending ? (
					<p role="status">Загружаем статью…</p>
				) : query.error ? (
					<div>
						<p
							className="mb-4 border-l-2 border-red-400 px-3 py-2 text-red-200"
							role="alert"
						>
							{errorMessage(query.error)}
						</p>
						<Button onClick={() => void query.refetch()}>
							Повторить загрузку
						</Button>
					</div>
				) : (
					<article>
						<p className="text-muted text-sm">
							{query.data.publishedAt
								? new Date(
										query.data.publishedAt
									).toLocaleDateString('ru-RU')
								: ''}
						</p>
						<h1 className="type-display">{query.data.title}</h1>
						{query.data.coverId && (
							<Image
								alt="Обложка статьи"
								className="article-cover"
								height={675}
								src={`/api/v1/articles/media/${query.data.coverId}`}
								unoptimized
								width={1200}
							/>
						)}
						<p className="article-lead">{query.data.excerpt}</p>
						<ArticleMarkdown content={query.data.content ?? ''} />
					</article>
				)}
			</main>
		</>
	)
}
