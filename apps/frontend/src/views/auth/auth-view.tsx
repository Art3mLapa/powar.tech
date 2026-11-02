'use client'

import { type Account, usernameSchema } from '@bscp/contracts'
import { useQueryClient } from '@tanstack/react-query'
import Image from 'next/image'
import Link from 'next/link'
import QRCode from 'qrcode'
import { useEffect, useRef, useState } from 'react'
import { ContentNav } from '@/components/content/nav'
import { Button, buttonClassName } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiClient, errorMessage } from '@/services/api'

type Enrollment = {
	challenge: string
	secret?: string
	uri?: string
	issuer?: string
}

export function AuthView({ registration = false }: { registration?: boolean }) {
	const client = useQueryClient()
	const [token, setToken] = useState('')
	const [username, setUsername] = useState('')
	const [password, setPassword] = useState('')
	const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
	const [code, setCode] = useState('')
	const [error, setError] = useState('')
	const [busy, setBusy] = useState(false)
	const [ready, setReady] = useState(false)
	const [recovery, setRecovery] = useState<string[] | null>(null)
	const [qrCode, setQrCode] = useState('')
	const codeInput = useRef<HTMLInputElement>(null)

	useEffect(() => {
		const hash = new URLSearchParams(window.location.hash.slice(1))
		const inviteToken = hash.get('token')
		if (inviteToken) setToken(inviteToken)
		const challenge = hash.get('challenge')
		if (challenge) setEnrollment({ challenge })
		if (window.location.hash)
			window.history.replaceState(null, '', window.location.pathname)
		setReady(true)
	}, [])

	useEffect(() => {
		if (enrollment) codeInput.current?.focus()
	}, [enrollment])

	useEffect(() => {
		let cancelled = false
		setQrCode('')
		if (enrollment?.uri)
			void QRCode.toDataURL(enrollment.uri, {
				errorCorrectionLevel: 'M',
				margin: 2,
				width: 240,
			})
				.then((value) => {
					if (!cancelled) setQrCode(value)
				})
				.catch(() => undefined)
		return () => {
			cancelled = true
		}
	}, [enrollment?.uri])

	async function submit(event: React.FormEvent) {
		event.preventDefault()
		if (busy) return
		setBusy(true)
		setError('')
		try {
			if (enrollment) {
				const { data } = await apiClient.post<{
					user: Account
					recoveryCodes: string[]
				}>('/auth/factor', {
					challenge: enrollment.challenge,
					code: code.trim(),
				})
				client.clear()
				client.setQueryData(['me'], data.user)
				setRecovery(data.recoveryCodes)
				setEnrollment(null)
				setCode('')
				return
			}
			const parsedUsername = usernameSchema.safeParse(username)
			if (!parsedUsername.success) {
				setError(
					'Username должен содержать 3–32 символа: латинские буквы, цифры, _ или -, начиная с буквы или цифры.'
				)
				return
			}
			const { data } = await apiClient.post<Enrollment>(
				registration ? '/auth/register' : '/auth/login',
				registration
					? { token, username: parsedUsername.data, password }
					: { username: parsedUsername.data, password }
			)
			setEnrollment(data)
			setPassword('')
		} catch (cause) {
			setError(errorMessage(cause))
		} finally {
			setBusy(false)
		}
	}

	function downloadCodes() {
		const url = URL.createObjectURL(
			new Blob([recovery?.join('\n') ?? ''], { type: 'text/plain' })
		)
		const anchor = document.createElement('a')
		anchor.href = url
		anchor.download = 'bscp-recovery-codes.txt'
		anchor.click()
		setTimeout(() => URL.revokeObjectURL(url), 1000)
	}

	return (
		<>
			<ContentNav />
			<main className="mx-auto max-w-[620px] px-4 py-12 pb-24 wrap-anywhere sm:px-6">
				<h1 className="type-display mb-8 text-5xl sm:text-7xl">
					{recovery
						? 'Доступ открыт'
						: enrollment
							? 'Двухфакторная защита'
							: registration
								? 'Создать аккаунт'
								: 'Вход в редакцию'}
				</h1>
				{recovery ? (
					<div className="flex flex-col gap-2">
						{recovery.length > 0 && (
							<>
								<p>
									Сохраните резервные коды в надёжном месте.
									Каждый код можно использовать один раз;
									повторно они не отображаются.
								</p>
								<pre className="bg-surface-raised text-foreground max-h-[60vh] overflow-x-auto p-6 font-mono leading-loose">
									{recovery.join('\n')}
								</pre>
							</>
						)}
						<div className="flex w-full gap-4">
							<Button
								className="w-full"
								onClick={downloadCodes}
								type="button"
								variant="primary"
							>
								Скачать коды
							</Button>
							<Link
								className={buttonClassName(
									'secondary',
									'w-full'
								)}
								href="/workspace"
							>
								Открыть редакцию
							</Link>
						</div>
					</div>
				) : (
					<form
						aria-busy={busy}
						className="grid gap-6"
						onSubmit={submit}
					>
						{registration && ready && !token && !enrollment && (
							<p
								className="border-l-2 border-red-400 px-3 py-2 text-red-200"
								role="alert"
							>
								Откройте ссылку из приглашения. Без неё создать
								аккаунт нельзя. Уже зарегистрированы?{' '}
								<Link href="/auth">Войти</Link>.
							</p>
						)}
						{enrollment ? (
							<>
								{enrollment.secret ? (
									<>
										<p>
											Отсканируйте QR-код в приложении-
											аутентификаторе. Если сканирование
											недоступно, используйте секрет ниже.
										</p>
										{qrCode && (
											<Image
												alt="QR-код для подключения двухфакторной аутентификации"
												className="size-60 bg-white p-3 [image-rendering:pixelated]"
												height={240}
												src={qrCode}
												unoptimized
												width={240}
											/>
										)}
										<code className="bg-surface-raised p-4 font-mono wrap-anywhere">
											{enrollment.secret}
										</code>
										{enrollment.issuer && (
											<p className="text-muted text-sm">
												Издатель: {enrollment.issuer}
											</p>
										)}
										{enrollment.uri && (
											<a href={enrollment.uri}>
												Открыть
												приложение-аутентификатор
											</a>
										)}
									</>
								) : (
									<p id="factor-help">
										Введите текущий код из
										приложения-аутентификатора или один из
										сохранённых резервных кодов.
									</p>
								)}
								<label
									className="text-muted grid gap-2 text-sm"
									htmlFor="auth-code"
								>
									Код{' '}
									{enrollment.secret
										? 'из приложения'
										: 'из приложения или резервный код'}
									<Input
										autoCapitalize="none"
										autoComplete="one-time-code"
										id="auth-code"
										maxLength={40}
										minLength={6}
										name="code"
										onChange={(event) =>
											setCode(event.target.value)
										}
										readOnly={busy}
										ref={codeInput}
										required
										spellCheck={false}
										value={code}
									/>
								</label>
							</>
						) : (
							<>
								{registration && (
									<p>
										Регистрация доступна только по
										приглашению. После пароля потребуется
										подключить приложение-аутентификатор.
									</p>
								)}

								<label
									className="text-muted grid gap-2 text-sm"
									htmlFor="auth-username"
								>
									Username
									<Input
										aria-describedby="username-help"
										autoCapitalize="none"
										autoComplete="username"
										id="auth-username"
										maxLength={32}
										minLength={3}
										name="username"
										onChange={(event) =>
											setUsername(event.target.value)
										}
										readOnly={busy}
										required
										spellCheck={false}
										type="text"
										value={username}
									/>
								</label>
								<p
									className="text-muted text-sm"
									id="username-help"
								>
									3–32 символа: латинские буквы, цифры, _ или
									-. Первый символ — буква или цифра.
								</p>
								<label
									className="text-muted grid gap-2 text-sm"
									htmlFor="auth-password"
								>
									Пароль
									<Input
										aria-describedby={
											registration
												? 'password-help'
												: undefined
										}
										autoComplete={
											registration
												? 'new-password'
												: 'current-password'
										}
										id="auth-password"
										maxLength={128}
										minLength={
											registration ? 12 : undefined
										}
										name="password"
										onChange={(event) =>
											setPassword(event.target.value)
										}
										readOnly={busy}
										required
										type="password"
										value={password}
									/>
								</label>
								{registration && (
									<p
										className="text-muted text-sm"
										id="password-help"
									>
										Не менее 12 символов. Не используйте
										пароль от других сервисов.
									</p>
								)}
							</>
						)}
						{error && (
							<p
								className="border-l-2 border-red-400 px-3 py-2 text-red-200"
								role="alert"
							>
								{error}
							</p>
						)}
						<Button
							disabled={
								!ready ||
								busy ||
								(registration && !token && !enrollment)
							}
							type="submit"
							variant="primary"
						>
							{busy
								? 'Проверяем…'
								: enrollment
									? 'Подтвердить код'
									: registration
										? 'Создать аккаунт'
										: 'Продолжить'}
						</Button>
					</form>
				)}
			</main>
		</>
	)
}
