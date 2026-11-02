'use client'

import { type Account, type Article, articleSchema } from '@bscp/contracts'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArticleMarkdown } from '@/components/content/markdown'
import { ContentNav } from '@/components/content/nav'
import { Button } from '@/components/ui/button'
import {
	articleStatusLabels,
	continueList,
	indentSelection,
	parseArticleTags,
	type TextEdit,
	wrapSelection,
} from '@/lib/article-editor'
import { articleQueries } from '@/queries/article/article.queries'
import { apiClient, errorMessage } from '@/services/api'
import { articleService } from '@/services/article/article.service'

const fields = (article: Article) => ({
	title: article.title,
	slug: article.slug ?? '',
	content: article.content ?? '',
	excerpt: article.excerpt,
	tags: article.tags.join(', '),
	coverId: article.coverId ?? '',
})
type Draft = ReturnType<typeof fields>

function Editor({ article }: { article: Article }) {
	const client = useQueryClient()
	const [draft, setDraft] = useState(() => fields(article))
	const [saved, setSaved] = useState(() => fields(article))
	const [version, setVersion] = useState(article.version)
	const [status, setStatus] = useState(article.status)
	const [error, setError] = useState('')
	const [busy, setBusy] = useState(false)
	const [transitioning, setTransitioning] = useState(false)
	const [uploading, setUploading] = useState(false)
	const [lastUpload, setLastUpload] = useState<{
		id: string
		url: string
		name: string
	} | null>(null)
	const [lastSaved, setLastSaved] = useState('')
	const [tab, setTab] = useState('write')
	const [conflict, setConflict] = useState(false)
	const [syncScroll, setSyncScroll] = useState(true)
	const [reviewNote, setReviewNote] = useState(article.reviewNote ?? '')
	const [rejecting, setRejecting] = useState(false)
	const [rejection, setRejection] = useState('')
	const textarea = useRef<HTMLTextAreaElement>(null)
	const preview = useRef<HTMLElement>(null)
	const inFlight = useRef(false)
	const transitionLock = useRef(false)
	const uploadLock = useRef(false)
	const scrolling = useRef<EventTarget | null>(null)
	const scrollFrame = useRef(0)
	const draftRef = useRef(draft)
	const versionRef = useRef(version)
	const history = useRef<{
		past: string[]
		future: string[]
		lastTyped: number
	}>({ past: [], future: [], lastTyped: 0 })
	draftRef.current = draft
	const me = useQuery({
		queryKey: ['me'],
		queryFn: async () => (await apiClient.get<Account>('/auth/me')).data,
	})
	const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
	const readOnly = status === 'PUBLISHED'
	const locked = readOnly || transitioning
	const isAdmin = !!me.data && ['OWNER', 'ADMIN'].includes(me.data.role)

	const save = useCallback(async () => {
		if (inFlight.current || conflict || status === 'PUBLISHED') return null
		const snapshot = draftRef.current
		const parsed = articleSchema.safeParse({
			...snapshot,
			coverId: snapshot.coverId || null,
			tags: parseArticleTags(snapshot.tags),
			version: versionRef.current,
		})
		if (!parsed.success) {
			const field = parsed.error.issues[0]?.path[0]
			setError(
				field === 'slug'
					? 'Адрес: только латинские строчные буквы, цифры и дефисы между словами.'
					: field === 'title'
						? 'Укажите название от 1 до 180 символов.'
						: field === 'tags'
							? 'Не более 12 тегов, каждый — до 32 символов.'
							: field === 'excerpt'
								? 'Краткое описание не должно превышать 400 символов.'
								: 'Текст не должен превышать 200 000 символов.'
			)
			return null
		}
		inFlight.current = true
		setBusy(true)
		setError('')
		try {
			const result = await articleService.save(
				String(article.id),
				parsed.data
			)
			versionRef.current = result.version
			setVersion(result.version)
			setSaved(snapshot)
			setStatus(result.status)
			setReviewNote(result.reviewNote ?? '')
			setLastSaved(new Date().toLocaleTimeString('ru-RU'))
			client.setQueryData(['article', String(article.id)], result)
			void client.invalidateQueries({ queryKey: ['articles-mine'] })
			void client.invalidateQueries({ queryKey: ['admin-review'] })
			return result
		} catch (cause) {
			setError(errorMessage(cause))
			if (
				axios.isAxiosError(cause) &&
				cause.response?.data?.error?.code === 'VERSION_CONFLICT'
			)
				setConflict(true)
			return null
		} finally {
			inFlight.current = false
			setBusy(false)
		}
	}, [article.id, client, conflict, status])

	useEffect(() => {
		if (
			JSON.stringify(draft) === JSON.stringify(saved) ||
			readOnly ||
			conflict ||
			error ||
			busy ||
			transitioning
		)
			return
		const timer = setTimeout(() => void save(), 3000)
		return () => clearTimeout(timer)
	}, [draft, saved, readOnly, conflict, error, busy, transitioning, save])

	useEffect(() => {
		const beforeUnload = (event: BeforeUnloadEvent) => {
			if (dirty || uploading) event.preventDefault()
		}
		const beforeNavigate = (event: MouseEvent) => {
			if (
				(!dirty && !uploading) ||
				event.defaultPrevented ||
				event.button !== 0 ||
				event.metaKey ||
				event.ctrlKey ||
				event.shiftKey ||
				event.altKey
			)
				return
			const anchor =
				event.target instanceof Element
					? event.target.closest('a')
					: null
			if (
				!anchor ||
				anchor.hasAttribute('download') ||
				anchor.target === '_blank' ||
				anchor.href === window.location.href
			)
				return
			if (
				!window.confirm(
					'Есть несохранённые изменения. Уйти со страницы и потерять их?'
				)
			) {
				event.preventDefault()
				event.stopPropagation()
			}
		}
		window.addEventListener('beforeunload', beforeUnload)
		document.addEventListener('click', beforeNavigate, true)
		return () => {
			window.removeEventListener('beforeunload', beforeUnload)
			document.removeEventListener('click', beforeNavigate, true)
		}
	}, [dirty, uploading])
	useEffect(() => () => cancelAnimationFrame(scrollFrame.current), [])

	function update(patch: Partial<Draft>) {
		setDraft((current) => ({ ...current, ...patch }))
		if (!conflict) setError('')
	}

	function remember(value: string, typing = false) {
		const stack = history.current
		if (!typing || Date.now() - stack.lastTyped > 600) {
			stack.past.push(value)
			if (stack.past.length > 100) stack.past.shift()
		}
		stack.lastTyped = typing ? Date.now() : 0
		stack.future = []
	}

	function apply(edit: TextEdit) {
		if (locked) return
		remember(draftRef.current.content)
		update({ content: edit.value })
		requestAnimationFrame(() => {
			textarea.current?.focus()
			textarea.current?.setSelectionRange(edit.start, edit.end)
		})
	}

	function insert(prefix: string, suffix = '', placeholder = 'Текст') {
		const element = textarea.current
		if (!element) return
		apply(
			wrapSelection(
				element.value,
				element.selectionStart,
				element.selectionEnd,
				prefix,
				suffix,
				placeholder
			)
		)
	}

	function undo(redo = false) {
		if (locked) return
		const stack = history.current
		const from = redo ? stack.future : stack.past
		const to = redo ? stack.past : stack.future
		const next = from.pop()
		if (next === undefined) return
		to.push(draftRef.current.content)
		stack.lastTyped = 0
		update({ content: next })
	}

	async function change(action: string) {
		if (
			inFlight.current ||
			transitionLock.current ||
			uploadLock.current ||
			conflict
		)
			return
		transitionLock.current = true
		setTransitioning(true)
		setError('')
		try {
			if (dirty && !(await save())) return
			const next = await articleService.status(
				String(article.id),
				action,
				versionRef.current,
				action === 'reject' ? rejection.trim() : ''
			)
			versionRef.current = next.version
			setVersion(next.version)
			setStatus(next.status)
			setReviewNote(next.reviewNote ?? '')
			setRejecting(false)
			client.setQueryData(['article', String(article.id)], next)
			for (const queryKey of [
				['articles-mine'],
				['articles'],
				['article-public'],
				['admin-review'],
			])
				void client.invalidateQueries({ queryKey })
		} catch (cause) {
			setError(errorMessage(cause))
			if (
				axios.isAxiosError(cause) &&
				cause.response?.data?.error?.code === 'VERSION_CONFLICT'
			)
				setConflict(true)
		} finally {
			transitionLock.current = false
			setTransitioning(false)
		}
	}

	async function upload(file: File) {
		if (locked || uploadLock.current) return
		if (
			!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
			file.size > 10 * 1024 * 1024
		) {
			setError('Выберите PNG, JPEG или WebP размером до 10 МБ.')
			return
		}
		uploadLock.current = true
		setUploading(true)
		setError('')
		try {
			const media = await articleService.image(String(article.id), file)
			const name = file.name
				.replaceAll('\\', '')
				.replaceAll('[', '')
				.replaceAll(']', '')
				.replaceAll('\r', '')
				.replaceAll('\n', '')
			setLastUpload({ ...media, name })
			insert(`\n![${name}](${media.url})\n`, '', '')
		} catch (cause) {
			setError(errorMessage(cause))
		} finally {
			uploadLock.current = false
			setUploading(false)
		}
	}

	function scroll(source: HTMLElement, target: HTMLElement | null) {
		if (
			!syncScroll ||
			!target ||
			(scrolling.current && scrolling.current !== source)
		)
			return
		scrolling.current = source
		const range = source.scrollHeight - source.clientHeight
		target.scrollTop =
			range > 0
				? (source.scrollTop / range) *
					(target.scrollHeight - target.clientHeight)
				: 0
		cancelAnimationFrame(scrollFrame.current)
		scrollFrame.current = requestAnimationFrame(() => {
			scrolling.current = null
		})
	}

	function exportDraft() {
		const url = URL.createObjectURL(
			new Blob([`# ${draft.title}\n\n${draft.content}`], {
				type: 'text/markdown;charset=utf-8',
			})
		)
		const anchor = document.createElement('a')
		anchor.href = url
		anchor.download = `${draft.slug || 'article'}.md`
		anchor.click()
		setTimeout(() => URL.revokeObjectURL(url), 1000)
	}

	return (
		<>
			<div className="mb-6">
				<p>
					<Link href="/workspace">Все мои статьи</Link>
				</p>
				<h1 className="type-display mb-4 text-5xl sm:text-7xl">
					Редактор статьи
				</h1>
				<p className="text-muted text-sm" role="status">
					{articleStatusLabels[status] ?? status} · версия {version}
					{busy
						? ' · сохраняем…'
						: dirty
							? ' · есть несохранённые правки'
							: lastSaved
								? ` · сохранено ${lastSaved}`
								: ' · все изменения сохранены'}
					{uploading ? ' · загружаем изображение…' : ''}
				</p>
			</div>
			<div className="mb-8 flex flex-wrap items-center gap-4">
				<Button
					disabled={busy || !dirty || locked || conflict}
					onClick={() => void save()}
					type="button"
				>
					Сохранить
				</Button>
				{!readOnly && status !== 'REVIEW' && (
					<Button
						disabled={
							busy || transitioning || uploading || conflict
						}
						onClick={() => void change('submit')}
						type="button"
					>
						На проверку
					</Button>
				)}
				{isAdmin &&
					(!readOnly ? (
						<>
							<Button
								disabled={
									busy ||
									transitioning ||
									uploading ||
									conflict
								}
								onClick={() => void change('publish')}
								type="button"
							>
								Опубликовать
							</Button>
							{status === 'REVIEW' && (
								<Button
									disabled={busy || transitioning || conflict}
									onClick={() => setRejecting(!rejecting)}
									type="button"
								>
									Отклонить
								</Button>
							)}
						</>
					) : (
						<Button
							disabled={transitioning || conflict}
							onClick={() => void change('unpublish')}
							type="button"
						>
							Снять с публикации
						</Button>
					))}
				<Button onClick={exportDraft} type="button">
					Скачать текст
				</Button>
			</div>
			{readOnly && (
				<p>
					Опубликованная статья доступна только для чтения.
					{isAdmin
						? ' Снимите её с публикации, чтобы внести изменения.'
						: ' Для изменений обратитесь к администратору.'}
				</p>
			)}
			{reviewNote && (
				<p className="border-l-2 border-red-400 px-3 py-2 text-red-200">
					Замечание редактора: {reviewNote}
				</p>
			)}
			{rejecting && (
				<form
					className="mb-6 grid gap-4"
					onSubmit={(event) => {
						event.preventDefault()
						void change('reject')
					}}
				>
					<label
						className="text-muted grid gap-2 text-sm"
						htmlFor="review-reason"
					>
						Что нужно исправить
						<textarea
							className="border-border-default bg-surface-raised text-foreground focus-visible:border-accent focus-visible:ring-accent/25 min-h-24 w-full min-w-0 resize-y rounded-sm border px-3 py-2 text-base outline-none focus-visible:ring-2 disabled:opacity-50"
							disabled={transitioning}
							id="review-reason"
							maxLength={1000}
							onChange={(event) =>
								setRejection(event.target.value)
							}
							required
							rows={3}
							value={rejection}
						/>
					</label>
					<div className="mb-8 flex flex-wrap items-center gap-4">
						<Button disabled={transitioning} type="submit">
							Отклонить с замечанием
						</Button>
						<Button
							disabled={transitioning}
							onClick={() => setRejecting(false)}
							type="button"
						>
							Отмена
						</Button>
					</div>
				</form>
			)}
			{error && (
				<p
					className="border-l-2 border-red-400 px-3 py-2 text-red-200"
					role="alert"
				>
					{error}
				</p>
			)}
			{conflict && (
				<div className="mb-6 grid gap-4">
					<p>
						Ваши правки остались здесь. Скачайте текст перед
						загрузкой новой версии: автоматического объединения нет.
					</p>
					<div className="mb-8 flex flex-wrap items-center gap-4">
						<Button onClick={exportDraft} type="button">
							Скачать мои правки
						</Button>
						<Button
							onClick={() => {
								if (
									window.confirm(
										'Загрузить версию с сервера? Несохранённые правки будут потеряны.'
									)
								)
									window.location.reload()
							}}
							type="button"
						>
							Загрузить версию с сервера
						</Button>
					</div>
				</div>
			)}
			<div className="grid gap-6">
				<label
					className="text-muted grid gap-2 text-sm"
					htmlFor="article-title"
				>
					<input
						aria-label="Название"
						className="border-border-default bg-surface-raised text-foreground focus-visible:border-accent focus-visible:ring-accent/25 min-h-11 w-full min-w-0 rounded-sm border px-3 py-2 text-base outline-none focus-visible:ring-2 disabled:opacity-50"
						disabled={locked}
						id="article-title"
						maxLength={180}
						onChange={(event) =>
							update({ title: event.target.value })
						}
						placeholder="Название"
						required
						value={draft.title}
					/>
				</label>
				<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
					<label className="text-muted grid gap-2 text-sm">
						Адрес статьи
						<input
							aria-describedby="slug-help"
							className="border-border-default bg-surface-raised text-foreground focus-visible:border-accent focus-visible:ring-accent/25 min-h-11 w-full min-w-0 rounded-sm border px-3 py-2 text-base outline-none focus-visible:ring-2 disabled:opacity-50"
							disabled={locked}
							maxLength={180}
							onChange={(event) =>
								update({ slug: event.target.value })
							}
							spellCheck={false}
							value={draft.slug}
						/>
						<span className="text-muted text-sm" id="slug-help">
							Латинские строчные буквы, цифры и дефисы. /articles/
							{draft.slug}
						</span>
					</label>
					<label className="text-muted grid gap-2 text-sm">
						Теги через запятую
						<input
							className="border-border-default bg-surface-raised text-foreground focus-visible:border-accent focus-visible:ring-accent/25 min-h-11 w-full min-w-0 rounded-sm border px-3 py-2 text-base outline-none focus-visible:ring-2 disabled:opacity-50"
							disabled={locked}
							onChange={(event) =>
								update({ tags: event.target.value })
							}
							value={draft.tags}
						/>
						<span className="text-muted text-sm">
							До 12 тегов, не более 32 символов в каждом.
						</span>
					</label>
				</div>
				<label className="text-muted grid gap-2 text-sm">
					Краткое описание
					<textarea
						className="border-border-default bg-surface-raised text-foreground focus-visible:border-accent focus-visible:ring-accent/25 min-h-24 w-full min-w-0 resize-y rounded-sm border px-3 py-2 text-base outline-none focus-visible:ring-2 disabled:opacity-50"
						disabled={locked}
						maxLength={400}
						onChange={(event) =>
							update({ excerpt: event.target.value })
						}
						rows={2}
						value={draft.excerpt}
					/>
				</label>
				<div className="border-border-default border-t pt-4">
					<p>Обложка</p>
					{draft.coverId ? (
						<p className="text-muted text-sm" role="status">
							Обложка выбрана. Она появится на странице статьи
							после сохранения.{' '}
							<Button
								disabled={locked}
								onClick={() => update({ coverId: '' })}
								type="button"
							>
								Убрать обложку
							</Button>
						</p>
					) : (
						<p className="text-muted text-sm">
							Загрузите изображение в панели Markdown, затем
							выберите его как обложку.
						</p>
					)}
					{lastUpload && (
						<div className="mt-3 flex flex-wrap items-center gap-4">
							<Image
								alt={`Загруженное изображение: ${lastUpload.name}`}
								height={90}
								src={lastUpload.url}
								unoptimized
								width={160}
							/>
							<Button
								disabled={
									locked || draft.coverId === lastUpload.id
								}
								onClick={() =>
									update({ coverId: lastUpload.id })
								}
								type="button"
							>
								{draft.coverId === lastUpload.id
									? 'Текущая обложка'
									: 'Сделать обложкой'}
							</Button>
						</div>
					)}
				</div>
			</div>
			<div
				aria-label="Форматирование текста"
				className="my-6 flex flex-wrap items-start gap-2"
				role="toolbar"
			>
				<Button
					aria-keyshortcuts="Control+b Meta+b"
					disabled={locked}
					onClick={() => insert('**', '**')}
					type="button"
				>
					Жирный
				</Button>
				<Button
					aria-keyshortcuts="Control+i Meta+i"
					disabled={locked}
					onClick={() => insert('*', '*')}
					type="button"
				>
					Курсив
				</Button>
				<Button
					disabled={locked}
					onClick={() => insert('\n## ')}
					type="button"
				>
					Заголовок
				</Button>
				<Button
					disabled={locked}
					onClick={() => insert('\n> ')}
					type="button"
				>
					Цитата
				</Button>
				<Button
					aria-keyshortcuts="Control+k Meta+k"
					disabled={locked}
					onClick={() => insert('[', '](https://)')}
					type="button"
				>
					Ссылка
				</Button>
				<Button
					disabled={locked}
					onClick={() => insert('\n- ')}
					type="button"
				>
					Список
				</Button>
				<Button
					disabled={locked}
					onClick={() => insert('\n```\n', '\n```\n')}
					type="button"
				>
					Код
				</Button>
				<Button
					disabled={locked}
					onClick={() =>
						insert(
							'\n| Заголовок | Значение |\n| --- | --- |\n| ',
							' | |\n'
						)
					}
					type="button"
				>
					Таблица
				</Button>
				<Button
					disabled={locked}
					onClick={() => insert('\n:::note\n', '\n:::\n')}
					type="button"
				>
					Примечание
				</Button>
				<Button
					disabled={locked}
					onClick={() => insert('\n:::collage\n\n', '\n\n:::\n', '')}
					type="button"
				>
					Коллаж
				</Button>
				<Button
					disabled={locked}
					onClick={() =>
						insert('\n```mermaid\n', '\n```\n', 'graph TD; A --> B')
					}
					type="button"
				>
					Схема
				</Button>
				<label className="inline-flex cursor-pointer flex-wrap items-center gap-3">
					{uploading ? 'Загружаем…' : 'Изображение'}
					<input
						accept="image/png,image/jpeg,image/webp"
						className="max-w-[230px] text-sm"
						disabled={locked || uploading}
						onChange={(event) => {
							const file = event.target.files?.[0]
							event.target.value = ''
							if (file) void upload(file)
						}}
						type="file"
					/>
				</label>
			</div>
			<details className="my-4">
				<summary className="cursor-pointer">
					Markdown и горячие клавиши
				</summary>
				<p>
					Ctrl/⌘ + S — сохранить; B — жирный; I — курсив; K — ссылка;
					Z — отмена; Shift + Z — повтор. Tab и Shift + Tab меняют
					отступ; Enter продолжает список. Tab перехватывается только
					вместе с выделением; без выделения он переносит фокус.
				</p>
				<p>
					Поддерживаются таблицы, списки задач и блоки :::note,
					:::warning, :::tip, :::info, :::collage (изображения в блоке
					складываются в сетку-коллаж). Ссылка на YouTube превращается в
					видеокарточку, ссылка на аудиофайл (mp3 и т.д.) — в
					аудиоплеер. Блок ```mermaid превращается в схему. HTML и
					JavaScript не выполняются.
				</p>
			</details>
			<label className="mb-6 flex items-center gap-2">
				<input
					checked={syncScroll}
					className="accent-accent !h-4 !min-h-0 !w-4 !min-w-0 !border-0 !bg-transparent !p-0"
					onChange={(event) => setSyncScroll(event.target.checked)}
					type="checkbox"
				/>
				Синхронная прокрутка текста и предпросмотра
			</label>
			<fieldset className="mb-4 flex gap-3 md:hidden">
				<legend className="sr-only">Режим редактора</legend>
				<Button
					aria-pressed={tab === 'write'}
					onClick={() => setTab('write')}
					type="button"
					variant={tab === 'write' ? 'primary' : 'secondary'}
				>
					Текст
				</Button>
				<Button
					aria-pressed={tab === 'preview'}
					onClick={() => setTab('preview')}
					type="button"
					variant={tab === 'preview' ? 'primary' : 'secondary'}
				>
					Предпросмотр
				</Button>
			</fieldset>
			<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
				<label
					className={`grid min-w-0 gap-2 ${tab === 'preview' ? 'hidden md:grid' : ''}`}
				>
					Текст Markdown
					<textarea
						className="border-border-default bg-surface-raised text-foreground focus-visible:border-accent focus-visible:ring-accent/25 h-[65svh] min-h-[350px] w-full min-w-0 resize-y rounded-sm border px-3 py-2 font-mono text-base leading-[1.7] [tab-size:2] outline-none read-only:opacity-75 focus-visible:ring-2 md:h-[650px]"
						maxLength={200000}
						onChange={(event) => {
							remember(draft.content, true)
							update({ content: event.target.value })
						}}
						onKeyDown={(event) => {
							const key = event.key.toLowerCase()
							if (event.ctrlKey || event.metaKey) {
								if (key === 's') {
									event.preventDefault()
									if (dirty) void save()
								}
								if (locked) return
								if (key === 'b') {
									event.preventDefault()
									insert('**', '**')
								}
								if (key === 'i') {
									event.preventDefault()
									insert('*', '*')
								}
								if (key === 'k') {
									event.preventDefault()
									insert('[', '](https://)')
								}
								if (key === 'z' || key === 'y') {
									event.preventDefault()
									undo(event.shiftKey || key === 'y')
								}
							} else if (!locked) {
								const element = event.currentTarget
								if (
									key === 'tab' &&
									element.selectionStart !==
										element.selectionEnd
								) {
									event.preventDefault()
									apply(
										indentSelection(
											element.value,
											element.selectionStart,
											element.selectionEnd,
											event.shiftKey
										)
									)
								}
								if (
									key === 'enter' &&
									!event.shiftKey &&
									element.selectionStart ===
										element.selectionEnd
								) {
									const edit = continueList(
										element.value,
										element.selectionStart
									)
									if (edit) {
										event.preventDefault()
										apply(edit)
									}
								}
							}
						}}
						onScroll={(event) =>
							scroll(event.currentTarget, preview.current)
						}
						readOnly={locked}
						ref={textarea}
						spellCheck
						value={draft.content}
					/>
				</label>

				<section
					aria-label="Предпросмотр статьи"
					className={`border-border-default min-w-0 overflow-y-auto rounded-sm border p-6 md:mt-[26px] md:h-[650px] ${tab === 'write' ? 'hidden md:block' : 'block'}`}
					onScroll={(event) =>
						scroll(event.currentTarget, textarea.current)
					}
					ref={preview}
				>
					{draft.content ? (
						<ArticleMarkdown content={draft.content} />
					) : (
						<p className="text-muted text-sm">
							Здесь появится предпросмотр. Начните писать в поле
							Markdown.
						</p>
					)}
				</section>
			</div>
		</>
	)
}

export function EditorView({ id }: { id: string }) {
	const article = useQuery(articleQueries.get(id))
	return (
		<>
			<ContentNav />
			<main className="mx-auto max-w-[1500px] px-4 py-12 pb-24 wrap-anywhere sm:px-6">
				{article.isPending ? (
					<p role="status">Загружаем редактор…</p>
				) : article.error ? (
					<div className="grid gap-6">
						<p
							className="border-l-2 border-red-400 px-3 py-2 text-red-200"
							role="alert"
						>
							{errorMessage(article.error)}
						</p>
						<div className="mb-8 flex flex-wrap items-center gap-4">
							<Button
								onClick={() => void article.refetch()}
								type="button"
							>
								Повторить загрузку
							</Button>
							<Link href="/auth">Войти</Link>
						</div>
					</div>
				) : (
					<Editor article={article.data} key={id} />
				)}
			</main>
		</>
	)
}
