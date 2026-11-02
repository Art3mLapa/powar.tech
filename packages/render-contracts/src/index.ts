export const RENDER_CONTRACT_VERSION = 'render-contracts.1'

export type RenderProfile = 'catalog' | 'scene'

export type DiagnosticsSeverity = 'error' | 'warning' | 'info'

export interface DiagnosticsEntry {
	severity: DiagnosticsSeverity
	code: string
	message: string
	source?: string
	line?: number
}

export type ResolutionStatus = 'resolved' | 'missing' | 'ambiguous' | 'unsafe'

export interface ManagedRef {
	raw: string
	namespace: string | null
	remainder: string
	context: string
	status: ResolutionStatus
	path?: string
	candidates?: string[]
	reason?: string
	key?: string
}

export type McmtlLightingModel = 'base' | 'pbr' | 'glass' | 'unlit' | 'unknown'

export type McmtlValueKind = 'number' | 'boolean' | 'word' | 'ref' | 'path'

export interface McmtlValue {
	kind: McmtlValueKind
	number?: number
	boolean?: boolean
	text?: string
	refNamespace?: string
	refRemainder?: string
	contextRelative?: boolean
}

export interface McmtlDirectiveRecord {
	key: string
	values: McmtlValue[]
	raw: string
	line: number
}

export interface McmtlHookRef {
	kind: 'shader' | 'skinMask'
	name: string
	line: number
	observed: boolean
}

export interface MaterialIr {
	name: string
	version: number | null
	lightingModel: { raw: string; normalized: McmtlLightingModel }
	maps: Record<string, McmtlValue[]>
	colors: Record<string, number[]>
	scalars: Record<string, number[]>
	flags: Record<string, boolean>
	hooks: McmtlHookRef[]
	renderState: {
		alphaTransparency: boolean | null
		alphaBlending: boolean | null
		alphaFactor: number | null
		burnFactor: number | null
		backFaces: boolean | null
		decal: boolean | null
		lightmap3d: boolean | null
		disableSnow: boolean | null
	}
	directives: McmtlDirectiveRecord[]
	raw: string
}

export interface McmtlIr {
	path: string
	sha1: string
	mtlType: string | null
	materials: MaterialIr[]
	diagnostics: DiagnosticsEntry[]
	raw: string
}

export type McmtlMapSlot =
	| 'diffuse'
	| 'normal'
	| 'specular'
	| 'gloss'
	| 'emission'
	| 'animDiffuse'
	| 'animEmission'
	| 'animNormal'
	| 'ao'
	| 'custom'
	| 'wornOut'
	| 'skinMaskDiffuse'
	| 'skinMaskDiffuseBlend'
	| 'unknown'

export interface McmtlMapBinding {
	slot: McmtlMapSlot
	ref: McmtlValue | null
	line: number
}

export interface CatalogItemIr {
	profile: 'catalog'
	configPath: string
	itemId: number | null
	shape: string
	renderFields: Record<string, McmtlValue>
	models: ManagedRef[]
	animations: ManagedRef[]
	effects: ManagedRef[]
	materials: McmtlIr[]
	diagnostics: DiagnosticsEntry[]
}

export interface FrameIr {
	width: number
	height: number
	camera: { name: string | null; policy: 'neutral' | 'positioned' }
}

export interface SceneIr {
	profile: RenderProfile
	items: CatalogItemIr[]
	frames: FrameIr[]
	diagnostics: DiagnosticsEntry[]
}

export type BundleSourceKind = 'glsl' | 'texture' | 'geometry' | 'config'

export interface BundleSource {
	kind: BundleSourceKind
	virtualPath: string
	sha1: string
	size: number
}

export interface RendererBundle {
	bundleVersion: string
	schemaVersion: string
	root: string
	sources: BundleSource[]
	programs: Record<
		string,
		{ vertex: BundleSource[]; fragment: BundleSource[]; defines: string[] }
	>
	render: {
		width: number
		height: number
		readback: 'off' | 'rgba8'
		capturePrefix: string
	}
	diagnostics: DiagnosticsEntry[]
}

export interface CapabilityLimitReport {
	name: string
	value: number
	required?: number
	sufficient: boolean
}

export interface GlBackendReport {
	platform: string
	contextProfile: string
	version: string
	versionMajor: number
	versionMinor: number
	shadingLanguage: string
	vendor: string
	rendererString: string
	extensions: string[]
	limits: CapabilityLimitReport[]
}

export interface ProgramCompileReport {
	status: 'linked' | 'compiled' | 'failed'
	vertexStatus: string
	fragmentStatus: string
	logTruncated: number
	diagnostics: DiagnosticsEntry[]
}

export interface CaptureReport {
	path: string
	width: number
	height: number
	bytes: number
	sha256: string
	format: 'rgba8'
}

export interface RendererTimingsReport {
	contextMs: number
	compileMs: number
	renderMs: number
	readMs: number
}

export interface ProgramDrawReport {
	mesh: string
	program: string
	status: 'drawn' | 'failed'
	indexCount: number
	diagnostics: DiagnosticsEntry[]
}

export interface RendererReport {
	draws?: Record<string, ProgramDrawReport>
	reportVersion: string
	rendererVersion: string
	status: 'ok' | 'partial' | 'failed'
	backend: GlBackendReport
	programs: Record<string, ProgramCompileReport>
	capture: CaptureReport | null
	assembled?: CaptureReport | null
	timings: RendererTimingsReport
	diagnostics: DiagnosticsEntry[]
	contractVersion: string
}

export type UnsupportedReason =
	| 'no-referece-corpus'
	| 'unknown-lighting-model'
	| 'unresolved-hook-mapping'
	| 'unresolved-map-ref'
	| 'missing-binary-payload'
	| 'missing-scene-formats'
	| 'animation-not-verified'

export interface UnsupportedMark {
	reason: UnsupportedReason
	context: string
	detail?: string
}

export interface MaterialMapPlan {
	slot: McmtlMapSlot
	textureIndex: number | null
	uniform: string | null
	channel: number | null
	channelProvenance: string | null
}

export interface MaterialUniformPlan {
	name: string
	values: number[]
	key: string
}

export interface MaterialProgramPlan {
	material: string
	lightingModel: McmtlLightingModel
	defines: string[]
	unrollValues: { [name: string]: number }
	numMaps: number
	maps: MaterialMapPlan[]
	uniformValues: MaterialUniformPlan[]
	renderState: MaterialIr['renderState']
	hooks: string[]
	unverifiable: string[]
	unsupported: UnsupportedMark[]
	status: 'planned' | 'unsupported'
	diagnostics: DiagnosticsEntry[]
}

export interface DrawTextureBinding {
	uniform: string
	textureIndex: number | null
	channel: number | null
	channelProvenance: string | null
	file: string | null
	width: number | null
	height: number | null
	rgbaFormat: 'rgba8' | null
	decoded: boolean
}

export interface DrawUniformValue {
	name: string
	type: 'float' | 'int' | 'vec3' | 'vec4'
	values: number[]
}

export interface CatalogDrawRecord {
	program: string
	itemConfigPath: string
	itemId: number | null
	meshIndex: number
	mesh: string
	material: string
	meshFile: string
	indicesFile: string
	interleavedStride: number
	interleavedFloats: number
	vertexCount: number
	indexCount: number
	indexType: 'u16' | 'u32'
	uvs: boolean
	textures: DrawTextureBinding[]
	uniformValues: DrawUniformValue[]
	quantizationScale: [number, number, number, number]
	viewMatrix: number[]
	backViewMatrix?: number[]
	projectionMatrix: number[]
	cameraPolicy: 'neutral'
	tangentProvenance: 'computed' | 'absent'
	diagnostics: DiagnosticsEntry[]
}

export interface CatalogDrawsBuild {
	draws: CatalogDrawRecord[]
	diagnostics: DiagnosticsEntry[]
	files: { path: string; bytes: number }[]
}
