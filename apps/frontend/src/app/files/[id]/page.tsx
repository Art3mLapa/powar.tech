import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

const backendOrigin = process.env.BACKEND_ORIGIN ?? 'http://localhost:3001'
const siteOrigin =
	process.env.WEB_ORIGIN ??
	process.env.NEXT_PUBLIC_SITE_URL ??
	'http://localhost:3000'

type PublicFile = {
	id: string
	name: string
	description: string
	mime: string
	size: number
	createdAt: string
	downloadUrl: string
}

async function getFile(id: string) {
	try {
		const response = await fetch(
			`${backendOrigin}/api/v1/files/${encodeURIComponent(id)}/info`,
			{ next: { revalidate: 60 } }
		)
		if (!response.ok) return null
		return (await response.json()) as PublicFile
	} catch {
		return null
	}
}

function formatSize(size: number) {
	if (size < 1024) return `${size} Б`
	if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} КБ`
	return `${(size / (1024 * 1024)).toFixed(1)} МБ`
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ id: string }>
}): Promise<Metadata> {
	const { id } = await params
	const file = await getFile(id)
	if (!file) return { title: 'Файл — БСЗП' }
	const title = `${file.name} — БСЗП`
	const description = file.description || `Файл ${file.name}`
	return {
		metadataBase: new URL(siteOrigin),
		title,
		description,
		openGraph: {
			type: 'website',
			locale: 'ru_RU',
			title,
			description,
		},
	}
}

export default async function Page({
	params,
}: {
	params: Promise<{ id: string }>
}) {
	const { id } = await params
	const file = await getFile(id)
	if (!file) notFound()

	return (
		<main className="content-shell reading-shell">
			<p>
				<Link href="/articles">БСЗП</Link>
			</p>
			<article className="grid gap-6">
				<p className="text-muted text-sm">Публичный файл</p>
				<h1 className="type-display">{file.name}</h1>
				{file.description ? (
					<p className="article-lead">{file.description}</p>
				) : null}
				<p className="text-muted text-sm">
					{file.mime} · {formatSize(file.size)}
				</p>
				<div>
					<a
						className="button bg-foreground text-background focus-visible:outline-accent inline-flex min-h-10 items-center justify-center rounded-sm border border-transparent px-4 py-2 text-sm font-medium transition-colors hover:bg-white/85 focus-visible:outline-2 focus-visible:outline-offset-3"
						download
						href={`/api/v1/files/${file.id}`}
					>
						Скачать файл
					</a>
				</div>
			</article>
		</main>
	)
}
