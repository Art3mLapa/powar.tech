'use client'

import type { Account } from '@bscp/contracts'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useRef, useState } from 'react'
import { ContentNav } from '@/components/content/nav'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { apiClient, errorMessage } from '@/services/api'
import type { Job, Snapshot } from '@/services/patches/patches.service'

const errorClassName = 'mb-4 border-l-2 border-red-400 px-3 py-2 text-red-200'
const buttonLink =
	'underline underline-offset-3 hover:text-accent transition-colors'

const presets = [
	'zone',
	'newsever',
	'underarmsklad',
	'underpd',
	'xvoiniy',
	'kvartali',
	'rozavetrov',
	'nizina',
	'sovhoz',
	'sovhozfull',
	'boral2023',
	'boral2021',
	'gawrgura',
]
const kindLabels: Record<string, string> = {
	PATCH: 'Обновление игры',
	BALANCE: 'Баланс',
	LOCALIZATION: 'Локализации',
	SERVERS: 'Онлайн серверов',
	MAP: 'Карта',
	FILE: 'Ресурс',
}
const stateLabels: Record<string, string> = {
	QUEUED: 'В очереди',
	RUNNING: 'Выполняется',
	SUCCEEDED: 'Завершена',
	FAILED: 'Ошибка',
	CANCELLED: 'Отменена',
}
function resultText(value: unknown) {
	if (typeof value === 'string') return value
	try {
		return JSON.stringify(value, null, 2) ?? '—'
	} catch {
		return String(value)
	}
}

export function JobsView() {
	const client = useQueryClient()
	const [error, setError] = useState('')
	const [notice, setNotice] = useState('')
	const [kind, setKind] = useState('PATCH')
	const [region, setRegion] = useState('RU')
	const [snapshotId, setSnapshotId] = useState('')
	const [preset, setPreset] = useState('')
	const [diff, setDiff] = useState('')
	const [busy, setBusy] = useState(false)
	const pending = useRef(false)
	const me = useQuery({
		queryKey: ['me'],
		queryFn: async () => (await apiClient.get<Account>('/auth/me')).data,
	})
	const enabled = !!me.data && ['OWNER', 'ADMIN'].includes(me.data.role)
	const jobs = useQuery({
		queryKey: ['jobs'],
		enabled,
		queryFn: async () => (await apiClient.get<Job[]>('/patches/jobs')).data,
		refetchInterval: 3000,
	})
	const snapshots = useQuery({
		queryKey: ['job-snapshots', region],
		enabled: enabled && kind === 'MAP',
		queryFn: async () =>
			(
				await apiClient.get<Snapshot[]>('/patches', {
					params: { region },
				})
			).data,
	})

	async function run(fn: () => Promise<unknown>, success: string) {
		if (pending.current) return
		pending.current = true
		setBusy(true)
		setError('')
		setNotice('')
		try {
			await fn()
			await client.invalidateQueries({ queryKey: ['jobs'] })
			setNotice(success)
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
					Обработка обновлений
				</h1>
				{me.isPending ? (
					<p role="status">Проверяем доступ…</p>
				) : !enabled ? (
					<p className={errorClassName} role="alert">
						{me.error
							? errorMessage(me.error)
							: 'Нужны права администратора.'}{' '}
						<Link className={buttonLink} href="/auth">
							Войти
						</Link>
					</p>
				) : (
					<>
						<p>
							<Link className={buttonLink} href="/admin">
								Администрирование
							</Link>
						</p>
						{error && (
							<p className={errorClassName} role="alert">
								{error}
							</p>
						)}
						{notice && <p role="status">{notice}</p>}
						<form
							aria-busy={busy}
							className="grid gap-6 sm:grid-cols-2"
							onSubmit={(event) => {
								event.preventDefault()
								void run(
									() =>
										apiClient.post('/patches/jobs', {
											kind,
											region,
											...(kind === 'MAP'
												? {
														snapshotId,
														preset,
														...(diff
															? { diff }
															: {}),
													}
												: {}),
										}),
									'Задача добавлена в очередь.'
								)
							}}
						>
							<label
								className="text-muted grid gap-2 text-sm"
								htmlFor="job-kind"
							>
								Задача
								<Select
									disabled={busy}
									id="job-kind"
									onChange={(event) => {
										setKind(event.target.value)
										setSnapshotId('')
										setDiff('')
									}}
									value={kind}
								>
									<option value="PATCH">
										Проверить обновление игры
									</option>
									<option value="BALANCE">
										Обновить баланс
									</option>
									<option value="SERVERS">
										Обновить онлайн
									</option>
									<option value="MAP">Собрать карту</option>
								</Select>
							</label>
							<label
								className="text-muted grid gap-2 text-sm"
								htmlFor="job-region"
							>
								Регион
								<Select
									disabled={busy}
									id="job-region"
									onChange={(event) => {
										setRegion(event.target.value)
										setSnapshotId('')
									}}
									value={region}
								>
									<option value="RU">RU</option>
									<option value="GLOBAL">Global</option>
								</Select>
							</label>
							{kind === 'MAP' && (
								<>
									<label
										className="text-muted grid gap-2 text-sm"
										htmlFor="job-snapshot"
									>
										Снимок
										<Select
											disabled={
												busy || snapshots.isPending
											}
											id="job-snapshot"
											onChange={(event) =>
												setSnapshotId(
													event.target.value
												)
											}
											required
											value={snapshotId}
										>
											<option value="">
												{snapshots.isPending
													? 'Загружаем снимки…'
													: 'Выберите снимок'}
											</option>
											{snapshots.data?.map((snapshot) => (
												<option
													key={snapshot.id}
													value={snapshot.id}
												>
													{new Date(
														snapshot.createdAt
													).toLocaleString('ru-RU')}
												</option>
											))}
										</Select>
									</label>
									<label
										className="text-muted grid gap-2 text-sm"
										htmlFor="job-preset"
									>
										Область
										<Select
											disabled={busy}
											id="job-preset"
											onChange={(event) =>
												setPreset(event.target.value)
											}
											value={preset}
										>
											<option value="">
												Полная карта
											</option>
											{presets.map((name) => (
												<option key={name} value={name}>
													{name}
												</option>
											))}
										</Select>
									</label>
									<label
										className="text-muted grid gap-2 text-sm"
										htmlFor="job-diff"
									>
										Изменение карты
										<Select
											disabled={busy}
											id="job-diff"
											onChange={(event) =>
												setDiff(event.target.value)
											}
											value={diff}
										>
											<option value="">Вся карта</option>
											<option value="added">
												Добавленные
											</option>
											<option value="removed">
												Удалённые
											</option>
											<option value="changed">
												Изменённые
											</option>
										</Select>
									</label>
									{snapshots.error && (
										<p
											className={errorClassName}
											role="alert"
										>
											{errorMessage(snapshots.error)}
										</p>
									)}
									{snapshots.data?.length === 0 && (
										<p>
											Сначала запустите проверку
											обновления игры: для сборки карты
											нужен снимок.
										</p>
									)}
								</>
							)}
							<Button
								className="w-fit sm:col-span-2"
								disabled={
									busy ||
									(kind === 'MAP' &&
										(!snapshotId ||
											snapshots.isPending ||
											!!snapshots.error))
								}
								type="submit"
							>
								{busy ? 'Отправляем…' : 'Запустить задачу'}
							</Button>
						</form>
						<p className="text-muted text-sm">
							Для патчей нужны настроенные учётные данные launcher
							на worker. Ошибка задачи не заменяет последний
							успешный снимок.
						</p>
						{jobs.isPending && (
							<p role="status">Загружаем задачи…</p>
						)}
						{jobs.error && (
							<p className={errorClassName} role="alert">
								{errorMessage(jobs.error)}
							</p>
						)}
						<div className="grid gap-8">
							{jobs.data?.length === 0 && (
								<p>
									Задач пока нет. Выберите задачу и запустите
									её выше.
								</p>
							)}
							{jobs.data?.map((job) => (
								<article
									className="border-border-default min-w-0 border-b pb-8"
									key={job.id}
								>
									<h2 className="my-2 text-2xl leading-tight">
										{kindLabels[job.kind] ?? job.kind} —{' '}
										{stateLabels[job.state] ?? job.state}
									</h2>
									<p className="text-muted text-sm">
										{new Date(job.createdAt).toLocaleString(
											'ru-RU'
										)}{' '}
										· попытка {job.attempts}
									</p>
									{job.error && (
										<p className={errorClassName}>
											{job.error}
										</p>
									)}
									{['FAILED', 'CANCELLED'].includes(
										job.state
									) && (
										<Button
											aria-label={`Повторить задачу ${job.id}`}
											disabled={busy}
											onClick={() =>
												void run(
													() =>
														apiClient.post(
															`/patches/jobs/${job.id}/retry`,
															{}
														),
													'Задача поставлена на повтор.'
												)
											}
											type="button"
										>
											Повторить
										</Button>
									)}
									{['RUNNING', 'QUEUED'].includes(
										job.state
									) && (
										<Button
											aria-label={`Отменить задачу ${job.id}`}
											disabled={busy}
											onClick={() => {
												if (
													window.confirm(
														'Отменить задачу?'
													)
												)
													void run(
														() =>
															apiClient.post(
																`/patches/jobs/${job.id}/cancel`,
																{}
															),
														'Запрос на отмену отправлен.'
													)
											}}
											type="button"
										>
											Отменить
										</Button>
									)}
									{job.result !== null && (
										<details className="mt-4">
											<summary className="cursor-pointer">
												Результат
											</summary>
											<pre className="bg-surface-raised mt-4 max-h-[500px] overflow-auto p-4 text-sm wrap-anywhere whitespace-pre-wrap">
												{resultText(job.result)}
											</pre>
										</details>
									)}
								</article>
							))}
						</div>
					</>
				)}
			</main>
		</>
	)
}
