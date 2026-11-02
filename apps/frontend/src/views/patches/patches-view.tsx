'use client'

import type { Account } from '@bscp/contracts'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Image from 'next/image'
import Link from 'next/link'
import { useRef, useState } from 'react'
import { ContentNav } from '@/components/content/nav'
import { Button, buttonClassName } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { apiClient, errorMessage } from '@/services/api'
import {
	type Change,
	type MapResult,
	patchesService,
} from '@/services/patches/patches.service'

const errorClassName = 'mb-4 border-l-2 border-red-400 px-3 py-2 text-red-200'

function mapAssets(result: MapResult) {
	if ('assetId' in result)
		return [
			{
				key: 'map',
				label: result.preset || 'Полная карта',
				asset: result,
			},
		]
	return [
		...(result.before
			? [{ key: 'before', label: 'До изменений', asset: result.before }]
			: []),
		...(result.after
			? [{ key: 'after', label: 'После изменений', asset: result.after }]
			: []),
	]
}

function Value({ value }: { value: unknown }) {
	const text =
		value == null
			? '—'
			: typeof value === 'string'
				? value
				: JSON.stringify(value, null, 2)
	return (
		<>
			<pre className="bg-surface-raised max-h-[500px] overflow-auto p-4 text-sm wrap-anywhere whitespace-pre-wrap">
				{text.slice(0, 10000)}
			</pre>
			{text.length > 10000 && (
				<p className="text-muted text-sm">
					Показаны первые 10 000 символов.
				</p>
			)}
		</>
	)
}

function ChangeList({ items }: { items: Change[] }) {
	return (
		<div className="my-8">
			{items.length === 0 && (
				<p>
					Изменений по этому фильтру нет. Попробуйте другой запрос или
					категорию.
				</p>
			)}
			{items.map((change, index) => (
				<details
					className="border-border-default border-b py-4"
					key={change.id ?? `${change.path}-${index}`}
				>
					<summary className="cursor-pointer leading-relaxed wrap-anywhere">
						<span
							className={`inline-block min-w-[100px] text-[13px] ${
								change.kind === 'ADDED'
									? 'text-accent'
									: change.kind === 'REMOVED'
										? 'text-red-400'
										: 'text-muted'
							}`}
						>
							{{
								ADDED: 'Добавлено',
								REMOVED: 'Удалено',
								CHANGED: 'Изменено',
							}[change.kind] ?? change.kind}
						</span>{' '}
						{change.path}
					</summary>
					<div className="grid gap-4 sm:grid-cols-2">
						<section className="min-w-0">
							<h3 className="text-muted text-sm">До</h3>
							<Value value={change.oldValue} />
						</section>
						<section className="min-w-0">
							<h3 className="text-muted text-sm">После</h3>
							<Value value={change.newValue} />
						</section>
					</div>
				</details>
			))}
		</div>
	)
}

function Pagination({
	page,
	hasMore,
	onPage,
}: {
	page: number
	hasMore: boolean
	onPage: (page: number) => void
}) {
	return (
		<nav
			aria-label="Страницы результатов"
			className="mb-8 flex flex-wrap items-center gap-4"
		>
			<Button
				disabled={page === 1}
				onClick={() => onPage(page - 1)}
				type="button"
			>
				Назад
			</Button>
			<span aria-live="polite" className="text-muted text-sm">
				Страница {page}
			</span>
			<Button
				disabled={!hasMore}
				onClick={() => onPage(page + 1)}
				type="button"
			>
				Далее
			</Button>
		</nav>
	)
}

function LoadError({ error, retry }: { error: unknown; retry: () => void }) {
	return (
		<div>
			<p className={errorClassName} role="alert">
				{errorMessage(error)}
			</p>
			<Button onClick={retry} type="button">
				Повторить загрузку
			</Button>
		</div>
	)
}

export function PatchesView() {
	const [region, setRegion] = useState('RU')
	const [tab, setTab] = useState('PATCH')
	const snapshots = useQuery({
		queryKey: ['patches', region],
		queryFn: () => patchesService.snapshots(region),
		enabled: tab === 'PATCH',
	})
	const data = useQuery({
		queryKey: ['patch-data', tab],
		queryFn: () => patchesService.data(tab),
		enabled: tab !== 'PATCH',
	})
	return (
		<>
			<ContentNav />
			<main className="mx-auto max-w-[1200px] px-4 py-12 pb-24 wrap-anywhere sm:px-6">
				<h1 className="type-display mb-8 text-5xl sm:text-7xl">
					Обновления игры
				</h1>
				<div className="mb-8 flex flex-wrap items-center gap-4">
					<Button
						aria-pressed={tab === 'PATCH'}
						variant={tab === 'PATCH' ? 'primary' : 'secondary'}
						onClick={() => setTab('PATCH')}
						type="button"
					>
						Файлы игры
					</Button>
					<Button
						aria-pressed={tab === 'BALANCE'}
						variant={tab === 'BALANCE' ? 'primary' : 'secondary'}
						onClick={() => setTab('BALANCE')}
						type="button"
					>
						Баланс
					</Button>
					<Button
						aria-pressed={tab === 'LOCALIZATION'}
						variant={
							tab === 'LOCALIZATION' ? 'primary' : 'secondary'
						}
						onClick={() => setTab('LOCALIZATION')}
						type="button"
					>
						Локализации
					</Button>
					<Link className={buttonClassName('quiet')} href="/servers">
						Серверы и онлайн
					</Link>
				</div>
				{tab === 'PATCH' ? (
					<>
						<label
							className="text-muted mb-8 grid max-w-[480px] gap-2 text-sm"
							htmlFor="patch-region"
						>
							Регион
							<Select
								id="patch-region"
								onChange={(event) =>
									setRegion(event.target.value)
								}
								value={region}
							>
								<option value="RU">RU</option>
								<option value="GLOBAL">Global</option>
							</Select>
						</label>
						{snapshots.isPending ? (
							<p role="status">Загружаем снимки…</p>
						) : snapshots.error ? (
							<LoadError
								error={snapshots.error}
								retry={() => void snapshots.refetch()}
							/>
						) : (
							<div className="grid gap-8">
								{snapshots.data.length === 0 && (
									<p>
										Снимков пока нет. Администратор может
										запустить синхронизацию в разделе задач.
									</p>
								)}
								{snapshots.data.map((snapshot) => (
									<article
										className="border-border-default min-w-0 border-b pb-8"
										key={snapshot.id}
									>
										<h2 className="my-2 text-2xl leading-tight">
											<Link
												className="hover:text-accent transition-colors"
												href={`/patches/${snapshot.id}`}
											>
												{new Date(
													snapshot.createdAt
												).toLocaleString('ru-RU')}
											</Link>
										</h2>
										<p className="text-muted text-sm">
											{snapshot.region} ·{' '}
											{snapshot.manifestHash.slice(0, 16)}
										</p>
									</article>
								))}
							</div>
						)}
					</>
				) : data.isPending ? (
					<p role="status">Загружаем историю…</p>
				) : data.error ? (
					<LoadError
						error={data.error}
						retry={() => void data.refetch()}
					/>
				) : (
					<div className="grid gap-8">
						{data.data.length === 0 && (
							<p>
								Данных пока нет. История появится после первой
								успешной синхронизации.
							</p>
						)}
						{data.data.map((snapshot) => (
							<article
								className="border-border-default min-w-0 border-b pb-8"
								key={snapshot.id}
							>
								<h2 className="my-2 text-2xl leading-tight">
									<Link
										className="hover:text-accent transition-colors"
										href={`/patches/data/${snapshot.id}`}
									>
										{new Date(
											snapshot.createdAt
										).toLocaleString('ru-RU')}
									</Link>
								</h2>
								<p className="text-muted text-sm">
									{snapshot.region}
								</p>
							</article>
						))}
					</div>
				)}
			</main>
		</>
	)
}

function FileDetail({ id }: { id: string }) {
	const client = useQueryClient()
	const [error, setError] = useState('')
	const [busy, setBusy] = useState(false)
	const pending = useRef(false)
	const query = useQuery({
		queryKey: ['game-file', id],
		queryFn: () => patchesService.file(id),
		refetchInterval: (query) =>
			['QUEUED', 'RUNNING'].includes(query.state.data?.job?.state ?? '')
				? 3000
				: false,
	})
	const me = useQuery({
		queryKey: ['me'],
		queryFn: async () => (await apiClient.get<Account>('/auth/me')).data,
	})
	if (query.isPending) return <p role="status">Загружаем ресурс…</p>
	if (query.error)
		return (
			<LoadError error={query.error} retry={() => void query.refetch()} />
		)
	const { file, job } = query.data
	const outputs = job?.result?.outputs ?? []
	const downloads = outputs.filter((output) => !output.preview)
	const previews = outputs.filter((output) => output.preview)
	return (
		<section className="border-border-default border-t pt-6 wrap-anywhere">
			<h2 className="my-2 text-2xl leading-tight">{file.path}</h2>
			<p className="text-muted text-sm">
				{Number(file.size).toLocaleString('ru-RU')} байт · SHA-1{' '}
				{file.hash}
			</p>
			{job && (
				<p className="text-muted text-sm" role="status">
					Обработка:{' '}
					{{
						QUEUED: 'В очереди',
						RUNNING: 'Выполняется',
						SUCCEEDED: 'Завершена',
						FAILED: 'Ошибка',
						CANCELLED: 'Отменена',
					}[job.state] ?? job.state}
					{job.error ? ` — ${job.error}` : ''}
				</p>
			)}
			{error && (
				<p className={errorClassName} role="alert">
					{error}
				</p>
			)}
			{me.data &&
				['OWNER', 'ADMIN'].includes(me.data.role) &&
				(!job || ['FAILED', 'CANCELLED'].includes(job.state)) && (
					<Button
						className="mt-4"
						disabled={busy}
						onClick={async () => {
							if (pending.current) return
							pending.current = true
							setBusy(true)
							setError('')
							try {
								await patchesService.process(id)
								await client.invalidateQueries({
									queryKey: ['game-file', id],
								})
							} catch (cause) {
								setError(errorMessage(cause))
							} finally {
								pending.current = false
								setBusy(false)
							}
						}}
						type="button"
					>
						{busy
							? 'Запускаем…'
							: 'Подготовить превью и скачивание'}
					</Button>
				)}
			{!job && <p>Готового превью пока нет.</p>}
			{job?.state === 'SUCCEEDED' && !job.result?.outputs?.length && (
				<p>
					Обработка завершена, но для этого формата нет доступного
					превью.
				</p>
			)}
			{downloads.length > 0 && (
				<div className="mt-6">
					<h3 className="text-muted mb-2 text-sm">
						Файлы для скачивания
					</h3>
					<ul className="flex list-disc flex-col gap-1 pl-6">
						{downloads.map((output) => (
							<li key={output.assetId}>
								<a
									className="hover:text-accent underline underline-offset-3 transition-colors"
									download
									href={`/api/v1/patches/assets/${output.assetId}`}
								>
									{output.name}
								</a>
							</li>
						))}
					</ul>
				</div>
			)}
			{previews.length > 0 && (
				<div className="mt-6 grid [grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-6">
					{previews.map((output) => (
						<figure className="min-w-0" key={output.assetId}>
							<Image
								alt={output.name}
								className="h-auto w-full"
								height={1024}
								src={`/api/v1/patches/assets/${output.assetId}`}
								unoptimized
								width={1024}
							/>
							<figcaption className="text-muted text-sm">
								<a
									className="hover:text-accent underline underline-offset-3 transition-colors"
									download
									href={`/api/v1/patches/assets/${output.assetId}`}
								>
									{output.name}
								</a>
							</figcaption>
						</figure>
					))}
				</div>
			)}
		</section>
	)
}

export function PatchView({ id }: { id: string }) {
	const [page, setPage] = useState(1)
	const [search, setSearch] = useState('')
	const [category, setCategory] = useState('')
	const [mode, setMode] = useState('changes')
	const [file, setFile] = useState<string | null>(null)
	const changes = useQuery({
		queryKey: ['changes', id, page, search, category],
		queryFn: () => patchesService.changes(id, page, search, category),
		enabled: mode === 'changes',
	})
	const files = useQuery({
		queryKey: ['files', id, page, search, category],
		queryFn: () => patchesService.files(id, page, search, category),
		enabled: mode === 'files',
	})
	const maps = useQuery({
		queryKey: ['maps', id],
		queryFn: async () =>
			(
				await apiClient.get<{ id: string; result: MapResult }[]>(
					`/patches/maps/${id}`
				)
			).data,
		enabled: mode === 'maps',
	})
	const current = mode === 'changes' ? changes : files
	function selectMode(next: string) {
		setMode(next)
		setPage(1)
		setFile(null)
	}
	return (
		<>
			<ContentNav />
			<main className="mx-auto max-w-[1200px] px-4 py-12 pb-24 wrap-anywhere sm:px-6">
				<p>
					<Link
						className="hover:text-accent underline underline-offset-3 transition-colors"
						href="/patches"
					>
						Все обновления
					</Link>
				</p>
				<h1 className="type-display mt-4 mb-8 text-5xl sm:text-7xl">
					Патч игры
				</h1>
				<div className="mb-8 flex flex-wrap items-center gap-4">
					<Button
						aria-pressed={mode === 'changes'}
						variant={mode === 'changes' ? 'primary' : 'secondary'}
						onClick={() => selectMode('changes')}
						type="button"
					>
						Изменения
					</Button>
					<Button
						aria-pressed={mode === 'files'}
						variant={mode === 'files' ? 'primary' : 'secondary'}
						onClick={() => selectMode('files')}
						type="button"
					>
						Все файлы и модели
					</Button>
					<Button
						aria-pressed={mode === 'maps'}
						variant={mode === 'maps' ? 'primary' : 'secondary'}
						onClick={() => selectMode('maps')}
						type="button"
					>
						Карты
					</Button>
				</div>
				{mode === 'maps' ? (
					<>
						{maps.isPending && (
							<p role="status">Загружаем карты…</p>
						)}
						{maps.error && (
							<LoadError
								error={maps.error}
								retry={() => void maps.refetch()}
							/>
						)}
						{maps.data?.length === 0 && (
							<p>
								Карты для этого снимка ещё не собраны.
								Администратор может запустить сборку в задачах.
							</p>
						)}
						{maps.data?.flatMap((map) =>
							mapAssets(map.result).map(
								({ key, label, asset }) => (
									<figure
										className="min-w-0"
										key={`${map.id}-${key}`}
									>
										<a
											href={`/api/v1/patches/assets/${asset.assetId}`}
										>
											<Image
												alt={`${label}: ${asset.name}`}
												className="h-auto w-full"
												height={1000}
												src={`/api/v1/patches/assets/${asset.assetId}`}
												unoptimized
												width={1600}
											/>
										</a>
										<figcaption className="text-muted text-sm">
											{label}:{' '}
											{asset.preset || 'Полная карта'}
										</figcaption>
									</figure>
								)
							)
						)}
					</>
				) : (
					<>
						<div className="mb-8 grid gap-6 sm:grid-cols-2">
							<label
								className="text-muted grid gap-2 text-sm"
								htmlFor="patch-search"
							>
								Путь или имя файла
								<Input
									id="patch-search"
									maxLength={120}
									onChange={(event) => {
										setSearch(event.target.value)
										setPage(1)
										setFile(null)
									}}
									type="search"
									value={search}
								/>
							</label>
							<label
								className="text-muted grid gap-2 text-sm"
								htmlFor="patch-category"
							>
								Категория
								<Select
									id="patch-category"
									onChange={(event) => {
										setCategory(event.target.value)
										setPage(1)
										setFile(null)
									}}
									value={category}
								>
									<option value="">Все</option>
									<option value="models">Модели</option>
									<option value="textures">Текстуры</option>
									<option value="maps">Карты</option>
									<option value="localization">
										Локализации
									</option>
									<option value="images">Изображения</option>
									<option value="other">Прочее</option>
								</Select>
							</label>
						</div>
						{current.isPending ? (
							<p role="status">Загружаем…</p>
						) : current.error ? (
							<LoadError
								error={current.error}
								retry={() => void current.refetch()}
							/>
						) : (
							<>
								{mode === 'changes' ? (
									<ChangeList
										items={changes.data?.items ?? []}
									/>
								) : (
									<div className="my-8 grid">
										{files.data?.items.length === 0 && (
											<p>
												Файлы не найдены. Измените
												запрос или категорию.
											</p>
										)}
										{files.data?.items.map((item) => (
											<Button
												aria-pressed={file === item.id}
												className="w-full justify-between gap-4 text-left wrap-anywhere"
												key={item.id}
												onClick={() => setFile(item.id)}
												type="button"
											>
												{item.path}
												<span className="text-muted text-sm whitespace-nowrap">
													{Number(
														item.size
													).toLocaleString(
														'ru-RU'
													)}{' '}
													байт
												</span>
											</Button>
										))}
									</div>
								)}
								<Pagination
									hasMore={!!current.data?.hasMore}
									onPage={(next) => {
										setPage(next)
										setFile(null)
									}}
									page={page}
								/>
							</>
						)}
						{file && (
							<>
								<Button
									onClick={() => setFile(null)}
									type="button"
								>
									Закрыть ресурс
								</Button>
								<FileDetail id={file} key={file} />
							</>
						)}
					</>
				)}
			</main>
		</>
	)
}

export function DataChangesView({ id }: { id: string }) {
	const [page, setPage] = useState(1)
	const [search, setSearch] = useState('')
	const query = useQuery({
		queryKey: ['data-changes', id, page, search],
		queryFn: () => patchesService.dataChanges(id, page, search),
	})
	return (
		<>
			<ContentNav />
			<main className="mx-auto max-w-[1200px] px-4 py-12 pb-24 wrap-anywhere sm:px-6">
				<p>
					<Link
						className="hover:text-accent underline underline-offset-3 transition-colors"
						href="/patches"
					>
						Все обновления
					</Link>
				</p>
				<h1 className="type-display mt-4 mb-8 text-5xl sm:text-7xl">
					Изменения данных
				</h1>
				<label
					className="text-muted mb-8 grid max-w-[480px] gap-2 text-sm"
					htmlFor="data-changes-search"
				>
					Найти параметр
					<Input
						id="data-changes-search"
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
					<p role="status">Загружаем изменения…</p>
				) : query.error ? (
					<LoadError
						error={query.error}
						retry={() => void query.refetch()}
					/>
				) : (
					<>
						<ChangeList items={query.data.items} />
						<Pagination
							hasMore={query.data.hasMore}
							onPage={setPage}
							page={page}
						/>
					</>
				)}
			</main>
		</>
	)
}
