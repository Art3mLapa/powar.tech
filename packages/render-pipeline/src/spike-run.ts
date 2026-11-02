import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {
	BundleSource,
	DiagnosticsEntry,
	GlBackendReport,
	ProgramCompileReport,
	RendererReport,
} from '@bscp/render-contracts'
import { buildSourceIndex, detectSourceSet } from './source-set'
import {
	planSpikePrograms,
	type SpikeManifest,
	type SpikePlan,
	type SpikeProgramPlan,
	spikeManifest,
} from './spike-plan'

export interface WriteSpikeBundleValue {
	bundleDir: string
	manifestPath: string
	sources: { virtualPath: string; file: string; sha1: string; size: number }[]
	manifest: SpikeManifest
}

export async function writeSpikeBundle(
	bundleDir: string,
	plan: SpikePlan
): Promise<WriteSpikeBundleValue> {
	await rm(bundleDir, { recursive: true, force: true })
	await mkdir(bundleDir, { recursive: true })
	const sources: WriteSpikeBundleValue['sources'] = []
	for (const program of plan.programs) {
		for (const [extension, composed] of [
			['.vert', program.composedVertex],
			['.frag', program.composedFragment],
		] as const) {
			if (!composed) continue
			const file = join(bundleDir, `${program.name}${extension}`)
			const digest = createHash('sha256')
				.update(composed.lines.join('\n'))
				.digest('hex')
			await writeFile(file, composed.lines.join('\n'))
			sources.push({
				virtualPath: `${program.name}${extension}`,
				file,
				sha1: digest,
				size: composed.sizeBytes,
			})
		}
	}
	const manifest = spikeManifest(plan)
	const manifestPath = join(bundleDir, 'render_manifest.json')
	await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
	return { bundleDir, manifestPath, sources, manifest }
}

export interface SpikeRunValue {
	report: RendererReport
	rawDirectory: string
	capturePath: string | null
	pngPath: string | null
	assembledPngPath: string | null
	drawPngPaths: string[]
	timings: { totalMs: number }
}

export const DEFAULT_RENDERER_EXECUTABLE = join(
	import.meta.dir,
	'../../../apps/renderer/build/renderer'
)

export interface RunRendererOptions {
	timeoutMs?: number
}

export async function runRendererSpike(
	executable: string,
	bundle: WriteSpikeBundleValue,
	outDir: string,
	options: RunRendererOptions = {}
): Promise<SpikeRunValue> {
	if (!existsSync(executable))
		throw new Error(
			`renderer executable not found: ${executable}; run bun run --cwd packages/render-pipeline spike:build first`
		)
	await rm(outDir, { recursive: true, force: true })
	await mkdir(outDir, { recursive: true })
	const started = Date.now()
	const proc = Bun.spawn(
		[executable, '--manifest', bundle.manifestPath, '--out', outDir],
		{ stdout: 'pipe', stderr: 'pipe' }
	)
	const timeoutMs =
		options.timeoutMs && options.timeoutMs > 0 ? options.timeoutMs : null
	let timedOut = false
	const timer = timeoutMs
		? setTimeout(() => {
				timedOut = true
				proc.kill()
			}, timeoutMs)
		: null
	const stdout = await new Response(proc.stdout).text()
	const stderr = await new Response(proc.stderr).text()
	const code = await proc.exited
	if (timer) clearTimeout(timer)
	if (timedOut)
		throw new Error(`renderer exceeded timeout of ${timeoutMs}ms; killed`)
	const timings = { totalMs: Date.now() - started }
	let parseFailure: string | null = null
	let report: RendererReport
	try {
		report = JSON.parse(stdout) as RendererReport
	} catch {
		parseFailure = stdout.slice(0, 400)
		throw new Error(
			`renderer stdout is not a RendererReport (exit ${code}): ${parseFailure}${stderr.trim() ? `; stderr: ${stderr.trim().slice(0, 400)}` : ''}`
		)
	}
	if (stderr.trim())
		report.diagnostics.push({
			severity: 'info',
			code: 'renderer.process-stderr',
			message: stderr.trim(),
		})
	const captureSubdir = join(outDir, 'capture')
	let capturePath: string | null = null
	let pngPath: string | null = null
	let assembledPngPath: string | null = null
	const drawPngPaths: string[] = []
	if (report.capture) {
		capturePath = join(captureSubdir, report.capture.path)
		pngPath = capturePath.replace(/\.rgba$/, '.png')
		const rgba = await readFile(capturePath)
		const { default: sharp } = await import('sharp')
		await writeFile(
			pngPath,
			await sharp(rgba, {
				raw: {
					width: report.capture.width,
					height: report.capture.height,
					channels: 4,
				},
			})
				.png()
				.toBuffer()
		)
		if (report.assembled) {
			const assembledRgbaPath = join(captureSubdir, report.assembled.path)
			assembledPngPath = assembledRgbaPath.replace(/\.rgba$/, '.png')
			const assembledRgba = await readFile(assembledRgbaPath)
			await writeFile(
				assembledPngPath,
				await sharp(assembledRgba, {
					raw: {
						width: report.assembled.width,
						height: report.assembled.height,
						channels: 4,
					},
				})
					.png()
					.toBuffer()
			)
		}
		const captureFiles = await readdir(captureSubdir)
		for (const captureFile of captureFiles) {
			if (
				!captureFile.startsWith('draw-') ||
				!captureFile.endsWith('.rgba')
			)
				continue
			const drawRgbaPath = join(captureSubdir, captureFile)
			const drawPngPath = drawRgbaPath.replace(/\.rgba$/, '.png')
			const drawRgba = await readFile(drawRgbaPath)
			await writeFile(
				drawPngPath,
				await sharp(drawRgba, {
					raw: {
						width: report.capture.width,
						height: report.capture.height,
						channels: 4,
					},
				})
					.png()
					.toBuffer()
			)
			drawPngPaths.push(drawPngPath)
		}
	}
	return {
		report,
		rawDirectory: outDir,
		capturePath,
		pngPath,
		assembledPngPath,
		drawPngPaths,
		timings,
	}
}

export interface SpikeGate {
	context: {
		platform: string
		version: string
		versionMajor: number
		versionMinor: number
		profile: string
	}
	extensions: string[]
	programs: { name: string; status: string; note: string }[]
	allRepresentativeResolved: boolean
	failures: string[]
	captureOk: boolean
}

export function summarizeSpikeGate(report: RendererReport): SpikeGate {
	const failures: string[] = []
	if (report.status === 'failed')
		failures.push('renderer reported failed status')
	if (
		report.backend.versionMajor < 4 ||
		(report.backend.versionMajor === 4 && report.backend.versionMinor < 3)
	) {
		failures.push(
			`headless context provides GL ${report.backend.version}; archive shaders use layout 430 features`
		)
	}
	const missingSuffix = []
	const programNames = Object.keys(report.programs)
	for (const name of programNames) {
		const program = report.programs[name]
		if (program.status === 'failed')
			failures.push(
				`${name}: ${
					program.diagnostics
						.filter((entry) => entry.severity === 'error')
						.map((entry) => entry.message)
						.join('; ') || 'unspecified'
				}`
			)
		else if (program.status !== 'linked')
			missingSuffix.push(`${name}:${program.status}`)
	}
	const captureOk = Boolean(report.capture)
	if (!captureOk) failures.push('framebuffer readback missing')
	return {
		context: {
			platform: report.backend.platform,
			version: report.backend.version,
			versionMajor: report.backend.versionMajor,
			versionMinor: report.backend.versionMinor,
			profile: report.backend.contextProfile,
		},
		extensions: report.backend.extensions,
		programs: programNames.map((name) => ({
			name,
			status: report.programs[name].status,
			note: report.programs[name].diagnostics
				.filter((entry) => entry.code === 'renderer.link-failed')
				.map((entry) => entry.message)
				.join('; '),
		})),
		allRepresentativeResolved: !report.diagnostics.some(
			(entry) => entry.code === 'spike.program-missing'
		),
		failures,
		captureOk,
	}
}

export async function planFromEnv(
	hookNames: string[] = []
): Promise<SpikePlan> {
	const sourceSet = await detectSourceSet()
	if (sourceSet.status !== 'ok')
		throw new Error(`source set incomplete: ${sourceSet.errors.join('; ')}`)
	const index = await buildSourceIndex(sourceSet.roots)
	return planSpikePrograms(index, hookNames)
}

export type {
	BundleSource,
	DiagnosticsEntry,
	GlBackendReport,
	ProgramCompileReport,
	RendererReport,
	SpikeProgramPlan,
}
