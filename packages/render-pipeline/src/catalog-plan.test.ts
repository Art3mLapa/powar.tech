import { afterAll, beforeAll, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { planCatalogScene, sweepMaterials } from './catalog-plan'
import {
	buildSourceIndex,
	type SourceIndex,
	type SourceRoot,
} from './source-set'

let root: string
let index: SourceIndex

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
	{
		kind: 'shaders',
		label: 'shaders_test',
		root: join(root, 'shaders_test'),
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
	for (const entry of meshes) parts.push(...record(entry, 2, 1))
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

beforeAll(async () => {
	root = join(await mkdtemp(`${tmpdir()}/catalog-plan-`), 'x')
	await write(
		'materials_test/assets/weapons/models/weapons/gun/gun_diff.dds',
		'binary'
	)
	await write(
		'materials_test/assets/weapons/models/weapons/gun/gun.mcmtl',
		`mtlType Weapon
newmtl m1
version 2
lighting model pbr
diffuse color 1 1 1
diffuse map weapons:models/weapons/gun/gun_diff.dds
alpha as gloss true
newmtl other
version 2
lighting model base
diffuse map weapons:models/weapons/gun/gun_diff.dds
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
		'configs_test/assets/weapons/items/lmg/100_gun.json',
		JSON.stringify([
			{
				item_id: 100,
				model_name: 'gun/gun.mcsa',
				material_lib: 'gun/gun.mcmtl',
				default_X_rot: -1.5,
				default_Y_rot: -48.4,
				default_Z_rot: 9.6,
				default_scale: 0.5,
			},
		])
	)
	await write(
		'configs_test/assets/weapons/items/lmg/101_broken.json',
		JSON.stringify([
			{
				item_id: 101,
				model_name: 'nothing/ghost.mcsa',
				material_lib: 'gun/gun.mcmtl',
			},
		])
	)
	await write(
		'configs_test/assets/weapons/items/lmg/102_alias.json',
		JSON.stringify([
			{
				item_id: 102,
				model: 'gun/gun.mcsa',
			},
		])
	)
	index = await buildSourceIndex(roots())
})

afterAll(async () => {
	await rm(join(root, '..'), { recursive: true, force: true })
})

test('planCatalogScene retargets the model payload and binds mesh materials to programs', async () => {
	const scene = await planCatalogScene(
		index,
		'assets/weapons/items/lmg/100_gun.json'
	)
	expect(scene.quality).toBe('structural')
	expect(scene.itemId).toBe(100)
	expect(scene.primary.path).toBe(
		'assets/weapons/models/weapons/gun/gun.mcsb'
	)
	expect(scene.primary.version).toBe(11)
	expect(scene.primary.meshCount).toBe(2)
	expect(scene.primary.boneCount).toBe(1)
	expect(scene.primary.clipCount).toBe(0)
	expect(scene.lod).toBeNull()
	expect(scene.meshBinds.map((bind) => bind.mesh)).toEqual(['body', 'spare'])
	expect(scene.meshBinds.map((bind) => bind.program?.material)).toEqual([
		'm1',
		'other',
	])
	expect(scene.meshBinds[0]?.vertices).toBe(2)
	expect(scene.meshBinds[0]?.polygons).toBe(1)
	expect(scene.programs.map((program) => program.status)).toEqual([
		'planned',
		'planned',
	])
	expect(
		scene.transform.find((field) => field.field === 'default_X_rot')
	).toEqual({ field: 'default_X_rot', value: -1.5, provenance: 'explicit' })
	expect(
		scene.transform.find((field) => field.field === 'bake_center_x')
	).toEqual({ field: 'bake_center_x', value: 0, provenance: 'neutral' })
	expect(scene.camera.policy).toBe('neutral')
	expect(scene.output).toEqual({ format: 'rgba8', watermark: false })
	expect(scene.animation.deferred).toBe(true)
	expect(
		scene.diagnostics.some(
			(entry) => entry.code === 'scene.mesh-material-unmatched'
		)
	).toBe(false)
})

test('catalog aliases model and infers a unique material library', async () => {
	const scene = await planCatalogScene(
		index,
		'assets/weapons/items/lmg/102_alias.json'
	)
	expect(scene.quality).toBe('structural')
	expect(scene.primary.path).toBe(
		'assets/weapons/models/weapons/gun/gun.mcsb'
	)
	expect(scene.programs.length).toBeGreaterThan(0)
	expect(
		scene.diagnostics.some(
			(entry) => entry.code === 'config.material-lib-inferred'
		)
	).toBe(true)
})

test('planCatalogScene marks unresolved primary models as unsupported and records unmatched meshes', async () => {
	const scene = await planCatalogScene(
		index,
		'assets/weapons/items/lmg/101_broken.json'
	)
	expect(scene.quality).toBe('unsupported')
	expect(scene.primary.path).toBe('')
	expect(
		scene.diagnostics.some(
			(entry) => entry.code === 'scene.model-unresolved'
		)
	).toBe(true)
	expect(
		scene.transform.every((field) => field.provenance === 'neutral')
	).toBe(true)
	const emptyPrograms = await sweepMaterials(index)
	expect(emptyPrograms.files).toBe(1)
	expect(emptyPrograms.programsPlanned).toBe(2)
	expect(emptyPrograms.programsUnsupported).toBe(0)
	expect(emptyPrograms.reasons).toEqual([])
})
