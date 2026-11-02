'use client'

import type { Account } from '@bscp/contracts'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { ContentNav } from '@/components/content/nav'
import { Button, buttonClassName } from '@/components/ui/button'
import { articleStatusLabels } from '@/lib/article-editor'
import { articleQueries } from '@/queries/article/article.queries'
import { apiClient, errorMessage } from '@/services/api'
import { articleService } from '@/services/article/article.service'

export function WorkspaceView() {
	const router = useRouter()
	const client = useQueryClient()
	const [error, setError] = useState('')
	const [busy, setBusy] = useState(false)
	const pending = useRef(false)
	const me = useQuery({
		queryKey: ['me'],
		queryFn: async () => (await apiClient.get<Account>('/auth/me')).data,
	})
	const posts = useQuery({ ...articleQueries.mine(), enabled: !!me.data })

	async function action(fn: () => Promise<void>) {
		if (pending.current) return
		pending.current = true
		setBusy(true)
		setError('')
		try {
			await fn()
		} catch (cause) {
			setError(errorMessage(cause))
		} finally {
			pending.current = false
			setBusy(false)
		}
	}

	return (
		<>
			<ContentNav />
			<main className="mx-auto max-w-[1200px] px-4 py-12 pb-24 wrap-anywhere sm:px-6">
				<h1 className="type-display mb-8 text-5xl sm:text-7xl">
					Редакция
				</h1>
				{me.isPending ? (
					<p role="status">Проверяем доступ…</p>
				) : me.error ? (
					<div className="grid gap-6">
						<p role="alert">{errorMessage(me.error)}</p>
						<div className="mb-8 flex flex-wrap items-center gap-4">
							<Link href="/auth">Войти в редакцию</Link>
							<Button
								onClick={() => void me.refetch()}
								type="button"
							>
								Повторить проверку
							</Button>
						</div>
					</div>
				) : (
					<>
						<div className="mb-8 flex flex-wrap items-center gap-4">
							<p className="text-muted mr-auto text-sm">
								{me.data.username}
							</p>
							<Button
								disabled={busy}
								onClick={() =>
									void action(async () => {
										const post =
											await articleService.create()
										await client.invalidateQueries({
											queryKey: ['articles-mine'],
										})
										router.push(
											`/workspace/articles/${post.id}`
										)
									})
								}
								type="button"
							>
								Создать статью
							</Button>
							{['OWNER', 'ADMIN'].includes(me.data.role) && (
								<Link
									className={buttonClassName('quiet')}
									href="/admin"
								>
									Администрирование
								</Link>
							)}
							<Button
								disabled={busy}
								onClick={() =>
									void action(async () => {
										await apiClient.post('/auth/logout', {})
										client.clear()
										router.push('/auth')
									})
								}
								type="button"
							>
								Выйти
							</Button>
						</div>
						{error && (
							<p
								className="mb-6 border-l-2 border-red-400 px-3 py-2 text-red-200"
								role="alert"
							>
								{error}
							</p>
						)}
						{posts.isPending ? (
							<p role="status">Загружаем ваши статьи…</p>
						) : posts.error ? (
							<div>
								<p role="alert">{errorMessage(posts.error)}</p>
								<Button
									onClick={() => void posts.refetch()}
									type="button"
								>
									Повторить загрузку
								</Button>
							</div>
						) : (
							<div className="grid gap-8">
								{posts.data.length === 0 && (
									<p>
										Создайте первую статью — она сохранится
										как черновик.
									</p>
								)}
								{posts.data.map((post) => (
									<article
										className="border-border-default min-w-0 border-b pb-8"
										key={post.id}
									>
										<p className="text-muted text-sm">
											{articleStatusLabels[post.status] ??
												post.status}
										</p>
										<h2 className="my-2 text-2xl leading-tight">
											<Link
												className="hover:text-accent"
												href={`/workspace/articles/${post.id}`}
											>
												{post.title}
											</Link>
										</h2>
										{post.reviewNote && (
											<p>
												Замечание редактора:{' '}
												{post.reviewNote}
											</p>
										)}
									</article>
								))}
							</div>
						)}
					</>
				)}
			</main>
		</>
	)
}
