import type {
	BundleSource,
	CatalogDrawRecord,
	DiagnosticsEntry,
} from '@bscp/render-contracts'
import {
	buildHookRegistry,
	type HookRegistry,
	resolveHookInserts,
} from './hooks'
import {
	type ComposedShader,
	type ComposeShaderOptions,
	composeShader,
	type HookInsert,
	type StubDefinition,
} from './shaders'
import type { SourceIndex } from './source-set'

export interface SpikeProgramSpec {
	name: string
	vertex: string | null
	fragment: string | null
	defines: string[]
	unrollValues: { [name: string]: number }
	note: string
	hooks?: string[]
	prologue?: { vertex?: string[]; fragment?: string[] }
}

export interface SpikeProgramPlan {
	name: string
	vertexPath: string | null
	fragmentPath: string | null
	composedVertex: ComposedShader | null
	composedFragment: ComposedShader | null
	spec: SpikeProgramSpec
	diagnostics: DiagnosticsEntry[]
	appliedStubs: { point: string; note: string }[]
}

export interface SpikePlan {
	programs: SpikeProgramPlan[]
	hookRegistry: HookRegistry
	sources: BundleSource[]
	diagnostics: DiagnosticsEntry[]
	draws?: CatalogDrawRecord[]
}

export const SPIKE_PROGRAMS: SpikeProgramSpec[] = [
	{
		name: 'mcsa130-pbr-skinned-lit-full',
		vertex: 'assets/effects/shaders/mcsa130.vert',
		fragment: 'assets/effects/shaders/mcsa130.frag',
		defines: [
			'NORMAL_MAPPING',
			'VERTEX_COLORS',
			'LIGHTING_MODEL_PBR',
			'DIFFUSE_MAPPING',
			'EMISSION_MAPPING',
			'SPECULAR_MAPPING',
			'GLOSS_MAPPING',
			'SPECULAR_LIGHTING',
			'TEXTURE_AO',
			'ALPHA_TRANSPARENCY',
			'ALPHA_BLENDING',
			'NUM_BONES=96',
			'ACTIVE_BLENDSHAPE_COUNT=8',
			'NUM_MAPS=4',
		],
		unrollValues: { NUM_MAPS: 4 },
		note: 'representative catalog material: PBR, skinned, tangent frame, gloss channel select, alpha blending, emission, texture AO',
	},
	{
		name: 'mcsa130-base-specular',
		vertex: 'assets/effects/shaders/mcsa130.vert',
		fragment: 'assets/effects/shaders/mcsa130.frag',
		defines: [
			'LIGHTING_MODEL_BASE',
			'DIFFUSE_MAPPING',
			'SPECULAR_MAPPING',
			'SPECULAR_LIGHTING',
			'ALPHA_TRANSPARENCY',
			'NUM_BONES=96',
			'ACTIVE_BLENDSHAPE_COUNT=8',
			'NUM_MAPS=3',
		],
		unrollValues: { NUM_MAPS: 3 },
		note: 'base lighting model with classic specular',
	},
	{
		name: 'mcsa130-glass',
		vertex: 'assets/effects/shaders/mcsa130.vert',
		fragment: 'assets/effects/shaders/mcsa130.frag',
		defines: [
			'LIGHTING_MODEL_GLASS',
			'DIFFUSE_MAPPING',
			'ALPHA_TRANSPARENCY',
			'ALPHA_BLENDING',
			'NUM_BONES=96',
			'ACTIVE_BLENDSHAPE_COUNT=8',
			'NUM_MAPS=2',
		],
		unrollValues: { NUM_MAPS: 2 },
		note: 'glass lens lighting path with envmap/fresnel uniforms from the archived shader body',
	},
	{
		name: 'mcsa130-unlit-emission',
		vertex: 'assets/effects/shaders/mcsa130.vert',
		fragment: 'assets/effects/shaders/mcsa130.frag',
		defines: [
			'LIGHTING_MODEL_UNLIT',
			'DIFFUSE_MAPPING',
			'EMISSION_MAPPING',
			'ALPHA_TRANSPARENCY',
			'NUM_BONES=96',
			'ACTIVE_BLENDSHAPE_COUNT=8',
			'NUM_MAPS=2',
		],
		unrollValues: { NUM_MAPS: 2 },
		note: 'unlit/emission-only variant',
	},
	{
		name: 'world-boxes-forward',
		vertex: 'assets/effects/shaders/blocks.vert',
		fragment: 'assets/effects/shaders/blocks.frag',
		defines: [
			'QUANTIZATION_POS_SCALE=192',
			'QUANTIZATION_SIDE_SCALE=192',
			'ARRAY_SIZE=16',
			'HR_ARRAY_SIZE=8',
		],
		unrollValues: {},
		note: 'world stage variant (blocks); QUANTIZATION_* are engine-injected macro values, approximations pending corpus confirmation',
	},
	{
		name: 'sun-shadow-mcsa130',
		vertex: 'assets/effects/shaders/sun_shadow/mcsa130.vert',
		fragment: 'assets/effects/shaders/sun_shadow/mcsa130.frag',
		defines: [
			'NORMAL_MAPPING',
			'DIFFUSE_MAPPING',
			'NUM_BONES=96',
			'ACTIVE_BLENDSHAPE_COUNT=8',
			'NUM_MAPS=3',
		],
		unrollValues: { NUM_MAPS: 3 },
		note: 'sun shadow variant of mcsa130',
	},
	{
		name: 'postprocess',
		vertex: null,
		fragment: 'assets/effects/shaders/postprocess.frag',
		defines: [],
		unrollValues: {},
		note: 'postprocessing stage body; engine sidecar declares the varying aTexCordsIO that the fragment consumes',
		prologue: {
			fragment: [
				'in vec2 aTexCordsIO;',
				'uniform vec2 globalTexCordsSelection;',
			],
		},
	},
]

const ENGINE_UNIFORM_DEFINITIONS_STUB: StubDefinition = {
	point: 'uniform_definitions',
	lines: [
		'uniform mat4 modelMatrix;',
		'uniform vec4 quantizationScale;',
		'uniform vec4 lightmapColorAndSkylight;',
	],
	note: 'uniform block: engine injects modelMatrix/quantizationScale (and light modeldata in some states) outside archived sources; declarations provided only to make compile-like verification possible',
}

export interface SpikeProgramOverride {
	defines: string[]
	unrollValues: { [name: string]: number }
	note: string
}

export async function planSpikePrograms(
	index: SourceIndex,
	hookNames: string[] = [],
	overrides: { [programName: string]: SpikeProgramOverride } = {}
): Promise<SpikePlan> {
	const diagnostics: DiagnosticsEntry[] = []
	const hookRegistry = await buildHookRegistry(index)
	diagnostics.push(...hookRegistry.diagnostics)
	let hookInserts: HookInsert[] = []
	if (hookNames.length > 0) {
		const resolved = await resolveHookInserts(
			hookRegistry,
			hookNames,
			index
		)
		hookInserts = resolved.inserts
		diagnostics.push(...resolved.diagnostics)
	}
	const sources: BundleSource[] = []
	const programs: SpikeProgramPlan[] = []
	for (const prototype of SPIKE_PROGRAMS) {
		const override = overrides[prototype.name]
		let spec: SpikeProgramSpec
		if (override) {
			const emulatedStubNames = new Set([
				'NUM_BONES',
				'ACTIVE_BLENDSHAPE_COUNT',
			])
			const engineDefines = prototype.defines.filter((define) =>
				emulatedStubNames.has(define.split('=')[0])
			)
			const merged: string[] = []
			for (const define of [...engineDefines, ...override.defines]) {
				if (!merged.includes(define)) merged.push(define)
			}
			spec = {
				...prototype,
				defines: merged,
				unrollValues: {
					...prototype.unrollValues,
					...override.unrollValues,
				},
				note: override.note,
			}
		} else {
			spec = prototype
		}
		const planDiagnostics: DiagnosticsEntry[] = []
		const stubs = spec.vertex ? [ENGINE_UNIFORM_DEFINITIONS_STUB] : []
		const vertexPrologue: string[] = spec.prologue?.vertex ?? []
		const fragmentPrologue: string[] = spec.prologue?.fragment ?? []
		let composedVertex: ComposedShader | null = null
		let composedFragment: ComposedShader | null = null
		if (spec.vertex) {
			if (index.caseInsensitive.has(spec.vertex.toLowerCase())) {
				composedVertex = await composeShader(index, spec.vertex, {
					...composeOptions(spec, hookInserts, stubs),
					prologue: vertexPrologue,
				})
				sources.push({
					kind: 'glsl',
					virtualPath: `${spec.name}.vert`,
					sha1: '',
					size: composedVertex.sizeBytes,
				})
				planDiagnostics.push(...composedVertex.diagnostics)
			} else
				planDiagnostics.push({
					severity: 'warning',
					code: 'spike.vertex-source-missing',
					message: `${spec.vertex} is not indexed; program skipped`,
					source: spec.name,
				})
		}
		if (spec.fragment) {
			if (index.caseInsensitive.has(spec.fragment.toLowerCase())) {
				composedFragment = await composeShader(index, spec.fragment, {
					...composeOptions(spec, hookInserts, stubs),
					prologue: fragmentPrologue,
				})
				sources.push({
					kind: 'glsl',
					virtualPath: `${spec.name}.frag`,
					sha1: '',
					size: composedFragment.sizeBytes,
				})
				planDiagnostics.push(...composedFragment.diagnostics)
			} else
				planDiagnostics.push({
					severity: 'warning',
					code: 'spike.fragment-source-missing',
					message: `${spec.fragment} is not indexed; program skipped`,
					source: spec.name,
				})
		}
		programs.push({
			name: spec.name,
			vertexPath: composedVertex ? spec.vertex : null,
			fragmentPath: composedFragment ? spec.fragment : null,
			composedVertex,
			composedFragment,
			spec,
			diagnostics: planDiagnostics,
			appliedStubs: stubs.map((stub) => ({
				point: stub.point,
				note: stub.note,
			})),
		})
	}
	return { programs, hookRegistry, sources, diagnostics }
}

function composeOptions(
	spec: SpikeProgramSpec,
	hookInserts: HookInsert[],
	stubs: StubDefinition[]
): ComposeShaderOptions {
	return {
		defines: spec.defines,
		unrollValues: spec.unrollValues,
		hookInserts,
		stubs,
		injectVersion: '#version 430 core',
		prologue: [],
	}
}

export interface SpikeManifest {
	schema: 'renderer-spike.1'
	programs: {
		name: string
		vertex?: string
		fragment?: string
		defines: string[]
	}[]
	capture: { width: number; height: number; readback: 'rgba8' }
	draws?: CatalogDrawRecord[]
	notes: string[]
}

export function spikeManifest(plan: SpikePlan): SpikeManifest {
	const programs = plan.programs.map((program) => ({
		name: program.name,
		...(program.composedVertex ? { vertex: `${program.name}.vert` } : {}),
		...(program.composedFragment
			? { fragment: `${program.name}.frag` }
			: {}),
		defines: program.spec.defines,
	}))
	return {
		schema: 'renderer-spike.1',
		programs,
		capture: { width: 1024, height: 1024, readback: 'rgba8' },
		...(plan.draws ? { draws: plan.draws } : {}),
		notes: [
			...new Set(
				plan.programs.flatMap((program) =>
					program.appliedStubs.map(
						(stub) => `${program.name}: ${stub.point}: ${stub.note}`
					)
				)
			),
			...new Set(
				plan.programs
					.filter((program) => program.spec.note)
					.map((program) => `${program.name}: ${program.spec.note}`)
			),
		],
	}
}
