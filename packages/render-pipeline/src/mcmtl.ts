import type {
	DiagnosticsEntry,
	MaterialIr,
	McmtlIr,
	McmtlMapSlot,
	McmtlValue,
} from '@bscp/render-contracts'
import { joinNumbers, parseDirectiveValue } from './mcmtl-values'
import type { SourceEntry } from './source-set'
import { readEntry } from './source-set'

const KNOWN_LIGHTING_MODELS = ['base', 'pbr', 'glass', 'unlit'] as const

export const OBSERVED_HOOKS = [
	'dmap_alpha_as_dual_skin_mask',
	'dmap_alpha_as_skin_mask',
	'nmap_blue_as_skin_mask',
	'nmap_blue_as_dual_skin_mask',
	'diffuse_blend_by_mask',
	'skin_mask_unified',
	'overheat',
	'overheat_compute',
	'phantom',
	'animation',
	'skin_mask_diffuse_blend',
	'collimator',
	'tree',
	'head_eye_offset',
	'distortion_scale',
	'worn_out',
	'diffuse_multiply_biome',
	'snow_mask',
	'pbr',
	'krovosos',
	'tree_lod_skin_mask',
	'emission_map_opacity',
	'uv_scrolling',
	'teleport_bubble',
	'shield',
	'uv_distortion',
	'signal_detector_display',
	'signal_detector_color',
	'emission_death',
	'damage_lerp',
	'ammo_display',
	'stickers_decal',
	'random_image',
	'water',
	'serial_number_decal',
	'random_color',
	'serial_number_cheytac',
	'kill_display_5',
	'kill_display_2',
	'flag_wind',
	'cards',
	'skin_mask_apply_diffuse_color',
	'door_ppe',
	'constant_as_skin_mask',
	'random_pass',
	'random_number',
	'random_integer_number',
	'random_hue',
	'mdt_tex_specular',
	'mdt_tex_normal',
	'mdt_tex_diffuse',
	'mdt_mask_by_tex',
	'virtual_screen',
	'virtual_screen_world',
	'snowman_display',
	'random_photo',
	'fresnel_highlight',
	'diffuse_replace_vc_g',
	'clan_icon',
	'kill_streak_m60',
	'gauss_pistol_decal',
	'metal_detector',
] as const

const MAP_SLOTS: Record<string, McmtlMapSlot> = {
	'diffuse map': 'diffuse',
	'normal map': 'normal',
	'specular map': 'specular',
	'gloss map': 'gloss',
	'emission map': 'emission',
	'anim diffuse map': 'animDiffuse',
	'anim emission map': 'animEmission',
	'anim normal map': 'animNormal',
	'ao map': 'ao',
	'custom map': 'custom',
	'worn out map': 'wornOut',
	'skin mask diffuse': 'skinMaskDiffuse',
	'skin mask diffuse_blend': 'skinMaskDiffuseBlend',
}

const COLOR_KEYS = [
	'diffuse color',
	'specular color',
	'emission color',
	'ambient color',
	'heat emission color',
	'snow mask color',
	'screen color',
	'screen scan color',
	'screen background color',
	'shield color',
]

const SCALAR_KEYS = [
	'specular exponent',
	'alpha factor',
	'burn factor',
	'fresnel scale',
	'fresnel bias',
	'fresnel power',
	'reflection factor',
	'reflection gloss',
	'skin mask tex scale',
	'skin mask aspect ratio',
	'worn out aspect ratio',
	'phantom fresnel factor',
	'cylinder start radius',
	'cylinder end radius',
	'length start',
	'length end',
	'pos offset',
	'collimator scale',
	'distortion scale',
	'distortion power',
	'noise amount',
	'anim rows',
	'anim columns',
	'anim duration',
	'anim tex scale u',
	'anim tex scale v',
	'u speed',
	'v speed',
]

const FLAG_KEYS = [
	'alpha transparency',
	'alpha blending',
	'back faces',
	'decal',
	'lightmap 3d',
	'disable snow',
	'disable ssao',
	'distortion pass',
	'alpha as gloss',
	'alpha as specular',
	'colors as diffuse',
	'vertex colors',
	'anim interpolation',
	'cast shadows',
	'phantom color exterior',
]

const HOOK_DIRECTIVES = new Set(['shader hook', 'skin mask hook'])

export const KNOWN_KEYS: string[] = [
	...Object.keys(MAP_SLOTS),
	...COLOR_KEYS,
	...SCALAR_KEYS,
	...FLAG_KEYS,
	...HOOK_DIRECTIVES,
	'version',
	'lighting model',
	'mtltype',
].sort((a, b) => b.length - a.length)

export function parseMcmtlIr(
	text: string,
	path: string,
	sha1: string
): McmtlIr {
	const diagnostics: McmtlIr['diagnostics'] = []
	const mtlType: string[] = []
	const materials: MaterialIr[] = []
	let current: MaterialIr | null = null
	const names = new Set<string>()
	const splitIntoDirectives = (
		material: MaterialIr | null,
		key: string,
		tail: string,
		line: number
	) => {
		const values = tail
			.split(/\s+/)
			.filter(Boolean)
			.map(parseDirectiveValue)
		const record = {
			key,
			values,
			raw: `${key}${tail ? ` ${tail.trim()}` : ''}`,
			line,
		}
		if (material) {
			material.directives.push(record)
			applyDirective(
				material,
				record.key,
				record.values,
				line,
				diagnostics
			)
		} else {
			diagnostics.push({
				severity: 'info',
				code: 'mcmtl.file-directive',
				message: `${key}${tail ? ` ${tail.trim()}` : ''}`,
				source: path,
				line,
			})
		}
	}
	const lines = text.split(/\r?\n/)
	for (let line = 0; line < lines.length; line++) {
		const rawLine = lines[line] ?? ''
		const trimmed = rawLine.trim()
		if (!trimmed) continue
		if (
			trimmed.startsWith('#') ||
			trimmed.startsWith('//') ||
			trimmed === '#End'
		)
			continue
		const newmtl =
			trimmed.startsWith('newmtl') && /^\s*newmtl(?: |$)/.test(rawLine)
		if (newmtl) {
			const name = trimmed.replace(/^newmtl\s*/, '').trim()
			if (!name) {
				diagnostics.push({
					severity: 'error',
					code: 'mcmtl.empty-material-name',
					message: `newmtl without a name at line ${line + 1}`,
					source: path,
					line: line + 1,
				})
				current = null
				continue
			}
			if (names.has(name))
				diagnostics.push({
					severity: 'warning',
					code: 'mcmtl.duplicate-material-name',
					message: `material ${name} redeclared at line ${line + 1}`,
					source: path,
					line: line + 1,
				})
			names.add(name)

			current = {
				name,
				version: null,
				lightingModel: { raw: '', normalized: 'unknown' },
				maps: {},
				colors: {},
				scalars: {},
				flags: {},
				hooks: [],
				renderState: {
					alphaTransparency: null,
					alphaBlending: null,
					alphaFactor: null,
					burnFactor: null,
					backFaces: null,
					decal: null,
					lightmap3d: null,
					disableSnow: null,
				},
				directives: [],
				raw: '',
			}
			materials.push(current)
			continue
		}
		const known = KNOWN_KEYS.find(
			(candidate) =>
				trimmed.toLowerCase().startsWith(candidate) &&
				(trimmed.length === candidate.length ||
					/^[\s]/.test(trimmed.slice(candidate.length)))
		)
		if (known) {
			const tail = trimmed.slice(known.length)
			if (known === 'mtltype' && tail.trim()) mtlType.push(tail.trim())
			splitIntoDirectives(current, known, tail, line + 1)
			continue
		}
		const token = /^([a-z][a-z_ .]*[a-z_.])(?:[ \t]+(\S.*))?[ \t]*$/i.exec(
			trimmed
		)
		if (!token) {
			diagnostics.push({
				severity: 'warning',
				code: 'mcmtl.unparsed-line',
				message: `line preserved but not tokenized: ${trimmed.slice(0, 120)}`,
				source: path,
				line: line + 1,
			})
			continue
		}
		const key = (token[1] ?? '').trim().toLowerCase()
		const tail = (token[2] ?? '').trim()
		if (key === 'mtltype' && tail.trim()) mtlType.push(tail.trim())
		splitIntoDirectives(current, key, tail, line + 1)
	}
	for (const material of materials)
		material.renderState = renderStateOf(material)
	return {
		path,
		sha1,
		mtlType: mtlType.length > 0 ? mtlType[mtlType.length - 1] : null,
		materials,
		diagnostics,
		raw: text,
	}
}

function applyDirective(
	material: MaterialIr,
	key: string,
	values: McmtlValue[],
	line: number,
	diagnostics: DiagnosticsEntry[]
) {
	if (key === 'version')
		material.version =
			Math.trunc(joinNumbers(values)[0] ?? Number.NaN) || material.version
	if (key === 'lighting model') {
		const raw = (
			values.find((value) => value.kind === 'word')?.text ??
			values
				.filter((value) => value.kind === 'number')
				.map((value) => value.number)
				.join(' ')
		).toString()
		const normalized = (
			KNOWN_LIGHTING_MODELS as readonly string[]
		).includes(raw)
			? (raw as 'base' | 'pbr' | 'glass' | 'unlit')
			: 'unknown'
		if (
			material.lightingModel &&
			material.lightingModel.normalized !== 'unknown' &&
			normalized === 'unknown'
		) {
			diagnostics.push({
				severity: 'info',
				code: 'mcmtl.lighting-model-ignored',
				message: `lighting model ${raw} ignored; ${material.lightingModel.normalized} already set`,
				source: material.name,
				line,
			})
		} else {
			material.lightingModel = { raw, normalized }
			if (normalized === 'unknown') {
				diagnostics.push({
					severity: 'warning',
					code: 'mcmtl.unknown-lighting-model',
					message: `lighting model ${raw} has no known semantics; stored raw`,
					source: material.name,
					line,
				})
			}
		}
	}
	if (key === 'mtltype') return
	const mapSlot = MAP_SLOTS[key]
	if (mapSlot) {
		material.maps[mapSlot] = values
		if (
			!values.some(
				(value) => value.kind === 'ref' || value.kind === 'path'
			)
		) {
			diagnostics.push({
				severity: 'info',
				code: 'mcmtl.map-none',
				message: `${key} without namespace references`,
				source: material.name,
				line,
			})
		}
		return
	}
	if (HOOK_DIRECTIVES.has(key)) {
		const hookName = values.find((value) => value.kind === 'word')?.text
		if (!hookName) {
			diagnostics.push({
				severity: 'error',
				code: 'mcmtl.hook-without-name',
				message: `${key} without hook name`,
				source: material.name,
				line,
			})
			return
		}
		material.hooks.push({
			kind: key === 'shader hook' ? 'shader' : 'skinMask',
			name: hookName,
			line,
			observed: (OBSERVED_HOOKS as readonly string[]).includes(hookName),
		})
		return
	}
	if (COLOR_KEYS.includes(key)) {
		material.colors[key] = joinNumbers(values)
		return
	}
	if (SCALAR_KEYS.includes(key)) {
		material.scalars[key] = joinNumbers(values)
		return
	}
	if (FLAG_KEYS.includes(key)) {
		const boolean = values.find(
			(value) => value.kind === 'boolean'
		)?.boolean
		if (boolean !== undefined) material.flags[key] = boolean
	}
}

export async function parseMcmtlEntry(entry: SourceEntry): Promise<McmtlIr> {
	const raw = await readEntry(entry)
	return parseMcmtlIr(raw.toString('utf8'), entry.path, '')
}

export function renderStateOf(material: MaterialIr): MaterialIr['renderState'] {
	return {
		alphaTransparency: material.flags['alpha transparency'] ?? null,
		alphaBlending: material.flags['alpha blending'] ?? null,
		alphaFactor: material.scalars['alpha factor']?.[0] ?? null,
		burnFactor: material.scalars['burn factor']?.[0] ?? null,
		backFaces: material.flags['back faces'] ?? null,
		decal: material.flags.decal ?? null,
		lightmap3d: material.flags['lightmap 3d'] ?? null,
		disableSnow: material.flags['disable snow'] ?? null,
	}
}
