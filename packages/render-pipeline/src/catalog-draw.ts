import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { decodeModelStreams } from '@bscp/game-assets/mcsa'
import { decodeOl, textureRgba } from '@bscp/game-assets/textures'
import type {
	CatalogDrawRecord,
	DiagnosticsEntry,
	DrawTextureBinding,
	DrawUniformValue,
} from '@bscp/render-contracts'
import type { CatalogScenePlan } from './catalog-plan'
import { readEntry, type SourceIndex } from './source-set'

export const DRAW_BUFFER_FLOATS_PER_VERTEX = 14

const CAMERA_FIELD_OF_VIEW_DEGREES = 40
const CAMERA_DISTANCE_FACTOR = 2.8
const CAMERA_EYE_DIRECTION: [number, number, number] = [0.71, 0.58, 0.71]
const CAMERA_UP: [number, number, number] = [0, 1, 0]

interface CatalogRgbaTexture {
	width: number
	height: number
	rgba: Buffer
}

export interface DecodedDrawMesh {
	name: string
	material: string
	vertices: number
	polygons: number
	positions: Float32Array
	normals: Float32Array
	uvsPresent: boolean
	uvs: Float32Array
	indices: Uint32Array
	indexType: 'u16' | 'u32'
	positionScale: number
	uvScale: number | null
}

export function neutralCamera(positions: Float32Array): {
	viewMatrix: number[]
	backViewMatrix: number[]
	projectionMatrix: number[]
	radius: number
	center: [number, number, number]
} {
	let minX = Infinity
	let minY = Infinity
	let minZ = Infinity
	let maxX = -Infinity
	let maxY = -Infinity
	let maxZ = -Infinity
	for (let i = 0; i < positions.length; i += 4) {
		minX = Math.min(minX, positions[i])
		maxX = Math.max(maxX, positions[i])
		minY = Math.min(minY, positions[i + 1])
		maxY = Math.max(maxY, positions[i + 1])
		minZ = Math.min(minZ, positions[i + 2])
		maxZ = Math.max(maxZ, positions[i + 2])
	}
	if (!Number.isFinite(minX)) minX = minY = minZ = 0
	if (!Number.isFinite(maxX)) maxX = maxY = maxZ = 0
	const center: [number, number, number] = [
		(minX + maxX) / 2,
		(minY + maxY) / 2,
		(minZ + maxZ) / 2,
	]
	const extentX = maxX - minX
	const extentY = maxY - minY
	const extentZ = maxZ - minZ
	const radius = Math.max(Math.hypot(extentX, extentY, extentZ) / 2, 1e-6)
	const distance = radius * CAMERA_DISTANCE_FACTOR
	const makeViewMatrix = (direction: [number, number, number]): number[] => {
		const eye: [number, number, number] = [
			center[0] + direction[0] * distance,
			center[1] + direction[1] * distance,
			center[2] + direction[2] * distance,
		]
		const zx = eye[0] - center[0]
		const zy = eye[1] - center[1]
		const zz = eye[2] - center[2]
		const zLength = Math.hypot(zx, zy, zz) || 1
		const z0 = zx / zLength
		const z1 = zy / zLength
		const z2 = zz / zLength
		let x0 = CAMERA_UP[1] * z2 - CAMERA_UP[2] * z1
		let x1 = CAMERA_UP[2] * z0 - CAMERA_UP[0] * z2
		let x2 = CAMERA_UP[0] * z1 - CAMERA_UP[1] * z0
		const xLength = Math.hypot(x0, x1, x2) || 1
		x0 /= xLength
		x1 /= xLength
		x2 /= xLength
		const y0 = z1 * x2 - z2 * x1
		const y1 = z2 * x0 - z0 * x2
		const y2 = z0 * x1 - z1 * x0
		return [
			x0,
			y0,
			z0,
			0,
			x1,
			y1,
			z1,
			0,
			x2,
			y2,
			z2,
			0,
			-(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]),
			-(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]),
			-(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]),
			1,
		]
	}
	const viewMatrix = makeViewMatrix(CAMERA_EYE_DIRECTION)
	const backViewMatrix = makeViewMatrix([
		-CAMERA_EYE_DIRECTION[0],
		CAMERA_EYE_DIRECTION[1],
		-CAMERA_EYE_DIRECTION[2],
	])
	const focus = 1 / Math.tan((CAMERA_FIELD_OF_VIEW_DEGREES * Math.PI) / 360)
	const near = Math.max(distance / 64, 0.01)
	const far = distance * 64
	const invRange = 1 / (near - far)
	const projectionMatrix = [
		focus,
		0,
		0,
		0,
		0,
		focus,
		0,
		0,
		0,
		0,
		(far + near) * invRange,
		-1,
		0,
		0,
		2 * far * near * invRange,
		0,
	]
	return { viewMatrix, backViewMatrix, projectionMatrix, radius, center }
}

export function tangentBasis(
	positions: Float32Array,
	normals: Float32Array,
	uvs: Float32Array,
	uvsPresent: boolean,
	indices: Uint32Array,
	vertexCount: number
): Float32Array {
	const tangents = new Float32Array(vertexCount * 4)
	for (let triangle = 0; triangle + 2 < indices.length; triangle += 3) {
		const a = indices[triangle]
		const b = indices[triangle + 1]
		const c = indices[triangle + 2]
		if (a >= vertexCount || b >= vertexCount || c >= vertexCount) continue
		if (a === b || b === c || a === c) continue
		const e1 = [
			positions[b * 4] - positions[a * 4],
			positions[b * 4 + 1] - positions[a * 4 + 1],
			positions[b * 4 + 2] - positions[a * 4 + 2],
		]
		const e2 = [
			positions[c * 4] - positions[a * 4],
			positions[c * 4 + 1] - positions[a * 4 + 1],
			positions[c * 4 + 2] - positions[a * 4 + 2],
		]
		const uv = (vertex: number, component: number) =>
			uvsPresent && vertex * 2 + component < uvs.length
				? uvs[vertex * 2 + component]
				: 0
		const du1 = uv(b, 0) - uv(a, 0)
		const dv1 = uv(b, 1) - uv(a, 1)
		const du2 = uv(c, 0) - uv(a, 0)
		const dv2 = uv(c, 1) - uv(a, 1)
		const denominator = du1 * dv2 - du2 * dv1
		const seed =
			Math.abs(denominator) < 1e-9
				? [e1[0], e1[1], e1[2]]
				: [
						(dv2 * e1[0] - dv1 * e2[0]) / denominator,
						(dv2 * e1[1] - dv1 * e2[1]) / denominator,
						(dv2 * e1[2] - dv1 * e2[2]) / denominator,
					]
		const bitangentSeed =
			Math.abs(denominator) < 1e-9
				? [e2[0], e2[1], e2[2]]
				: [
						(-du2 * e1[0] + du1 * e2[0]) / denominator,
						(-du2 * e1[1] + du1 * e2[1]) / denominator,
						(-du2 * e1[2] + du1 * e2[2]) / denominator,
					]
		const seedLength = Math.hypot(seed[0], seed[1], seed[2])
		if (seedLength < 1e-9) {
			tangents[a * 4] = 1
			tangents[b * 4] = 1
			tangents[c * 4] = 1
			continue
		}
		let tx = seed[0] / seedLength
		let ty = seed[1] / seedLength
		let tz = seed[2] / seedLength
		const normalLength = Math.hypot(
			normals[a * 4],
			normals[a * 4 + 1],
			normals[a * 4 + 2]
		)
		let nx = 0
		let ny = 0
		let nz = 0
		if (normalLength >= 1e-9) {
			nx = normals[a * 4] / normalLength
			ny = normals[a * 4 + 1] / normalLength
			nz = normals[a * 4 + 2] / normalLength
			const dot = tx * nx + ty * ny + tz * nz
			tx -= dot * nx
			ty -= dot * ny
			tz -= dot * nz
			const orthogonalLength = Math.hypot(tx, ty, tz)
			if (orthogonalLength < 1e-9) {
				tx = 1
				ty = 0
				tz = 0
			} else {
				tx /= orthogonalLength
				ty /= orthogonalLength
				tz /= orthogonalLength
			}
		} else {
			tx = 1
			ty = 0
			tz = 0
		}
		const bitangentZ = ny * tz - nz * ty
		const handedness =
			bitangentSeed[0] * (ny * tz - nz * ty) +
				bitangentSeed[1] * (nz * tx - nx * tz) +
				bitangentSeed[2] * (nx * ty - ny * tx) >=
			0
				? 1
				: -1
		for (const vertex of [a, b, c]) {
			tangents[vertex * 4] = handedness * tx
			tangents[vertex * 4 + 1] = handedness * ty
			tangents[vertex * 4 + 2] = handedness * tz
			tangents[vertex * 4 + 3] = handedness * bitangentZ
		}
	}
	return tangents
}

export function decodeDrawMesh(data: Buffer): DecodedDrawMesh | null {
	const decoded = decodeModelStreams(data, '.mcsb')
	const mesh = decoded.meshes[0]
	if (!mesh) return null
	const streams = new Map(mesh.streams.map((stream) => [stream.slot, stream]))
	const positionStream = streams.get('positions')
	const normalStream = streams.get('normals')
	const uvStream = streams.get('uv')
	const indexStream = streams.get('indices')
	if (!positionStream || !indexStream) return null
	const positions = new Float32Array(mesh.vertices * 4)
	const normals = new Float32Array(mesh.vertices * 4)
	const uvs = new Float32Array(mesh.vertices * 2)
	for (let i = 0; i < mesh.vertices; i++) {
		for (let c = 0; c < 4; c++) {
			positions[i * 4 + c] = positionStream.data.readInt16LE(
				(i * 4 + c) * 2
			)
			if (normalStream)
				normals[i * 4 + c] = normalStream.data.readInt8(i * 4 + c)
		}
		if (uvStream) {
			uvs[i * 2] = uvStream.data.readInt16LE(i * 4)
			uvs[i * 2 + 1] = uvStream.data.readInt16LE(i * 4 + 2)
		}
	}
	const indexCount = mesh.polygons * 3
	const indices = new Uint32Array(indexCount)
	const indexType: 'u16' | 'u32' =
		indexStream.component?.width === 4 ? 'u32' : 'u16'
	for (let i = 0; i < indexCount; i++) {
		indices[i] =
			indexType === 'u32'
				? indexStream.data.readUInt32LE(i * 4)
				: indexStream.data.readUInt16LE(i * 2)
	}
	return {
		name: mesh.name,
		material: mesh.material,
		vertices: mesh.vertices,
		polygons: mesh.polygons,
		positions,
		normals,
		uvsPresent: Boolean(uvStream),
		uvs,
		indices,
		indexType,
		positionScale: decoded.positionScale,
		uvScale: decoded.uvScale,
	}
}

export function interleaveDrawMesh(
	mesh: DecodedDrawMesh,
	tangents: Float32Array
): Float32Array {
	const stride = DRAW_BUFFER_FLOATS_PER_VERTEX
	const interleaved = new Float32Array(mesh.vertices * stride)
	for (let i = 0; i < mesh.vertices; i++) {
		const base = i * stride
		for (let c = 0; c < 4; c++)
			interleaved[base + c] = mesh.positions[i * 4 + c]
		for (let c = 0; c < 4; c++)
			interleaved[base + 4 + c] = mesh.normals[i * 4 + c]
		for (let c = 0; c < 4; c++)
			interleaved[base + 8 + c] = tangents[i * 4 + c]
		interleaved[base + 12] = mesh.uvs[i * 2]
		interleaved[base + 13] = mesh.uvs[i * 2 + 1]
	}
	return interleaved
}

export function decodeOlTexture(data: Buffer): CatalogRgbaTexture | null {
	try {
		const texture = decodeOl(data)
		const rgba = textureRgba(texture)
		if (!rgba || rgba.length === 0) return null
		return {
			width: texture.width,
			height: texture.height,
			rgba: Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength),
		}
	} catch {
		return null
	}
}

export function neutralUniforms(
	values: {
		name: string
		values: number[]
	}[]
): DrawUniformValue[] {
	const typed = values.map((entry): DrawUniformValue => {
		const type: DrawUniformValue['type'] =
			entry.values.length >= 4
				? 'vec4'
				: entry.values.length === 3
					? 'vec3'
					: 'float'
		return { name: entry.name, type, values: entry.values }
	})
	const has = (name: string) => typed.some((entry) => entry.name === name)
	const add = (
		name: string,
		type: DrawUniformValue['type'],
		values: number[]
	) => {
		if (!has(name)) typed.push({ name, type, values })
	}
	add('diffuseColor', 'vec3', [1, 1, 1])
	add('emissionColor', 'vec3', [0, 0, 0])
	add('specularColor', 'vec3', [0.5, 0.5, 0.5])
	add('specularExponent', 'float', [1])
	add('alphaFactor', 'float', [1])
	add('burnFactor', 'float', [0])
	add('g_LightSunDir', 'vec3', [0.577, 0.577, 0.577])
	add('g_LightSunColor', 'vec3', [1, 1, 1])
	add('g_LightExposure', 'float', [1])
	add('g_LightSkyObjectNoShadow', 'float', [1])
	return typed
}

export interface CatalogDrawOptions {
	bundleDir: string
	lightingModels: string[]
	spikeProgram: string
}

export interface CatalogDrawsBuild {
	draws: CatalogDrawRecord[]
	diagnostics: DiagnosticsEntry[]
	files: { path: string; bytes: number }[]
}

export async function writeCatalogDraws(
	index: SourceIndex,
	scene: CatalogScenePlan,
	options: CatalogDrawOptions
): Promise<CatalogDrawsBuild> {
	const diagnostics: DiagnosticsEntry[] = []
	const files: { path: string; bytes: number }[] = []
	const draws: CatalogDrawRecord[] = []
	await mkdir(join(options.bundleDir, 'draws'), { recursive: true })
	const modelEntry = index.caseInsensitive.get(
		scene.primary.path.toLowerCase()
	)?.[0]
	if (!modelEntry) {
		diagnostics.push({
			severity: 'error',
			code: 'draws.model-unreadable',
			message: `primary model ${scene.primary.path} is not indexed; draws skipped`,
			source: scene.configPath,
		})
		return { draws, diagnostics, files }
	}
	const payload = await readEntry(modelEntry)
	const model = decodeModelStreams(payload, '.mcsb')
	const allPositions: number[] = []
	for (const mesh of model.meshes) {
		const positionStream = mesh.streams.find(
			(stream) => stream.slot === 'positions'
		)
		if (!positionStream) continue
		const cameraScale = model.positionScale / 32767
		for (let i = 0; i < mesh.vertices * 4; i++)
			allPositions.push(
				positionStream.data.readInt16LE(i * 2) * cameraScale
			)
	}
	const camera = neutralCamera(Float32Array.from(allPositions))
	const textureCache = new Map<string, CatalogRgbaTexture | null>()
	for (const [meshIndex, mesh] of model.meshes.entries()) {
		const program = scene.programs.find(
			(candidate) =>
				candidate.material.toLowerCase() === mesh.material.toLowerCase()
		)
		if (program?.status !== 'planned') {
			diagnostics.push({
				severity: 'info',
				code: 'draws.mesh-skipped',
				message: `mesh ${meshIndex} (${mesh.name}) material ${mesh.material} has no planned program; skipped`,
				source: modelEntry.path,
			})
			continue
		}
		if (!options.lightingModels.includes(program.lightingModel)) {
			diagnostics.push({
				severity: 'info',
				code: 'draws.mesh-skipped',
				message: `mesh ${meshIndex} (${mesh.name}) material ${mesh.material} lighting model ${program.lightingModel} is not among ${options.lightingModels.join('/')}; skipped`,
				source: modelEntry.path,
			})
			continue
		}
		const positionStream = mesh.streams.find(
			(stream) => stream.slot === 'positions'
		)
		const normalStream = mesh.streams.find(
			(stream) => stream.slot === 'normals'
		)
		const uvStream = mesh.streams.find((stream) => stream.slot === 'uv')
		const indexStream = mesh.streams.find(
			(stream) => stream.slot === 'indices'
		)
		if (!positionStream || !indexStream) continue
		const decodedMesh: DecodedDrawMesh = {
			name: mesh.name,
			material: mesh.material,
			vertices: mesh.vertices,
			polygons: mesh.polygons,
			positions: new Float32Array(mesh.vertices * 4),
			normals: new Float32Array(mesh.vertices * 4),
			uvsPresent: Boolean(uvStream),
			uvs: new Float32Array(mesh.vertices * 2),
			indices: new Uint32Array(mesh.polygons * 3),
			indexType: indexStream.component?.width === 4 ? 'u32' : 'u16',
			positionScale: model.positionScale,
			uvScale: model.uvScale,
		}
		for (let i = 0; i < mesh.vertices; i++) {
			for (let c = 0; c < 4; c++) {
				decodedMesh.positions[i * 4 + c] =
					positionStream.data.readInt16LE((i * 4 + c) * 2)
				if (normalStream)
					decodedMesh.normals[i * 4 + c] = normalStream.data.readInt8(
						i * 4 + c
					)
			}
			if (uvStream) {
				decodedMesh.uvs[i * 2] = uvStream.data.readInt16LE(i * 4)
				decodedMesh.uvs[i * 2 + 1] = uvStream.data.readInt16LE(
					i * 4 + 2
				)
			}
		}
		for (let i = 0; i < decodedMesh.indices.length; i++) {
			decodedMesh.indices[i] =
				decodedMesh.indexType === 'u32'
					? indexStream.data.readUInt32LE(i * 4)
					: indexStream.data.readUInt16LE(i * 2)
		}
		const tangents = tangentBasis(
			decodedMesh.positions,
			decodedMesh.normals,
			decodedMesh.uvs,
			decodedMesh.uvsPresent,
			decodedMesh.indices,
			decodedMesh.vertices
		)
		const interleaved = interleaveDrawMesh(decodedMesh, tangents)
		const slug = `draw-${String(draws.length).padStart(4, '0')}-${mesh.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
		const meshFile = `draws/${slug}.mesh`
		const meshBytes = Buffer.from(
			interleaved.buffer as ArrayBuffer,
			interleaved.byteOffset,
			interleaved.byteLength
		)
		await writeFile(join(options.bundleDir, meshFile), meshBytes)
		files.push({ path: meshFile, bytes: meshBytes.length })
		const indicesFile = `draws/${slug}.idx`
		const indicesBytes =
			decodedMesh.indexType === 'u16'
				? (indexStream.data as Buffer)
				: (() => {
						const wide = Buffer.alloc(
							decodedMesh.indices.length * 4
						)
						for (let i = 0; i < decodedMesh.indices.length; i++)
							wide.writeUInt32LE(decodedMesh.indices[i], i * 4)
						return wide
					})()
		await writeFile(join(options.bundleDir, indicesFile), indicesBytes)
		files.push({ path: indicesFile, bytes: indicesBytes.length })
		const textures: DrawTextureBinding[] = []
		for (const map of program.maps) {
			const planTexture = scene.textures.find(
				(texture) =>
					texture.material === program.material &&
					texture.slot === map.slot &&
					texture.path
			)
			const base = {
				uniform: map.uniform ?? '',
				textureIndex: map.textureIndex,
				channel: map.channel,
				channelProvenance: map.channelProvenance,
			}
			const empty = {
				file: null,
				width: null,
				height: null,
				rgbaFormat: null,
				decoded: false,
			}
			if (!planTexture?.path) {
				textures.push({ ...base, ...empty })
				continue
			}
			const cacheKey = planTexture.path.toLowerCase()
			if (!textureCache.has(cacheKey)) {
				const textureEntry = index.caseInsensitive.get(cacheKey)?.[0]
				let decodedTexture: CatalogRgbaTexture | null = null
				if (textureEntry) {
					try {
						const textureBytes = await readEntry(textureEntry)
						decodedTexture = decodeOlTexture(textureBytes)
					} catch (error) {
						diagnostics.push({
							severity: 'info',
							code: 'draws.texture-read-failed',
							message: `${planTexture.path}: ${error instanceof Error ? error.message : 'unreadable'}`,
							source: modelEntry.path,
						})
					}
				}
				if (!decodedTexture) {
					diagnostics.push({
						severity: 'info',
						code: 'draws.texture-decode-failed',
						message: `texture ${planTexture.path} is not a decodable .ol; sampler bound with a neutral placeholder`,
						source: modelEntry.path,
					})
				}
				textureCache.set(cacheKey, decodedTexture)
			}
			const rgba = textureCache.get(cacheKey)
			if (!rgba) {
				textures.push({ ...base, ...empty })
				continue
			}
			const textureFile = `draws/${slug}-tex${textures.length}.rgba`
			await writeFile(join(options.bundleDir, textureFile), rgba.rgba)
			files.push({ path: textureFile, bytes: rgba.rgba.length })
			textures.push({
				...base,
				file: textureFile,
				width: rgba.width,
				height: rgba.height,
				rgbaFormat: 'rgba8',
				decoded: true,
			})
		}
		const positionScale = decodedMesh.positionScale / 32767 || 1
		const uvScale = (decodedMesh.uvScale ?? 1) / 32767 || 1
		draws.push({
			program: options.spikeProgram,
			itemConfigPath: scene.configPath,
			itemId: scene.itemId,
			meshIndex,
			mesh: mesh.name,
			material: mesh.material,
			meshFile,
			indicesFile,
			interleavedStride: DRAW_BUFFER_FLOATS_PER_VERTEX * 4,
			interleavedFloats: DRAW_BUFFER_FLOATS_PER_VERTEX,
			vertexCount: mesh.vertices,
			indexCount: mesh.polygons * 3,
			indexType: decodedMesh.indexType,
			uvs: decodedMesh.uvsPresent,
			textures,
			uniformValues: neutralUniforms(program.uniformValues),
			quantizationScale: [positionScale, uvScale, 0, 1],
			viewMatrix: camera.viewMatrix,
			backViewMatrix: camera.backViewMatrix,
			projectionMatrix: camera.projectionMatrix,
			cameraPolicy: 'neutral',
			tangentProvenance: 'computed',
			diagnostics: [],
		})
	}
	return { draws, diagnostics, files }
}
