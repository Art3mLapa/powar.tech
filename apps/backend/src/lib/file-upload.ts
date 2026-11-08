import { createHash } from 'node:crypto'

export const MAX_FILE_SIZE = 500 * 1024 * 1024
const BLOCKED_FILE_TYPES = new Set([
	'html',
	'htm',
	'js',
	'mjs',
	'cjs',
	'svg',
	'xml',
])

export function safeOriginalName(name: string) {
	return (
		name
			.replaceAll('\\', '/')
			.split('/')
			.pop()
			?.split('')
			.filter((character) => {
				const code = character.charCodeAt(0)
				return code >= 32 && code !== 127
			})
			.join('')
			.slice(0, 200) || 'file'
	)
}

function fileExtension(name: string) {
	const extension = name.split('.').pop()?.toLowerCase() ?? ''
	return /^[a-z0-9]{1,10}$/.test(extension) &&
		!BLOCKED_FILE_TYPES.has(extension)
		? `.${extension}`
		: '.bin'
}

export async function prepareUploadedFile(file: File, prefix: string) {
	if (file.size === 0 || file.size > MAX_FILE_SIZE) return null
	const originalName = safeOriginalName(file.name)
	const encoded = Buffer.from(await file.arrayBuffer())
	const digest = createHash('sha256').update(encoded).digest('hex')
	const storageKey = `${prefix}-${digest}${fileExtension(originalName)}`
	const mime =
		file.type && /^[\w.+-]+\/[\w.+-]+$/.test(file.type)
			? file.type.slice(0, 120)
			: 'application/octet-stream'
	return { encoded, mime, originalName, storageKey }
}
