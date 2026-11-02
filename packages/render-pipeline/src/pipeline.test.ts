import { afterAll, beforeAll, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
	buildSourceIndex,
	detectSourceSet,
	normalizeRemainder,
	parseMcmtlIr,
	parseRef,
	parseStrictJson,
	renderStateOf,
	resolveNamespace,
	resolveRelative,
	type SourceRoot,
	sourceRootsFromRoot,
} from './index'

let root: string

const writeFixture = async (relative: string, body: string) => {
	const file = join(root, relative)
	await mkdir(file.slice(0, file.lastIndexOf('/')), { recursive: true })
	await writeFile(file, body)
}

const roots = (): SourceRoot[] => [
	{
		kind: 'configs',
		label: 'configs',
		root: join(root, 'configs'),
	},
	{
		kind: 'materials',
		label: 'materials',
		root: join(root, 'materials'),
	},
	{
		kind: 'shaders',
		label: 'shaders',
		root: join(root, 'shaders'),
	},
]

beforeAll(async () => {
	root = join(await mkdtemp(`${tmpdir()}/render-pipeline-`), 'x')
	await writeFixture(
		'configs/assets/weapons/items/lmg/20179_item.json',
		JSON.stringify([
			{
				type: 'weapon',
				item_id: 20179,
				unlocalized_name: 'wpn.6p62',
				model_name: '6p62/6p62.mcsa',
				material_lib: '6p62/6p62.mcmtl',
				model_name_lod: '6p62/lod/6p62_lod.mcsa',
				material_lib_lod: '6p62/lod/6p62_lod.mcmtl',
				animated: true,
				default_Y_rot: -48.4,
				fp_anim: 'highpoly:animations/wpn_fp.mcvd',
				muzzle_flash_fx_fp: 'effects:particles/flash/fp_flash.efkefc',
			},
		])
	)
	await writeFixture(
		'materials/assets/weapons/models/weapons/6p62/6p62.mcmtl',
		'# synthetic test corpus\nmtlType Weapon\n\nnewmtl bullets\nversion 2\nlighting model pbr\ndiffuse color 1 1 1\ndiffuse map weapons:models/sleeves/sleeves_diff.dds\nspecular map weapons:models/sleeves/sleeves_spek.dds\nalpha as gloss true\n\nnewmtl 6P62_1\nversion 2\nlighting model pbr\ndiffuse map weapons:models/weapons/6p62/6p62_1_diff.dds\nnormal map weapons:models/weapons/6p62/6p62_1_nrm.dds\nalpha transparency true\nalpha blending true\nalpha factor 0.8\nskin mask hook dmap_alpha_as_dual_skin_mask\n'
	)
	await writeFixture(
		'materials/assets/weapons/models/weapons/6p62/lod/6p62_lod.mcmtl',
		'mtlType Weapon\nnewmtl 6P62_1\nlighting model base\ndiffuse map tests:relative_sibling.dds\n'
	)
	await writeFixture(
		'materials/assets/weapons/models/weapons/6p62/lod/paint_spek.dds',
		'binary'
	)
	await writeFixture(
		'materials/assets/weapons/models/weapons/6p62/6p62.mcsb',
		'binary'
	)
	await writeFixture(
		'materials/assets/weapons/models/weapons/6p62/6p62.mcsb',
		'binary'
	)
	await writeFixture(
		'shaders/assets/effects/shaders/mcsa130.vert',
		'#version 430\n#include module/light.vert\n#uniform_definitions\nvoid main(){}\n'
	)
	await writeFixture(
		'shaders/assets/effects/shaders/module/light.vert',
		'uniform vec4 test;\n'
	)
	await writeFixture(
		'shaders/assets/effects/shaders/mcsahook/phantom.fsh',
		'emissionMapColor *= 0.5;\n'
	)
	await writeFixture(
		'shaders/assets/effects/shaders/CaseSensitive.frag',
		'void a(){}\n'
	)
	await writeFixture(
		'shaders/assets/effects/shaders/casesensitive.frag',
		'void b(){}\n'
	)
})

afterAll(async () => {
	await rm(join(root, '..'), { recursive: true, force: true })
})

test('source set detection resolves the three roots under RENDER_SOURCE_ROOT', async () => {
	const set = await sourceRootsFromRoot(root)
	expect(set.map((entry) => entry.kind).sort()).toEqual([
		'configs',
		'materials',
		'shaders',
	])
	const detected = await detectSourceSet({ RENDER_SOURCE_ROOT: root })
	expect(detected.status).toBe('ok')
	const individual = detectSourceSet({
		RENDER_CONFIGS_ROOT: join(root, 'configs'),
		RENDER_MATERIALS_ROOT: join(root, 'materials'),
		RENDER_SHADERS_ROOT: join(root, 'shaders'),
	})
	await expect(individual).resolves.toMatchObject({ status: 'ok' })
	const missing = await detectSourceSet({})
	expect(missing.status).toBe('incomplete')
	expect(missing.errors).toHaveLength(3)
})

test('index registers every file and reports case collisions', async () => {
	const index = await buildSourceIndex(roots())
	expect(index.files).toBe(10)
	expect(
		index.diagnostics.some(
			(entry) =>
				entry.code === 'index.case-collision' &&
				entry.message.includes('casesensitive.frag')
		)
	).toBe(true)
})

test('namespace refs resolve over roots with case and ol fallback, relatives via prefix join and suffix fallback', async () => {
	const index = await buildSourceIndex(roots())
	const ref = resolveNamespace(
		index,
		'weapons',
		'models/sleeves/sleeves_diff.dds'
	)
	expect(ref.status).toBe('missing')
	expect(ref.reason).toContain('assets/weapons/models/sleeves')
	const lodMaterial = resolveRelative(
		index,
		'assets/weapons/items/lmg/20179_item.json',
		'6p62/lod/6p62_lod.mcmtl'
	)
	expect(lodMaterial.paths).toEqual([
		'assets/weapons/models/weapons/6p62/lod/6p62_lod.mcmtl',
	])
	const unbounded = resolveRelative(
		index,
		'assets/weapons/models/weapons/6p62/lod/6p62_lod.mcmtl',
		'../paint_spek.dds'
	)
	expect(unbounded.status).toBe('unsafe')
	expect(unbounded.reason).toContain('unbounded')
	const paint = resolveRelative(
		index,
		'assets/weapons/models/weapons/6p62/lod/6p62_lod.mcmtl',
		'paint_spek.dds'
	)
	expect(paint.paths).toEqual([
		'assets/weapons/models/weapons/6p62/lod/paint_spek.dds',
	])
	const candidate = parseRef('stalker:Models/Armor/kim_topaz/topaz.dds')
	expect(candidate.namespace).toBe('stalker')
	expect(candidate.remainder).toBe('Models/Armor/kim_topaz/topaz.dds')
	expect(normalizeRemainder('a\\b\\')).toBe('a/b')
})

test('model refs retarget mcsa payloads onto runtime mcsb containers', async () => {
	const index = await buildSourceIndex(roots())
	const ref = resolveNamespace(
		index,
		'weapons',
		'models/weapons/6p62/6p62.mcsa'
	)
	expect(ref.status).toBe('resolved')
	expect(ref.paths).toEqual(['assets/weapons/models/weapons/6p62/6p62.mcsb'])
})

test('strict JSON flags trailing comma and duplicate keys without modifying data', () => {
	const clean = parseStrictJson('[{"a": 1}]', 'clean.json')
	expect(clean.diagnostics).toHaveLength(0)
	expect(clean.data).toEqual([{ a: 1 }])
	const trailing = parseStrictJson('[{"a": 1,},{"b": null}]', 'trailing.json')
	expect(
		trailing.diagnostics.some(
			(entry) => entry.code === 'json.trailing-comma'
		)
	).toBe(true)
	expect(trailing.data).toEqual([{ a: 1 }, { b: null }])
	const duplicates = parseStrictJson(
		'{"k": 1, "k": 2, // note\n"x": {"y": 3}}',
		'dup.json'
	)
	expect(
		duplicates.diagnostics.some(
			(entry) => entry.code === 'json.duplicate-key'
		)
	).toBe(true)
	expect((duplicates.data as { x: { y: number } }).x.y).toBe(3)
	expect(() => parseStrictJson('{"a": }', 'broken.json')).toThrow(
		/broken\.json.*line 1/
	)
})

test('mcmtl keeps directives, hooks, lighting models and render state losslessly', () => {
	const text =
		'# Amogus test\nmtlType Weapon\n\nnewmtl bullets\nversion 2\nlighting model pbr\ndiffuse map weapons:models/sleeves/sleeves_diff.dds\nspecular exponent 96.07843\nalpha as gloss true\n\nnewmtl 6P62_1\nversion 2\nlighting model glass\ndiffuse map stalker:models/armor/kim/topaz_diff.dds\nnormal map stalker:models/armor/kim/topaz_nrm.dds\nalpha transparency true\nalpha blending true\nalpha factor 1.6\nskin mask hook dmap_alpha_as_dual_skin_mask\nfresnel scale 4\nheat emission color 0.05 0.0005 0\nshader hook overheat\npos offset 0 0 0\nlighting model 1\n'
	const ir = parseMcmtlIr(text, 'assets/test.mcmtl', 'hash1')
	expect(ir.mtlType).toBe('Weapon')
	expect(ir.materials).toHaveLength(2)
	const bullets = ir.materials[0]
	expect(bullets.lightingModel).toEqual({ raw: 'pbr', normalized: 'pbr' })
	expect(bullets.maps.diffuse[0]).toEqual({
		kind: 'ref',
		refNamespace: 'weapons',
		refRemainder: 'models/sleeves/sleeves_diff.dds',
		contextRelative: false,
	})
	expect(bullets.scalars['specular exponent']).toEqual([96.07843])
	expect(bullets.flags['alpha as gloss']).toBe(true)
	const glass = ir.materials[1]
	expect(glass.lightingModel.normalized).toBe('glass')
	expect(glass.flags['alpha transparency']).toBe(true)
	expect(renderStateOf(glass)).toMatchObject({
		alphaTransparency: true,
		alphaBlending: true,
		alphaFactor: 1.6,
	})
	expect(glass.hooks[0].name).toBe('dmap_alpha_as_dual_skin_mask')
	expect(glass.hooks[0].observed).toBe(true)
	expect(glass.scalars['fresnel scale']).toEqual([4])
	expect(glass.colors['heat emission color']).toEqual([0.05, 0.0005, 0])
	expect(glass.hooks[1].name).toBe('overheat')
	expect(ir.raw).toBe(text)
	expect(
		ir.diagnostics.some(
			(entry) =>
				entry.code === 'mcmtl.lighting-model-ignored' &&
				entry.message.includes('lighting model 1 ignored')
		)
	).toBe(true)
	expect(glass.directives.map((directive) => directive.key)).toContain(
		'pos offset'
	)
	expect(glass.directives.map((directive) => directive.raw)).toContain(
		'skin mask hook dmap_alpha_as_dual_skin_mask'
	)
})
