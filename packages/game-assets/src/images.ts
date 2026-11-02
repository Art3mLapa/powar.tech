import sharp from 'sharp'

const background = { r: 95, g: 95, b: 95, alpha: 1 }
export type WatermarkOptions = {
	opacity?: number
	sizeFactor?: number
	allowUpscale?: boolean
	position?: 'center' | 'bottom_right'
}
const clamp = (value: number, min: number, max: number) => {
	if (!Number.isFinite(value)) throw new Error('Invalid image option')
	return Math.max(min, Math.min(value, max))
}
export async function applyWatermark(
	input: Buffer,
	mark: Buffer,
	options: WatermarkOptions = {}
) {
	const opacity = clamp(options.opacity ?? 0.4, 0, 1),
		factor = clamp(options.sizeFactor ?? 0.37, 0.05, 1)
	if (!opacity) return input
	const base = await sharp(input, { limitInputPixels: 40_000_000 })
		.flatten({ background })
		.ensureAlpha()
		.png()
		.toBuffer({ resolveWithObject: true })
	const raw = await sharp(mark, { limitInputPixels: 40_000_000 })
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true })
	let left = raw.info.width,
		top = raw.info.height,
		right = -1,
		bottom = -1
	for (let y = 0; y < raw.info.height; y++)
		for (let x = 0; x < raw.info.width; x++)
			if (raw.data[(y * raw.info.width + x) * 4 + 3]) {
				left = Math.min(left, x)
				right = Math.max(right, x)
				top = Math.min(top, y)
				bottom = Math.max(bottom, y)
			}
	if (right < left) return base.data
	const width = right - left + 1,
		height = bottom - top + 1,
		scale = Math.min(
			Math.max(1, Math.floor(base.info.width * factor)) / width,
			Math.max(1, Math.floor(base.info.height * factor)) / height,
			options.allowUpscale ? Infinity : 1
		)
	const resized = await sharp(raw.data, { raw: raw.info })
		.extract({ left, top, width, height })
		.resize(
			Math.max(1, Math.floor(width * scale)),
			Math.max(1, Math.floor(height * scale)),
			{ kernel: 'lanczos3' }
		)
		.raw()
		.toBuffer({ resolveWithObject: true })
	for (let p = 0; p < resized.data.length; p += 4) {
		const alpha = Math.floor(resized.data[p + 3] * opacity)
		for (let c = 0; c < 3; c++)
			resized.data[p + c] = Math.round(
				(resized.data[p + c] * alpha) / 255
			)
		resized.data[p + 3] = Math.round((alpha * alpha) / 255)
	}
	const x =
			options.position === 'bottom_right'
				? base.info.width - resized.info.width
				: Math.floor((base.info.width - resized.info.width) / 2),
		y =
			options.position === 'bottom_right'
				? base.info.height - resized.info.height
				: Math.floor((base.info.height - resized.info.height) / 2)
	return sharp(base.data)
		.composite([
			{ input: resized.data, raw: resized.info, left: x, top: y },
		])
		.png()
		.toBuffer()
}
export async function createCollages(images: Buffer[], mark?: Buffer) {
	const results: Buffer[] = []
	for (let offset = 0; offset < images.length; offset += 9) {
		const chunk = images.slice(offset, offset + 9),
			cols = Math.min(3, chunk.length),
			rows = Math.ceil(chunk.length / cols),
			width = cols * 512,
			height = rows * 512,
			canvas = Buffer.alloc(width * height * 4)
		for (let p = 0; p < canvas.length; p += 4) {
			canvas[p] = 95
			canvas[p + 1] = 95
			canvas[p + 2] = 95
			canvas[p + 3] = 255
		}
		for (const [index, input] of chunk.entries()) {
			const image = await sharp(input, { limitInputPixels: 40_000_000 })
				.ensureAlpha()
				.resize(512, 512, { fit: 'inside', kernel: 'lanczos3' })
				.raw()
				.toBuffer({ resolveWithObject: true })
			const left =
					(index % cols) * 512 +
					Math.floor((512 - image.info.width) / 2),
				top =
					Math.floor(index / cols) * 512 +
					Math.floor((512 - image.info.height) / 2)
			for (let y = 0; y < image.info.height; y++)
				for (let x = 0; x < image.info.width; x++) {
					const source = (y * image.info.width + x) * 4,
						target = ((y + top) * width + x + left) * 4,
						alpha = image.data[source + 3] / 255
					for (let c = 0; c < 4; c++)
						canvas[target + c] = Math.round(
							image.data[source + c] * alpha +
								canvas[target + c] * (1 - alpha)
						)
				}
		}
		const data = await sharp(canvas, {
			raw: { width, height, channels: 4 },
		})
			.png()
			.toBuffer()
		results.push(
			mark
				? await applyWatermark(data, mark, {
						opacity: 0.4,
						sizeFactor: 0.58,
						allowUpscale: true,
						position: 'center',
					})
				: data
		)
	}
	return results
}
