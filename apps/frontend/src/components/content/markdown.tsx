'use client'

import type { ReactNode } from 'react'
import Markdown from 'react-markdown'
import remarkDirective from 'remark-directive'
import remarkGfm from 'remark-gfm'
import { detectYouTubeVideoId, isAudioLink } from '@/lib/article-embeds'
import { remarkCallouts } from '@/lib/article-markdown'
import { AudioEmbed } from './audio-embed'
import { MermaidDiagram } from './mermaid'
import { VideoEmbed } from './video-embed'

function flattenText(node: ReactNode): string {
	if (typeof node === 'string') return node
	if (typeof node === 'number') return String(node)
	if (Array.isArray(node)) return node.map(flattenText).join('')
	if (node && typeof node === 'object' && 'props' in node) {
		const children = (
			node as unknown as { props?: { children?: ReactNode } }
		).props?.children
		return children ? flattenText(children) : ''
	}
	return ''
}

function ArticleLink({
	href,
	children,
}: {
	href?: string
	children: ReactNode
}) {
	const label = flattenText(children).trim()
	const youtube = href ? detectYouTubeVideoId(href) : null
	if (youtube) {
		return <VideoEmbed id={youtube.id} title={label} />
	}
	if (href && isAudioLink(href)) {
		return (
			<AudioEmbed
				src={href}
				title={label || href.split('/').pop() || 'Аудио'}
			/>
		)
	}
	return <a href={href}>{children}</a>
}

function ArticleCode({
	className,
	children,
}: {
	className?: string
	children?: ReactNode
}) {
	const code = flattenText(children)
	if (/language-mermaid\b/.test(className ?? '')) {
		return <MermaidDiagram code={code} />
	}
	return <code className={className}>{children}</code>
}

function ArticlePre({ children }: { children?: ReactNode }) {
	const child = Array.isArray(children) ? children[0] : children
	if (
		child &&
		typeof child === 'object' &&
		'type' in (child as { type?: unknown }) &&
		(child as { type: unknown }).type === ArticleCode &&
		/language-mermaid\b/.test(
			String(
				(child as { props?: { className?: string } }).props?.className
			)
		)
	) {
		return child as ReactNode
	}
	return <pre>{children}</pre>
}

export function ArticleMarkdown({ content }: { content: string }) {
	return (
		<div className="article-prose">
			<Markdown
				components={{
					a: ArticleLink as never,
					pre: ArticlePre as never,
					code: ArticleCode as never,
				}}
				remarkPlugins={[remarkGfm, remarkDirective, remarkCallouts]}
				skipHtml
			>
				{content}
			</Markdown>
		</div>
	)
}
