import { decodeModelStreams } from '@bscp/game-assets/mcsa'
import type {
	CatalogItemIr,
	DiagnosticsEntry,
	ManagedRef,
	MaterialProgramPlan,
} from '@bscp/render-contracts'
import { buildCatalogItem } from './catalog'
import type { MaterialPlanResult } from './material-plan'
import { planMaterialPrograms } from './material-plan'
import { parseMcmtlIr } from './mcmtl'
import { readEntry, type SourceIndex } from './source-set'

const TRANSFORM_KEYS = [
	'default_X_rot',
	'default_Y_rot',
	'default_Z_rot',
	'default_scale',
	'bake_center_x',
	'bake_center_y',
	'center_x',
	'center_y',
	'center_z',
	'offset_x',
	'offset_y',
	'offset_z',
] as const

const ANIMATION_KEYS = [
	'anim',
	'fp_anim',
	'fp_anim_cast',
	'fp_weapon_reload_cast',
	'fp_weapon_shoot_cast',
] as const

const NEUTRAL_TRANSFORM_DEFAULTS: Record<string, number> = {
	default_X_rot: 0,
	default_Y_rot: 0,
	default_Z_rot: 0,
	default_scale: 1,
	bake_center_x: 0,
	bake_center_y: 0,
	center_x: 0,
	center_y: 0,
	center_z: 0,
	offset_x: 0,
	offset_y: 0,
	offset_z: 0,
}

export interface CatalogModelPlan {
	key: string
	raw: string
	path: string
	version: number | null
	positionScale: number | null
	uvScale: number | null
	meshCount: number
	boneCount: number
	clipCount: number
	diagnostics: DiagnosticsEntry[]
}

export interface CatalogMeshBind {
	meshIndex: number
	mesh: string
	material: string
	program: MaterialProgramPlan | null
	vertices: number
	polygons: number
}

export interface CatalogDecodedMesh {
	name: string
	material: string
	vertices: number
	polygons: number
}

export interface CatalogTransformField {
	field: string
	value: number
	provenance: 'explicit' | 'neutral'
}

export interface CatalogScenePlan {
	profile: 'catalog'
	quality: 'structural' | 'unsupported'
	configPath: string
	itemId: number | null
	primary: CatalogModelPlan
	lod: CatalogModelPlan | null
	meshBinds: CatalogMeshBind[]
	programs: MaterialProgramPlan[]
	textures: MaterialPlanResult['textures']
	transform: CatalogTransformField[]
	animation: {
		configKeys: string[]
		resolved: string[]
		clipCount: number
		deferred: boolean
	}
	camera: { policy: 'neutral'; reason: string }
	output: { format: 'rgba8'; watermark: false }
	diagnostics: DiagnosticsEntry[]
}

function emptyModelPlan(ref: ManagedRef, key: string): CatalogModelPlan {
	return {
		key,
		raw: ref.raw,
		path: '',
		version: null,
		positionScale: null,
		uvScale: null,
		meshCount: 0,
		boneCount: 0,
		clipCount: 0,
		diagnostics: [],
	}
}

function unreadablePlan(
	ref: ManagedRef,
	key: string,
	code: string,
	message: string
): CatalogModelPlan {
	return {
		...emptyModelPlan(ref, key),
		path: ref.path ?? '',
		diagnostics: [
			{
				severity: 'error',
				code,
				message,
				source: ref.context,
			},
		],
	}
}

export interface ModelPlanOutcome {
	plan: CatalogModelPlan
	meshes: CatalogDecodedMesh[]
}

async function planCatalogModel(
	index: SourceIndex,
	ref: ManagedRef
): Promise<ModelPlanOutcome> {
	if (!ref.path)
		return {
			plan: unreadablePlan(
				ref,
				ref.key ?? 'model_name',
				'scene.model-unresolved',
				`${ref.key}: ${ref.raw} did not resolve (${ref.reason ?? 'no resolver reason'})`
			),
			meshes: [],
		}
	const entry = index.caseInsensitive.get(ref.path.toLowerCase())?.[0]
	if (!entry)
		return {
			plan: unreadablePlan(
				ref,
				ref.key ?? 'model_name',
				'scene.model-path-missing',
				`${ref.key}: resolved path ${ref.path} is not indexed`
			),
			meshes: [],
		}
	const plan = emptyModelPlan(ref, ref.key ?? 'model_name')
	plan.path = entry.path
	const data = await readEntry(entry)
	const decoded = decodeModelStreams(
		data,
		entry.path.toLowerCase().endsWith('.mcsb') ? '.mcsb' : '.mcsa'
	)
	return {
		plan: {
			...plan,
			version: decoded.version,
			positionScale: decoded.positionScale,
			uvScale: decoded.uvScale,
			meshCount: decoded.meshes.length,
			boneCount: decoded.skeleton?.length ?? 0,
			clipCount: decoded.clips.length,
		},
		meshes: decoded.meshes.map((mesh) => ({
			name: mesh.name,
			material: mesh.material,
			vertices: mesh.vertices,
			polygons: mesh.polygons,
		})),
	}
}

function transformPlanFromItem(item: CatalogItemIr): CatalogTransformField[] {
	return TRANSFORM_KEYS.map((field) => {
		const value = item.renderFields[field]
		if (
			value &&
			value.kind === 'number' &&
			typeof value.number === 'number'
		)
			return {
				field,
				value: value.number,
				provenance: 'explicit' as const,
			}
		return {
			field,
			value: NEUTRAL_TRANSFORM_DEFAULTS[field] ?? 0,
			provenance: 'neutral' as const,
		}
	})
}

export async function planCatalogScene(
	index: SourceIndex,
	configPath: string
): Promise<CatalogScenePlan> {
	const diagnostics: DiagnosticsEntry[] = []
	const item: CatalogItemIr = await buildCatalogItem(index, configPath)
	diagnostics.push(...item.diagnostics)
	const primaryRef =
		item.models.find((model) => model.key === 'model_name') ??
		item.models[0]
	const lodRef = item.models.find((model) => model.key === 'model_name_lod')
	let primaryOutcome: ModelPlanOutcome
	if (primaryRef) {
		primaryOutcome = await planCatalogModel(index, primaryRef)
	} else {
		primaryOutcome = {
			plan: {
				...emptyModelPlan({} as ManagedRef, 'model_name'),
				diagnostics: [
					{
						severity: 'error',
						code: 'scene.model-missing',
						message: `${configPath}: render fields declare no primary model`,
						source: configPath,
					},
				],
			},
			meshes: [],
		}
	}
	diagnostics.push(...primaryOutcome.plan.diagnostics)
	const lodOutcome = lodRef ? await planCatalogModel(index, lodRef) : null
	diagnostics.push(...(lodOutcome?.plan.diagnostics ?? []))
	const materialPlan: MaterialPlanResult = await planMaterialPrograms(
		item.materials.flatMap((library) => library.materials),
		index
	)
	diagnostics.push(...materialPlan.diagnostics)
	const programByName = new Map<string, MaterialProgramPlan>()
	for (const program of materialPlan.programs) {
		const name = program.material.toLowerCase()
		if (!programByName.has(name)) programByName.set(name, program)
	}
	let degraded = primaryOutcome.plan.diagnostics.some(
		(diag) => diag.severity === 'error'
	)
	const meshBinds: CatalogMeshBind[] = []
	for (const [meshIndex, mesh] of primaryOutcome.meshes.entries()) {
		const program = programByName.get(mesh.material.toLowerCase()) ?? null
		if (!program) {
			diagnostics.push({
				severity: 'warning',
				code: 'scene.mesh-material-unmatched',
				message: `mesh ${meshIndex} (${mesh.name}) declares material ${mesh.material} with no MCMTL entry`,
				source: primaryOutcome.plan.path,
			})
		}
		meshBinds.push({
			meshIndex,
			mesh: mesh.name,
			material: mesh.material,
			program,
			vertices: mesh.vertices,
			polygons: mesh.polygons,
		})
	}
	if (
		materialPlan.programs.some(
			(program) => program.status === 'unsupported'
		)
	)
		degraded = true
	const animationConfigKeys: string[] = []
	const animationResolved: string[] = []
	for (const ref of item.animations) {
		const key = ref.key ?? ''
		if (!ANIMATION_KEYS.includes(key as (typeof ANIMATION_KEYS)[number]))
			continue
		animationConfigKeys.push(key)
		if (ref.status === 'resolved' && ref.path) animationResolved.push(key)
	}
	return {
		profile: 'catalog',
		quality: degraded ? 'unsupported' : 'structural',
		configPath,
		itemId: item.itemId,
		primary: primaryOutcome.plan,
		lod: lodOutcome?.plan ?? null,
		meshBinds,
		programs: materialPlan.programs,
		textures: materialPlan.textures,
		transform: transformPlanFromItem(item),
		animation: {
			configKeys: animationConfigKeys,
			resolved: animationResolved,
			clipCount: primaryOutcome.plan.clipCount,
			deferred: true,
		},
		camera: {
			policy: 'neutral',
			reason: 'catalog camera pose convention not recovered from the corpus yet; neutral fixed framing until stage-0 references exist',
		},
		output: { format: 'rgba8', watermark: false },
		diagnostics,
	}
}

export async function sweepMaterials(
	index: SourceIndex,
	options: { limit?: number } = {}
): Promise<{
	files: number
	programsPlanned: number
	programsUnsupported: number
	reasons: { reason: string; count: number }[]
	limitApplied: boolean
}> {
	const libraries = [...index.byPath.values()]
		.filter(
			(entry) =>
				entry.root.kind === 'materials' &&
				entry.path.toLowerCase().endsWith('.mcmtl')
		)
		.sort((left, right) => left.path.localeCompare(right.path))
		.map((entry) => entry.path)
	const bounded =
		options.limit !== undefined
			? libraries.slice(0, options.limit)
			: libraries
	const reasonCounts = new Map<string, number>()
	let planned = 0
	let unsupported = 0
	for (const path of bounded) {
		const entry = index.caseInsensitive.get(path.toLowerCase())?.[0]
		if (!entry) continue
		const data = await readEntry(entry)
		const library = parseMcmtlIr(data.toString('utf8'), path, '')
		const result = await planMaterialPrograms(library.materials, index)
		for (const program of result.programs) {
			if (program.status === 'planned') planned++
			else unsupported++
			for (const mark of program.unsupported) {
				const code = mark.reason
				reasonCounts.set(code, (reasonCounts.get(code) ?? 0) + 1)
			}
		}
	}
	const reasons = [...reasonCounts.entries()]
		.map(([reason, count]) => ({ reason, count }))
		.sort(
			(left, right) =>
				right.count - left.count ||
				left.reason.localeCompare(right.reason)
		)
	return {
		files: bounded.length,
		programsPlanned: planned,
		programsUnsupported: unsupported,
		reasons,
		limitApplied:
			options.limit !== undefined && bounded.length < libraries.length,
	}
}
