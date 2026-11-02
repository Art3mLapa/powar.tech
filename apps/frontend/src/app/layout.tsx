import type { Metadata, Viewport } from 'next'
import { ThemeProvider } from 'next-themes'
import '../shared/style/globals.css'
import { QueryProvider } from '@/providers/query-provider'
import { bebas, zed } from './fonts'
import '../shared/style/content.css'
import { Suspense } from 'react'
import FooterLayout from '@/shared/layout/footer'
import { SiteHeader } from '@/shared/layout/nav'

export const metadata: Metadata = {
	title: 'BSCP — БИЛДЕРС СЗ ПРОДАКШН — UNDERГРАУНД STAЛZОНА',
	description:
		'Самые отбитые панки в зоне. Подвал Билдеров, видео и андерграунд Сталзона.',
	openGraph: {
		title: 'BSCP — БИЛДЕРС СЗ ПРОДАКШН',
		description: 'UNDERГРАУНД STAЛZОНА',
		locale: 'ru_RU',
		type: 'website',
	},
	robots: { index: true, follow: true },
}

export const viewport: Viewport = {
	themeColor: [
		{ media: '(prefers-color-scheme: dark)', color: '#000000' },
		{ media: '(prefers-color-scheme: light)', color: '#ffffff' },
	],
	colorScheme: 'dark light',
	width: 'device-width',
	initialScale: 1,
}

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html
			className={`${bebas.variable} ${zed.variable}`}
			data-scroll-behavior="smooth"
			lang="ru"
			suppressHydrationWarning
		>
			<body>
				<Suspense fallback={<div />}>
					<ThemeProvider
						attribute="class"
						defaultTheme="dark"
						disableTransitionOnChange
						enableSystem
					>
						<QueryProvider>
							<SiteHeader />
							{children}
							<FooterLayout />
						</QueryProvider>
					</ThemeProvider>
				</Suspense>
			</body>
		</html>
	)
}
