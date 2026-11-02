import type { DiagnosticsEntry } from '@bscp/render-contracts'
import {
	parseShaderSource,
	resolveShaderInclude,
	SHADER_FILTER,
	type ShaderFeature,
	type ShaderInventoryEntry,
	sourceStageGuess,
} from './shader-features'
import type { SourceIndex } from './source-set'
import { readEntry } from './source-set'

export interface HookInsert {
	point: string
	name: string
	lines: string[]
	resolvedPath: string
	provenance: 'explicit-source-mapping' | 'engine-stub'
}

export interface StubDefinition {
	point: string
	lines: string[]
	note: string
}

export interface ComposeShaderOptions {
	defines: string[]
	unrollValues: { [name: string]: number }
	hookInserts: HookInsert[]
	stubs: StubDefinition[]
	injectVersion: string | null
	prologue: string[]
}

export interface ComposedShader {
	path: string
	lines: string[]
	origins: string[]
	feature: ShaderFeature
	diagnostics: DiagnosticsEntry[]
	defines: string[]
	appliedStubs: { point: string; note: string }[]
	resolvedHookPoints: string[]
	emptyHookPoints: string[]
	sizeBytes: number
}

export async function composeShader(
	index: SourceIndex,
	path: string,
	options: ComposeShaderOptions
): Promise<ComposedShader> {
	const diagnostics: ComposedShader['diagnostics'] = []
	const emptyHookPoints: string[] = []
	const hooks = new Map<string, HookInsert[]>()
	for (const hook of options.hookInserts) {
		const list = hooks.get(hook.point) ?? []
		list.push(hook)
		hooks.set(hook.point, list)
	}
	const stubs = new Map(options.stubs.map((stub) => [stub.point, stub]))
	const result: ComposedShader = {
		path,
		lines: [],
		origins: [],
		feature: {
			version: null,
			includes: [],
			hookPoints: [],
			unrolls: [],
			conditionals: [],
		},
		diagnostics,
		defines: options.defines,
		appliedStubs: options.stubs.map((stub) => ({
			point: stub.point,
			note: stub.note,
		})),
		resolvedHookPoints: [
			...new Set(options.hookInserts.map((hook) => hook.point)),
		],
		emptyHookPoints,
		sizeBytes: 0,
	}
	const expandResult = await expand(path, new Set<string>())
	let lines = expandResult.lines.map((entry) => entry.text)
	let origins = expandResult.lines.map((entry) => entry.origin)
	if (expandResult.feature.version === null && options.injectVersion) {
		lines = [options.injectVersion, ...lines]
		origins = ['synthetic:inject-version', ...origins]
	}
	if (options.prologue.length > 0) {
		const afterVersion =
			lines.length > 0 && lines[0].startsWith('#version') ? 1 : 0
		lines = [
			...lines.slice(0, afterVersion),
			...options.prologue,
			...lines.slice(afterVersion),
		]
		origins = [
			...origins.slice(0, afterVersion),
			...options.prologue.map(
				(_line, index) => `synthetic:prologue:${index + 1}`
			),
			...origins.slice(afterVersion),
		]
	}
	result.lines = lines
	result.origins = origins
	result.feature = expandResult.feature
	result.sizeBytes = lines.reduce((total, line) => total + line.length + 1, 0)
	return result

	interface SourceLine {
		text: string
		origin: string
	}

	async function expand(
		expandPath: string,
		stack: Set<string>
	): Promise<{ lines: SourceLine[]; feature: ShaderFeature }> {
		const entry = index.caseInsensitive.get(expandPath.toLowerCase())?.[0]
		if (!entry) {
			diagnostics.push({
				severity: 'error',
				code: 'shader.source-missing',
				message: `${expandPath} absent from index`,
				source: expandPath,
			})
			return {
				lines: [],
				feature: {
					version: null,
					includes: [],
					hookPoints: [],
					unrolls: [],
					conditionals: [],
				},
			}
		}
		const data = await readEntry(entry)
		const text = data.toString('utf8')
		const feature = parseShaderSource(expandPath, text)
		const raw = text.split(/\r?\n/)
		const lines: SourceLine[] = []
		let cursor = 0
		while (cursor < raw.length) {
			const rawLine = raw[cursor] ?? ''
			const instruction = rawLine.trim()
			const originLine = cursor + 1
			const commentTrimmed = instruction.startsWith('#')
				? rawLine.replace(/\/\/.*$/, '')
				: rawLine
			if (/^#version\b/.test(instruction)) {
				if (
					stack.size === 0 &&
					options.injectVersion &&
					options.injectVersion !== instruction
				) {
					diagnostics.push({
						severity: 'warning',
						code: 'shader.version-rewritten',
						message: `original ${instruction} replaced by ${options.injectVersion}`,
						source: expandPath,
					})
					lines.push({
						text: options.injectVersion,
						origin: 'synthetic:version',
					})
					cursor++
					continue
				}
				lines.push({
					text: instruction,
					origin: `${expandPath}:${originLine}`,
				})
				cursor++
				continue
			}
			const include = /^#include\s+(\S+)/.exec(instruction)
			if (include?.[1]) {
				const embed = resolveShaderInclude(
					index,
					expandPath,
					include[1]
				)
				if (!embed) {
					diagnostics.push({
						severity: 'error',
						code: 'shader.include-unresolved',
						message: `${include[1]} from ${expandPath}`,
						source: expandPath,
						line: originLine,
					})
					cursor++
					continue
				}
				const key = embed.toLowerCase()
				if (stack.has(key)) {
					diagnostics.push({
						severity: 'error',
						code: 'shader.include-cycle',
						message: `${embed} already in include chain of ${expandPath}`,
						source: expandPath,
						line: originLine,
					})
					cursor++
					continue
				}
				stack.add(key)
				const nested = await expand(embed, stack)
				stack.delete(key)
				lines.push(...nested.lines)
				cursor++
				continue
			}
			const unroll =
				/^#unroll_start:\s*([a-zA-Z_]\w*)\s*,\s*(-?\d+)\s*,\s*([A-Z0-9_]+|\d+)\s*;?$/.exec(
					instruction
				)
			if (unroll?.[1]) {
				const variable = unroll[1]
				const countToken = unroll[3]
				const resolution = /^\d+$/.test(countToken)
					? Number(countToken)
					: options.unrollValues[countToken]
				if (resolution === undefined) {
					diagnostics.push({
						severity: 'error',
						code: 'shader.unroll-count-missing',
						message: `${variable} over token ${countToken} has no provided value`,
						source: expandPath,
						line: originLine,
					})
					cursor++
					continue
				}
				let end = cursor + 1
				while (
					end < raw.length &&
					!/^#unroll_end\b/.test((raw[end] ?? '').trim())
				)
					end++
				if (end >= raw.length) {
					diagnostics.push({
						severity: 'error',
						code: 'shader.unroll-unclosed',
						message: `${variable} unroll without matching #unroll_end`,
						source: expandPath,
						line: originLine,
					})
					cursor++
					continue
				}
				const pattern = new RegExp(`\\b${variable}\\b`, 'g')
				for (let iteration = 0; iteration < resolution; iteration++) {
					for (let inner = cursor + 1; inner < end; inner++) {
						lines.push({
							text: (raw[inner] ?? '').replace(
								pattern,
								String(iteration)
							),
							origin: `${expandPath}:${inner + 1}#${iteration}`,
						})
					}
				}
				cursor = end + 1
				continue
			}
			const marker =
				/^#([a-zA-Z_]*(?:_hook)|attribute_write|uniform_definitions|model_matrix_decryption)$/.exec(
					instruction
				)
			if (marker?.[1]) {
				const point = marker[1]
				const insertions = hooks.get(point) ?? []
				const stub = stubs.get(point)
				if (insertions.length > 0) {
					for (const insertion of insertions) {
						lines.push({
							text: `// hook ${insertion.name}`,
							origin: `synthetic:hook:${insertion.name}`,
						})
						for (const hookLine of insertion.lines)
							lines.push({
								text: hookLine,
								origin: `${insertion.resolvedPath}:hook`,
							})
					}
				} else if (stub) {
					lines.push({
						text: `// engine stub for ${point}: ${stub.note}`,
						origin: 'synthetic:stub-note',
					})
					for (const stubLine of stub.lines)
						lines.push({ text: stubLine, origin: 'synthetic:stub' })
				} else {
					emptyHookPoints.push(`${point}@${expandPath}:${originLine}`)
					diagnostics.push({
						severity: 'warning',
						code: 'shader.hook-point-empty',
						message: `${point} composed empty; insertion mapping unresolved for this program`,
						source: expandPath,
						line: originLine,
					})
				}
				cursor++
				continue
			}
			lines.push({
				text: commentTrimmed,
				origin: `${expandPath}:${originLine}`,
			})
			cursor++
		}
		if (feature.version === null && !options.injectVersion) {
			diagnostics.push({
				severity: 'warning',
				code: 'shader.no-version',
				message: `${expandPath} has no explicit #version and no injector`,
				source: expandPath,
			})
		}
		return { lines, feature }
	}
}

export async function discoverShaders(
	index: SourceIndex,
	diagnostics: DiagnosticsEntry[]
): Promise<ShaderInventoryEntry[]> {
	const entries: ShaderInventoryEntry[] = []
	for (const [path] of index.byPath) {
		if (!SHADER_FILTER.test(path)) continue
		const resolved = index.caseInsensitive.get(path.toLowerCase())?.[0]
		if (!resolved) continue
		const data = await readEntry(resolved)
		const text = data.toString('utf8')
		const feature = parseShaderSource(path, text)
		entries.push({
			path,
			feature,
			stageGuess: sourceStageGuess(path, text),
			sizeBytes: data.length,
		})
	}
	void diagnostics
	return entries
}
