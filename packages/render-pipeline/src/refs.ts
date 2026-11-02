import type { DiagnosticsEntry } from '@bscp/render-contracts'
import { normalizeRemainder } from './mcmtl-values'
import { lookup, type SourceIndex } from './source-set'

export interface ParsedRef {
	raw: string
	namespace: string | null
	remainder: string
	unsafe: string | null
}

export function parseRef(input: string): ParsedRef {
	const raw = input.trim()
	if (!raw)
		return {
			raw,
			namespace: null,
			remainder: '',
			unsafe: 'empty reference',
		}
	if (raw.includes('\0'))
		return { raw, namespace: null, remainder: raw, unsafe: 'NUL byte' }
	const separator = raw.indexOf(':')
	if (separator > 0) {
		const namespace = raw.slice(0, separator)
		const remainder = raw.slice(separator + 1)
		if (!/^[a-z0-9_]+$/i.test(namespace)) {
			return {
				raw,
				namespace: null,
				remainder: raw,
				unsafe: `namespace is not an identifier: ${namespace.slice(0, 64)}`,
			}
		}
		if (
			!remainder ||
			remainder.startsWith('/') ||
			remainder.includes('..') ||
			remainder.endsWith('/')
		) {
			return {
				raw,
				namespace,
				remainder: normalizeRemainder(remainder),
				unsafe: 'remainder is not a bounded assets path',
			}
		}
		return {
			raw,
			namespace,
			remainder: normalizeRemainder(remainder),
			unsafe: null,
		}
	}
	if (/^[a-z0-9_-]+$/i.test(raw)) {
		return { raw, namespace: null, remainder: raw, unsafe: null }
	}
	if (
		raw.startsWith('/') ||
		raw.split('/').includes('..') ||
		raw.endsWith('/')
	) {
		return {
			raw,
			namespace: null,
			remainder: normalizeRemainder(raw),
			unsafe: 'absolute or unbounded relative path',
		}
	}
	return {
		raw,
		namespace: null,
		remainder: normalizeRemainder(raw),
		unsafe: null,
	}
}

export interface ResolvedPath {
	status: 'resolved' | 'missing' | 'ambiguous' | 'unsafe'
	paths: string[]
	reason: string
	diagnostics: DiagnosticsEntry[]
}

export const VIRTUAL_EXTENSIONS = [
	'.mcmtl',
	'.mcsb',
	'.mcsa',
	'.mcvd',
	'.sac',
	'.json',
	'.ol',
	'.dds',
] as const

function exactLookup(index: SourceIndex, path: string): string[] {
	const hits = lookup(index, path)
	return [...new Set(hits.map((hit) => hit.path))]
}

export function resolveRef(
	index: SourceIndex,
	contextPath: string,
	rawRef: string,
	options: ResolveRefOptions = {}
): ResolvedPath {
	const parsed = parseRef(rawRef)
	if (parsed.unsafe)
		return {
			status: 'unsafe',
			paths: [],
			reason: parsed.unsafe,
			diagnostics: [],
		}
	if (parsed.namespace)
		return resolveNamespace(
			index,
			parsed.namespace,
			parsed.remainder,
			options
		)
	return resolveRelative(index, contextPath, parsed.remainder, options)
}

export interface ResolveRefOptions {
	textureToOlFallback?: boolean
	virtualExtensions?: boolean
	suffixMatchRelatives?: boolean
}

function genTextures(
	_index: SourceIndex,
	path: string,
	options: ResolveRefOptions
): string[] {
	const variants = new Set<string>()
	variants.add(path)
	const lower = path.toLowerCase()
	variants.add(lower)
	if (options.textureToOlFallback !== false) {
		if (path.endsWith('.dds')) {
			const stem = path.slice(0, -4)
			variants.add(`${stem}.ol`)
			variants.add(`${stem.toLowerCase()}.ol`)
		} else if (path.endsWith('.dds'.toUpperCase())) {
			const stem = path.slice(0, -4)
			variants.add(`${stem}.OL`)
		}
	}
	return [...variants]
}

function genModelPayloads(path: string): string[] {
	const variants = [path]
	if (path.endsWith('.mcsa')) {
		const stem = path.slice(0, -5)
		variants.push(`${stem}.mcsb`)
		variants.push(`${stem.toLowerCase()}.mcsb`)
	}
	return variants
}

function candidatesExact(
	index: SourceIndex,
	candidate: string,
	options: ResolveRefOptions
): string[] {
	const found: string[] = []
	for (const variant of genTextures(index, candidate, options)) {
		for (const hit of exactLookup(index, variant)) found.push(hit)
		if (found.length > 0) return found
	}
	for (const variant of genModelPayloads(candidate)) {
		for (const hit of exactLookup(index, variant)) found.push(hit)
		if (found.length > 0) return found
	}
	if (options.virtualExtensions === false || candidate.includes('.'))
		return found
	for (const ext of VIRTUAL_EXTENSIONS) {
		const stemless = candidate.replace(/\.[a-z0-9_]+$/i, '') + ext
		for (const variant of genTextures(index, stemless, options)) {
			for (const hit of exactLookup(index, variant)) found.push(hit)
		}
		if (found.length > 0) return found
	}
	return found
}

export function resolveRelative(
	index: SourceIndex,
	contextPath: string,
	remainder: string,
	options: ResolveRefOptions = {}
): ResolvedPath {
	const unsafe = parseRef(remainder).unsafe
	if (unsafe)
		return { status: 'unsafe', paths: [], reason: unsafe, diagnostics: [] }
	if (remainder.includes(':')) {
		return resolveNamespace(
			index,
			remainder.split(':')[0],
			remainder.split(':').slice(1).join(':'),
			options
		)
	}
	const contextDir = contextPath.slice(0, contextPath.lastIndexOf('/') + 1)
	const segments = contextDir.split('/')
	const joinBases: string[] = []
	for (let i = segments.length; i >= 1; i--)
		joinBases.push(
			[...segments.slice(0, i), remainder]
				.filter((p) => p && p !== '.')
				.join('/')
		)
	const direct: string[] = []
	for (const base of joinBases) {
		const hits = candidatesExact(index, base, options)
		if (hits.length > 0) direct.push(...hits)
	}
	if (direct.length > 0) {
		return {
			status: 'resolved',
			paths: [...new Set(direct)],
			reason: `joined relative to ${contextDir}`,
			diagnostics: [],
		}
	}
	if (options.suffixMatchRelatives !== false && remainder.includes('/')) {
		for (const variant of suffixVariants(remainder)) {
			const suffixHits = suffixSearch(index, variant)
			if (suffixHits.length === 1) {
				return {
					status: 'resolved',
					paths: suffixHits,
					reason: `suffix matched relative reference against indexed corpus${variant === remainder ? '' : ` (${variant} retarget)`}`,
					diagnostics: [
						{
							severity: 'info',
							code: 'resolver.suffix-match',
							message: `relative reference ${remainder} resolved by corpus suffix match from ${contextPath}`,
						},
					],
				}
			}
			if (suffixHits.length > 1)
				return {
					status: 'ambiguous',
					paths: suffixHits,
					reason: `relative reference ${remainder} matches several indexed paths`,
					diagnostics: [],
				}
		}
	}
	return {
		status: 'missing',
		paths: [],
		reason: `no indexed path for ${remainder} under ${contextDir}`,
		diagnostics: [],
	}
}

export function resolveNamespace(
	index: SourceIndex,
	namespace: string,
	remainder: string,
	options: ResolveRefOptions = {}
): ResolvedPath {
	const check = parseRef(`${namespace}:${remainder}`)
	if (check.unsafe)
		return {
			status: 'unsafe',
			paths: [],
			reason: check.unsafe,
			diagnostics: [],
		}
	if (!namespace) return resolveRelative(index, remainder, remainder, options)
	const bases = [
		`assets/${namespace}/${remainder}`,
		`assets/${namespace.toLowerCase()}/${remainder.toLowerCase()}`,
	]
	for (const base of bases) {
		const hits = candidatesExact(index, base, options)
		if (hits.length > 0) {
			return {
				status: 'resolved',
				paths: [...new Set(hits)],
				reason: `assets namespace ${namespace}`,
				diagnostics: [],
			}
		}
	}
	if (options.suffixMatchRelatives !== false) {
		const tail = `${namespace.toLowerCase()}/${remainder.toLowerCase()}`
		for (const variant of suffixVariants(tail)) {
			const suffixHits = suffixSearch(index, variant)
			if (suffixHits.length === 1)
				return {
					status: 'resolved',
					paths: suffixHits,
					reason: 'namespace tail resolved by indexed corpus suffix match',
					diagnostics: [],
				}
			if (suffixHits.length > 1)
				return {
					status: 'ambiguous',
					paths: suffixHits,
					reason: `namespace reference matches several indexed paths`,
					diagnostics: [],
				}
		}
	}
	return {
		status: 'missing',
		paths: [],
		reason: `assets/${namespace}/${remainder} absent from index${options.textureToOlFallback === false ? '' : ' (also tried .ol swap and lowercase variants)'}`,
		diagnostics: [],
	}
}

function suffixVariants(tail: string): string[] {
	const variants = new Set<string>()
	variants.add(tail)
	const lowered = tail.toLowerCase()
	variants.add(lowered)
	if (lowered.endsWith('.mcsa')) {
		const stem = tail.slice(0, -5)
		variants.add(`${stem}.mcsb`)
		variants.add(`${stem.toLowerCase()}.mcsb`)
	} else if (lowered.endsWith('.mca')) {
		variants.add(`${tail.slice(0, -4)}.mcsb`)
	}
	if (lowered.endsWith('.dds')) {
		const stem = tail.slice(0, -4)
		variants.add(`${stem}.ol`)
		variants.add(`${stem.toLowerCase()}.ol`)
	}
	return [...variants]
}

function suffixSearch(index: SourceIndex, tail: string): string[] {
	const wanted = tail.toLowerCase()
	const hits: string[] = []
	for (const [path] of index.byPath) {
		if (
			path.length >= wanted.length &&
			path.toLowerCase().endsWith(`/${wanted}`)
		)
			hits.push(path)
		if (hits.length > 64) return hits
	}
	return hits
}

export interface ResolveRefOptions {
	textureToOlFallback?: boolean
	virtualExtensions?: boolean
	suffixMatchRelatives?: boolean
}
