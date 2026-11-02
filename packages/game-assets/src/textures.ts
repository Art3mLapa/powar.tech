import sharp from 'sharp'
import { BinaryReader, safeGamePath } from './binary'

export function decompressLz4(source: Buffer, size: number) {
	if (size < 0 || size > 256 * 1024 * 1024)
		throw new Error('LZ4 output limit')
	const output = Buffer.alloc(size)
	let p = 0,
		q = 0
	function length(base: number) {
		let n = base
		if (base === 15) {
			let v: number
			do {
				if (p >= source.length) throw new Error('Truncated LZ4')
				v = source[p++]
				n += v
			} while (v === 255)
		}
		return n
	}
	while (p < source.length) {
		const token = source[p++],
			literal = length(token >>> 4)
		if (p + literal > source.length || q + literal > size)
			throw new Error('Invalid LZ4 literal')
		source.copy(output, q, p, p + literal)
		p += literal
		q += literal
		if (p === source.length) break
		if (p + 2 > source.length) throw new Error('Invalid LZ4 offset')
		const offset = source.readUInt16LE(p)
		p += 2
		if (!offset || offset > q) throw new Error('Invalid LZ4 reference')
		const match = length(token & 15) + 4
		if (q + match > size) throw new Error('Invalid LZ4 match')
		for (let i = 0; i < match; i++) output[q + i] = output[q + i - offset]
		q += match
	}
	if (q !== size) throw new Error('LZ4 size mismatch')
	return output
}
export type Texture = {
	width: number
	height: number
	format: string
	mips: Buffer[]
}
export type TextureFamilyCandidate = {
	root: string
	samplePath: string
	entries: number
	hasDiff: boolean
}
function textureTokens(value: string) {
	const result = new Set<string>()
	for (const token of value.toLowerCase().match(/[a-z]+|\d+/g) ?? []) {
		if (/^\d+$/.test(token)) {
			if (token.length >= 2) result.add(token.replace(/^0+/, '') || '0')
		} else if (token.length >= 2) result.add(token)
	}
	return result
}
export function isRelevantTextureRoot(
	root: string,
	modelNameFull: string,
	modelNameBase = modelNameFull.slice(0, 5)
) {
	const compact = root.toLowerCase().replace(/[^a-z0-9]+/g, '')
	if (compact.length < 3) return false
	const normalized = root.toLowerCase(),
		model = modelNameFull.toLowerCase(),
		shared = [...textureTokens(model), ...textureTokens(root)]
			.filter((token, index, array) => array.indexOf(token) === index)
			.filter(
				(token) =>
					textureTokens(model).has(token) &&
					textureTokens(root).has(token)
			)
	return (
		normalized === model ||
		normalized.startsWith(model) ||
		(model.startsWith(normalized) && compact.length >= 5) ||
		((normalized.startsWith(modelNameBase.toLowerCase()) ||
			textureTokens(root).has(modelNameBase.toLowerCase())) &&
			modelNameBase.length >= 5) ||
		shared.length > 0
	)
}
export function scoreTextureFamily(
	candidate: TextureFamilyCandidate,
	modelNameFull: string,
	modelNameBase: string,
	parentFolder = '',
	gamePath = '',
	gameParentPath = ''
) {
	const root = candidate.root.toLowerCase(),
		compact = root.replace(/[^a-z0-9]+/g, ''),
		modelTokens = textureTokens(modelNameFull),
		rootTokens = textureTokens(root),
		shared = [...modelTokens].filter((token) => rootTokens.has(token)),
		normalizedPath = candidate.samplePath
			.toLowerCase()
			.replaceAll('\\', '/')
	let score = 0
	if (root === modelNameFull) score += 260
	if (root.startsWith(modelNameFull)) score += 160
	if (modelNameFull.startsWith(root) && compact.length >= 5) score += 90
	if (modelNameFull.includes(root)) score += 120
	if (
		(root.startsWith(modelNameBase) || rootTokens.has(modelNameBase)) &&
		modelNameBase.length >= 5
	)
		score += 50
	score +=
		shared.length * 45 +
		candidate.entries * 35 +
		(candidate.hasDiff ? 80 : -120)
	if (
		gameParentPath &&
		normalizedPath.startsWith(
			`${gameParentPath.replace(/\\/g, '/').replace(/\/$/, '')}/`
		)
	)
		score += 320
	if (parentFolder && normalizedPath.includes(`/${parentFolder}/`))
		score += 95
	for (const tag of ['weapon', 'armor', 'artifact', 'backpack', 'attachment'])
		if (
			gamePath.toLowerCase().includes(tag) &&
			normalizedPath.includes(`/${tag}/`)
		)
			score += 40
	return score - Math.abs(root.length - modelNameFull.length) * 2
}
export function decodeOl(input: Buffer): Texture {
	const r = new BinaryReader(input)
	if (r.u32() !== 0x0a9523fd) throw new Error('Invalid OL signature')
	const width = r.u32(),
		height = r.u32(),
		count = r.count(32)
	if (!width || !height || width * height > 40_000_000 || !count)
		throw new Error('Texture dimensions exceed limit')
	const format = String.fromCharCode(
		...[...r.bytes(17).subarray(0, 16)]
			.filter((n) => n !== 71)
			.map((n) => n ^ 103)
	)
	if (
		![
			'DXT1',
			'DXT3',
			'DXT5',
			'RGBA8',
			'BGRA8',
			'RGBA32F',
			'DXN_XY',
		].includes(format)
	)
		throw new Error(`Unsupported OL format ${format}`)
	const plain = Array.from({ length: count }, () => r.u32()),
		packed = Array.from({ length: count }, () => r.u32())
	r.bytes(r.u16())
	if (plain.reduce((a, b) => a + b, 0) > 256 * 1024 * 1024)
		throw new Error('Texture mipmap limit')
	const mips = plain.map((size, i) => decompressLz4(r.bytes(packed[i]), size))
	return { width, height, format, mips }
}
function colors565(n: number) {
	return [
		Math.round((((n >>> 11) & 31) * 255) / 31),
		Math.round((((n >>> 5) & 63) * 255) / 63),
		Math.round(((n & 31) * 255) / 31),
		255,
	]
}
function bc4(b: Buffer, start: number) {
	const a = b[start],
		c = b[start + 1],
		table = [a, c]
	if (a > c) {
		for (let i = 1; i <= 6; i++)
			table.push(Math.floor(((7 - i) * a + i * c) / 7))
	} else {
		for (let i = 1; i <= 4; i++)
			table.push(Math.floor(((5 - i) * a + i * c) / 5))
		table.push(0, 255)
	}
	let bits = 0n
	for (let i = 0; i < 6; i++)
		bits |= BigInt(b[start + 2 + i]) << BigInt(i * 8)
	return Array.from(
		{ length: 16 },
		(_, i) => table[Number((bits >> BigInt(i * 3)) & 7n)]
	)
}
export function textureRgba(t: Texture) {
	const { width, height, format } = t,
		b = t.mips[0],
		out = Buffer.alloc(width * height * 4)
	if (['RGBA8', 'BGRA8', 'RGBA32F'].includes(format)) {
		const stride = format === 'RGBA32F' ? 16 : 4
		if (b.length < width * height * stride)
			throw new Error('Truncated pixel buffer')
		for (let i = 0; i < width * height; i++)
			for (let c = 0; c < 4; c++) {
				const source = format === 'BGRA8' && c < 3 ? 2 - c : c
				out[i * 4 + c] =
					format === 'RGBA32F'
						? Math.round(
								Math.min(
									1,
									Math.max(0, b.readFloatLE(i * 16 + c * 4))
								) * 255
							)
						: b[i * 4 + source]
			}
		return out
	}
	const blockSize = format === 'DXT1' ? 8 : 16,
		bx = Math.ceil(width / 4),
		by = Math.ceil(height / 4)
	if (b.length < bx * by * blockSize)
		throw new Error('Truncated compressed texture')
	for (let y = 0; y < by; y++)
		for (let x = 0; x < bx; x++) {
			const offset = (y * bx + x) * blockSize
			if (format === 'DXN_XY') {
				const red = bc4(b, offset),
					green = bc4(b, offset + 8)
				for (let i = 0; i < 16; i++) {
					const xx = x * 4 + (i % 4),
						yy = y * 4 + Math.floor(i / 4)
					if (xx >= width || yy >= height) continue
					const target = (yy * width + xx) * 4
					out[target] = red[i]
					out[target + 1] = green[i]
					out[target + 2] = Math.round(
						(Math.sqrt(
							Math.max(
								0,
								1 -
									(red[i] / 127.5 - 1) ** 2 -
									(green[i] / 127.5 - 1) ** 2
							)
						) +
							1) *
							127.5
					)
					out[target + 3] = 255
				}
				continue
			}
			const colorOffset = offset + (format === 'DXT1' ? 0 : 8),
				c0 = b.readUInt16LE(colorOffset),
				c1 = b.readUInt16LE(colorOffset + 2),
				a = colors565(c0),
				c = colors565(c1),
				palette = [a, c]
			if (c0 > c1 || format !== 'DXT1') {
				palette.push(
					a.map((v, i) =>
						i === 3 ? 255 : Math.floor((2 * v + c[i]) / 3)
					),
					a.map((v, i) =>
						i === 3 ? 255 : Math.floor((v + 2 * c[i]) / 3)
					)
				)
			} else {
				palette.push(
					a.map((v, i) =>
						i === 3 ? 255 : Math.floor((v + c[i]) / 2)
					),
					[0, 0, 0, 0]
				)
			}
			const selectors = b.readUInt32LE(colorOffset + 4),
				alpha = format === 'DXT5' ? bc4(b, offset) : null
			for (let i = 0; i < 16; i++) {
				const xx = x * 4 + (i % 4),
					yy = y * 4 + Math.floor(i / 4)
				if (xx >= width || yy >= height) continue
				const target = (yy * width + xx) * 4,
					color = palette[(selectors >>> (i * 2)) & 3]
				for (let channel = 0; channel < 4; channel++)
					out[target + channel] = color[channel]
				if (alpha) out[target + 3] = alpha[i]
				if (format === 'DXT3')
					out[target + 3] =
						((b[offset + Math.floor(i / 2)] >> ((i % 2) * 4)) &
							15) *
						17
			}
		}
	return out
}
export async function olToPng(input: Buffer) {
	const texture = decodeOl(input)
	return sharp(textureRgba(texture), {
		raw: { width: texture.width, height: texture.height, channels: 4 },
	})
		.png()
		.toBuffer()
}
export function olToDds(input: Buffer) {
	const t = decodeOl(input),
		compressed = ['DXT1', 'DXT3', 'DXT5', 'DXN_XY', 'RGBA32F'].includes(
			t.format
		),
		header = Buffer.alloc(t.format === 'RGBA32F' ? 148 : 128)
	header.write('DDS ')
	header.writeUInt32LE(124, 4)
	header.writeUInt32LE(0x21007 | (compressed ? 0x80000 : 8), 8)
	header.writeUInt32LE(t.height, 12)
	header.writeUInt32LE(t.width, 16)
	header.writeUInt32LE(compressed ? t.mips[0].length : t.width * 4, 20)
	header.writeUInt32LE(t.mips.length, 28)
	header.writeUInt32LE(32, 76)
	header.writeUInt32LE(compressed ? 4 : 0x41, 80)
	if (compressed)
		header.write(
			t.format === 'DXN_XY'
				? 'ATI2'
				: t.format === 'RGBA32F'
					? 'DX10'
					: t.format,
			84
		)
	else {
		header.writeUInt32LE(32, 88)
		;[
			t.format === 'BGRA8' ? 0xff0000 : 0xff,
			0xff00,
			t.format === 'BGRA8' ? 0xff : 0xff0000,
			0xff000000,
		].forEach((n, i) => {
			header.writeUInt32LE(n, 92 + i * 4)
		})
	}
	header.writeUInt32LE(0x401008, 108)
	if (t.format === 'RGBA32F') {
		header.writeUInt32LE(2, 128)
		header.writeUInt32LE(3, 132)
		header.writeUInt32LE(1, 140)
	}
	return Buffer.concat([header, ...t.mips])
}
export async function micToPng(input: Buffer) {
	if (input.subarray(0, 4).toString('hex') !== '894d4943')
		throw new Error('Invalid MIC signature')
	return sharp(
		Buffer.concat([Buffer.from('89504e47', 'hex'), input.subarray(4)]),
		{ limitInputPixels: 40_000_000 }
	)
		.png()
		.toBuffer()
}
export function decodeTexarr(input: Buffer) {
	const r = new BinaryReader(input),
		count = r.count(10000),
		result: { path: string; data: Buffer }[] = []
	for (let i = 0; i < count; i++) {
		const path = safeGamePath(`${r.string().replaceAll(':', '/')}.dds`)
		result.push({ path, data: r.bytes(r.count(256 * 1024 * 1024)) })
	}
	return result
}
