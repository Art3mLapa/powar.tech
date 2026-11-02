import type {
	CatalogItemIr,
	DiagnosticsEntry,
	ManagedRef,
	McmtlIr,
	McmtlValue,
} from '@bscp/render-contracts'
import { parseStrictJsonResource } from './json-strict'
import { parseMcmtlIr } from './mcmtl'
import { normalizeRemainder } from './mcmtl-values'
import { parseRef, type ResolveRefOptions, resolveRef } from './refs'
import { readEntry, type SourceIndex } from './source-set'

export const RENDER_REF_KEYS = [
	'model_name',
	'model_name_lod',
	'material_lib',
	'material_lib_lod',
	'sleeve_model',
	'anim',
	'fp_anim',
	'fp_anim_cast',
	'fp_weapon_reload_cast',
	'fp_weapon_shoot_cast',
	'muzzle_flash_fx_fp',
	'muzzle_flash_fx_tp',
	'item_texture',
] as const

export const RENDER_FIELD_KEYS = [
	...RENDER_REF_KEYS,
	'animated',
	'mirrored',
	'render_equipped',
	'do_bake_icon',
	'bake_center_x',
	'bake_center_y',
	'center_x',
	'center_y',
	'center_z',
	'offset_x',
	'offset_y',
	'offset_z',
	'default_X_rot',
	'default_Y_rot',
	'default_Z_rot',
	'default_scale',
	'max_scale',
	'min_scale',
	'item_id',
	'category',
	'pda_category',
	'unlocalized_name',
] as const

export type ManagedRefKind =
	| 'model'
	| 'material'
	| 'animation'
	| 'effect'
	| 'texture'
	| 'unknown'

const REF_KIND_SUFFIXES: { kind: ManagedRefKind; suffix: string }[] = [
	{ kind: 'material', suffix: '.mcmtl' },
	{ kind: 'model', suffix: '.mcsb' },
	{ kind: 'model', suffix: '.mcsa' },
	{ kind: 'animation', suffix: '.mcvd' },
	{ kind: 'animation', suffix: '.sac' },
	{ kind: 'animation', suffix: '.anm.json' },
	{ kind: 'effect', suffix: '.efkefc' },
	{ kind: 'texture', suffix: '.dds' },
	{ kind: 'texture', suffix: '.ol' },
	{ kind: 'texture', suffix: '.mic' },
]

export interface DependencyEdge {
	from: string
	key: string
	kind: ManagedRefKind
	ref: ManagedRef
	targetPath: string | null
}

export interface DependencyGraph {
	edges: DependencyEdge[]
	reverse: Map<string, DependencyEdge[]>
	itemConfigs: string[]
	materialLibraries: string[]
	diagnostics: DiagnosticsEntry[]
}

export function referenceKind(remainder: string): ManagedRefKind {
	const lowered = remainder.toLowerCase()
	const hit = REF_KIND_SUFFIXES.find((entry) =>
		lowered.endsWith(entry.suffix)
	)
	if (hit) return hit.kind
	if (lowered.endsWith('.json')) return 'animation'
	return 'unknown'
}

export function scalarToValue(input: unknown): McmtlValue {
	if (typeof input === 'number') return { kind: 'number', number: input }
	if (typeof input === 'boolean') return { kind: 'boolean', boolean: input }
	if (typeof input === 'string') {
		const value = normalizeRemainder(input)
		return { kind: 'word', text: value }
	}
	return { kind: 'word', text: JSON.stringify(input) }
}

function managedRef(
	resolved: ReturnType<typeof resolveRef>,
	raw: string,
	context: string,
	key: string
): ManagedRef {
	const parsed = parseRef(raw)
	return {
		raw,
		namespace: parsed.namespace,
		remainder: parsed.remainder,
		context,
		status: resolved.status,
		...(resolved.paths.length === 1
			? { path: resolved.paths[0] }
			: resolved.paths.length > 1
				? { candidates: resolved.paths }
				: {}),
		...(resolved.reason ? { reason: resolved.reason } : {}),
		...(key ? { key } : {}),
	}
}

export interface CatalogBuildOptions extends ResolveRefOptions {}

const RENDER_FIELD_ALIASES: Record<string, string[]> = {
	model_name: ['model'],
}

function fieldValue(item: Record<string, unknown>, key: string): unknown {
	const direct = item[key]
	if (direct !== undefined) return direct
	for (const alias of RENDER_FIELD_ALIASES[key] ?? []) {
		const value = item[alias]
		if (value !== undefined) return value
	}
	return undefined
}

function inferredMaterialPath(
	index: SourceIndex,
	modelPath: string
): string | null {
	const stem = modelPath
		.replace(/\\/g, '/')
		.replace(/\.(?:mcsa|mcsb)$/i, '')
		.split('/')
		.at(-1)
	if (!stem) return null
	const suffix = `/${stem.toLowerCase()}.mcmtl`
	const matches = [...index.byPath.values()].filter(
		(entry) =>
			entry.root.kind === 'materials' &&
			entry.path.toLowerCase().endsWith(suffix)
	)
	if (matches.length !== 1) return null
	return matches[0]?.path ?? null
}

export async function readItemConfig(
	index: SourceIndex,
	path: string
): Promise<{
	data: Record<string, unknown>
	diagnostics: DiagnosticsEntry[]
} | null> {
	const entry = index.caseInsensitive.get(path.toLowerCase())?.[0]
	if (!entry) return null
	const raw = await readEntry(entry)
	const diagnostics: DiagnosticsEntry[] = []
	const parsed = parseStrictJsonResource(
		raw.toString('utf8'),
		path,
		diagnostics
	)
	const item = Array.isArray(parsed)
		? (parsed[0] as Record<string, unknown> | undefined)
		: undefined
	if (!item || typeof item !== 'object') return null
	return { data: item, diagnostics }
}

export async function buildCatalogItem(
	index: SourceIndex,
	configPath: string,
	options: CatalogBuildOptions = {}
): Promise<CatalogItemIr> {
	const diagnostics: DiagnosticsEntry[] = []
	const config = await readItemConfig(index, configPath)
	if (!config) {
		diagnostics.push({
			severity: 'error',
			code: 'config.missing-object',
			message: `${configPath}: expected root array with one render item object`,
			source: configPath,
		})
		return {
			profile: 'catalog',
			configPath,
			itemId: null,
			shape: 'invalid',
			renderFields: {},
			models: [],
			animations: [],
			effects: [],
			materials: [],
			diagnostics,
		}
	}
	diagnostics.push(...config.diagnostics)
	const item = config.data
	const renderFields: Record<string, McmtlValue> = {}
	for (const key of RENDER_FIELD_KEYS) {
		const value = fieldValue(item, key)
		if (value === undefined) continue
		renderFields[key] = scalarToValue(value)
	}
	const models: ManagedRef[] = []
	const animations: ManagedRef[] = []
	const effects: ManagedRef[] = []
	const materials: McmtlIr[] = []
	for (const key of RENDER_REF_KEYS) {
		const value = fieldValue(item, key)
		const raw = typeof value === 'string' ? value : null
		if (!raw) continue
		const parsed = parseRef(raw)
		const kind = referenceKind(parsed.remainder)
		const ref = managedRef(
			resolveRef(index, configPath, raw, options),
			raw,
			configPath,
			key
		)
		if (ref.status === 'unsafe') {
			diagnostics.push({
				severity: 'error',
				code: 'config.unsafe-ref',
				message: `${key}: ${raw}`,
				source: configPath,
			})
			continue
		}
		if (kind === 'material' && ref.path) {
			const entry = index.caseInsensitive.get(ref.path.toLowerCase())
			if (entry?.length === 1) {
				const data = await readEntry(entry[0])
				materials.push(
					parseMcmtlIr(data.toString('utf8'), ref.path, '')
				)
				continue
			}
			diagnostics.push({
				severity: 'warning',
				code: 'config.material-lib-entry',
				message: `${key}: material library uncovered for ${raw}`,
				source: configPath,
			})
			continue
		}
		if (kind === 'animation') animations.push(ref)
		else if (kind === 'effect') effects.push(ref)
		else models.push(ref)
	}
	if (!materials.length && fieldValue(item, 'material_lib') === undefined) {
		const model = models.find((entry) => entry.key === 'model_name')
		const inferredPath = model?.path
			? inferredMaterialPath(index, model.path)
			: null
		if (inferredPath) {
			const entry = index.caseInsensitive.get(
				inferredPath.toLowerCase()
			)?.[0]
			if (entry) {
				const data = await readEntry(entry)
				materials.push(
					parseMcmtlIr(data.toString('utf8'), entry.path, '')
				)
				diagnostics.push({
					severity: 'info',
					code: 'config.material-lib-inferred',
					message: `material library inferred from model ${model?.raw}: ${entry.path}`,
					source: configPath,
				})
			}
		}
	}
	return {
		profile: 'catalog',
		configPath,
		itemId: typeof item.item_id === 'number' ? item.item_id : null,
		shape: 'catalog-item',
		renderFields,
		models,
		animations,
		effects,
		materials,
		diagnostics,
	}
}

export interface GraphBuildOptions extends ResolveRefOptions {
	maxItems?: number
}

export async function buildDependencyGraph(
	index: SourceIndex,
	options: GraphBuildOptions = {}
): Promise<DependencyGraph> {
	const edges: DependencyEdge[] = []
	const diagnostics: DiagnosticsEntry[] = []
	const itemConfigs = [...index.byPath.values()]
		.filter(
			(entry) =>
				entry.root.kind === 'configs' &&
				/(^|\/)items\//.test(entry.path) &&
				entry.path.toLowerCase().endsWith('.json')
		)
		.map((entry) => entry.path)
	if (options.maxItems !== undefined)
		itemConfigs.length = Math.min(itemConfigs.length, options.maxItems)
	const materialLibraries = [...index.byPath.values()]
		.filter(
			(entry) =>
				entry.root.kind === 'materials' &&
				entry.path.toLowerCase().endsWith('.mcmtl')
		)
		.map((entry) => entry.path)
	for (const path of itemConfigs) {
		const entry = index.caseInsensitive.get(path.toLowerCase())?.[0]
		if (!entry) continue
		let data: unknown = null
		try {
			const raw = await readEntry(entry)
			data = parseStrictJsonResource(
				raw.toString('utf8'),
				path,
				diagnostics
			)
		} catch (error) {
			diagnostics.push({
				severity: 'error',
				code: 'graph.config-parse',
				message: `${error instanceof Error ? error.message : 'unreadable'}`,
				source: path,
			})
			continue
		}
		const item = Array.isArray(data)
			? (data[0] as Record<string, unknown> | undefined)
			: undefined
		if (!item || typeof item !== 'object') {
			diagnostics.push({
				severity: 'error',
				code: 'graph.config-shape',
				message: `expected root array with one object`,
				source: path,
			})
			continue
		}
		for (const key of RENDER_FIELD_KEYS) {
			const value = item[key]
			if (typeof value !== 'string') continue
			const ref = parseRef(value)
			if (ref.unsafe) {
				edges.push({
					from: path,
					key,
					kind: 'unknown',
					ref: managedRef(
						{
							status: 'unsafe',
							paths: [],
							reason: ref.unsafe,
							diagnostics: [],
						},
						value,
						path,
						key
					),
					targetPath: null,
				})
				continue
			}
			const kind = referenceKind(ref.remainder)
			if (kind === 'unknown') {
				diagnostics.push({
					severity: 'info',
					code: 'graph.unknown-ref-kind',
					message: `${key}: ${value} has no known render suffix; kept as unknown instead of guessing`,
					source: path,
				})
			}
			const resolved = resolveRef(index, path, value, options)
			edges.push({
				from: path,
				key,
				kind,
				ref: managedRef(resolved, value, path, key),
				targetPath:
					resolved.paths.length === 1 ? resolved.paths[0] : null,
			})
		}
	}
	const reverse = new Map<string, DependencyEdge[]>()
	for (const edge of edges) {
		if (!edge.targetPath) continue
		const list = reverse.get(edge.targetPath) ?? []
		list.push(edge)
		reverse.set(edge.targetPath, list)
	}
	return { edges, reverse, itemConfigs, materialLibraries, diagnostics }
}
