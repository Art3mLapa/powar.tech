export type TextEdit = { value: string; start: number; end: number }

export function wrapSelection(
	value: string,
	start: number,
	end: number,
	prefix: string,
	suffix = '',
	placeholder = 'Текст'
): TextEdit {
	const selected = value.slice(start, end) || placeholder
	return {
		value:
			value.slice(0, start) +
			prefix +
			selected +
			suffix +
			value.slice(end),
		start: start + prefix.length,
		end: start + prefix.length + selected.length,
	}
}

export function indentSelection(
	value: string,
	start: number,
	end: number,
	outdent = false
): TextEdit {
	const lineStart = start > 0 ? value.lastIndexOf('\n', start - 1) + 1 : 0
	const blockEnd = end > start && value[end - 1] === '\n' ? end - 1 : end
	const block = value.slice(lineStart, blockEnd)
	const lines = block.split('\n')
	const updated = lines.map((line) =>
		outdent ? line.replace(/^( {1,2}|\t)/, '') : `  ${line}`
	)
	const firstDelta = updated[0].length - lines[0].length
	const replacement = updated.join('\n')
	return {
		value: value.slice(0, lineStart) + replacement + value.slice(blockEnd),
		start: Math.max(lineStart, start + firstDelta),
		end: end + replacement.length - block.length,
	}
}

export function continueList(value: string, cursor: number): TextEdit | null {
	const lineStart = cursor > 0 ? value.lastIndexOf('\n', cursor - 1) + 1 : 0
	const line = value.slice(lineStart, cursor)
	const match = /^(\s*)([-*+] |\d+\. )(\[[ xX]\] )?(.*)$/.exec(line)
	if (!match) return null
	if (!match[4].trim()) {
		return {
			value: value.slice(0, lineStart) + value.slice(cursor),
			start: lineStart,
			end: lineStart,
		}
	}
	const marker = /^\d/.test(match[2])
		? `${Number.parseInt(match[2], 10) + 1}. `
		: match[2]
	const insertion = `\n${match[1]}${marker}${match[3] ? '[ ] ' : ''}`
	const next = cursor + insertion.length
	return {
		value: value.slice(0, cursor) + insertion + value.slice(cursor),
		start: next,
		end: next,
	}
}

export function parseArticleTags(value: string): string[] {
	return [
		...new Set(
			value
				.split(',')
				.map((tag) => tag.trim())
				.filter(Boolean)
		),
	]
}

export const articleStatusLabels: Record<string, string> = {
	DRAFT: 'Черновик',
	REVIEW: 'На проверке',
	PUBLISHED: 'Опубликована',
	REJECTED: 'Отклонена',
}
