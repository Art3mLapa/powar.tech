import type { Metadata, Viewport } from 'next'
import './globals.css'
import { bebas } from './fonts'

export const metadata: Metadata = {
	title: 'БСЗП',
	description:
		'Самые отбитые панки в зоне. Подвал Билдеров, видео и андерграунд Сталзона.',
	openGraph: {
		title: 'БСЗП',
		description: 'UNDERГРАУНД STAЛZОНА',
		locale: 'ru_RU',
		type: 'website',
	},
	robots: { index: true, follow: true },
}

export const viewport: Viewport = {
	themeColor: '#000000',
	colorScheme: 'dark',
	width: 'device-width',
	initialScale: 1,
}

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html
			className={bebas.variable}
			data-scroll-behavior="smooth"
			lang="ru"
		>
			<body>{children}</body>
		</html>
	)
}
