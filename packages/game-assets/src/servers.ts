import sharp from 'sharp'
export type GameServer = Record<string, unknown> & {
	onlineCurrent: number
	onlineMax: number
}
export type OnlinePoint = {
	ts: string
	onlineCurrent: number
	onlineMax: number
}
function integer(value: unknown) {
	const n =
		typeof value === 'number'
			? value
			: typeof value === 'string' && /^[+-]?\d+$/.test(value.trim())
				? Number(value)
				: 0
	return Number.isSafeInteger(Math.trunc(n)) ? Math.trunc(n) : 0
}
export function parseServersResponse(input: unknown): GameServer[] {
	if (
		!input ||
		typeof input !== 'object' ||
		!('success' in input) ||
		!input.success ||
		!('data' in input)
	)
		throw new Error('Launcher rejected server list')
	let data = input.data
	if (typeof data === 'string') {
		try {
			data = JSON.parse(data)
		} catch {
			throw new Error('Invalid server list data')
		}
	}
	if (
		!Array.isArray(data) ||
		data.length > 1000 ||
		data.some((s) => !s || typeof s !== 'object' || Array.isArray(s))
	)
		throw new Error('Invalid server list data')
	return data.map((server) => ({
		...server,
		onlineCurrent: integer(server.onlineCurrent),
		onlineMax: integer(server.onlineMax),
	}))
}
export function serverKey(server: Record<string, unknown>) {
	return `${server.id || 'unknown_id'}::${server.caption || 'unknown_caption'}`
}
export function onlineHistory(
	samples: { createdAt: string; data: unknown }[],
	server: Record<string, unknown>,
	now = Date.now()
): OnlinePoint[] {
	const cutoff = now - 31 * 86400000,
		key = serverKey(server),
		points: OnlinePoint[] = []
	for (const sample of samples) {
		const ts = Date.parse(sample.createdAt)
		if (!Number.isFinite(ts) || ts < cutoff || ts > now) continue
		let data = sample.data
		if (typeof data === 'string') {
			try {
				data = JSON.parse(data)
			} catch {
				continue
			}
		}
		if (
			data &&
			typeof data === 'object' &&
			!Array.isArray(data) &&
			'data' in data
		) {
			try {
				data = parseServersResponse(data)
			} catch {
				continue
			}
		}
		if (!Array.isArray(data)) continue
		const found = data.find(
			(s) => s && typeof s === 'object' && serverKey(s) === key
		)
		if (found)
			points.push({
				ts: new Date(ts).toISOString(),
				onlineCurrent: integer(found.onlineCurrent),
				onlineMax: integer(found.onlineMax),
			})
	}
	return points.sort((a, b) => a.ts.localeCompare(b.ts)).slice(-300)
}
const xml = (value: string) => {
	const escaped: Record<string, string> = {
		'<': '&lt;',
		'>': '&gt;',
		'&': '&amp;',
		'"': '&quot;',
		"'": '&apos;',
	}
	return value.replace(/[<>&"']/g, (char) => escaped[char] ?? char)
}
export async function renderOnlineGraph(
	points: OnlinePoint[],
	caption: string,
	region: string
) {
	if (!points.length) throw new Error('No online history')
	const last = points[points.length - 1],
		start = Date.parse(points[0].ts),
		end = Date.parse(last.ts),
		max = Math.max(
			1,
			...points.flatMap((p) => [p.onlineCurrent, p.onlineMax])
		),
		x = (ts: string) =>
			90 + ((Date.parse(ts) - start) / Math.max(1, end - start)) * 1450,
		y = (n: number) => 550 - (Math.max(0, n) / max) * 450
	const path = (field: 'onlineCurrent' | 'onlineMax') =>
		points
			.map(
				(p, i) =>
					`${i ? 'L' : 'M'}${x(p.ts).toFixed(2)},${y(p[field]).toFixed(2)}`
			)
			.join(' ')
	const grid = Array.from({ length: 6 }, (_, i) => {
		const n = Math.round((max * i) / 5),
			yy = y(n)
		return `<path d="M90 ${yy}H1540" stroke="#ddd"/><text x="78" y="${yy + 6}" text-anchor="end">${n}</text>`
	}).join('')
	const ticks = Array.from({ length: Math.min(6, points.length) }, (_, i) => {
		const p =
			points[
				Math.floor(
					(i * (points.length - 1)) /
						Math.max(1, Math.min(6, points.length) - 1)
				)
			]
		return `<text x="${x(p.ts)}" y="585" text-anchor="middle">${new Date(p.ts).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit' })}</text>`
	}).join('')
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="640"><rect width="1600" height="640" fill="white"/><g font-family="sans-serif" font-size="20" fill="#222"><text x="800" y="42" text-anchor="middle">${xml(caption)} [${xml(region)}] — онлайн за 31 день</text>${grid}${ticks}<text x="100" y="78" fill="#2a9d8f">Текущий онлайн</text><text x="340" y="78" fill="#e76f51">Лимит</text><path d="${path('onlineCurrent')}" fill="none" stroke="#2a9d8f" stroke-width="4"/>${points.map((p) => `<circle cx="${x(p.ts)}" cy="${y(p.onlineCurrent)}" r="4" fill="#2a9d8f"/>`).join('')}<path d="${path('onlineMax')}" fill="none" stroke="#e76f51" stroke-width="3" stroke-dasharray="10 7"/></g></svg>`
	return sharp(Buffer.from(svg)).png().toBuffer()
}
