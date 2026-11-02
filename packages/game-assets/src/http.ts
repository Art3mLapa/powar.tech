import { createHash } from 'node:crypto'
import axios from 'axios'

const hosts = new Set([
	'launcher.stalcraft.net',
	'launcher-global.stalcraft.net',
	'exbo.b-cdn.net',
	'm-cdn.exbo.net',
	'sc-client-am.cdn77.exbo.net',
	'sc-client-dev.cdn77.exbo.net',
	'sc-client-ru.cdn77.exbo.net',
	'raw.githubusercontent.com',
	'api.github.com',
	'codeload.github.com',
])
export function validateSource(input: string) {
	const url = new URL(input)
	if (
		!['http:', 'https:'].includes(url.protocol) ||
		!hosts.has(url.hostname) ||
		url.username ||
		url.password ||
		(url.port && ![80, 443].includes(Number(url.port)))
	)
		throw new Error('Source URL is not allowed')
	return url
}
export async function fetchBuffer(
	input: string,
	maxBytes = 64 * 1024 * 1024,
	sha1?: string,
	signal?: AbortSignal
): Promise<Buffer> {
	let url = validateSource(input)
	for (let redirects = 0; redirects < 4; redirects++) {
		const response = await axios.get<ArrayBuffer>(url.href, {
			responseType: 'arraybuffer',
			timeout: 60000,
			maxContentLength: maxBytes,
			maxBodyLength: maxBytes,
			maxRedirects: 0,
			signal,
			validateStatus: (s) => s >= 200 && s < 400,
		})
		if (response.status >= 300) {
			const location = response.headers.location
			if (!location) throw new Error('Invalid source redirect')
			url = validateSource(new URL(location, url).href)
			continue
		}
		const data = Buffer.from(response.data)
		if (data.length > maxBytes) throw new Error('Download exceeds limit')
		if (
			sha1 &&
			createHash('sha1').update(data).digest('hex') !==
				sha1.padStart(40, '0')
		)
			throw new Error('Asset hash mismatch')
		return data
	}
	throw new Error('Too many source redirects')
}
export async function downloadAsset(
	input: string,
	size: bigint,
	hash: string,
	signal?: AbortSignal
) {
	if (size > 512n * 1024n * 1024n)
		throw new Error('Asset exceeds 512 MB limit')
	const original = validateSource(input),
		candidates = [original.href],
		match = original.pathname.match(/[a-f0-9]{1,40}$/)
	if (match)
		for (const host of [
			'exbo.b-cdn.net',
			'sc-client-ru.cdn77.exbo.net',
			'sc-client-am.cdn77.exbo.net',
		])
			for (const path of [
				`/stalcraft/stalcraft/${match[0]}`,
				`/stalcraft/${match[0]}`,
				`/${match[0]}`,
			])
				candidates.push(`https://${host}${path}`)
	for (const url of candidates) {
		for (let attempt = 0; attempt < 2; attempt++) {
			if (signal?.aborted) throw new Error('Cancelled')
			try {
				const bytes = await fetchBuffer(
					url,
					Number(size) + 1,
					hash,
					signal
				)
				if (BigInt(bytes.length) !== size)
					throw new Error('Asset size mismatch')
				return bytes
			} catch {
				if (signal?.aborted) throw new Error('Cancelled')
			}
		}
	}
	throw new Error('Не удалось скачать ресурс с проверкой хэша')
}
