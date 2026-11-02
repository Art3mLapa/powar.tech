import { afterAll, beforeAll, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { planMaterialPrograms } from './material-plan'
import { parseMcmtlIr } from './mcmtl'
import { resolveNamespace } from './refs'
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

const write = async (relative: string, body: string) => {
	const file = join(root, relative)
	await mkdir(file.slice(0, file.lastIndexOf('/')), { recursive: true })
	await writeFile(file, body)
}

beforeAll(async () => {
	root = join(await mkdtemp(`${tmpdir()}/material-plan-`), 'x')
	await write(
		'materials_test/assets/weapons/models/weapons/6p62/6p62_1_diff.dds',
		'binary'
	)
	await write(
		'materials_test/assets/weapons/models/weapons/6p62/6p62_2_diff.dds',
		'binary'
	)
	await write(
		'materials_test/assets/weapons/models/weapons/6p62/6p62_1_nrm.dds',
		'binary'
	)
	await write(
		'materials_test/assets/weapons/models/weapons/6p62/6p62_1_spek.dds',
		'binary'
	)
	await write(
		'materials_test/assets/armor/models/black/black_diff.dds',
		'binary'
	)
	await write(
		'materials_test/assets/effects/models/black_armor.mcmtl',
		'mtlType Weapon\nnewmtl armor\nversion 2\nlighting model pbr\ndiffuse map armor:models/black/black_diff.dds\n'
	)
	index = await buildSourceIndex(roots())
})

afterAll(async () => {
	await rm(join(root, '..'), { recursive: true, force: true })
})

const PBR_WEAPON_MCMTL = `# Blender MCMTL File: 'None'
# Material Count: 3

mtlType Weapon

newmtl bullets
version 2
lighting model pbr
diffuse color 1 1 1
specular color 1 1 1
diffuse map weapons:models/weapons/6p62/6p62_1_diff.dds
specular map weapons:models/weapons/6p62/6p62_1_spek.dds
normal map weapons:models/weapons/6p62/6p62_1_nrm.dds
gloss map weapons:models/weapons/6p62/6p62_1_spek.dds
alpha as gloss true

skin mask hook dmap_alpha_as_dual_skin_mask

newmtl 6P62_1

version 2
lighting model pbr
diffuse color 1 1 1
specular color 1 1 1
diffuse map weapons:models/weapons/6p62/6p62_2_diff.dds
gloss map weapons:models/weapons/6p62/6p62_1_spek.dds
alpha as gloss true

newmtl unlit_display

lighting model unlit
diffuse map weapons:models/weapons/6p62/6p62_1_diff.dds
alpha transparency true

newmtl unknown_model

lighting model 1
diffuse map weapons:models/weapons/6p62/6p62_1_diff.dds
`

const GLASS_MCMTL = `mtlType Weapon
newmtl lens
version 2
lighting model glass
diffuse map weapons:models/weapons/6p62/6p62_1_diff.dds
fresnel scale 4
fresnel bias 0.1
fresnel power 5
reflection factor 0.5
reflection gloss 0.2
alpha transparency true
alpha blending true
alpha factor 0.8
`

test('pbr weapon materials map onto defines, map bindings, uniform values and skin hooks', async () => {
	const ir = parseMcmtlIr(PBR_WEAPON_MCMTL, 'assets/6p62.mcmtl', '')
	const plan = await planMaterialPrograms(ir.materials, index)
	const bullets = plan.programs[0]
	expect(bullets.material).toBe('bullets')
	expect(bullets.status).toBe('planned')
	expect(bullets.lightingModel).toBe('pbr')
	expect(bullets.defines).toEqual([
		'LIGHTING_MODEL_PBR',
		'DIFFUSE_MAPPING',
		'NORMAL_MAPPING',
		'SPECULAR_MAPPING',
		'GLOSS_MAPPING',
		'SPECULAR_LIGHTING',
		'NUM_MAPS=4',
	])
	expect(bullets.unrollValues).toEqual({ NUM_MAPS: 4 })
	expect(bullets.maps.map((map) => map.slot)).toEqual([
		'diffuse',
		'specular',
		'normal',
		'gloss',
	])
	expect(
		bullets.maps.map(
			(map) => `${map.slot}:${map.textureIndex}:${map.uniform}`
		)
	).toEqual([
		'diffuse:0:diffuseMap',
		'specular:1:specularMap',
		'normal:2:normalMap',
		'gloss:3:glossMap',
	])
	const gloss = bullets.maps.find((map) => map.slot === 'gloss')
	expect(gloss?.channel).toBe(3)
	expect(gloss?.channelProvenance).toContain('alpha as gloss')
	const specular = bullets.maps.find((map) => map.slot === 'specular')
	expect(specular?.channel).toBeNull()
	expect(bullets.uniformValues).toEqual([
		{ name: 'diffuseColor', values: [1, 1, 1], key: 'diffuse color' },
		{ name: 'specularColor', values: [1, 1, 1], key: 'specular color' },
	])
	expect(bullets.hooks).toEqual(['dmap_alpha_as_dual_skin_mask'])
	expect(bullets.unverifiable.join(' ')).toContain(
		'alpha as gloss: archived mcsa130 samples gloss'
	)
	const resolved = plan.textures.filter(
		(texture) =>
			texture.status === 'resolved' && texture.material === 'bullets'
	)
	expect(
		resolved
			.map((texture) => texture.slot)
			.sort()
			.join(',')
	).toBe('diffuse,gloss,normal,specular')
	expect(resolved[0]?.path).toMatch(/6p62_1_(diff|nrm|spek)\.dds$/)
})

test('unlit material drops specular lighting and alpha transparency maps through', async () => {
	const ir = parseMcmtlIr(PBR_WEAPON_MCMTL, 'assets/6p62.mcmtl', '')
	const plan = await planMaterialPrograms(ir.materials, null)
	const unlit = plan.programs[2]
	expect(unlit.material).toBe('unlit_display')
	expect(unlit.status).toBe('planned')
	expect(unlit.lightingModel).toBe('unlit')
	expect(unlit.defines).toEqual([
		'LIGHTING_MODEL_UNLIT',
		'DIFFUSE_MAPPING',
		'ALPHA_TRANSPARENCY',
		'NUM_MAPS=1',
	])
})

test('glass material binds fresnel uniforms and refuses observed-hook-free plans only for unknown hooks', async () => {
	const ir = parseMcmtlIr(GLASS_MCMTL, 'assets/glass.mcmtl', '')
	const plan = await planMaterialPrograms(ir.materials, null)
	const glass = plan.programs[0]
	expect(glass.lightingModel).toBe('glass')
	expect(glass.defines).toEqual([
		'LIGHTING_MODEL_GLASS',
		'DIFFUSE_MAPPING',
		'ALPHA_TRANSPARENCY',
		'ALPHA_BLENDING',
		'NUM_MAPS=1',
	])
	const names = glass.uniformValues.reduce<Record<string, number[]>>(
		(values, uniform) => {
			values[uniform.name] = uniform.values
			return values
		},
		{}
	)
	expect(names.fresnelScale).toEqual([4])
	expect(names.fresnelBias).toEqual([0.1])
	expect(names.fresnelPower).toEqual([5])
	expect(names.reflectionFactor).toEqual([0.5])
	expect(names.reflectionGloss).toEqual([0.2])
})

test('unknown lighting models and unobserved hooks mark programs unsupported with explicit marks', async () => {
	const ir = parseMcmtlIr(PBR_WEAPON_MCMTL, 'assets/6p62.mcmtl', '')
	const plan = await planMaterialPrograms(ir.materials, null)
	const unknown = plan.programs[3]
	expect(unknown.material).toBe('unknown_model')
	expect(unknown.status).toBe('unsupported')
	expect(unknown.lightingModel).toBe('unknown')
	expect(unknown.unsupported).toHaveLength(1)
	expect(unknown.unsupported[0]?.reason).toBe('unknown-lighting-model')
	expect(
		plan.diagnostics.some(
			(entry) =>
				entry.code === 'material.unsupported' &&
				entry.message.includes('unknown_model')
		)
	).toBe(true)

	const mutated = parseMcmtlIr(
		`newmtl mutant\nversion 2\nlighting model pbr\ndiffuse map weapons:models/weapons/6p62/6p62_1_diff.dds\nskin mask hook totally_unknown_hook\n`,
		'assets/mutant.mcmtl',
		''
	)
	const mutant = await planMaterialPrograms(mutated.materials, null)
	expect(mutant.programs[0]?.status).toBe('unsupported')
	expect(mutant.programs[0]?.unsupported[0]?.reason).toBe(
		'unresolved-hook-mapping'
	)
})

test('unresolved map refs over an index surface unsupported marks and texture diagnostics', async () => {
	const iron = parseMcmtlIr(
		`newmtl armor\nversion 2\nlighting model pbr\ndiffuse map armor:models/black/black_diff.dds\nspecular map armor:models/black/missing_spek.dds\n`,
		'assets/black_armor.mcmtl',
		''
	)
	const plan = await planMaterialPrograms(iron.materials, index)
	const program = plan.programs[0]
	expect(program.status).toBe('unsupported')
	expect(program.unsupported.map((mark) => mark.reason)).toEqual([
		'unresolved-map-ref',
	])
	const diffuse = plan.textures.find((texture) => texture.slot === 'diffuse')
	expect(diffuse?.path).toMatch(/black_diff\.dds$/)
	const specular = plan.textures.find(
		(texture) => texture.slot === 'specular'
	)
	expect(specular?.status).toBe('missing')
	expect(
		resolveNamespace(
			index,
			'weapons',
			'models/weapons/6p62/6p62_1_diff.dds'
		).status
	).toBe('resolved')
})
