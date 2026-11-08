'use client'

import type { Account } from '@bscp/contracts'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Button, buttonClassName } from '@/components/ui/button'
import { apiClient, errorMessage } from '@/services/api'

type FileAsset = {
	id: string
	name: string
	description: string
	mime: string
	size: number
	createdAt: string
	url: string
}

const MAX_FILE_SIZE = 500 * 1024 * 1024
const inputClassName =
	'border-border-default bg-surface-raised text-foreground focus-visible:border-accent focus-visible:ring-accent/25 min-h-11 w-full min-w-0 rounded-sm border px-3 py-2 text-base outline-none focus-visible:ring-2 disabled:opacity-50'

function formatSize(size: number) {
	if (size < 1024) return `${size} Б`
	if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} КБ`
	return `${(size / (1024 * 1024)).toFixed(1)} МБ`
}

export function AdminFilesView() {
	const client = useQueryClient()
	const fileInput = useRef<HTMLInputElement>(null)
	const [description, setDescription] = useState('')
	const [busy, setBusy] = useState(false)
	const [uploadProgress, setUploadProgress] = useState(0)
	const [error, setError] = useState('')
	const [copied, setCopied] = useState('')
	const me = useQuery({
		queryKey: ['me'],
		queryFn: async () => (await apiClient.get<Account>('/auth/me')).data,
	})
	const enabled = !!me.data && ['OWNER', 'ADMIN'].includes(me.data.role)
	const files = useQuery({
		queryKey: ['admin-files'],
		enabled,
		queryFn: async () =>
			(await apiClient.get<FileAsset[]>('/admin/files')).data,
	})

	useEffect(() => {
		if (!busy) return
		const preventUnload = (event: BeforeUnloadEvent) => {
			event.preventDefault()
		}
		window.addEventListener('beforeunload', preventUnload)
		return () => window.removeEventListener('beforeunload', preventUnload)
	}, [busy])

	async function upload(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const file = fileInput.current?.files?.[0]
		if (!file) {
			setError('Выберите файл')
			return
		}
		if (file.size > MAX_FILE_SIZE) {
			setError('Файл не должен превышать 500 МБ')
			return
		}
		setBusy(true)
		setUploadProgress(0)
		setError('')
		try {
			const data = new FormData()
			data.set('file', file)
			data.set('description', description)
			await apiClient.post('/admin/files', data, {
				onUploadProgress: (event) => {
					if (event.total)
						setUploadProgress(
							Math.min(
								100,
								Math.round((event.loaded / event.total) * 100)
							)
						)
				},
			})
			setDescription('')
			if (fileInput.current) fileInput.current.value = ''
			await client.invalidateQueries({ queryKey: ['admin-files'] })
		} catch (cause) {
			setError(errorMessage(cause))
		} finally {
			setBusy(false)
			setUploadProgress(0)
		}
	}

	async function copyLink(file: FileAsset) {
		const url = new URL(
			`/files/${file.id}`,
			window.location.origin
		).toString()
		try {
			await navigator.clipboard.writeText(url)
			setCopied(file.id)
			window.setTimeout(() => setCopied(''), 1800)
		} catch {
			setError('Не удалось скопировать ссылку')
		}
	}

	return (
		<main className="mx-auto max-w-[1200px] px-4 py-12 pb-24 wrap-anywhere sm:px-6">
			<div className="mb-6 flex flex-wrap items-center gap-3">
				<Link className={buttonClassName('quiet')} href="/admin">
					Администрирование
				</Link>
				<Link className={buttonClassName('quiet')} href="/articles">
					Статьи
				</Link>
			</div>
			<h1 className="type-display mb-8 text-5xl sm:text-7xl">Файлы</h1>
			{me.isPending ? (
				<p role="status">Проверяем доступ…</p>
			) : !enabled ? (
				<div className="grid gap-4">
					<p
						className="border-l-2 border-red-400 px-3 py-2 text-red-200"
						role="alert"
					>
						{me.error
							? errorMessage(me.error)
							: 'Нужны права администратора.'}
					</p>
					<Link className={buttonClassName('secondary')} href="/auth">
						Войти
					</Link>
				</div>
			) : (
				<>
					<form
						className="mb-12 grid max-w-[680px] gap-4"
						onSubmit={upload}
					>
						<label
							className="text-muted grid gap-2 text-sm"
							htmlFor="file-upload"
						>
							Файл
							<input
								className={inputClassName}
								disabled={busy}
								id="file-upload"
								ref={fileInput}
								type="file"
							/>
						</label>
						<label
							className="text-muted grid gap-2 text-sm"
							htmlFor="file-description"
						>
							Описание
							<textarea
								className={`${inputClassName} min-h-24 resize-y`}
								disabled={busy}
								id="file-description"
								maxLength={1000}
								onChange={(event) =>
									setDescription(event.target.value)
								}
								placeholder="Например: архив с материалами для обновления"
								rows={3}
								value={description}
							/>
						</label>
						<div className="flex flex-wrap items-center gap-4">
							<Button disabled={busy} type="submit">
								{busy ? 'Загружаем…' : 'Загрузить файл'}
							</Button>
							<span className="text-muted text-sm">
								До 500 МБ
							</span>
						</div>
					</form>
					{busy && (
						<div
							aria-live="polite"
							className="border-border-default mb-6 grid gap-3 border p-4"
							role="status"
						>
							<div className="flex items-center gap-3">
								<span
									aria-hidden="true"
									className="border-foreground size-4 animate-spin rounded-full border-2 border-r-transparent"
								/>
								<span>
									Загружаем файл, не закрывайте страницу…
								</span>
							</div>
							<progress
								className="h-2 w-full"
								max={100}
								value={uploadProgress}
							/>
							<span className="text-muted text-sm">
								{uploadProgress > 0
									? `${uploadProgress}% отправлено`
									: 'Подготавливаем загрузку…'}
							</span>
						</div>
					)}
					{error && (
						<p
							className="mb-6 border-l-2 border-red-400 px-3 py-2 text-red-200"
							role="alert"
						>
							{error}
						</p>
					)}
					{files.isPending ? (
						<p role="status">Загружаем список файлов…</p>
					) : files.error ? (
						<p
							className="border-l-2 border-red-400 px-3 py-2 text-red-200"
							role="alert"
						>
							{errorMessage(files.error)}
						</p>
					) : files.data.length === 0 ? (
						<p className="text-muted">
							Загруженных файлов пока нет.
						</p>
					) : (
						<div className="grid gap-4">
							{files.data.map((file) => (
								<article
									className="border-border-default grid gap-3 border-b pb-5"
									key={file.id}
								>
									<div className="flex flex-wrap items-start justify-between gap-4">
										<div className="min-w-0">
											<h2 className="text-xl break-all">
												{file.name}
											</h2>
											<p className="text-muted text-sm">
												{file.mime} ·{' '}
												{formatSize(file.size)} ·{' '}
												{new Date(
													file.createdAt
												).toLocaleDateString('ru-RU')}
											</p>
										</div>
										<Button
											onClick={() => void copyLink(file)}
											type="button"
										>
											{copied === file.id
												? 'Скопировано'
												: 'Копировать ссылку'}
										</Button>
									</div>
									{file.description && (
										<p>{file.description}</p>
									)}
									<a
										className="hover:text-accent break-all underline underline-offset-3"
										href={`/files/${file.id}`}
										rel="noopener noreferrer"
										target="_blank"
									>
										Открыть страницу файла
									</a>
								</article>
							))}
						</div>
					)}
				</>
			)}
		</main>
	)
}
