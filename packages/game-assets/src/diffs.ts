export type Change = {
	path: string
	oldValue: unknown
	newValue: unknown
	kind: 'ADDED' | 'REMOVED' | 'CHANGED'
}
export function parseLang(text: string) {
	const result: Record<string, string> = Object.create(null)
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim()
		if (!line || line.startsWith('#') || line.startsWith('//')) continue
		const split = line.indexOf('=')
		if (split <= 0) continue
		result[line.slice(0, split).trim()] = line.slice(split + 1).trim()
	}
	return result
}
export function diffValues(
	previous: unknown,
	next: unknown,
	path = '',
	depth = 0
): Change[] {
	if (depth > 50) throw new Error('Data nesting limit')
	if (JSON.stringify(previous) === JSON.stringify(next)) return []
	if (previous === undefined)
		return [{ path, oldValue: null, newValue: next, kind: 'ADDED' }]
	if (next === undefined)
		return [{ path, oldValue: previous, newValue: null, kind: 'REMOVED' }]
	if (
		previous &&
		next &&
		typeof previous === 'object' &&
		typeof next === 'object' &&
		!Array.isArray(previous) &&
		!Array.isArray(next)
	) {
		const a = previous as Record<string, unknown>,
			b = next as Record<string, unknown>
		return [...new Set([...Object.keys(a), ...Object.keys(b)])]
			.sort()
			.flatMap((key) =>
				diffValues(
					a[key],
					b[key],
					path ? `${path}.${key}` : key,
					depth + 1
				)
			)
	}
	return [{ path, oldValue: previous, newValue: next, kind: 'CHANGED' }]
}
export function parseItemStats(data: Record<string, unknown>) {
	const result: Record<string, unknown> = {}
	const blocks = data.infoBlocks as
		| {
				type: string
				elements?: {
					type: string
					name?: { key?: string }
					key?: { key?: string }
					value?: unknown
					text?: { key?: string; args?: unknown }
				}[]
		  }[]
		| undefined
	for (const block of blocks ?? [])
		for (const element of block.elements ?? []) {
			const key =
				element.name?.key ?? element.key?.key ?? element.text?.key
			if (key)
				result[key] =
					element.type === 'numericVariants' &&
					Array.isArray(element.value)
						? element.value[0]
						: (element.value ?? element.text?.args)
		}
	result.name = data.name
	result.category = data.category
	result.raw = data
	return result
}
