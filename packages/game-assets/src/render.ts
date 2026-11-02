import { chromium } from 'playwright-core'
import sharp from 'sharp'
import { decodeOl, textureRgba } from './textures'

export type RenderTexture = {
	name: string
	data: Buffer
	family?: string
	kind?: 'diff' | 'nrm' | 'spek' | 'emi'
	alpha?: 'opaque' | 'soft' | 'cutout'
}
export type RenderView = { name: string; angle: number }
export const DEFAULT_RENDER_VIEWS: RenderView[] = [
	{ name: 'front_right', angle: 45 },
	{ name: 'back_left', angle: 135 },
]
type TextureChannel = 'diff' | 'normal' | 'roughness' | 'emissive'
const CHANNELS: Partial<Record<string, TextureChannel>> = {
	diff: 'diff',
	normal: 'normal',
	nrm: 'normal',
	spek: 'roughness',
	emi: 'emissive',
}

export async function renderModel(
	model: Buffer,
	textures: RenderTexture[],
	views: RenderView[] | boolean = DEFAULT_RENDER_VIEWS
) {
	const assets = new Map<string, { data: Buffer; type: string }>([
		['/model.glb', { data: model, type: 'model/gltf-binary' }],
	])
	const families: Record<
		string,
		{
			diff?: string
			normal?: string
			roughness?: string
			emissive?: string
			alpha?: 'opaque' | 'soft' | 'cutout'
		}
	> = {}
	for (const texture of textures) {
		const match = texture.name
				.toLowerCase()
				.match(/([^/]+)_(diff|nrm|spek|emi)\.ol$/),
			family = texture.family ?? match?.[1],
			kind = (texture.kind ?? match?.[2]) as
				| 'diff'
				| 'nrm'
				| 'spek'
				| 'emi'
				| undefined
		if (!family || !kind) continue
		const channel = CHANNELS[kind]
		if (!channel) continue
		const key = family.toLowerCase(),
			t = decodeOl(texture.data),
			rgba = textureRgba(t),
			path = `/textures/${encodeURIComponent(`${family}_${kind}`)}.png`
		let config = families[key]
		if (!config) {
			config = {}
			families[key] = config
		}
		if (kind === 'diff') {
			if (texture.alpha) config.alpha = texture.alpha
			else {
				let transparent = 0,
					semi = 0
				for (let i = 3; i < rgba.length; i += 4) {
					if (rgba[i] <= 3) transparent++
					else if (rgba[i] < 252) semi++
				}
				const count = t.width * t.height,
					soft = /glass|window|visor|scope|lens|transparent/.test(
						family
					),
					cutout = /mesh|net|grate|fence|chain|alpha|mask/.test(
						family
					)
				config.alpha =
					transparent / count < 0.005 || semi / count > 0.12
						? 'opaque'
						: soft
							? 'soft'
							: cutout
								? 'cutout'
								: semi / count >= 0.01
									? 'soft'
									: transparent / count >= 0.02
										? 'cutout'
										: 'opaque'
			}
			if (config.alpha === 'opaque')
				for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255
			if (config.alpha === 'cutout')
				for (let i = 3; i < rgba.length; i += 4)
					rgba[i] = rgba[i] > 127 ? 255 : 0
		}
		if (kind === 'spek') {
			for (let i = 0; i < rgba.length; i += 4) {
				const rough = 255 - rgba[i + 1]
				rgba[i] = rough
				rgba[i + 1] = rough
				rgba[i + 2] = rough
				rgba[i + 3] = 255
			}
		}
		if (kind === 'nrm' || kind === 'emi')
			for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255
		const image = await sharp(rgba, {
			raw: { width: t.width, height: t.height, channels: 4 },
		})
			.png()
			.toBuffer()
		assets.set(path, { data: image, type: 'image/png' })
		config[channel] = path
	}
	const built = await Bun.build({
		entrypoints: [new URL('./render-browser.ts', import.meta.url).pathname],
		target: 'browser',
		minify: true,
	})
	if (!built.success)
		throw new Error(
			`Renderer bundle failed: ${built.logs.map((x) => x.message).join(', ')}`
		)
	const script = await built.outputs[0].text()
	const server = Bun.serve({
		hostname: '127.0.0.1',
		port: 0,
		fetch(request) {
			const path = new URL(request.url).pathname
			if (path === '/')
				return new Response(
					'<!doctype html><html><body></body></html>',
					{
						headers: {
							'content-type': 'text/html',
							'content-security-policy':
								"default-src 'self'; script-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; style-src 'unsafe-inline'",
						},
					}
				)
			const asset = assets.get(path)
			return asset
				? new Response(new Uint8Array(asset.data), {
						headers: { 'content-type': asset.type },
					})
				: new Response('Not found', { status: 404 })
		},
	})
	const browser = await chromium
		.launch({
			executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
			headless: true,
			args: [
				'--use-gl=angle',
				'--use-angle=swiftshader',
				'--enable-unsafe-swiftshader',
				...(process.env.CHROMIUM_NO_SANDBOX === '1'
					? ['--no-sandbox']
					: []),
			],
		})
		.catch((error) => {
			server.stop(true)
			throw error
		})
	try {
		const page = await browser.newPage({
			viewport: { width: 1024, height: 1024 },
		})
		page.setDefaultTimeout(60000)
		await page.route('**/*', (route) =>
			new URL(route.request().url()).origin === server.url.origin
				? route.continue()
				: route.abort()
		)
		await page.goto(server.url.href)
		await page.addScriptTag({ content: script })
		const fallback = Object.keys(families).find((key) => families[key].diff)
		await page.evaluate(async (input) => window.loadModel(input), {
			model: '/model.glb',
			families,
			fallback,
		})
		const result: { name: string; data: Buffer }[] = []
		for (const view of typeof views === 'boolean'
			? DEFAULT_RENDER_VIEWS
			: views) {
			const url = await page.evaluate(
				(angle) => window.captureModel(angle),
				view.angle
			)
			result.push({
				name: view.name,
				data: Buffer.from(url.split(',')[1], 'base64'),
			})
		}
		return result
	} finally {
		await browser.close()
		server.stop(true)
	}
}
