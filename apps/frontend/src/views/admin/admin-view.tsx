'use client'

import { type Account, type Article, usernameSchema } from '@bscp/contracts'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { type ReactNode, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { apiClient, errorMessage } from '@/services/api'

const errorClassName = 'mb-4 border-l-2 border-red-400 px-3 py-2 text-red-200'
const cellClassName = 'border-border-default border-b px-3 py-2 text-left'
const buttonLink =
	'underline underline-offset-3 hover:text-accent transition-colors'

type User = Account & { disabled: boolean; totpEnabled: boolean }
type Invitation = {
	id: string
	username: string
	role: string
	expiresAt: string
	usedAt: string | null
}
type Audit = {
	id: string
	action: string
	actorId: number | null
	subject: string
	createdAt: string
}

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="border-border-default mt-12 border-t pt-6">
			<h2 className="mb-4 text-2xl">{title}</h2>
			{children}
		</section>
	)
}

export function AdminView() {
	const client = useQueryClient()
	const [username, setUsername] = useState('')
	const [role, setRole] = useState('AUTHOR')
	const [link, setLink] = useState('')
	const [error, setError] = useState('')
	const [busy, setBusy] = useState(false)
	const pending = useRef(false)
	const me = useQuery({
		queryKey: ['me'],
		queryFn: async () => (await apiClient.get<Account>('/auth/me')).data,
	})
	const enabled = !!me.data && ['OWNER', 'ADMIN'].includes(me.data.role)
	const users = useQuery({
		queryKey: ['admin-users'],
		enabled,
		queryFn: async () => (await apiClient.get<User[]>('/admin/users')).data,
	})
	const invitations = useQuery({
		queryKey: ['admin-invitations'],
		enabled,
		queryFn: async () =>
			(await apiClient.get<Invitation[]>('/admin/invitations')).data,
	})
	const review = useQuery({
		queryKey: ['admin-review'],
		enabled,
		queryFn: async () =>
			(await apiClient.get<Article[]>('/articles/admin/review')).data,
	})
	const audit = useQuery({
		queryKey: ['admin-audit'],
		enabled,
		queryFn: async () =>
			(await apiClient.get<Audit[]>('/admin/audit')).data,
	})

	async function action(fn: () => Promise<unknown>) {
		if (pending.current) return
		pending.current = true
		setBusy(true)
		setError('')
		try {
			await fn()
			await Promise.all(
				['admin-users', 'admin-invitations', 'admin-audit'].map((key) =>
					client.invalidateQueries({ queryKey: [key] })
				)
			)
		} catch (cause) {
			setError(errorMessage(cause))
		} finally {
			pending.current = false
			setBusy(false)
		}
	}

	return (
		<>
			<main className="mx-auto max-w-[1200px] px-4 py-12 pb-24 wrap-anywhere sm:px-6">
				<h1 className="type-display mb-8 text-5xl sm:text-7xl">
					Администрирование
				</h1>
				{me.isPending ? (
					<p role="status">Проверяем доступ…</p>
				) : !enabled ? (
					<div>
						<p className={errorClassName} role="alert">
							{me.error
								? errorMessage(me.error)
								: 'Нужны права администратора.'}
						</p>
						<Link className={buttonLink} href="/auth">
							Войти
						</Link>
					</div>
				) : (
					<>
						<p>
							<Link className={buttonLink} href="/admin/jobs">
								Задачи парсера и рендера
							</Link>
						</p>
						{error && (
							<p className={errorClassName} role="alert">
								{error}
							</p>
						)}
						<Section title="Пригласить в редакцию">
							<form
								aria-busy={busy}
								className="grid gap-6 sm:grid-cols-2"
								onSubmit={(event) => {
									event.preventDefault()
									void action(async () => {
										const parsedUsername =
											usernameSchema.safeParse(username)
										if (!parsedUsername.success) {
											setError(
												'Username должен содержать 3–32 символа: латинские буквы, цифры, _ или -, начиная с буквы или цифры.'
											)
											return
										}
										const { data } = await apiClient.post<{
											url: string
										}>('/auth/invitations', {
											username: parsedUsername.data,
											role,
										})
										setLink(data.url)
										setUsername('')
									})
								}}
							>
								<label
									className="text-muted grid gap-2 text-sm"
									htmlFor="invitation-username"
								>
									Username
									<Input
										aria-describedby="invitation-username-help"
										autoCapitalize="none"
										autoComplete="username"
										disabled={busy}
										id="invitation-username"
										maxLength={32}
										minLength={3}
										name="username"
										onChange={(event) =>
											setUsername(event.target.value)
										}
										required
										spellCheck={false}
										type="text"
										value={username}
									/>
								</label>
								<label
									className="text-muted grid gap-2 text-sm"
									htmlFor="invitation-role"
								>
									Права
									<Select
										disabled={busy}
										id="invitation-role"
										onChange={(event) =>
											setRole(event.target.value)
										}
										value={role}
									>
										<option value="AUTHOR">Автор</option>
										{me.data?.role === 'OWNER' && (
											<option value="ADMIN">
												Администратор
											</option>
										)}
									</Select>
								</label>
								<span
									className="text-muted text-sm sm:col-span-2"
									id="invitation-username-help"
								>
									3–32 символа: латинские буквы, цифры, _ или
									-. Первый символ — буква или цифра.
								</span>
								<Button
									className="w-fit"
									disabled={busy}
									type="submit"
								>
									{busy
										? 'Выполняем…'
										: 'Создать приглашение'}
								</Button>
							</form>
							{link && (
								<div className="mt-6 grid gap-6" role="status">
									<p>
										Передайте ссылку получателю. Срок
										действия — сутки.
									</p>
									<label
										className="text-muted grid gap-2 text-sm"
										htmlFor="invitation-link"
									>
										Ссылка-приглашение
										<Input
											id="invitation-link"
											onFocus={(event) =>
												event.target.select()
											}
											readOnly
											value={link}
										/>
									</label>
								</div>
							)}
						</Section>
						<Section title="Ожидают проверки">
							{review.isPending && (
								<p role="status">Загружаем статьи…</p>
							)}
							{review.error && (
								<p className={errorClassName} role="alert">
									{errorMessage(review.error)}
								</p>
							)}
							{review.data?.length === 0 && (
								<p>Все статьи проверены.</p>
							)}
							{review.data?.map((post) => (
								<p key={post.id}>
									<Link
										className={buttonLink}
										href={`/workspace/articles/${post.id}`}
									>
										{post.title}
									</Link>
								</p>
							))}
						</Section>
						<Section title="Аккаунты">
							{users.isPending && (
								<p role="status">Загружаем аккаунты…</p>
							)}
							{users.error && (
								<p className={errorClassName} role="alert">
									{errorMessage(users.error)}
								</p>
							)}
							<table className="w-full border-collapse overflow-auto text-left">
								<caption className="sr-only">
									Доступ участников редакции
								</caption>
								<thead>
									<tr>
										<th
											className={cellClassName}
											scope="col"
										>
											Username
										</th>
										<th
											className={cellClassName}
											scope="col"
										>
											Права
										</th>
										<th
											className={cellClassName}
											scope="col"
										>
											2FA
										</th>
										<th
											className={cellClassName}
											scope="col"
										>
											Доступ
										</th>
									</tr>
								</thead>
								<tbody>
									{users.data?.map((user) => (
										<tr key={user.id}>
											<td className={cellClassName}>
												{user.username}
											</td>
											<td className={cellClassName}>
												{{
													OWNER: 'Владелец',
													ADMIN: 'Администратор',
													AUTHOR: 'Автор',
												}[user.role] ?? user.role}
											</td>
											<td className={cellClassName}>
												{user.totpEnabled
													? 'Подключена'
													: 'Ожидает подключения'}
											</td>
											<td className={cellClassName}>
												{me.data?.role === 'OWNER' &&
												user.role !== 'OWNER' ? (
													<Button
														aria-label={`${user.disabled ? 'Включить' : 'Отключить'} доступ ${user.username}`}
														disabled={busy}
														onClick={() => {
															if (
																!user.disabled &&
																!window.confirm(
																	`Отключить доступ ${user.username}?`
																)
															)
																return
															void action(() =>
																apiClient.patch(
																	`/admin/users/${user.id}`,
																	{
																		role: user.role,
																		disabled:
																			!user.disabled,
																	}
																)
															)
														}}
														type="button"
													>
														{user.disabled
															? 'Включить'
															: 'Отключить'}
													</Button>
												) : user.disabled ? (
													'Отключён'
												) : (
													'Включён'
												)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</Section>
						<Section title="Приглашения">
							{invitations.isPending && (
								<p role="status">Загружаем приглашения…</p>
							)}
							{invitations.error && (
								<p className={errorClassName} role="alert">
									{errorMessage(invitations.error)}
								</p>
							)}
							{invitations.data?.length === 0 && (
								<p>
									Активных приглашений пока нет. Создайте
									приглашение для нового автора выше.
								</p>
							)}
							{invitations.data?.map((invitation) => (
								<p key={invitation.id}>
									{invitation.username} —{' '}
									{invitation.usedAt
										? 'Использовано'
										: new Date(
													invitation.expiresAt
												).getTime() < Date.now()
											? 'Истекло'
											: 'Ожидает регистрации'}{' '}
									{!invitation.usedAt &&
										invitation.role !== 'OWNER' && (
											<Button
												aria-label={`Отозвать приглашение ${invitation.username}`}
												className="ml-2"
												disabled={busy}
												onClick={() => {
													if (
														window.confirm(
															`Отозвать приглашение ${invitation.username}?`
														)
													)
														void action(() =>
															apiClient.delete(
																`/admin/invitations/${invitation.id}`
															)
														)
												}}
												type="button"
											>
												Отозвать
											</Button>
										)}
								</p>
							))}
						</Section>
						<Section title="Журнал действий">
							{audit.isPending && (
								<p role="status">Загружаем журнал…</p>
							)}
							{audit.error && (
								<p className={errorClassName} role="alert">
									{errorMessage(audit.error)}
								</p>
							)}
							{audit.data?.length === 0 && (
								<p>Действий пока нет.</p>
							)}
							<table className="w-full border-collapse overflow-auto text-left">
								<caption className="sr-only">
									Последние действия в редакции
								</caption>
								<thead>
									<tr>
										<th
											className={cellClassName}
											scope="col"
										>
											Когда
										</th>
										<th
											className={cellClassName}
											scope="col"
										>
											Действие
										</th>
										<th
											className={cellClassName}
											scope="col"
										>
											Объект
										</th>
									</tr>
								</thead>
								<tbody>
									{audit.data?.map((entry) => (
										<tr key={entry.id}>
											<td className={cellClassName}>
												{new Date(
													entry.createdAt
												).toLocaleString('ru-RU')}
											</td>
											<td className={cellClassName}>
												{entry.action}
											</td>
											<td className={cellClassName}>
												{entry.subject}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</Section>
					</>
				)}
			</main>
		</>
	)
}
