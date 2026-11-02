import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
	buildSourceIndex,
	detectSourceSet,
	type MaterialPlanResult,
	type MaterialProgramPlan,
	parseMcmtlEntry,
	planCatalogScene,
	planMaterialPrograms,
	planSpikeProgramFromMaterial,
	planSpikePrograms,
	type SpikeProgramOverride,
	spikeManifest,
	sweepMaterials,
	writeCatalogDraws,
	writeSpikeBundle,
} from './index'
import { lookup } from './source-set'
import { runRendererSpike, summarizeSpikeGate } from './spike-run'

interface SpikeReportArgs {
	bundleDir: string
	outDir: string
	hooks: string[]
	run: boolean
	executable: string
	verbose: boolean
	material: string | null
	catalogView: 'pbr' | 'albedo'
	spikeProgram: string
	item: string | null
	sweepLimit: number | null
}

function parseArgs(argv: string[]): SpikeReportArgs {
	const args = {
		bundleDir: '/tmp/opencode/renderer-spike/bundle',
		outDir: '/tmp/opencode/renderer-spike/run',
		hooks: [] as string[],
		run: false,
		executable: '',
		verbose: false,
		material: null as string | null,
		catalogView: 'pbr' as 'pbr' | 'albedo',
		spikeProgram: 'mcsa130-pbr-skinned-lit-full',
		item: null as string | null,
		sweepLimit: null as number | null,
	}
	for (let i = 0; i < argv.length; i++) {
		const flag = argv[i]
		const value = argv[i + 1]
		if (flag === '--bundle') args.bundleDir = value
		else if (flag === '--out') args.outDir = value
		else if (flag === '--hooks')
			args.hooks = value
				.split(',')
				.map((hook) => hook.trim())
				.filter(Boolean)
		else if (flag === '--run') args.run = true
		else if (flag === '--executable') args.executable = value
		else if (flag === '--material') args.material = value
		else if (flag === '--catalog-view') {
			if (value === 'albedo' || value === 'pbr') args.catalogView = value
		} else if (flag === '--spike-program') args.spikeProgram = value
		else if (flag === '--item') args.item = value
		else if (flag === '--sweep-materials') args.sweepLimit = Number(value)
		else if (flag === '--verbose') args.verbose = true
		else if (flag === '--help') {
			console.log(
				'spike-report [--bundle DIR] [--out DIR] [--hooks a,b] [--material PATH] [--item PATH] [--sweep-materials N] [--spike-program NAME] [--catalog-view pbr|albedo] [--run] [--executable PATH] [--verbose]'
			)
			process.exit(0)
		}
		if (
			value !== undefined &&
			(flag === '--bundle' ||
				flag === '--out' ||
				flag === '--hooks' ||
				flag === '--executable')
		)
			i++
	}
	return args
}

const args = parseArgs(process.argv.slice(2))
const sourceSet = await detectSourceSet()
if (sourceSet.status !== 'ok') {
	console.error(
		JSON.stringify(
			{ status: 'source-incomplete', errors: sourceSet.errors },
			null,
			2
		)
	)
	process.exit(1)
}
const index = await buildSourceIndex(sourceSet.roots)
if (args.sweepLimit !== null) {
	const sweep = await sweepMaterials(index, {
		limit: args.sweepLimit || undefined,
	})
	console.log(
		JSON.stringify(
			{ status: 'sweep', ...sweep, corpusFiles: index.files },
			null,
			2
		)
	)
	process.exit(0)
}
if (args.item) {
	const scene = await planCatalogScene(index, args.item)
	if (!args.run) {
		console.log(
			JSON.stringify(
				{ status: 'catalog', corpusFiles: index.files, scene },
				null,
				2
			)
		)
		process.exit(0)
	}
	const samplerSuffix = /glass/.test(args.spikeProgram)
		? 'glass'
		: /unlit/.test(args.spikeProgram)
			? 'unlit'
			: /base/.test(args.spikeProgram)
				? 'base'
				: 'pbr'
	const targets = scene.programs.filter(
		(program) =>
			program.status === 'planned' &&
			program.lightingModel === samplerSuffix
	)
	if (targets.length === 0) {
		console.error(
			JSON.stringify(
				{
					status: 'item-no-programs',
					itemId: scene.itemId,
					spikeProgram: args.spikeProgram,
				},
				null,
				2
			)
		)
		process.exit(1)
	}
	const richest = targets.reduce((best, program) =>
		program.numMaps > best.numMaps ? program : best
	)
	const materialProgram = planSpikeProgramFromMaterial(richest)
	const featureDefines = targets.flatMap((program) =>
		program.defines.filter(
			(define) =>
				define === 'ALPHA_TRANSPARENCY' || define === 'ALPHA_BLENDING'
		)
	)
	const programDefines = [
		...new Set([...materialProgram.defines, ...featureDefines]),
	]
	const plan = await planSpikePrograms(index, args.hooks, {
		[args.spikeProgram]: {
			defines: programDefines,
			unrollValues: materialProgram.unrollValues,
			note: materialProgram.note,
		},
	})
	const catalogAlphaTest = featureDefines.includes('ALPHA_TRANSPARENCY')
	const bundle = await writeSpikeBundle(args.bundleDir, plan)
	const draws = await writeCatalogDraws(index, scene, {
		bundleDir: args.bundleDir,
		lightingModels: [samplerSuffix],
		spikeProgram: args.spikeProgram,
	})
	if (args.catalogView === 'albedo') {
		const albedoMain = catalogAlphaTest
			? 'void main(){ vec4 albedo = texture(usedTextures[0], textureCoordsVert); if (albedo.a < 0.4) discard; fragColor = albedo; }\n'
			: 'void main(){ fragColor = vec4(texture(usedTextures[0], textureCoordsVert).rgb, 1.0); }\n'
		await writeFile(
			join(args.bundleDir, `${args.spikeProgram}.frag`),
			`#version 430 core\n` +
				`in vec2 textureCoordsVert;\n` +
				`uniform sampler2D usedTextures[NUM_MAPS];\n` +
				`layout(location = 0) out vec4 fragColor;\n` +
				albedoMain
		)
	}
	plan.draws = draws.draws
	const manifest = spikeManifest(plan) as typeof bundle.manifest
	manifest.draws = draws.draws as typeof manifest.draws
	await writeFile(
		bundle.manifestPath,
		`${JSON.stringify(manifest, null, 2)}\n`
	)
	const executable =
		args.executable ||
		(await import('./spike-run')).DEFAULT_RENDERER_EXECUTABLE
	const run = await runRendererSpike(executable, bundle, args.outDir)
	const backDraws = draws.draws.map((draw) => ({
		...draw,
		viewMatrix: draw.backViewMatrix ?? draw.viewMatrix,
	}))
	const backManifest = {
		...manifest,
		draws: backDraws as typeof manifest.draws,
	}
	const backManifestPath = join(args.bundleDir, 'render_manifest-back.json')
	await writeFile(
		backManifestPath,
		`${JSON.stringify(backManifest, null, 2)}\n`
	)
	const backRun = await runRendererSpike(
		executable,
		{
			...bundle,
			manifestPath: backManifestPath,
			manifest: backManifest,
		},
		`${args.outDir}-back`
	)
	console.log(
		JSON.stringify(
			{
				status: 'catalog',
				catalogView: args.catalogView,
				corpusFiles: index.files,
				scene,
				draws: draws.draws.map((draw) => ({
					program: draw.program,
					mesh: draw.mesh,
					material: draw.material,
					vertexCount: draw.vertexCount,
					indexCount: draw.indexCount,
					textures: draw.textures.length,
				})),
				drawDiagnostics: draws.diagnostics,
				sources: bundle.sources.map((source) => ({
					virtualPath: source.virtualPath,
					sha1: source.sha1,
					size: source.size,
				})),
				report: run.report,
				assembledCapture: run.assembledPngPath,
				backReport: backRun.report,
				assembledBackCapture: backRun.assembledPngPath,
				drawCaptures: run.drawPngPaths,
				backDrawCaptures: backRun.drawPngPaths,
				gate: summarizeSpikeGate(run.report),
				backGate: summarizeSpikeGate(backRun.report),
				manifestPath: bundle.manifestPath,
				bundleDir: bundle.bundleDir,
			},
			null,
			2
		)
	)
	process.exit(0)
}
const overrides: { [programName: string]: SpikeProgramOverride } = {}
let materialPlan: {
	material: string
	entry: string
	programs: MaterialProgramPlan[]
	textures: MaterialPlanResult['textures']
	diagnostics: import('@bscp/render-contracts').DiagnosticsEntry[]
} | null = null
if (args.material) {
	const hits = lookup(index, args.material)
	if (hits.length === 0) {
		console.error(
			JSON.stringify(
				{ status: 'material-missing', material: args.material },
				null,
				2
			)
		)
		process.exit(1)
	}
	if (hits.length > 1) {
		console.error(
			JSON.stringify(
				{
					status: 'material-ambiguous',
					candidates: hits.map((hit) => hit.path),
				},
				null,
				2
			)
		)
		process.exit(1)
	}
	const ir = await parseMcmtlEntry(hits[0])
	const planned = await planMaterialPrograms(ir.materials, index)
	const richest = planned.programs.reduce<MaterialProgramPlan | null>(
		(best, program) =>
			best === null || program.numMaps > best.numMaps ? program : best,
		null
	)
	if (richest && richest.status === 'planned') {
		const spikeProgram = planSpikeProgramFromMaterial(richest)
		overrides[args.spikeProgram] = {
			defines: spikeProgram.defines,
			unrollValues: spikeProgram.unrollValues,
			note: spikeProgram.note,
		}
	}
	materialPlan = {
		material: args.material,
		entry: hits[0].path,
		programs: planned.programs,
		textures: planned.textures,
		diagnostics: planned.diagnostics,
	}
}
const plan = await planSpikePrograms(index, args.hooks, overrides)
const bundle = await writeSpikeBundle(args.bundleDir, plan)
const summary = {
	status: 'planned',
	files: index.files,
	diagnostics: plan.diagnostics,
	material: materialPlan,
	overrides: Object.entries(overrides).map(([name, override]) => ({
		program: name,
		...override,
	})),
	sources: bundle.sources.map((source) => ({
		virtualPath: source.virtualPath,
		sha1: source.sha1,
		size: source.size,
	})),
	manifestPath: bundle.manifestPath,
}
if (!args.run) {
	console.log(
		JSON.stringify(
			args.verbose ? summary : { ...summary, diagnostics: undefined },
			null,
			2
		)
	)
	process.exit(0)
}
const executable =
	args.executable || (await import('./spike-run')).DEFAULT_RENDERER_EXECUTABLE
const run = await runRendererSpike(executable, bundle, args.outDir)
console.log(
	JSON.stringify(
		{
			status: 'ran',
			files: index.files,
			material: materialPlan,
			overrides: Object.entries(overrides).map(([name, override]) => ({
				program: name,
				...override,
			})),
			sources: bundle.sources.map((source) => ({
				virtualPath: source.virtualPath,
				sha1: source.sha1,
				size: source.size,
			})),
			report: run.report,
			gate: summarizeSpikeGate(run.report),
			bundleDir: bundle.bundleDir,
			manifestPath: bundle.manifestPath,
		},
		null,
		2
	)
)
