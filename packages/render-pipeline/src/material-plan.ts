import type {
	DiagnosticsEntry,
	MaterialIr,
	MaterialMapPlan,
	MaterialProgramPlan,
	MaterialUniformPlan,
	McmtlMapSlot,
	UnsupportedMark,
} from '@bscp/render-contracts'
import { type ResolveRefOptions, resolveRef } from './refs'
import type { SourceIndex } from './source-set'

const LIGHTING_MODEL_DEFINES: Record<string, string> = {
	base: 'LIGHTING_MODEL_BASE',
	pbr: 'LIGHTING_MODEL_PBR',
	glass: 'LIGHTING_MODEL_GLASS',
	unlit: 'LIGHTING_MODEL_UNLIT',
}

const MAP_DEFINES: { slot: McmtlMapSlot; define: string; uniform: string }[] = [
	{ slot: 'diffuse', define: 'DIFFUSE_MAPPING', uniform: 'diffuseMap' },
	{ slot: 'emission', define: 'EMISSION_MAPPING', uniform: 'emissionMap' },
	{ slot: 'normal', define: 'NORMAL_MAPPING', uniform: 'normalMap' },
	{ slot: 'specular', define: 'SPECULAR_MAPPING', uniform: 'specularMap' },
	{ slot: 'gloss', define: 'GLOSS_MAPPING', uniform: 'glossMap' },
	{ slot: 'ao', define: 'TEXTURE_AO', uniform: 'g_aoMap' },
	{ slot: 'custom', define: 'HAS_CUSTOM_MAP', uniform: 'customMap' },
]

const UNIFORM_MAPPINGS: {
	key: string
	name: string
	kinds: ('colors' | 'scalars')[]
}[] = [
	{ key: 'diffuse color', name: 'diffuseColor', kinds: ['colors'] },
	{ key: 'emission color', name: 'emissionColor', kinds: ['colors'] },
	{ key: 'heat emission color', name: 'emissionColor', kinds: ['colors'] },
	{ key: 'specular color', name: 'specularColor', kinds: ['colors'] },
	{
		key: 'ambient color',
		name: 'ambientColor',
		kinds: ['colors'],
	},
	{
		key: 'alpha factor',
		name: 'alphaFactor',
		kinds: ['scalars'],
	},
	{
		key: 'burn factor',
		name: 'burnFactor',
		kinds: ['scalars'],
	},
	{
		key: 'specular exponent',
		name: 'specularExponent',
		kinds: ['scalars'],
	},
	{
		key: 'fresnel scale',
		name: 'fresnelScale',
		kinds: ['scalars'],
	},
	{
		key: 'fresnel bias',
		name: 'fresnelBias',
		kinds: ['scalars'],
	},
	{
		key: 'fresnel power',
		name: 'fresnelPower',
		kinds: ['scalars'],
	},
	{
		key: 'reflection factor',
		name: 'reflectionFactor',
		kinds: ['scalars'],
	},
	{
		key: 'reflection gloss',
		name: 'reflectionGloss',
		kinds: ['scalars'],
	},
]

export interface MaterialPlanOptions extends ResolveRefOptions {}

export interface MaterialPlanResult {
	programs: MaterialProgramPlan[]
	textures: {
		material: string
		slot: McmtlMapSlot
		ref: string
		path: string | null
		status: string
		reason: string
	}[]
	diagnostics: DiagnosticsEntry[]
}

export async function planMaterialPrograms(
	materials: MaterialIr[],
	index: SourceIndex | null,
	options: MaterialPlanOptions = {}
): Promise<MaterialPlanResult> {
	const diagnostics: DiagnosticsEntry[] = []
	const programs: MaterialProgramPlan[] = []
	const textures: MaterialPlanResult['textures'] = []
	for (const material of materials)
		programs.push(
			await planMaterialProgram(material, index, options, {
				diagnostics,
				textures,
			})
		)
	return { programs, textures, diagnostics }
}

export async function planMaterialProgram(
	material: MaterialIr,
	index: SourceIndex | null,
	options: MaterialPlanOptions = {},
	run?: {
		diagnostics: DiagnosticsEntry[]
		textures: MaterialPlanResult['textures']
	}
): Promise<MaterialProgramPlan> {
	const diagnostics = run ? run.diagnostics : []
	const textures = run ? run.textures : []
	const unsupported: UnsupportedMark[] = []
	const unverifiable: string[] = []
	const lighting = material.lightingModel
	if (!lighting || lighting.normalized === 'unknown')
		unsupported.push({
			reason: 'unknown-lighting-model',
			context: `${material.name}: lighting model ${lighting?.raw ?? '<absent>'} has no known semantics`,
			detail: 'archive defines LIGHTING_MODEL_BASE/PBR/GLASS/UNLIT only',
		})
	const hooks = material.hooks
	for (const hook of hooks)
		if (!hook.observed)
			unsupported.push({
				reason: 'unresolved-hook-mapping',
				context: `${material.name}: hook ${hook.kind}:${hook.name}`,
				detail: 'hook is not in the observed hooks list backed by archived hook files',
			})
	const bound: McmtlMapSlot[] = []
	for (const [slot, values] of Object.entries(material.maps)) {
		const ref = values.find(
			(value) => value.kind === 'ref' || value.kind === 'path'
		)
		if (!ref) continue
		bound.push(slot as McmtlMapSlot)
		if (index) {
			const refText = `${ref.refNamespace ?? ''}${ref.refNamespace ? ':' : ''}${ref.refRemainder ?? ref.text ?? ''}`
			const resolved = resolveRef(index, '', refText, options)
			if (resolved.status === 'resolved')
				textures.push({
					material: material.name,
					slot: slot as McmtlMapSlot,
					ref: refText,
					path: resolved.paths[0] ?? null,
					status: resolved.status,
					reason: resolved.reason,
				})
			else {
				textures.push({
					material: material.name,
					slot: slot as McmtlMapSlot,
					ref: refText,
					path: null,
					status: resolved.status,
					reason: resolved.reason,
				})
				unsupported.push({
					reason: 'unresolved-map-ref',
					context: `${material.name}: ${slot} map ${refText}`,
					detail: `resolution ${resolved.status}: ${resolved.reason}`,
				})
			}
		}
	}
	const defines: string[] = []
	if (lighting && lighting.normalized !== 'unknown') {
		const define = LIGHTING_MODEL_DEFINES[lighting.normalized]
		if (define) defines.push(define)
	}
	for (const mapping of MAP_DEFINES)
		if (bound.includes(mapping.slot)) defines.push(mapping.define)
	const alphaTransparency = material.renderState.alphaTransparency ?? false
	const alphaBlending = material.renderState.alphaBlending ?? false
	if (alphaTransparency) defines.push('ALPHA_TRANSPARENCY')
	if (alphaBlending) defines.push('ALPHA_BLENDING')
	if (material.renderState.lightmap3d) defines.push('LIGHTMAP_3D')
	if (material.flags['vertex colors']) defines.push('VERTEX_COLORS')
	const specularDriven =
		lighting.normalized === 'base' || bound.includes('specular')
	if (specularDriven) defines.push('SPECULAR_LIGHTING')
	const numMaps = bound.length
	const maps: MaterialMapPlan[] = []
	const unrollValues: { [name: string]: number } = { NUM_MAPS: numMaps }
	if (numMaps > 0) defines.push(`NUM_MAPS=${numMaps}`)
	for (let i = 0; i < bound.length; i++) {
		const slot = bound[i] ?? ''
		const entry = MAP_DEFINES.find((candidate) => candidate.slot === slot)
		let channel: number | null = null
		let channelProvenance: string | null = null
		if (slot === 'gloss' && material.flags['alpha as gloss'] === true) {
			channel = 3
			channelProvenance =
				'alpha as gloss: single-value flag maps the sampling channel onto alpha'
		}
		if (
			slot === 'specular' &&
			material.flags['alpha as specular'] === true
		) {
			channel = 3
			channelProvenance =
				'alpha as specular: single-value flag maps the sampling channel onto alpha'
		}
		maps.push({
			slot,
			textureIndex: i,
			uniform: entry?.uniform ?? null,
			channel,
			channelProvenance,
		})
	}
	const uniformValues: MaterialUniformPlan[] = []
	for (const spec of UNIFORM_MAPPINGS) {
		const values = spec.kinds
			.flatMap((kind) =>
				kind === 'colors'
					? material.colors[spec.key]
					: material.scalars[spec.key]
			)
			.filter((value): value is number => typeof value === 'number')
		if (values.length === 0) continue
		uniformValues.push({ name: spec.name, values, key: spec.key })
	}
	if (material.flags['alpha as gloss'] !== undefined)
		unverifiable.push(
			'alpha as gloss: archived mcsa130 samples gloss as pixelColors[glossMap][glossChannel]; the engine-owned default channel value for materials without this flag is not stored in the sources'
		)
	if (material.flags['alpha as specular'] !== undefined)
		unverifiable.push(
			'alpha as specular: the nonzero-channel mapping to specularChannel is engine-owned; only channel 3 from explicit single-value flags is derivation-backed'
		)
	if (lighting.normalized === 'unknown')
		unverifiable.push(
			'no defines emitted for an unknown lighting model; the shader body has no fallback branch'
		)
	const status: MaterialProgramPlan['status'] =
		unsupported.length > 0 ? 'unsupported' : 'planned'
	const plan: MaterialProgramPlan = {
		material: material.name,
		lightingModel: lighting?.normalized ?? 'unknown',
		defines,
		unrollValues,
		numMaps,
		maps,
		uniformValues,
		renderState: material.renderState,
		hooks: hooks.map((hook) => hook.name),
		unverifiable,
		unsupported,
		status,
		diagnostics,
	}
	if (status === 'unsupported')
		diagnostics.push({
			severity: 'warning',
			code: 'material.unsupported',
			message: `${material.name}: ${unsupported.map((mark) => mark.context).join('; ')}`,
			source: 'material-plan',
		})
	return plan
}

export function planSpikeProgramFromMaterial(program: MaterialProgramPlan): {
	name: string
	defines: string[]
	unrollValues: { [name: string]: number }
	note: string
} {
	return {
		name: `${program.material.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${program.lightingModel}`,
		defines: program.defines,
		unrollValues: program.unrollValues,
		note: `material-driven program built from MCMTL directive states in ${program.material}`,
	}
}
