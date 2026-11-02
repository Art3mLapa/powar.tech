'use client'

import { useEffect, useRef, useState } from 'react'

export type SupportTone = 'blue' | 'red' | 'yellow'

const tones: Record<SupportTone, string> = {
	blue: 'support-method-blue',
	red: 'support-method-red',
	yellow: 'support-method-yellow',
}

export function SupportMethod({
	label,
	tone,
	href,
	value,
}: {
	label: string
	tone: SupportTone
	href?: string
	value?: string
}) {
	const [copied, setCopied] = useState(false)
	const timeout = useRef<ReturnType<typeof setTimeout> | null>(null)

	useEffect(() => {
		return () => {
			if (timeout.current) {
				clearTimeout(timeout.current)
			}
		}
	}, [])

	async function copy() {
		if (!value || !navigator.clipboard) {
			return
		}
		try {
			await navigator.clipboard.writeText(value)
			setCopied(true)
			if (timeout.current) {
				clearTimeout(timeout.current)
			}
			timeout.current = setTimeout(() => setCopied(false), 1600)
		} catch {
			setCopied(false)
		}
	}

	const className = `support-method ${tones[tone]}`
	const content = (
		<>
			<span className="support-method-label type-display">тык</span>
			<span aria-live="polite" className="support-method-meta">
				{copied ? 'скопировано' : label}
			</span>
		</>
	)

	if (href) {
		return (
			<a
				className={className}
				href={href}
				rel="noopener noreferrer"
				target="_blank"
			>
				{content}
			</a>
		)
	}
	if (value) {
		return (
			<button
				aria-label={`Скопировать ${label}: ${value}`}
				className={className}
				onClick={copy}
				title={value}
				type="button"
			>
				{content}
			</button>
		)
	}
	return <span className={className}>{content}</span>
}
