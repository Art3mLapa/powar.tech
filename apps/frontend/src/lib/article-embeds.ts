const YOUTUBE_HOSTS = new Set([
	'youtube.com',
	'm.youtube.com',
	'www.youtube.com',
	'music.youtube.com',
	'youtu.be',
])

const AUDIO_EXTENSIONS = new Set([
	'.mp3',
	'.m4a',
	'.aac',
	'.ogg',
	'.oga',
	'.opus',
	'.wav',
	'.flac',
])

function parseDocument(href: string) {
	try {
		return new URL(href)
	} catch {
		return null
	}
}

export function detectYouTubeVideoId(
	href: string
): { id: string } | null {
	const url = parseDocument(href)
	if (!url) return null
	const host = url.hostname.toLowerCase()
	if (!YOUTUBE_HOSTS.has(host)) {
		return null
	}
	if (host === 'youtu.be') {
		const id = url.pathname.slice(1).split('/')[0]
		return /^[\w-]{8,15}$/.test(id) ? { id } : null
	}
	const query = url.searchParams.get('v')
	if (query && /^[\w-]{8,15}$/.test(query)) {
		return { id: query }
	}
	const parts = url.pathname.split('/').filter(Boolean)
	if (parts.length >= 2 && ['embed', 'shorts', 'live', 'v'].includes(parts[0])) {
		const id = parts[1]
		return /^[\w-]{8,15}$/.test(id) ? { id } : null
	}
	return null
}

export function isAudioLink(href: string): boolean {
	try {
		const pathname = new URL(href).pathname.toLowerCase()
		for (const ext of AUDIO_EXTENSIONS) {
			if (pathname.endsWith(ext)) return true
		}
		return false
	} catch {
		return false
	}
}
