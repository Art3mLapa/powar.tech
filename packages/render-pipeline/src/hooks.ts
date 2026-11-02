import type { DiagnosticsEntry } from '@bscp/render-contracts'
import type { HookInsert } from './shaders'
import { readEntry, type SourceIndex } from './source-set'

export type HookMappingProvenance =
	| 'filename-match'
	| 'engine-external'
	| 'unresolved'

export interface HookInserter {
	path: string
	hints: string[]
}

export interface HookMapping {
	name: string
	inserters: HookInserter[]
	provenance: HookMappingProvenance
	note: string
}

const MCSA_SHADERS = 'assets/effects/shaders'

const FILENAME_HOOK_MATCHES: Record<
	string,
	{
		inserterFile: string
		uniformFile: string | null
		provenance: HookMappingProvenance
		note: string
	}
> = {
	dmap_alpha_as_skin_mask: {
		inserterFile: 'mcsahook/skin_mask_pre_dmap_alpha.fsh',
		uniformFile: 'mcsahook/skin_mask_pre_uniforms.fsh',
		provenance: 'filename-match',
		note: 'paired skin mask family shared uniforms',
	},
	dmap_alpha_as_dual_skin_mask: {
		inserterFile: 'mcsahook/skin_mask_pre_dmap_alpha_dual.fsh',
		uniformFile: 'mcsahook/skin_mask_pre_uniforms.fsh',
		provenance: 'filename-match',
		note: 'paired skin mask family shared uniforms',
	},
	nmap_blue_as_skin_mask: {
		inserterFile: 'mcsahook/skin_mask_pre_nmap_blue.fsh',
		uniformFile: 'mcsahook/skin_mask_pre_uniforms.fsh',
		provenance: 'filename-match',
		note: 'paired skin mask family shared uniforms',
	},
	nmap_blue_as_dual_skin_mask: {
		inserterFile: 'mcsahook/skin_mask_pre_nmap_blue_dual.fsh',
		uniformFile: 'mcsahook/skin_mask_pre_uniforms.fsh',
		provenance: 'filename-match',
		note: 'paired skin mask family shared uniforms',
	},
	phantom: {
		inserterFile: 'mcsahook/phantom.fsh',
		uniformFile: null,
		provenance: 'filename-match',
		note: 'hook stem match',
	},
	overheat: {
		inserterFile: 'mcsahook/overheat_color.fsh',
		uniformFile: 'mcsahook/overheat_uniforms.fsh',
		provenance: 'filename-match',
		note: 'overheat_exit.fsh stage is engine-unknown',
	},
	uv_scrolling: {
		inserterFile: 'mcsahook/uv_scrolling.vsh',
		uniformFile: 'mcsahook/uv_scrolling_uniforms.vsh',
		provenance: 'filename-match',
		note: 'vertex-sided hook only',
	},
	uv_distortion: {
		inserterFile: 'mcsahook/uv_distortion.fsh',
		uniformFile: 'mcsahook/uv_distortion_uniforms.fsh',
		provenance: 'filename-match',
		note: 'hook stem match',
	},
	worn_out: {
		inserterFile: 'mcsahook/worn_out.fsh',
		uniformFile: 'mcsahook/worn_out_uniforms.fsh',
		provenance: 'filename-match',
		note: 'hook stem match',
	},
	snow_mask: {
		inserterFile: 'mcsahook/snow_mask_color.fsh',
		uniformFile: 'mcsahook/snow_mask_uniforms.fsh',
		provenance: 'filename-match',
		note: 'hook stem match',
	},
	emission_map_opacity: {
		inserterFile: 'mcsahook/emission_map_opacity_tex.fsh',
		uniformFile: 'mcsahook/emission_map_opacity_uniforms.fsh',
		provenance: 'filename-match',
		note: 'hook stem match',
	},
	diffuse_blend_by_mask: {
		inserterFile: 'mcsahook/diffuse_blend_by_mask_color.fsh',
		uniformFile: 'mcsahook/diffuse_blend_by_mask_uniforms.fsh',
		provenance: 'filename-match',
		note: 'hook stem match',
	},
	diffuse_multiply_biome: {
		inserterFile: 'mcsahook/diffuse_multiply_biome_color.fsh',
		uniformFile: 'mcsahook/diffuse_multiply_biome_uniforms.fsh',
		provenance: 'filename-match',
		note: 'hook stem match',
	},
	animation: {
		inserterFile: 'mcsahook/animation_texture.fsh',
		uniformFile: 'mcsahook/animation_uniforms.fsh',
		provenance: 'filename-match',
		note: 'hook stem match',
	},
	tree: {
		inserterFile: 'mcsahook/tree.vsh',
		uniformFile: 'mcsahook/tree_uniforms.vsh',
		provenance: 'filename-match',
		note: 'vertex-sided hook',
	},
	tree_lod_skin_mask: {
		inserterFile: 'mcsahook/tree_lod_texture.fsh',
		uniformFile: 'mcsahook/tree_lod_uniforms.fsh',
		provenance: 'filename-match',
		note: 'hook stem match',
	},
	head_eye_offset: {
		inserterFile: 'mcsahook/head_eye_offset.fsh',
		uniformFile: 'mcsahook/head_eye_offset_uniforms.fsh',
		provenance: 'filename-match',
		note: 'hook stem match',
	},
	diffuse_replace: {
		inserterFile: 'mcsahook/diffuse_replace.fsh',
		uniformFile: 'mcsahook/diffuse_replace_uniforms.fsh',
		provenance: 'filename-match',
		note: 'hook stem match',
	},
	distortion_mesh: {
		inserterFile: 'mcsahook/distortion_mesh.fsh',
		uniformFile: 'mcsahook/distortion_mesh_uniforms.fsh',
		provenance: 'filename-match',
		note: 'hook stem match',
	},
	fresnel_highlight: {
		inserterFile: 'mcsahook/fresnel_highlight_exit.fsh',
		uniformFile: 'mcsahook/fresnel_highlight_uniforms.fsh',
		provenance: 'filename-match',
		note: 'hook stem match',
	},
	frozen: {
		inserterFile: 'mcsahook/frozen_color.fsh',
		uniformFile: 'mcsahook/frozen_uniforms.fsh',
		provenance: 'filename-match',
		note: 'material patch hook stem match',
	},
	inside: {
		inserterFile: 'mcsahook/inside_patch.fsh',
		uniformFile: 'mcsahook/inside_patch_uniforms.fsh',
		provenance: 'filename-match',
		note: 'material patch hook stem match',
	},
	snowed: {
		inserterFile: 'mcsahook/snowed_color.fsh',
		uniformFile: 'mcsahook/snowed_uniforms.fsh',
		provenance: 'filename-match',
		note: 'material patch hook stem match',
	},
	water: {
		inserterFile: 'mcsahook/water_exit.fsh',
		uniformFile: 'mcsahook/water_uniforms.fsh',
		provenance: 'filename-match',
		note: 'hook stem match',
	},
	flag_wind: {
		inserterFile: 'mcsahook/flag_wind.vsh',
		uniformFile: 'mcsahook/flag_wind_uniforms.vsh',
		provenance: 'filename-match',
		note: 'vertex-sided hook',
	},
	skin_mask_apply_diffuse_color: {
		inserterFile: 'mcsahook/skin_mask_apply_diffuse_color.fsh',
		uniformFile: null,
		provenance: 'filename-match',
		note: 'hook stem match',
	},
	skin_mask_diffuse_blend: {
		inserterFile: 'mcsahook/skin_mask_diffuse_blend_color.fsh',
		uniformFile: 'mcsahook/skin_mask_diffuse_blend_uniforms.fsh',
		provenance: 'filename-match',
		note: 'hook stem match',
	},
}

const UNRESOLVED_HOOKS = [
	'skin_mask_unified',
	'collimator',
	'krovosos',
	'damage_lerp',
	'ammo_display',
	'cards',
	'overheat_compute',
	'signal_detector_display',
	'kill_display_5',
	'kill_display_2',
	'teleport_bubble',
	'shield',
]

export interface HookRegistry {
	mappings: Map<string, HookMapping>
	unmatchedFiles: string[]
	diagnostics: DiagnosticsEntry[]
}

export async function buildHookRegistry(
	index: SourceIndex
): Promise<HookRegistry> {
	const diagnostics: DiagnosticsEntry[] = []
	const archives = new Set<string>()
	for (const [path] of index.byPath)
		if (path.startsWith('assets/effects/shaders/mcsahook/'))
			archives.add(path)
	const mappings = new Map<string, HookMapping>()
	for (const [name, spec] of Object.entries(FILENAME_HOOK_MATCHES)) {
		const inserters: HookInserter[] = []
		for (const file of [spec.inserterFile, spec.uniformFile]) {
			if (!file) continue
			const path = `${MCSA_SHADERS}/${file}`
			if (!index.caseInsensitive.has(path.toLowerCase())) {
				diagnostics.push({
					severity: 'warning',
					code: 'hooks.mapping-file-missing',
					message: `${path} for hook ${name} is absent from the index`,
					source: path,
				})
				continue
			}
			archives.delete(path)
			inserters.push({ path, hints: inferPointHints(path, file) })
		}
		const provenance: HookMappingProvenance =
			inserters.length > 0 ? spec.provenance : 'unresolved'
		if (inserters.length === 0)
			diagnostics.push({
				severity: 'error',
				code: 'hooks.mapping-empty',
				message: `${name} mapping found no inserters in the archived sources`,
			})
		mappings.set(name, { name, inserters, provenance, note: spec.note })
	}
	for (const name of UNRESOLVED_HOOKS) {
		mappings.set(name, {
			name,
			inserters: [],
			provenance: 'unresolved',
			note: 'no derived inserter mapping from the archived mcsahook directory',
		})
		diagnostics.push({
			severity: 'warning',
			code: 'hooks.unresolved',
			message: `${name} has no derived inserter mapping from archived sources`,
		})
	}
	const unmatchedFiles = [...archives].sort()
	for (const file of unmatchedFiles)
		diagnostics.push({
			severity: 'info',
			code: 'hooks.file-unclaimed',
			message: `${file} was not claimed by a hook mapping; treated as engine-side for now`,
			source: file,
		})
	return { mappings, unmatchedFiles, diagnostics }
}

export const POINT_HINTS_BY_KIND: {
	match: RegExp
	point: string | null
	note: string
}[] = [
	{
		match: /_uniforms\.(fsh|vsh)$/,
		point: 'uniform_hook',
		note: 'uniform block',
	},
	{
		match: /_color(_[a-z0-9]+)?\.fsh$/,
		point: 'color_hook',
		note: 'post diffuse combination',
	},
	{
		match: /\btex(ture)?\.fsh$/,
		point: 'texture_hook',
		note: 'texture sampling stage',
	},
	{
		match: /\b(pre|exit|apply|blend)_[a-z0-9_]+\.fsh$/,
		point: null,
		note: 'ambiguous source file role, not derivable by filename alone',
	},
	{
		match: /\.vsh$/,
		point: null,
		note: 'vertex hook stage placement is engine-unknown',
	},
]

function inferPointHints(path: string, file: string): string[] {
	const hints = new Set<string>()
	for (const hint of POINT_HINTS_BY_KIND) {
		if (hint.point && hint.match.test(path)) {
			hints.add(hint.point)
		}
	}
	if (/uv/.test(file)) hints.add('uv_hook')
	if (
		hints.size === 0 &&
		path.endsWith('.fsh') &&
		!/_uniforms\.fsh$/.test(path)
	) {
		hints.add('color_hook')
		hints.add('texture_hook')
	}
	return [...hints]
}

export async function resolveHookInserts(
	registry: HookRegistry,
	names: string[],
	index: SourceIndex
): Promise<{ inserts: HookInsert[]; diagnostics: DiagnosticsEntry[] }> {
	const diagnostics: DiagnosticsEntry[] = []
	const inserts: HookInsert[] = []
	for (const name of names) {
		const mapping = registry.mappings.get(name)
		if (!mapping) {
			diagnostics.push({
				severity: 'error',
				code: 'hooks.unknown-hook',
				message: `${name} not represented in the registry`,
			})
			continue
		}
		if (mapping.provenance === 'unresolved') continue
		for (const inserter of mapping.inserters) {
			const sourceLines = await readInserter(index, inserter.path)
			if (!sourceLines.resolved) {
				diagnostics.push({
					severity: 'error',
					code: 'hooks.inserter-unreadable',
					message: `${inserter.path} could not be read`,
					source: inserter.path,
				})
				continue
			}
			for (const hint of inserter.hints) {
				inserts.push({
					point: hint,
					name,
					lines: sourceLines.lines,
					resolvedPath: inserter.path,
					provenance: 'explicit-source-mapping',
				})
			}
		}
	}
	return { inserts, diagnostics }
}

async function readInserter(
	index: SourceIndex,
	path: string
): Promise<{ lines: string[]; resolved: boolean }> {
	const entry = index.caseInsensitive.get(path.toLowerCase())?.[0]
	if (!entry) return { lines: [], resolved: false }
	const data = await readEntry(entry)
	return { lines: data.toString('utf8').split(/\r?\n/), resolved: true }
}
