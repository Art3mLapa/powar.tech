import { afterAll, beforeAll, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'

import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
	DRAW_BUFFER_FLOATS_PER_VERTEX,
	neutralCamera,
	tangentBasis,
	writeCatalogDraws,
} from './catalog-draw'
import { planCatalogScene } from './catalog-plan'
import { buildSourceIndex, type SourceRoot } from './source-set'
import { runRendererSpike } from './spike-run'

let root: string

const roots = (): SourceRoot[] => [
	{
		kind: 'configs',
		label: 'configs_test',
		root: join(root, 'configs_test'),
	},
	{
		kind: 'materials',
		label: 'materials_test',
		root: join(root, 'materials_test'),
	},
]

const write = async (relative: string, body: Buffer | string) => {
	const file = join(root, relative)
	await mkdir(file.slice(0, file.lastIndexOf('/')), { recursive: true })
	await writeFile(file, body)
}

const count32 = (value: number) => {
	const b = Buffer.alloc(4)
	b.writeUInt32LE(value, 0)
	return b
}

const name16 = (text: string) => {
	const b = Buffer.alloc(2 + text.length)
	b.writeUInt16LE(text.length, 0)
	b.write(text, 2)
	return b
}

const syntheticGun = (meshes: { mesh: string; material: string }[]) => {
	const flags = [true, true, true, true, true, false]
	const parts: Buffer[] = [
		Buffer.from('MCSA', 'ascii'),
		(() => {
			const f = Buffer.alloc(4)
			f.writeFloatLE(11, 0)
			return f
		})(),
		(() => {
			const b = Buffer.alloc(6)
			b.set([1, 1, 1, 1, 1, 0])
			return b
		})(),
		Buffer.from(new Float32Array([2, 2, 2]).buffer),
	]
	const record = (
		entry: { mesh: string; material: string },
		vertices: number,
		polygons: number
	) => {
		const out: Buffer[] = []
		out.push(name16(entry.mesh), name16(entry.material))
		if (flags[0]) out.push(Buffer.from([1, 1, 0]))
		out.push(count32(vertices))
		out.push(count32(polygons))
		if (flags[1]) out.push(Buffer.from(new Float32Array([2]).buffer))
		out.push(
			Buffer.from(new Float32Array(6).buffer),
			Buffer.from(new Float32Array(1).buffer)
		)
		const positions = Buffer.alloc(vertices * 4 * 2)
		for (let i = 0; i < vertices * 4; i++)
			positions.writeInt16LE((i * 73) % 300, i * 2)
		out.push(positions)
		if (flags[1]) {
			const uv = Buffer.alloc(vertices * 2 * 2)
			for (let i = 0; i < vertices * 2; i++) uv.writeInt16LE(i % 7, i * 2)
			out.push(uv)
		}
		if (flags[4]) out.push(Buffer.alloc(vertices * 4))
		if (flags[2]) {
			const n = Buffer.alloc(vertices * 4)
			for (let i = 0; i < vertices * 4; i++) n.writeInt8(i % 5, i)
			out.push(n)
		}
		if (flags[3]) out.push(Buffer.alloc(vertices * 4))
		if (flags[0]) out.push(Buffer.alloc(vertices * 4, 0))
		if (flags[5]) out.push(Buffer.alloc(vertices * 4, 0))
		const idx = Buffer.alloc(polygons * 3 * 2)
		for (let i = 0; i < polygons * 3; i++)
			idx.writeUInt16LE(i % vertices, i * 2)
		out.push(idx)
		return out
	}
	parts.push(count32(meshes.length))
	for (const entry of meshes) parts.push(...record(entry, 3, 1))
	parts.push(
		Buffer.from([1]),
		name16('bone'),
		Buffer.from([0]),
		Buffer.from(new Float32Array([0, 0, 0, 0, 0, 0]).buffer)
	)
	const inner = Buffer.concat(parts)
	const size = Buffer.alloc(4)
	size.writeUInt32BE(16, 0)
	return Buffer.concat([size, Buffer.alloc(16, 9), inner])
}

const encodeOlRgba = (width: number, height: number, rgba: Buffer) => {
	const literals = Buffer.from(rgba)
	const packed = Buffer.alloc(2 + literals.length)
	packed[0] = 0xf0
	packed[1] = literals.length - 15
	literals.copy(packed, 2)
	const out: Buffer[] = [
		(() => {
			const b = Buffer.alloc(4)
			b.writeUInt32BE(0x0a9523fd, 0)
			return b
		})(),
		(() => {
			const b = Buffer.alloc(4)
			b.writeUInt32BE(width, 0)
			return b
		})(),
		(() => {
			const b = Buffer.alloc(4)
			b.writeUInt32BE(height, 0)
			return b
		})(),
		(() => {
			const b = Buffer.alloc(4)
			b.writeUInt32BE(1, 0)
			return b
		})(),
		(() => {
			const format = [...'RGBA8'].map(
				(letter) => Buffer.from(letter, 'ascii')[0] ^ 103
			)
			return Buffer.concat([
				Buffer.from(format),
				Buffer.alloc(17 - format.length, 0x47),
			])
		})(),
		(() => {
			const b = Buffer.alloc(4)
			b.writeUInt32BE(literals.length, 0)
			return b
		})(),
		(() => {
			const b = Buffer.alloc(4)
			b.writeUInt32BE(packed.length, 0)
			return b
		})(),
		Buffer.alloc(2, 0),
		packed,
	]
	return Buffer.concat(out)
}

const RGBA_PIXELS = Buffer.from([
	120, 40, 200, 255, 20, 20, 20, 255, 200, 220, 10, 255, 255, 255, 255, 255,
])

let index: Awaited<ReturnType<typeof buildSourceIndex>>

beforeAll(async () => {
	root = join(await mkdtemp(`${tmpdir()}/catalog-draw-`), 'x')
	await write(
		'materials_test/assets/weapons/models/weapons/gun/gun.mcmtl',
		`mtlType Weapon
newmtl m1
version 2
lighting model pbr
diffuse color 1 1 1
diffuse map weapons:models/weapons/gun/gun_diff.ol
normal map weapons:models/weapons/gun/gun_nrm.ol
newmtl other
version 2
lighting model base
diffuse map weapons:models/weapons/gun/gun_diff.ol
`
	)
	await write(
		'materials_test/assets/weapons/models/weapons/gun/gun.mcsb',
		syntheticGun([
			{ mesh: 'body', material: 'm1' },
			{ mesh: 'spare', material: 'other' },
		])
	)
	await write(
		'materials_test/assets/weapons/models/weapons/gun/gun_diff.ol',
		encodeOlRgba(2, 2, RGBA_PIXELS)
	)
	await write(
		'materials_test/assets/weapons/models/weapons/gun/gun_nrm.ol',
		encodeOlRgba(2, 2, RGBA_PIXELS)
	)
	await write(
		'configs_test/assets/weapons/items/lmg/100_gun.json',
		JSON.stringify([
			{
				item_id: 100,
				model_name: 'gun/gun.mcsb',
				material_lib: 'gun/gun.mcmtl',
				default_X_rot: -1.5,
				default_Y_rot: -48.4,
				default_Z_rot: 9.6,
				default_scale: 0.5,
			},
		])
	)
	index = await buildSourceIndex(roots())
})

afterAll(async () => {
	if (process.env.CATALOG_DRAW_KEEP) return
	await rm(join(root, '..'), { recursive: true, force: true })
})

test('catalog draws produce interleaved mesh payloads per material', async () => {
	const scene = await planCatalogScene(
		index,
		'assets/weapons/items/lmg/100_gun.json'
	)
	const build = await writeCatalogDraws(index, scene, {
		bundleDir: join(root, 'bundle-a'),
		lightingModels: ['pbr', 'base'],
		spikeProgram: 'mcsa130-pbr-skinned-lit-full',
	})
	expect(build.draws).toHaveLength(2)
	expect(
		build.files.some((file) =>
			file.path.startsWith('draws/draw-0000-body.mesh')
		)
	).toBeTrue()
	const mesh = await readFile(
		join(root, 'bundle-a', 'draws/draw-0000-body.mesh')
	)
	expect(mesh.length).toBe(3 * DRAW_BUFFER_FLOATS_PER_VERTEX * 4)
	const floats = Array.from(new Float32Array(mesh.buffer))
	expect(floats.length).toBe(3 * DRAW_BUFFER_FLOATS_PER_VERTEX)
	expect(floats[0]).toBe(0)
	expect(floats[1]).toBe(73)
	expect(floats[2]).toBe(146)
	expect(floats[4]).toBe(0)
	expect(floats[5]).toBe(1)
	expect(floats[6]).toBe(2)
	expect(floats[12]).toBe(0)
	expect(floats[13]).toBe(1)
	const body = build.draws[0]
	expect(body.material).toBe('m1')
	expect(body.textures.map((texture) => texture.textureIndex)).toEqual([0, 1])
	expect(
		build.files.filter((file) => file.path.includes('-tex0.rgba'))
	).toHaveLength(2)
	const decodedTexture = await readFile(
		join(root, 'bundle-a', body.textures[0].file as string)
	)
	expect(decodedTexture).toHaveLength(16)
	expect(body.indexType).toBe('u16')
	expect(body.indexCount).toBe(3)
	expect(body.viewMatrix).toHaveLength(16)
	expect(body.projectionMatrix).toHaveLength(16)
	expect(body.interleavedStride).toBe(DRAW_BUFFER_FLOATS_PER_VERTEX * 4)
})

test('draws honor lighting models and material-suffix program override', async () => {
	const scene = await planCatalogScene(
		index,
		'assets/weapons/items/lmg/100_gun.json'
	)
	const build = await writeCatalogDraws(index, scene, {
		bundleDir: join(root, 'bundle-b'),
		lightingModels: ['pbr'],
		spikeProgram: 'mcsa130-pbr-skinned-lit-full',
	})
	expect(build.draws).toHaveLength(1)
	expect(build.draws[0].material).toBe('m1')
	expect(build.draws[0].program).toBe('mcsa130-pbr-skinned-lit-full')
	expect(
		build.diagnostics.filter((entry) => entry.code === 'draws.mesh-skipped')
	).toHaveLength(1)
})

test('neutral camera derives basis windows from mesh extents', () => {
	const positions = Float32Array.from([0, 0, 0, 1, 2, 4, 0.5, 1])
	const camera = neutralCamera(positions)
	expect(camera.viewMatrix).toHaveLength(16)
	expect(camera.projectionMatrix).toHaveLength(16)
	expect(camera.radius).toBeGreaterThan(0)
	expect(camera.center).toEqual([1, 2, 0.25])
})

test('tangent basis derives triangle oriented first tangent', () => {
	const positions = Float32Array.from([0, 0, 0, 1, 1, 0, 0, 1, 1, 1, 0, 1])
	const normals = Float32Array.from([0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0])
	const uvs = Float32Array.from([0, 0, 1, 0, 1, 1])
	const tangents = tangentBasis(
		positions,
		normals,
		uvs,
		true,
		Uint32Array.from([0, 1, 2]),
		3
	)
	expect(tangents[0]).toBeCloseTo(1, 5)
	expect(tangents[1]).toBeCloseTo(0, 5)
	expect(tangents[2]).toBeCloseTo(0, 5)
	expect(tangents[3]).toBeCloseTo(0, 5)
})

test('mesh payload renders through the native draw pass', async () => {
	const scene = await planCatalogScene(
		index,
		'assets/weapons/items/lmg/100_gun.json'
	)
	const bundleDir = join(root, 'bundle-c')
	const build = await writeCatalogDraws(index, scene, {
		bundleDir,
		lightingModels: ['pbr', 'base'],
		spikeProgram: 'draw-spike',
	})
	const vertexShader = [
		'#version 430',
		'in vec4 positionIn;',
		'uniform vec4 quantizationScale;',
		'layout (std140, column_major) uniform persistentBlock {',
		'	mat4 viewMatrix;',
		'	mat4 projectionMatrix;',
		'};',
		'out vec3 v_color;',
		'void main(){',
		'	vec3 scaled = positionIn.xyz * quantizationScale.x;',
		'	v_color = vec3(0.3, 0.6, 0.9) * (0.5 + 0.5 * fract(scaled));',
		'	gl_Position = projectionMatrix * viewMatrix * vec4(scaled, 1.0);',
		'}',
	].join('\n')
	const fragmentShader = [
		'#version 430',
		'in vec3 v_color;',
		'out vec4 frag;',
		'void main(){',
		'	frag = vec4(v_color, 1.0);',
		'}',
	].join('\n')
	await write('bundle-c/draw-spike.vert', vertexShader)
	await write('bundle-c/draw-spike.frag', fragmentShader)
	const manifest = {
		schema: 'renderer-spike.1',
		programs: [
			{
				name: 'draw-spike',
				vertex: 'draw-spike.vert',
				fragment: 'draw-spike.frag',
				defines: [],
			},
		],
		capture: { width: 64, height: 64, readback: 'rgba8' },
		draws: build.draws,
		notes: ['catalog draws fixture'],
	}
	await write(
		'bundle-c/render_manifest.json',
		JSON.stringify(manifest, null, 2)
	)
	const softmax = await runRendererSpike(
		join(import.meta.dir, '../../../apps/renderer/build/renderer'),
		{
			bundleDir,
			manifestPath: join(bundleDir, 'render_manifest.json'),
			sources: [],
			manifest: manifest as never,
		},
		join(root, 'run-native')
	)
	expect(softmax.report.status).toBe('ok')
	const drawn = Object.entries(softmax.report.draws ?? {})
	expect(drawn).toHaveLength(2)
	expect(drawn.every(([, draw]) => draw.status === 'drawn')).toBeTrue()
	const captured = await readFile(
		join(root, 'run-native', 'capture', 'draw-0-body.rgba')
	)
	expect(captured).toHaveLength(64 * 64 * 4)
	expect(captured.some((byte, i) => i % 4 === 0 && byte > 10)).toBeTrue()
})
