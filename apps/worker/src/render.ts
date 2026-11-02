import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyWatermark } from '@bscp/game-assets'
import {
	type DiagnosticsEntry,
	DEFAULT_RENDERER_EXECUTABLE,
	planFromEnv,
	runRendererSpike,
	summarizeSpikeGate,
	type RendererReport,
	writeSpikeBundle,
} from '@bscp/render-pipeline'
import { watermarkPath } from './assets'
import { storeAsset } from './storage'

const MAX_HOOKS = 32,
	MAX_EXTENSIONS = 64,
	MAX_PROGRAMS = 32,
	MAX_DIAGNOSTICS = 20,
	DEFAULT_RENDER_TIMEOUT_MS = 240000,
	MAX_RENDER_TIMEOUT_MS = 240000

const hookNames = () =>
	(process.env.RENDER_HOOKS ?? '')
		.split(',')
		.map((hook) => hook.trim())
		.filter((hook) => hook.length > 0 && hook.length <= 100)
		.slice(0, MAX_HOOKS)

const renderTimeoutMs = () => {
	const value = Number(process.env.RENDER_TIMEOUT_MS)
	if (!Number.isFinite(value) || value < 5000)
		return DEFAULT_RENDER_TIMEOUT_MS
	return Math.min(value, MAX_RENDER_TIMEOUT_MS)
}

export function summarizeRenderRun(
	report: RendererReport,
	publishedAssets: string[]
) {
	const gate = summarizeSpikeGate(report),
		programs = Object.keys(report.programs)
			.slice(0, MAX_PROGRAMS)
			.map((name) => ({
				name,
				status: report.programs[name]?.status ?? 'unknown',
			})),
		draws = report.draws
			? Object.keys(report.draws)
					.slice(0, MAX_PROGRAMS)
					.map((name) => ({
						name,
						status: report.draws?.[name]?.status ?? 'unknown',
					}))
			: [],
		diagnostics: DiagnosticsEntry[] = report.diagnostics
			.filter((entry) => entry.severity !== 'info')
			.slice(0, MAX_DIAGNOSTICS)
	return {
		reportVersion: report.reportVersion,
		rendererVersion: report.rendererVersion,
		status: report.status,
		backend: {
			platform: report.backend.platform,
			version: report.backend.version,
			profile: report.backend.contextProfile,
		},
		programs,
		draws,
		capture: report.capture
			? {
					width: report.capture.width,
					height: report.capture.height,
					bytes: report.capture.bytes,
				}
			: null,
		gate: { ...gate, extensions: gate.extensions.slice(0, MAX_EXTENSIONS) },
		diagnostics,
		timings: report.timings,
		publishedAssets,
	}
}

export async function processRender() {
	const executable =
			process.env.RENDERER_EXECUTABLE?.trim() ||
			DEFAULT_RENDERER_EXECUTABLE,
		plan = await planFromEnv(hookNames()),
		parent = await mkdtemp(join(tmpdir(), 'wrender-'))
	try {
		const bundle = await writeSpikeBundle(join(parent, 'bundle'), plan)
		const run = await runRendererSpike(
			executable,
			bundle,
			join(parent, 'run'),
			{ timeoutMs: renderTimeoutMs() }
		)
		const published: string[] = []
		if (process.env.RENDER_PUBLISH === 'true') {
			const markPath = Bun.file(watermarkPath),
				mark = (await markPath.exists())
					? Buffer.from(await markPath.arrayBuffer())
					: null
			for (const [index, path] of [
				run.pngPath,
				run.assembledPngPath,
				...run.drawPngPaths,
			].entries()) {
				if (!path) continue
				let png: Buffer = Buffer.from(await readFile(path))
				if (mark) png = await applyWatermark(png, mark)
				published.push(
					await storeAsset(
						png,
						`render-spike/${index + 1}.png`,
						'image/png',
						null
					)
				)
			}
		}
		return {
			...summarizeRenderRun(run.report, published),
			captureMs: run.timings.totalMs,
		}
	} finally {
		await rm(parent, { recursive: true, force: true })
	}
}
