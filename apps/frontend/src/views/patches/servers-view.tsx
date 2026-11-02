'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'
import { ContentNav } from '@/components/content/nav'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { apiClient, errorMessage } from '@/services/api'

type Sample = { id: string; createdAt: string; data: unknown }
function online(data: unknown): number {
	if (Array.isArray(data))
		return data.reduce((sum, row) => sum + online(row), 0)
	if (!data || typeof data !== 'object') return 0
	const row = data as Record<string, unknown>
	for (const key of ['onlineCurrent', 'online', 'playersOnline', 'players']) {
		const value = row[key]
		if (typeof value === 'number' && Number.isFinite(value))
			return Math.max(0, value)
	}
	for (const key of ['data', 'servers']) {
		if (key in row) return online(row[key])
	}
	for (const key of ['total', 'onlineTotal', 'playersTotal']) {
		const value = row[key]
		if (typeof value === 'number' && Number.isFinite(value))
			return Math.max(0, value)
	}
	return 0
}

export function ServersView() {
	const [region, setRegion] = useState('RU')
	const query = useQuery({
		queryKey: ['servers', region],
		queryFn: async () =>
			(
				await apiClient.get<Sample[]>('/patches/servers', {
					params: { region },
				})
			).data,
		refetchInterval: 60000,
	})
	const rows = query.data?.toReversed() ?? []
	const values = rows.map((sample) => online(sample.data))
	const maximum = Math.max(...values, 1)
	const latest = rows.at(-1)
	return (
		<>
			<ContentNav />
			<main className="mx-auto max-w-[1200px] px-4 py-12 pb-24 wrap-anywhere sm:px-6">
				<p>
					<Link href="/patches">Обновления игры</Link>
				</p>
				<h1 className="type-display mb-8 text-5xl sm:text-7xl">
					Серверы игры
				</h1>
				<label
					className="text-muted mb-8 grid max-w-[480px] gap-2 text-sm"
					htmlFor="servers-region"
				>
					Регион
					<Select
						id="servers-region"
						onChange={(event) => setRegion(event.target.value)}
						value={region}
					>
						<option value="RU">RU</option>
						<option value="GLOBAL">Global</option>
					</Select>
				</label>
				{query.isPending ? (
					<p role="status">Загружаем данные…</p>
				) : query.error ? (
					<div>
						<p
							className="mb-4 border-l-2 border-red-400 px-3 py-2 text-red-200"
							role="alert"
						>
							{errorMessage(query.error)}
						</p>
						<Button
							onClick={() => void query.refetch()}
							type="button"
						>
							Повторить загрузку
						</Button>
					</div>
				) : !latest ? (
					<p>
						История пока не собрана. Администратор может запустить
						обновление онлайна в разделе задач.
					</p>
				) : (
					<>
						<h2 className="mb-4 text-2xl">История онлайна</h2>
						<p>
							Последний снимок:{' '}
							{online(latest.data).toLocaleString('ru-RU')}{' '}
							игроков. Данные обновляются раз в минуту.
						</p>
						<svg
							aria-labelledby="online-chart-title online-chart-description"
							className="border-border-default my-4 block w-full border-b"
							role="img"
							viewBox="0 0 1000 240"
						>
							<title id="online-chart-title">
								История количества игроков
							</title>
							<desc id="online-chart-description">
								Максимальное значение за период:{' '}
								{maximum.toLocaleString('ru-RU')}. Значения и
								время каждого снимка доступны в таблице ниже.
							</desc>
							<polyline
								fill="none"
								points={values
									.map(
										(value, index) =>
											`${(index / Math.max(values.length - 1, 1)) * 1000},${220 - (value / maximum) * 200}`
									)
									.join(' ')}
								stroke="var(--accent-telegram)"
								strokeWidth="3"
							/>
							{values.length === 1 && (
								<circle
									cx="0"
									cy={220 - (values[0] / maximum) * 200}
									fill="var(--accent-telegram)"
									r="5"
								/>
							)}
						</svg>
						<details>
							<summary>Значения по времени</summary>
							<table className="w-full border-collapse overflow-auto text-left">
								<caption className="sr-only">
									Количество игроков в каждом снимке
								</caption>
								<thead>
									<tr>
										<th
											className="border-border-default border-b px-3 py-2"
											scope="col"
										>
											Время
										</th>
										<th
											className="border-border-default border-b px-3 py-2"
											scope="col"
										>
											Игроки
										</th>
									</tr>
								</thead>
								<tbody>
									{rows.map((sample, index) => (
										<tr key={sample.id}>
											<td className="border-border-default border-b px-3 py-2">
												{new Date(
													sample.createdAt
												).toLocaleString('ru-RU')}
											</td>
											<td className="border-border-default border-b px-3 py-2">
												{values[index].toLocaleString(
													'ru-RU'
												)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</details>
						<h2 className="mt-8 mb-4 text-2xl">
							Последний снимок серверов
						</h2>
						<pre className="bg-surface-raised max-h-[500px] overflow-auto p-4 text-sm wrap-anywhere whitespace-pre-wrap">
							{JSON.stringify(latest.data, null, 2)}
						</pre>
					</>
				)}
			</main>
		</>
	)
}
