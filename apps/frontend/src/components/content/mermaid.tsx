'use client'

import { useEffect, useState } from 'react'

const themeVariables = {
	fontFamily:
		'var(--font-zed), "Roboto Condensed", Arial, Helvetica, sans-serif',
	dropShadow: 'none',
	background: '#000000',
	primaryColor: '#111111',
	primaryTextColor: '#f5f5f3',
	primaryBorderColor: '#6c6c6c',
	secondaryColor: '#1a1a1a',
	secondaryTextColor: '#dddddd',
	secondaryBorderColor: '#4a4a4a',
	tertiaryColor: '#242424',
	tertiaryTextColor: '#dddddd',
	tertiaryBorderColor: '#4a4a4a',
	lineColor: '#8a8a8a',
	textColor: '#dddddd',
	noteBkgColor: '#111111',
	noteTextColor: '#dddddd',
	noteBorderColor: '#4a4a4a',
	clusterBkg: '#111111',
	clusterBorder: '#4a4a4a',
	edgeLabelBackground: '#111111',
	sequenceNumberColor: '#000000',
	arrowheadColor: '#8a8a8a'
}

type MermaidRunner = (code: string) => Promise<string>

let runnerPromise: Promise<MermaidRunner> | null = null

function loadMermaid(): Promise<MermaidRunner> {
	runnerPromise ??= import('mermaid').then((module) => {
		const mermaid = module.default
		mermaid.initialize({
			startOnLoad: false,
			securityLevel: 'strict',
			theme: 'base',
			themeVariables,
		})
		let index = 0
		return async (code: string) => {
			index += 1
			const { svg } = await mermaid.render(`bscp-mermaid-${index}`, code)
			return svg
		}
	})
	return runnerPromise
}

export function MermaidDiagram({ code }: { code: string }) {
	const [svg, setSvg] = useState('')
	const [failed, setFailed] = useState(false)

	useEffect(() => {
		let active = true
		setSvg('')
		setFailed(false)
		async function run() {
			try {
				const render = await loadMermaid()
				const next = await render(code)
				if (active) setSvg(next)
			} catch {
				if (active) setFailed(true)
			}
		}
		void run()
		return () => {
			active = false
		}
	}, [code])

	if (failed) {
		return (
			<pre className="article-diagram-fail">
				<code>{code}</code>
			</pre>
		)
	}
	if (!svg) {
		return (
			<figure
				aria-label="Схема загружается"
				className="article-diagram article-diagram-pending"
			/>
		)
	}
	return (
		<figure className="article-diagram">
			<span
				aria-hidden="true"
				/* biome-ignore lint/security/noDangerouslySetInnerHtml: mermaid отдаёт уже sanitized SVG (securityLevel: strict), другого способа вставить его нет */
				dangerouslySetInnerHTML={{ __html: svg }}
			/>
		</figure>
	)
}
