import sharp from 'sharp'
import { micToPng, olToPng } from './textures'

type Preset = {
	bounds: [number, number, number, number]
	crop?: [number, number, number, number]
}
export const mapPresets: Record<string, Preset> = {
	zone: { bounds: [-12, -3, -6, 9], crop: [0, 0, 1, 264] },
	newsever: { bounds: [-23, -1, -14, 9], crop: [398, 229, 0, 352] },
	underarmsklad: { bounds: [-2, -10, -1, -9], crop: [1947, 1139, 97, 1143] },
	underpd: { bounds: [-3, -10, -2, -9], crop: [639, 1222, 50, 744] },
	xvoiniy: { bounds: [6, -5, 8, -4], crop: [347, 84, 276, 138] },
	kvartali: { bounds: [9, -5, 10, -4], crop: [114, 82, 38, 68] },
	rozavetrov: { bounds: [7, 4, 11, 8], crop: [409, 218, 21, 252] },
	nizina: { bounds: [13, 4, 16, 7], crop: [250, 0, 250, 420] },
	sovhoz: { bounds: [-4, 4, 0, 8], crop: [387, 42, 315, 383] },
	sovhozfull: { bounds: [-4, 1, 3, 8] },
	boral2023: { bounds: [5, -3, 10, 2] },
	boral2021: { bounds: [13, -3, 18, 2] },
	gawrgura: { bounds: [-5, 10, -5, 10], crop: [139, 404, 340, 66] },
}
export function regionCoordinates(path: string) {
	const file = path.replaceAll('\\', '/').split('/').pop()
	if (!file) return null
	const stem = file
		.replace(/\.[^.]+$/, '')
		.split('__')
		.pop()
	if (!stem) return null
	const name = stem.replaceAll('_', '.').replace(/^r\.?/i, '')
	const match = name.match(/^(-?\d+)[.,](-?\d+)$/)
	if (!match) return null
	const x = Number(match[1]),
		z = Number(match[2])
	return Number.isSafeInteger(x) && Number.isSafeInteger(z) ? { x, z } : null
}
export function selectMapRegions<T extends { path: string }>(
	regions: T[],
	presetName = ''
) {
	const preset = presetName ? mapPresets[presetName] : null
	if (presetName && !preset) throw new Error('Unknown map preset')
	return regions.flatMap((region) => {
		const coord = regionCoordinates(region.path)
		return coord &&
			(!preset ||
				(coord.x >= preset.bounds[0] &&
					coord.z >= preset.bounds[1] &&
					coord.x <= preset.bounds[2] &&
					coord.z <= preset.bounds[3]))
			? [{ ...region, ...coord }]
			: []
	})
}
export async function mergeMap(
	regions: { path: string; data: Buffer }[],
	presetName = '',
	strict = true
) {
	const preset = presetName ? mapPresets[presetName] : null,
		selected = selectMapRegions(regions, presetName)
	const coordinates = new Set(selected.map((r) => `${r.x},${r.z}`))
	if (coordinates.size !== selected.length)
		throw new Error('Duplicate map coordinates')
	if (!selected.length) throw new Error('No map regions')
	if (preset && strict) {
		const coordinates = new Set(selected.map((r) => `${r.x},${r.z}`))
		for (let x = preset.bounds[0]; x <= preset.bounds[2]; x++)
			for (let z = preset.bounds[1]; z <= preset.bounds[3]; z++)
				if (!coordinates.has(`${x},${z}`))
					throw new Error(`Missing region ${x},${z}`)
	}
	const decoded: ((typeof selected)[number] & { scale: number })[] = []
	let decodedPixels = 0
	for (const region of selected) {
		const data = /\.mic$/i.test(region.path)
			? await micToPng(region.data)
			: /\.ol$/i.test(region.path)
				? await olToPng(region.data)
				: region.data
		const metadata = await sharp(data, {
			limitInputPixels: 40_000_000,
		}).metadata()
		if (!metadata.width || metadata.width !== metadata.height)
			throw new Error('Map region must be square')
		decodedPixels += metadata.width * metadata.height
		if (decodedPixels > 250_000_000)
			throw new Error('Map input exceeds pixel budget')
		decoded.push({ ...region, data, scale: metadata.width })
	}
	const scale = decoded[0].scale
	if (decoded.some((r) => r.scale !== scale))
		throw new Error('Map region sizes differ')
	const left = Math.min(...decoded.map((r) => r.x)),
		right = Math.max(...decoded.map((r) => r.x)),
		top = Math.min(...decoded.map((r) => r.z)),
		bottom = Math.max(...decoded.map((r) => r.z)),
		width = (right - left + 1) * scale,
		height = (bottom - top + 1) * scale
	if (width * height > 250_000_000)
		throw new Error('Map output exceeds pixel budget')
	let image = sharp({
		create: {
			width,
			height,
			channels: 4,
			background: { r: 0, g: 0, b: 0, alpha: 0 },
		},
		limitInputPixels: 250_000_000,
	}).composite(
		decoded.map((r) => ({
			input: r.data,
			left: (r.x - left) * scale,
			top: (r.z - top) * scale,
		}))
	)
	const combined = await image.png().toBuffer()
	image = sharp(combined, { limitInputPixels: 250_000_000 })
	if (preset?.crop) {
		const [l, t, r, b] = preset.crop
		if (width - l - r <= 0 || height - t - b <= 0)
			throw new Error('Invalid preset crop')
		image = image.extract({
			left: l,
			top: t,
			width: width - l - r,
			height: height - t - b,
		})
	}
	return image.png().toBuffer()
}
