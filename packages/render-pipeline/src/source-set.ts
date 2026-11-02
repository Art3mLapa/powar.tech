import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import type { DiagnosticsEntry } from '@bscp/render-contracts'

export interface SourceRoot {
	kind: 'configs' | 'materials' | 'shaders' | 'textures'
	label: string
	root: string
}

export interface SourceEntry {
	path: string
	root: SourceRoot
	file: string
	size: number
	hash: string | null
}

export interface SourceIndex {
	roots: SourceRoot[]
	byPath: Map<string, SourceEntry>
	caseInsensitive: Map<string, SourceEntry[]>
	files: number
	diagnostics: DiagnosticsEntry[]
}

export interface SourceSetResult {
	status: 'ok' | 'incomplete'
	roots: SourceRoot[]
	errors: string[]
}

const KIND_LABELS: { kind: SourceRoot['kind']; markers: string[] }[] = [
	{ kind: 'configs', markers: ['configs'] },
	{ kind: 'materials', markers: ['materials'] },
	{ kind: 'shaders', markers: ['shaders'] },
]

export function individualSourceRoots(
	env: Record<string, string | undefined>
): SourceSetResult {
	const roots: SourceRoot[] = []
	const errors: string[] = []
	for (const { env: name, kind, required } of [
		{
			env: 'RENDER_CONFIGS_ROOT',
			kind: 'configs' as const,
			required: true,
		},
		{
			env: 'RENDER_MATERIALS_ROOT',
			kind: 'materials' as const,
			required: true,
		},
		{
			env: 'RENDER_SHADERS_ROOT',
			kind: 'shaders' as const,
			required: true,
		},
		{
			env: 'RENDER_TEXTURES_ROOT',
			kind: 'textures' as const,
			required: false,
		},
	]) {
		const value = env[name]
		if (!value) {
			if (required) errors.push(`${name} not set`)
			continue
		}
		roots.push({
			kind,
			label: name,
			root: isAbsolute(value) ? value : resolve(value),
		})
	}
	return { status: errors.length === 0 ? 'ok' : 'incomplete', roots, errors }
}

export async function sourceRootsFromRoot(
	rootDir: string
): Promise<SourceRoot[]> {
	const children = await readdir(rootDir)
	const roots: SourceRoot[] = []
	for (const child of children) {
		const full = join(rootDir, child)
		const info = await stat(full).catch(() => null)
		if (!info?.isDirectory()) continue
		const lowered = child.toLowerCase()
		const matched = KIND_LABELS.find((kind) =>
			kind.markers.some((marker) => lowered.includes(marker))
		)
		if (matched)
			roots.push({ kind: matched.kind, label: child, root: full })
	}
	return roots
}

export async function detectSourceSet(
	env: Record<string, string | undefined> = process.env
): Promise<SourceSetResult> {
	if (env.RENDER_SOURCE_ROOT) {
		const roots = await sourceRootsFromRoot(env.RENDER_SOURCE_ROOT)
		const texturesEnv = env.RENDER_TEXTURES_ROOT
		if (texturesEnv) {
			roots.push({
				kind: 'textures',
				label: 'RENDER_TEXTURES_ROOT',
				root: isAbsolute(texturesEnv)
					? texturesEnv
					: resolve(texturesEnv),
			})
		}
		const missing = KIND_LABELS.filter(
			(kind) => !roots.some((existing) => existing.kind === kind.kind)
		)
		return {
			status: missing.length === 0 ? 'ok' : 'incomplete',
			roots,
			errors: missing.map(
				(kind) =>
					`${kind.kind} directory not found under RENDER_SOURCE_ROOT`
			),
		}
	}
	return individualSourceRoots(env)
}

export async function buildSourceIndex(
	roots: SourceRoot[]
): Promise<SourceIndex> {
	const byPath = new Map<string, SourceEntry>()
	const caseInsensitive = new Map<string, SourceEntry[]>()
	const diagnostics: DiagnosticsEntry[] = []
	let files = 0
	for (const root of roots) {
		const entries = await walk(root)
		for (const entry of entries) {
			files++
			const key = entry.path.toLowerCase()
			byPath.set(entry.path, entry)
			const existing = caseInsensitive.get(key)
			if (existing) {
				if (
					!existing.some((candidate) => candidate.path === entry.path)
				) {
					diagnostics.push({
						severity: 'warning',
						code: 'index.case-collision',
						message: `${key} matches ${existing.map((candidate) => `${candidate.root.label}:${candidate.path}`).join(', ')} and ${root.label}:${entry.path}`,
						source: root.label,
					})
					existing.push(entry)
				}
			} else caseInsensitive.set(key, [entry])
		}
	}
	return { roots, byPath, caseInsensitive, files, diagnostics }
}

async function walk(root: SourceRoot): Promise<SourceEntry[]> {
	const result: SourceEntry[] = []
	const stack: string[] = [root.root]
	while (stack.length > 0) {
		const dir = stack.pop() as string
		const children =
			(await readdir(dir, { withFileTypes: true }).catch(() => null)) ??
			[]
		for (const child of children) {
			const full = join(dir, child.name)
			if (child.isDirectory()) {
				stack.push(full)
				continue
			}
			if (!child.isFile()) continue
			const relative = full
				.slice(root.root.length + 1)
				.replaceAll('\\', '/')
			const info = await stat(full)
			result.push({
				path: relative,
				root: root,
				file: full,
				size: info.size,
				hash: null,
			})
		}
	}
	return result
}

export async function readEntry(entry: SourceEntry): Promise<Buffer> {
	const data = await readFile(entry.file)
	if (!entry.hash) entry.hash = createHash('sha1').update(data).digest('hex')
	return data
}

export function entryHash(entry: SourceEntry, data: Buffer): string {
	if (!entry.hash) entry.hash = createHash('sha1').update(data).digest('hex')
	return entry.hash
}

export function lookup(index: SourceIndex, path: string): SourceEntry[] {
	return index.caseInsensitive.get(path.toLowerCase()) ?? []
}
