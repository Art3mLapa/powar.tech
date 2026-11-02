import type { DiagnosticsEntry } from '@bscp/render-contracts'
import type { SourceIndex } from './source-set'

export interface ShaderFeature {
	version: string | null
	includes: { ref: string; line: number }[]
	hookPoints: string[]
	unrolls: { variable: string; countToken: string; line: number }[]
	conditionals: string[]
}

const UNROLL_RE =
	/#unroll_start:\s*([a-zA-Z_]\w*)\s*,\s*(-?\d+)\s*,\s*([a-zA-Z_]\w*|\d+)\s*;?\s*$/

export function parseShaderSource(_path: string, text: string): ShaderFeature {
	const includes: ShaderFeature['includes'] = []
	const unrolls: ShaderFeature['unrolls'] = []
	const conditionals = new Set<string>()
	let version: string | null = null
	let line = 0
	for (const raw of text.split(/\r?\n/)) {
		line++
		const trimmed = raw.trim()
		if (!version && /^#version\b/.test(trimmed))
			version = trimmed.replace(/^#version/, '').trim()
		const include = /^#include\s+(\S+)/.exec(trimmed)
		if (include) {
			includes.push({ ref: include[1], line })
			continue
		}
		const unroll = UNROLL_RE.exec(trimmed)
		if (unroll?.[1] && unroll[3]) {
			unrolls.push({ variable: unroll[1], countToken: unroll[3], line })
			continue
		}
		if (/^#unroll_end\b/.test(trimmed)) continue
		const conditional = /^#(?:if|elif)\s+!?(.*)$/.exec(trimmed)
		if (conditional?.[1]) {
			for (const token of conditional[1].split(/[^\w]/)) {
				if (/^[A-Z][A-Z0-9_]{1,}$/.test(token)) conditionals.add(token)
			}
		}
		const defined = /^#define\s+([A-Z][A-Z0-9_]{1,})/.exec(trimmed)
		if (defined?.[1]) conditionals.add(defined[1])
	}
	return {
		version,
		includes,
		hookPoints: [
			...new Set(
				[
					...text.matchAll(
						/#([a-zA-Z_]*(?:_hook)|attribute_write)\b/g
					),
				].map((match) => match[1])
			),
		],
		unrolls,
		conditionals: [...conditionals].sort(),
	}
}

const SHADER_DIRS = ['assets/effects/shaders/', 'shaders/', '']

export function includeCandidatesRef(
	_index: SourceIndex,
	fromPath: string,
	ref: string
): string[] {
	const candidates: string[] = []
	const parts = fromPath.split('/').filter(Boolean)
	if (ref.startsWith('/')) candidates.push(ref.replace(/^\//, ''))
	for (const base of SHADER_DIRS) {
		if (
			base &&
			parts.every((part, idx) => (base.split('/')[idx] ?? '') === part)
		)
			candidates.push(base + ref)
		candidates.push(base + (ref.startsWith('./') ? ref.slice(2) : ref))
		candidates.push(base + ref.split('/').slice(-1)[0])
	}
	for (let depth = 0; depth < Math.min(parts.length, 6); depth++) {
		candidates.push(
			[
				...parts.slice(0, parts.length - depth),
				ref.replace(/^\.\//, ''),
			].join('/')
		)
	}
	return [...new Set(candidates)]
}

export function resolveShaderInclude(
	index: SourceIndex,
	fromPath: string,
	ref: string
): string | null {
	for (const candidate of includeCandidatesRef(index, fromPath, ref)) {
		if (index.caseInsensitive.has(candidate.toLowerCase())) return candidate
	}
	return null
}

export interface ShaderInventoryEntry {
	path: string
	feature: ShaderFeature
	stageGuess: 'vertex' | 'fragment' | 'other'
	sizeBytes: number
}

export function sourceStageGuess(
	path: string,
	text: string
): ShaderInventoryEntry['stageGuess'] {
	const lowered = path.toLowerCase()
	if (lowered.endsWith('.vert')) return 'vertex'
	if (lowered.endsWith('.frag')) return 'fragment'
	if (lowered.endsWith('.geom')) return 'other'
	if (/\bgl_Position\s*=/.test(text)) return 'vertex'
	if (/\bout\s+vec\d*\s+\w*/.test(text) || /gl_FragColor/.test(text))
		return 'fragment'
	return 'other'
}

export class ShaderInventory {
	readonly entries = new Map<string, ShaderInventoryEntry>()

	constructor(
		public readonly index: SourceIndex,
		public readonly diagnostics: DiagnosticsEntry[],
		public readonly query: (
			path: string
		) => { text: string; size: number } | null
	) {}

	discover(): void {
		for (const [path] of this.index.byPath) {
			if (!SHADER_FILTER.test(path)) continue
			this.inventory(path)
		}
	}

	inventory(path: string): ShaderInventoryEntry | null {
		const cached = this.entries.get(path.toLowerCase())
		if (cached) return cached
		const resolved = resolveShaderInclude(
			this.index,
			'assets/effects/shaders',
			path
		)
		if (!resolved) return null
		const raw = this.query(resolved)
		if (!raw) return null
		const feature = parseShaderSource(resolved, raw.text)
		const inventory: ShaderInventoryEntry = {
			path: resolved,
			feature,
			stageGuess: sourceStageGuess(resolved, raw.text),
			sizeBytes: raw.size,
		}
		this.entries.set(resolved.toLowerCase(), inventory)
		return inventory
	}
}

export const SHADER_FILTER = /\.(vert|frag|geom|tesc|tese|comp|glsl)$/i
