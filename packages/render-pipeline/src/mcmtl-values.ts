import type { McmtlValue, McmtlValueKind } from '@bscp/render-contracts'

export function normalizeRemainder(value: string): string {
	return value
		.replaceAll('\\\\', '/')
		.replaceAll('\\', '/')
		.replace(/\/+$/, '')
}

export function parseDirectiveValue(token: string): McmtlValue {
	const value = token.trim()
	if (/^-?\d+(?:\.\d+)?$/.test(value))
		return {
			kind: 'number' satisfies McmtlValueKind,
			number: Number(value),
		}
	if (value === 'true' || value === 'false')
		return { kind: 'boolean', boolean: value === 'true' }
	const namespaceColon = value.indexOf(':')
	if (
		namespaceColon > 0 &&
		/^[a-z0-9_]+$/i.test(value.slice(0, namespaceColon))
	) {
		const remainder = normalizePath(value.slice(namespaceColon + 1))
		const unsafe =
			!remainder ||
			remainder.startsWith('/') ||
			remainder.includes('..') ||
			/\s/.test(remainder)
		return {
			kind: 'ref',
			refNamespace: value.slice(0, namespaceColon),
			refRemainder: remainder,
			contextRelative: unsafe,
		}
	}
	if (value.includes('/') || value.includes('\\'))
		return { kind: 'path', text: normalizePath(value) }
	return { kind: 'word', text: value }
}

export function normalizePath(value: string): string {
	return value
		.replaceAll('\\\\', '/')
		.replaceAll('\\', '/')
		.replace(/\/+$/, '')
}

export function joinNumbers(values: McmtlValue[]): number[] {
	return values
		.filter(
			(value): value is { kind: 'number'; number: number } =>
				value.kind === 'number'
		)
		.map((value) => value.number)
}
