import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import {
	applyWatermark,
	createCollages,
	createZip,
	decodeModel,
	decodeOl,
	decompressLz4,
	diffManifests,
	diffValues,
	materialTexturePaths,
	micToPng,
	modelToGlb,
	olToPng,
	onlineHistory,
	parseBalanceItem,
	parseLang,
	parseMcmtl,
	parseServersResponse,
	parseTorrentData,
	readZip,
	regionCoordinates,
	renderModel,
	renderOnlineGraph,
	selectMapRegions,
} from '@bscp/game-assets'

const text = (value: string) => {
	const b = Buffer.from(value),
		prefix = Buffer.alloc(2)
	prefix.writeUInt16BE(b.length)
	return Buffer.concat([prefix, b])
}
const u32 = (n: number) => {
	const b = Buffer.alloc(4)
	b.writeUInt32BE(n)
	return b
}
test('torrentData big endian, gzip prefix, hashes, exact bigint and diff', () => {
	const size = Buffer.alloc(8)
	size.writeBigUInt64BE(7n)
	const hash = createHash('sha1').update('fixture').digest()
	const payload = Buffer.concat([
		size,
		text('test'),
		u32(0),
		text('https://exbo.b-cdn.net/'),
		u32(1024),
		text('stalcraft'),
		u32(1),
		text('assets/test.txt'),
		size,
		hash,
		u32(0),
	])
	const manifest = parseTorrentData(
		Buffer.concat([Buffer.alloc(4), gzipSync(payload)])
	)
	expect(manifest.files[0].size).toBe('7')
	expect(manifest.files[0].hash).toBe(hash.toString('hex'))
	expect(diffManifests([], manifest.files)[0].kind).toBe('ADDED')
	expect(diffManifests(manifest.files, manifest.files)).toEqual([])
	const withPiece = Buffer.concat([
		payload.subarray(0, -4),
		u32(1),
		Buffer.alloc(20, 7),
	])
	expect(
		parseTorrentData(Buffer.concat([Buffer.alloc(4), gzipSync(withPiece)]))
			.files
	).toHaveLength(1)
	expect(() =>
		parseTorrentData(
			Buffer.concat([Buffer.alloc(4), gzipSync(payload.subarray(0, -2))])
		)
	).toThrow()
})
test('LZ4 validates literals, overlap copies and corrupt references', () => {
	expect(
		decompressLz4(
			Buffer.from([0x50, ...Buffer.from('hello')]),
			5
		).toString()
	).toBe('hello')
	expect(decompressLz4(Buffer.from([0x11, 97, 1, 0]), 6).toString()).toBe(
		'aaaaaa'
	)
	expect(() => decompressLz4(Buffer.from([0, 0, 0]), 4)).toThrow()
})
test('ZIP roundtrip, path safety and localization diff', () => {
	const entries = [{ path: 'textures/test.dds', data: Buffer.from('pixels') }]
	expect(readZip(createZip(entries))).toEqual(entries)
	expect(() =>
		createZip([{ path: '../secret', data: Buffer.alloc(0) }])
	).toThrow()
	const old = parseLang('# x\na=1\nb=2'),
		next = parseLang('a=3\nb=2\nc=4')
	expect(diffValues(old, next).map((c) => c.kind)).toEqual([
		'CHANGED',
		'ADDED',
	])
})
test.skipIf(!process.env.MODEL_FIXTURE_DIR)(
	'real game MCSB + OL → GLB + CPU PNG previews',
	async () => {
		const root = process.env.MODEL_FIXTURE_DIR
		if (!root) throw new Error('MODEL_FIXTURE_DIR is required')
		const files = await readdir(root),
			modelName = files.find((name) => name.endsWith('.mcsb'))
		if (!modelName) throw new Error('MCSB fixture is required')
		const model = modelToGlb(
			decodeModel(
				Buffer.from(
					await Bun.file(`${root}/${modelName}`).arrayBuffer()
				),
				'.mcsb'
			)
		)
		expect(model.subarray(0, 4).toString()).toBe('glTF')
		const textures = await Promise.all(
			files
				.filter((name) => name.endsWith('.ol'))
				.map(async (name) => ({
					name,
					data: Buffer.from(
						await Bun.file(`${root}/${name}`).arrayBuffer()
					),
				}))
		)
		const texture = textures[0]
		if (!texture) throw new Error('OL fixture is required')
		const decoded = decodeOl(texture.data)
		expect(decoded.width).toBeGreaterThan(0)
		expect(
			(await olToPng(texture.data)).subarray(0, 4).toString('hex')
		).toBe('89504e47')
		const results = await renderModel(model, textures, true)
		expect(results).toHaveLength(2)
		for (const result of results) {
			expect(result.data.readUInt32BE(16)).toBe(1024)
			expect(result.data.length).toBeGreaterThan(10000)
		}
	},
	120000
)
test.skipIf(!process.env.MIC_FIXTURE)(
	'real MIC restores PNG signature',
	async () => {
		const path = process.env.MIC_FIXTURE
		if (!path) throw new Error('MIC_FIXTURE is required')
		const png = await micToPng(
			Buffer.from(await Bun.file(path).arrayBuffer())
		)
		expect(png.subarray(0, 4).toString('hex')).toBe('89504e47')
	}
)

test('mcmtl materials parse texture maps, alpha and relative game paths', () => {
	const materials = parseMcmtl(
		Buffer.from(
			`# Amogus Engine Foundation\r\nmtlType Gameobject\r\nnewmtl body\r\nversion 2\r\nlighting model base\r\ndiffuse color 1 1 1\r\ndiffuse map customitems:models/tex/body.dds\r\nnormal map customitems:models/tex/body_nrm.dds\r\nalpha transparency true\r\n\r\nnewmtl pub sign\r\ndiffuse map none\r\nspecular map weapons:models/w/Spek.OL\r\nemission map customitems:x/z.dds\r\nanim emission map\r\nanim rows 4`
		)
	)
	expect(materials).toEqual([
		{
			name: 'body',
			diff: 'customitems:models/tex/body.dds',
			normal: 'customitems:models/tex/body_nrm.dds',
			alpha: true,
		},
		{
			name: 'pub sign',
			spek: 'weapons:models/w/Spek.OL',
			emi: 'customitems:x/z.dds',
		},
	])
	const paths = materialTexturePaths('customitems:Models/Tex/body.dds')
	if (!paths)
		throw new Error('materialTexturePaths must resolve referenced textures')
	expect(paths).toEqual({
		ol: [
			'assets/customitems/Models/Tex/body.ol',
			'assets/customitems/models/tex/body.ol',
		],
		dds: [
			'assets/customitems/Models/Tex/body.dds',
			'assets/customitems/models/tex/body.dds',
		],
	})
	expect(paths).toEqual({
		ol: [
			'assets/customitems/Models/Tex/body.ol',
			'assets/customitems/models/tex/body.ol',
		],
		dds: [
			'assets/customitems/Models/Tex/body.dds',
			'assets/customitems/models/tex/body.dds',
		],
	})
	expect(materialTexturePaths('none')).toBeNull()
	expect(materialTexturePaths('a:b..c/x.dds')).toBeNull()
	expect(materialTexturePaths('x: with space.dds')).toBeNull()
})

test('specialized balance parsers preserve all eight legacy families', () => {
	const numeric = (key: string, value: unknown) => ({
			type: 'numeric',
			name: { key, lines: { ru: key } },
			value,
		}),
		base = { name: { lines: { ru: 'Предмет', en: 'Item' } } }
	const weapon = parseBalanceItem(
		{
			...base,
			infoBlocks: [
				{
					type: 'list',
					elements: [
						{
							type: 'key-value',
							key: { key: 'core.tooltip.info.rank' },
							value: { lines: { ru: 'A' } },
						},
						{
							type: 'numeric',
							name: { key: 'core.tooltip.info.weight' },
							value: 2,
						},
					],
				},
			],
		},
		'weapon'
	)
	expect(weapon).toMatchObject({ Название: 'Предмет', Ранг: 'A', Вес: 2 })
	for (const category of [
		'armor',
		'bag',
		'boost',
		'bullet',
		'grenade',
	] as const) {
		const item = parseBalanceItem(
			{
				...base,
				infoBlocks: [
					{
						type: 'list',
						elements: [
							numeric('custom.stat', 3),
							{ type: 'text', text: { lines: { ru: 'Флаг' } } },
						],
					},
				],
			},
			category
		)
		expect(item.Название).toBe('Предмет')
		expect(item['custom.stat']).toBe(3)
	}
	const attachment = parseBalanceItem(
		{
			...base,
			infoBlocks: [
				{
					type: 'list',
					elements: [
						{
							type: 'key-value',
							key: { key: 'weapon.zoom.x', lines: { ru: 'Зум' } },
							value: { text: '4x' },
						},
						{
							type: 'numeric',
							name: {
								key: 'custom.stat',
								lines: { ru: 'Стабильность' },
							},
							value: 1,
						},
					],
				},
			],
		},
		'attachment'
	)
	expect(attachment).toMatchObject({
		Зум: '4x',
		Стабильность: 1,
		compatibilityList: [],
	})
	const artefact = parseBalanceItem(
		{
			...base,
			infoBlocks: [
				{
					type: 'list',
					elements: [
						{
							type: 'key-value',
							key: { key: 'core.tooltip.info.rank' },
							value: { lines: { ru: 'A' } },
						},
						{
							type: 'range',
							name: { key: 'power', lines: { ru: 'Мощность' } },
							min: '1,5',
							max: '2,5',
						},
					],
				},
				{
					type: 'addStat',
					elements: [
						{
							type: 'numeric',
							name: { key: 'power', lines: { ru: 'Мощность' } },
							value: 1,
						},
					],
				},
			],
		},
		'artefact'
	)
	expect(artefact).toMatchObject({ Мощность: { min: 2.5, max: 3.5 } })
})

test('map coordinates, preset filtering, server payloads and history stay bounded', async () => {
	expect(regionCoordinates('modassets/assets/pda/map/r.-1.2.ol')).toEqual({
		x: -1,
		z: 2,
	})
	const regions = Array.from({ length: 600 }, (_, i) => ({
		path: `r.${i}.0.ol`,
	}))
	expect(selectMapRegions(regions, 'zone').length).toBe(0)
	const response = parseServersResponse({
		success: true,
		data: JSON.stringify([
			{
				id: 's1',
				caption: 'Alpha',
				onlineCurrent: '12',
				onlineMax: '32',
				desc: ['x'],
			},
		]),
	})
	expect(response[0]).toMatchObject({
		onlineCurrent: 12,
		onlineMax: 32,
		desc: ['x'],
	})
	const now = Date.parse('2026-10-30T12:00:00Z'),
		points = onlineHistory(
			[
				{
					createdAt: new Date(now - 86400000).toISOString(),
					data: JSON.stringify(response),
				},
			],
			response[0],
			now
		)
	expect(points).toHaveLength(1)
	expect(
		(await renderOnlineGraph(points, '<Alpha>', 'RU'))
			.subarray(0, 4)
			.toString('hex')
	).toBe('89504e47')
})

test('watermark and collage preserve PNG outputs without mutating input', async () => {
	const input = Buffer.from(
			'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
			'base64'
		),
		mark = Buffer.from(
			await Bun.file(
				'../../packages/game-assets/assets/watermark.png'
			).arrayBuffer()
		)
	const watermarked = await applyWatermark(input, mark, {
			opacity: 0.4,
			sizeFactor: 0.5,
			allowUpscale: true,
		}),
		collages = await createCollages([input, input], mark)
	expect(input.equals(watermarked)).toBe(false)
	expect(watermarked.readUInt32BE(16)).toBe(1)
	expect(collages).toHaveLength(1)
	expect(collages[0].readUInt32BE(16)).toBe(1024)
})
