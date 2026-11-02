export {
	classifyModelPayload,
	decodeModelStreams,
	type McsaClipRecord,
	type McsaMeshStreams,
	type McsaSkeletonBone,
	type McsaStream,
	type ModelStreamsResult,
	type PayloadClass,
} from '@bscp/game-assets/mcsa'
export type {
	MaterialMapPlan,
	MaterialProgramPlan,
	MaterialUniformPlan,
	ProgramCompileReport,
	ProgramDrawReport,
	UnsupportedMark,
	DiagnosticsEntry,
	RendererReport,
} from '@bscp/render-contracts'
export { DEFAULT_RENDERER_EXECUTABLE } from './spike-run'
export {
	buildCatalogItem,
	buildDependencyGraph,
	type CatalogBuildOptions,
	type DependencyEdge,
	type DependencyGraph,
	type ManagedRefKind,
	RENDER_FIELD_KEYS,
	RENDER_REF_KEYS,
	readItemConfig,
	referenceKind,
	scalarToValue,
} from './catalog'
export type {
	CatalogDrawOptions,
	DecodedDrawMesh,
} from './catalog-draw'
export { writeCatalogDraws } from './catalog-draw'
export {
	type CatalogDecodedMesh,
	type CatalogMeshBind,
	type CatalogModelPlan,
	type CatalogScenePlan,
	type CatalogTransformField,
	planCatalogScene,
	sweepMaterials,
} from './catalog-plan'
export {
	buildHookRegistry,
	type HookInserter,
	type HookMapping,
	type HookMappingProvenance,
	type HookRegistry,
	resolveHookInserts,
} from './hooks'
export { parseStrictJson, parseStrictJsonResource } from './json-strict'
export {
	type MaterialPlanOptions,
	type MaterialPlanResult,
	planMaterialProgram,
	planMaterialPrograms,
	planSpikeProgramFromMaterial,
} from './material-plan'
export {
	KNOWN_KEYS,
	OBSERVED_HOOKS,
	parseMcmtlEntry,
	parseMcmtlIr,
	renderStateOf,
} from './mcmtl'
export { normalizeRemainder, parseDirectiveValue } from './mcmtl-values'
export {
	type ParsedRef,
	parseRef,
	type ResolvedPath,
	type ResolveRefOptions,
	resolveNamespace,
	resolveRef,
	resolveRelative,
} from './refs'
export {
	includeCandidatesRef,
	parseShaderSource,
	resolveShaderInclude,
	SHADER_FILTER,
	type ShaderFeature,
	type ShaderInventoryEntry,
	sourceStageGuess,
} from './shader-features'
export {
	type ComposedShader,
	type ComposeShaderOptions,
	composeShader,
	discoverShaders,
	type HookInsert,
	type StubDefinition,
} from './shaders'
export {
	buildSourceIndex,
	detectSourceSet,
	entryHash,
	individualSourceRoots,
	lookup,
	readEntry,
	type SourceEntry,
	type SourceIndex,
	type SourceRoot,
	sourceRootsFromRoot,
} from './source-set'
export {
	planSpikePrograms,
	SPIKE_PROGRAMS,
	type SpikeManifest,
	type SpikePlan,
	type SpikeProgramOverride,
	type SpikeProgramSpec,
	spikeManifest,
} from './spike-plan'
export {
	planFromEnv,
	runRendererSpike,
	type SpikeGate,
	type SpikeRunValue,
	summarizeSpikeGate,
	type WriteSpikeBundleValue,
	writeSpikeBundle,
} from './spike-run'
