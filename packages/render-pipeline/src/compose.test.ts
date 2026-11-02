import { afterAll, beforeAll, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
	buildHookRegistry,
	buildSourceIndex,
	composeShader,
	planSpikePrograms,
	resolveHookInserts,
	type SourceIndex,
	type SourceRoot,
	spikeManifest,
} from './index'

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
	root = join(await mkdtemp(`${tmpdir()}/compose-`), 'x')
	await write(
		'shaders_test/assets/effects/shaders/mcsa130.vert',
		'#version 430\n#include module/sun_shadow.vert\n#uniform_definitions\n#model_matrix_decryption\nvoid main(){\n#vertex_pos_hook\n\tgl_Position = vec4(flexPos, 1);\n}\n'
	)
	await write(
		'shaders_test/assets/effects/shaders/mcsa130.frag',
		'#version 430\n#include module/light.frag\nlayout(location=0) out vec4 frag;\nuniform vec4 diffuse;\nvoid main(){\n#uniform_hook\n#texture_hook\n#pre_skin_hook\n#color_hook\n#exit_hook\n\tfrag = diffuse;\n}\n'
	)
	await write(
		'shaders_test/assets/effects/shaders/postprocess.frag',
		'#version 420\nlayout(binding=1) uniform sampler2D t;\nlayout(location=0) out vec4 frag;\nvoid main(){frag = texture(t, vec2(0));}\n'
	)
	await write(
		'shaders_test/assets/effects/shaders/module/sun_shadow.vert',
		'uniform mat4 shadowMatrix;\n'
	)
	await write(
		'shaders_test/assets/effects/shaders/module/light.frag',
		'vec3 diffuseLight;\n'
	)
	await write(
		'shaders_test/assets/effects/shaders/mcsahook/overheat_color.fsh',
		'\tdiffuse *= overheatAmount;\n'
	)
	await write(
		'shaders_test/assets/effects/shaders/mcsahook/overheat_uniforms.fsh',
		'\tuniform float overheatAmount;\n'
	)
	await write(
		'shaders_test/assets/effects/shaders/mcsahook/phantom.fsh',
		'\tdiffuse.a *= 0.5;\n'
	)
	await write(
		'shaders_test/assets/effects/shaders/mcsahook/unclaimed.fsh',
		'\tdiffuse.r *= 0.25;\n'
	)
	await write(
		'materials_test/assets/effects/models/black_armor.mcmtl',
		'mtlType Weapon\nnewmtl armor\nversion 2\nlighting model pbr\ndiffuse map armor:models/black/black_diff.dds\nskin mask hook dmap_alpha_as_skin_mask\n'
	)
	await write(
		'configs_test/assets/weapons/items/lmg/20179_item.json',
		JSON.stringify([
			{
				type: 'weapon',
				item_id: 20179,
				unlocalized_name: 'wpn.6p62',
				model_name: '6p62/6p62.mcsa',
				material_lib: '6p62/6p62.mcmtl',
				animated: true,
			},
		])
	)
	index = await buildSourceIndex(roots())
})

afterAll(async () => {
	await rm(join(root, '..'), { recursive: true, force: true })
})

test('hook registry maps filenames to inseters and claims stem matches, flagging unclaimed', async () => {
	const registry = await buildHookRegistry(index)
	expect(registry.mappings.get('overheat')?.provenance).toBe('filename-match')
	expect(
		registry.mappings
			.get('overheat')
			?.inserters.map((inserter) => inserter.path)
			.sort()
	).toEqual([
		'assets/effects/shaders/mcsahook/overheat_color.fsh',
		'assets/effects/shaders/mcsahook/overheat_uniforms.fsh',
	])
	expect(registry.mappings.get('phantom')?.inserters[0].hints.sort()).toEqual(
		['color_hook', 'texture_hook']
	)
	expect(
		registry.mappings
			.get('overheat')
			?.inserters.flatMap((inserter) => inserter.hints)
	).toEqual(['color_hook', 'uniform_hook'])
	expect(
		registry.diagnostics.some(
			(entry) =>
				entry.code === 'hooks.mapping-file-missing' &&
				entry.message.includes('dmap_alpha_as_skin_mask')
		)
	).toBe(true)
	expect(registry.unmatchedFiles).toEqual([
		'assets/effects/shaders/mcsahook/unclaimed.fsh',
	])
	const resolved = await resolveHookInserts(
		registry,
		['overheat', 'phantom', 'collimator', 'extra_nonexistent'],
		index
	)
	const names = new Set(resolved.inserts.map((insert) => insert.name))
	expect(names.has('overheat')).toBe(true)
	expect(names.has('phantom')).toBe(true)
	expect(names.has('collimator')).toBe(false)
	expect(
		resolved.diagnostics.some(
			(entry) =>
				entry.code === 'hooks.unknown-hook' &&
				entry.message.includes('extra_nonexistent')
		)
	).toBe(true)
})

test('composeShader expands includes, engine stubs and hook point insertions', async () => {
	const registry = await buildHookRegistry(index)
	const resolved = await resolveHookInserts(registry, ['overheat'], index)
	const composed = await composeShader(
		index,
		'assets/effects/shaders/mcsa130.frag',
		{
			defines: [],
			unrollValues: {},
			hookInserts: resolved.inserts,
			stubs: [
				{
					point: 'uniform_definitions',
					lines: ['uniform mat4 modelMatrix;'],
					note: 'engine-injected uniforms declared for spike only',
				},
			],
			injectVersion: null,
			prologue: [],
		}
	)
	const text = composed.lines.join('\n')
	expect(text).not.toContain('#version 430^')
	expect(text.startsWith('#version 430')).toBe(true)
	expect(text).toContain('vec3 diffuseLight;')
	expect(text).toContain('overheatAmount')
	expect(text).not.toContain('#include')
	expect(composed.emptyHookPoints.sort()).toEqual(
		[
			'exit_hook@assets/effects/shaders/mcsa130.frag:10',
			'pre_skin_hook@assets/effects/shaders/mcsa130.frag:8',
			'texture_hook@assets/effects/shaders/mcsa130.frag:7',
		].sort()
	)
	expect(
		composed.origins.some((origin) =>
			origin.startsWith('assets/effects/shaders/module/light.frag')
		)
	).toBe(true)
	expect(
		composed.diagnostics.some(
			(entry) => entry.code === 'shader.include-cycle'
		)
	).toBe(false)
})

test('composeShader unrolls #unroll_start loops with substituted iteration indexes', async () => {
	await write(
		'shaders_test/assets/effects/shaders/unroll_test.frag',
		'#version 430\n#define NUM_MAPS 2\nvec4 sum;\n#unroll_start: i,0,NUM_MAPS\n\tsum += maps[i];\n#unroll_end\nvoid main(){}\n'
	)
	const unrollIndex = await buildSourceIndex(roots())
	const composed = await composeShader(
		unrollIndex,
		'assets/effects/shaders/unroll_test.frag',
		{
			defines: [],
			unrollValues: { NUM_MAPS: 2 },
			hookInserts: [],
			stubs: [],
			injectVersion: null,
			prologue: [],
		}
	)
	const text = composed.lines.join('\n')
	expect(text).toContain('maps[0];')
	expect(text).toContain('maps[1];')
	expect(text).not.toContain('maps[i];')
	expect(text).not.toContain('#unroll')
	expect(composed.origins.some((origin) => origin.endsWith('#1'))).toBe(true)
})

test('planSpikePrograms composes nominal sources and flags missing virtual sources', async () => {
	const plan = await planSpikePrograms(index, ['overheat'])
	expect(plan.programs.map((program) => program.name)).toEqual([
		'mcsa130-pbr-skinned-lit-full',
		'mcsa130-base-specular',
		'mcsa130-glass',
		'mcsa130-unlit-emission',
		'world-boxes-forward',
		'sun-shadow-mcsa130',
		'postprocess',
	])
	const nominal = plan.programs.filter((program) =>
		program.name.startsWith('mcsa130')
	)
	for (const program of nominal) {
		expect(program.composedVertex?.lines.length).toBeGreaterThan(0)
		expect(program.composedFragment?.lines.length).toBeGreaterThan(0)
		expect(program.composedVertex?.lines.join('\n')).toContain(
			'modelMatrix'
		)
	}
	const world = plan.programs.find(
		(program) => program.name === 'world-boxes-forward'
	)
	expect(
		world?.diagnostics.some(
			(entry) =>
				entry.code === 'spike.vertex-source-missing' &&
				entry.message.includes('blocks.vert')
		)
	).toBe(true)
	const manifest = spikeManifest(plan)
	expect(manifest.schema).toBe('renderer-spike.1')
	expect(
		manifest.programs.find((program) => program.name === 'postprocess')
			?.fragment
	).toBe('postprocess.frag')
	expect(
		plan.diagnostics.some(
			(entry) =>
				entry.code === 'hooks.mapping-file-missing' &&
				(entry.message.includes('overheat') ||
					entry.message.includes('phantom'))
		)
	).toBe(false)
})

test('planSpikePrograms overlay merges engine stub defines with material-driven defines', async () => {
	const plan = await planSpikePrograms(index, [], {
		'mcsa130-pbr-skinned-lit-full': {
			defines: [
				'LIGHTING_MODEL_PBR',
				'DIFFUSE_MAPPING',
				'NORMAL_MAPPING',
				'SPECULAR_MAPPING',
				'GLOSS_MAPPING',
				'SPECULAR_LIGHTING',
				'NUM_MAPS=4',
			],
			unrollValues: { NUM_MAPS: 4 },
			note: 'material-driven program built from MCMTL directive states in bullets',
		},
	})
	const overridden = plan.programs.find(
		(program) => program.name === 'mcsa130-pbr-skinned-lit-full'
	)
	expect(overridden?.spec.defines).toEqual([
		'NUM_BONES=96',
		'ACTIVE_BLENDSHAPE_COUNT=8',
		'LIGHTING_MODEL_PBR',
		'DIFFUSE_MAPPING',
		'NORMAL_MAPPING',
		'SPECULAR_MAPPING',
		'GLOSS_MAPPING',
		'SPECULAR_LIGHTING',
		'NUM_MAPS=4',
	])
	expect(overridden?.spec.defines).not.toContain('TEXTURE_AO')
	expect(overridden?.spec.defines).not.toContain('VERTEX_COLORS')
	expect(overridden?.spec.defines).not.toContain('EMISSION_MAPPING')
	expect(overridden?.spec.unrollValues).toEqual({ NUM_MAPS: 4 })
	expect(spikeManifest(plan).notes).toContain(
		'mcsa130-pbr-skinned-lit-full: material-driven program built from MCMTL directive states in bullets'
	)
	const untouched = plan.programs.find(
		(program) => program.name === 'mcsa130-glass'
	)
	expect(untouched?.spec.defines).toEqual([
		'LIGHTING_MODEL_GLASS',
		'DIFFUSE_MAPPING',
		'ALPHA_TRANSPARENCY',
		'ALPHA_BLENDING',
		'NUM_BONES=96',
		'ACTIVE_BLENDSHAPE_COUNT=8',
		'NUM_MAPS=2',
	])
})
