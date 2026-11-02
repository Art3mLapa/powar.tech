import { expect, test } from 'bun:test'
import type { RendererReport } from '@bscp/render-pipeline'
import { summarizeRenderRun } from '../src/render'

const report = {
	reportVersion: 'renderer-report.1',
	rendererVersion: 'spike-1',
	status: 'ok',
	backend: {
		platform: 'test',
		contextProfile: 'core',
		version: '4.3',
		versionMajor: 4,
		versionMinor: 3,
		shadingLanguage: 'GLSL',
		vendor: 'vendor',
		rendererString: 'renderer',
		extensions: Array.from({ length: 80 }, (_, i) => `ext_${i}`),
		limits: [],
	},
	programs: {
		alpha: {
			status: 'linked',
			vertexStatus: 'ok',
			fragmentStatus: 'ok',
			logTruncated: 0,
			diagnostics: [],
		},
	},
	capture: {
		path: 'capture/0.rgba',
		width: 8,
		height: 4,
		bytes: 128,
		sha256: 'ab',
		format: 'rgba8',
	},
	timings: { contextMs: 1, compileMs: 2, renderMs: 3, readMs: 4 },
	diagnostics: [
		{ severity: 'info', code: 'x', message: 'keep out' },
		{ severity: 'warning', code: 'y', message: 'keep in' },
	],
	contractVersion: '1',
} as unknown as RendererReport

test('render run summary trims bounded lists and skips info diagnostics', () => {
	const summary = summarizeRenderRun(report, ['asset-id'])
	expect(summary.status).toBe('ok')
	expect(summary.programs).toEqual([{ name: 'alpha', status: 'linked' }])
	expect(summary.capture).toEqual({ width: 8, height: 4, bytes: 128 })
	expect(summary.gate.extensions).toHaveLength(64)
	expect(summary.gate.captureOk).toBe(true)
	expect(summary.diagnostics).toEqual([
		{ severity: 'warning', code: 'y', message: 'keep in' },
	])
	expect(summary.publishedAssets).toEqual(['asset-id'])
})

test('render run summary reports missing capture as gate failure', () => {
	const withoutCapture = {
		...report,
		capture: null,
	} as unknown as RendererReport
	const summary = summarizeRenderRun(withoutCapture, [])
	expect(summary.capture).toBeNull()
	expect(summary.gate.captureOk).toBe(false)
	expect(summary.gate.failures).toContain('framebuffer readback missing')
})
