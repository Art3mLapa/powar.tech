import { BinaryReader } from './binary'
export type StreamSlot =
	| 'positions'
	| 'uv'
	| 'normals'
	| 'skinning'
	| 'vertexColors'
	| 'indices'
	| 'unknown'
export type StreamComponent = {
	width: 1 | 2 | 4
	kind: 'i8' | 'u8' | 'i16' | 'u16' | 'u32'
}
export type McsaStream = {
	slot: StreamSlot
	count: number
	perVertex: number
	component: StreamComponent | null
	data: Buffer
	interpreted: boolean
	mapping: number[] | null
	packed?: 'ids-then-weights' | 'id-weight-interleaved'
}
export interface McsaMeshStreams {
	name: string
	material: string
	vertices: number
	polygons: number
	header: { unknownByte: number | null; unknownFloats: number[] }
	streams: McsaStream[]
}
export type McsaClipRecord = {
	name: string
	frames: number
	rateRaw: number
	raw: Buffer | null
}
export type McsaSkeletonBone = {
	name: string
	parent: number
	positionRaw: number[]
	rotationRaw: number[]
	convention: 'unknown-euler'
}
export interface ModelStreamsResult {
	signature: 'MCSA'
	version: number
	flags: boolean[]
	flagCount: number
	positionScale: number
	uvScale: number | null
	extraScale: number | null
	meshes: McsaMeshStreams[]
	skeleton: McsaSkeletonBone[] | null
	clips: McsaClipRecord[]
	trailing: Buffer | null
}
export type PayloadClass = {
	class: 'mcsb-wrapper' | 'mcsa' | 'unknown'
	signatureHex: string | null
	version: number | null
	reason: string
}
const signatures = Buffer.from('MCSA')
export function classifyModelPayload(input: Buffer): PayloadClass {
	if (input.length < 8)
		return {
			class: 'unknown',
			signatureHex: input
				.subarray(0, input.length)
				.toString('hex')
				.slice(0, 32),
			version: null,
			reason: 'payload smaller than MCSA header',
		}
	const versionAt = (offset: number) =>
		new BinaryReader(input.subarray(offset + 4), true).f32()
	if (input.subarray(0, 4).equals(signatures))
		return {
			class: 'mcsa',
			signatureHex: '4D435341',
			version: versionAt(0),
			reason: 'MCSA header at offset 0',
		}
	const declared = new BinaryReader(input.subarray(0, 4)).i32()
	if (declared >= 0 && declared <= input.length - 4 - 32) {
		const offset = 4 + declared
		if (input.subarray(offset, offset + 4).equals(signatures)) {
			const version = versionAt(offset)
			return {
				class: 'mcsb-wrapper',
				signatureHex: '4D435341',
				version,
				reason:
					declared === 0
						? 'empty runtime wrapper: 4 zero bytes precede the MCSA header; wrapper payload is retained by decoders'
						: `runtime container: ${declared}-byte metadata block precedes the MCSA header; wrapper payload is retained by decoders`,
			}
		}
	}
	return {
		class: 'unknown',
		signatureHex: input.subarray(0, 8).toString('hex').slice(0, 32),
		version: null,
		reason: 'MCSA signature not at offset 0; size-prefixed wrapper block without MCSA tail; extension must not override payload classification',
	}
}
export function decodeModelStreams(
	input: Buffer,
	extension?: string
): ModelStreamsResult {
	void extension
	const r = new BinaryReader(input, true)
	if (input.subarray(4, 8).equals(signatures)) {
		const size = new BinaryReader(r.bytes(4)).i32()
		r.bytes(size)
	} else {
		const declared = new BinaryReader(input.subarray(0, 4)).i32()
		if (
			declared >= 0 &&
			declared <= input.length - 4 - 32 &&
			input.subarray(4 + declared, 8 + declared).equals(signatures)
		)
			r.bytes(4 + declared)
	}
	const magic = r.bytes(4).toString()
	if (magic !== 'MCSA') throw new Error('Invalid MCSA model signature')
	const version = r.f32()
	const flagsCount: Record<number, number> = {
		7: 4,
		8: 5,
		10: 6,
		11: 6,
		12: 6,
	}
	const flagCount = flagsCount[version]
	if (!flagCount) throw new Error(`Unsupported MCSA version ${version}`)
	const flags = Array.from({ length: flagCount }, () => r.u8() !== 0)
	const positionScale = r.f32()
	const uvScale = flags[1] ? r.f32() : null
	const extraScale = flags[2] && version >= 10 ? r.f32() : null
	const result: ModelStreamsResult = {
		signature: 'MCSA',
		version,
		flags,
		flagCount,
		positionScale,
		uvScale,
		extraScale,
		meshes: [],
		skeleton: null,
		clips: [],
		trailing: null,
	}
	const meshCount = r.count(10000),
		totalVertices = { value: 0 }
	for (let m = 0; m < meshCount; m++) {
		const name = r.string(),
			material = r.string()
		let links = 0
		const mapping: number[] = []
		if (flags[0]) {
			links = r.u8()
			const bones = r.u8()
			for (let i = 0; i < bones; i++) mapping.push(r.u8())
			if (links > 4) throw new Error('Invalid bone links')
		}
		const vertices = r.count()
		totalVertices.value += vertices
		if (totalVertices.value > 5_000_000) throw new Error('Model too large')
		if (version >= 12) r.u8()
		const polygons = r.count()
		if (flags[1]) r.f32()
		const unknownFloats: number[] = []
		if (version >= 10)
			for (let i = 0; i < 6; i++) unknownFloats.push(r.f32())
		if (version >= 11) unknownFloats.push(r.f32())
		const streams: McsaStream[] = []
		streams.push({
			slot: 'positions',
			count: vertices,
			perVertex: 4,
			component: { width: 2, kind: 'i16' },
			data: r.bytes(vertices * 4 * 2),
			interpreted: true,
			mapping: null,
		})
		if (flags[1])
			streams.push({
				slot: 'uv',
				count: vertices,
				perVertex: 2,
				component: { width: 2, kind: 'i16' },
				data: r.bytes(vertices * 2 * 2),
				interpreted: true,
				mapping: null,
			})
		if (flags[4])
			streams.push({
				slot: 'unknown',
				count: vertices,
				perVertex: 4,
				component: null,
				data: r.bytes(vertices * 4),
				interpreted: false,
				mapping: null,
			})
		if (flags[2])
			streams.push({
				slot: 'normals',
				count: vertices,
				perVertex: 4,
				component: { width: 1, kind: 'i8' },
				data: r.bytes(vertices * 4),
				interpreted: true,
				mapping: null,
			})
		if (flags[3])
			streams.push({
				slot: 'unknown',
				count: vertices,
				perVertex: 4,
				component: null,
				data: r.bytes(vertices * 4),
				interpreted: false,
				mapping: null,
			})
		if (flags[0] && links) {
			const count = vertices * (links <= 2 ? 4 : 8),
				skin = r.bytes(count)
			streams.push({
				slot: 'skinning',
				count: vertices,
				perVertex: links <= 2 ? 4 : 8,
				component: { width: 1, kind: 'u8' },
				data: skin,
				interpreted: true,
				mapping,
				packed:
					links <= 2 ? 'id-weight-interleaved' : 'ids-then-weights',
			})
		}
		if (flags[5])
			streams.push({
				slot: 'vertexColors',
				count: vertices,
				perVertex: 4,
				component: null,
				data: r.bytes(vertices * 4),
				interpreted: false,
				mapping: null,
			})
		const width = polygons * 3 <= 65535 ? 2 : 4
		streams.push({
			slot: 'indices',
			count: polygons * 3,
			perVertex: 1,
			component: {
				width: width as 2 | 4,
				kind: width === 2 ? 'u16' : 'u32',
			},
			data: r.bytes(polygons * 3 * width),
			interpreted: true,
			mapping: null,
		})
		result.meshes.push({
			name,
			material,
			vertices,
			polygons,
			header: { unknownByte: version >= 12 ? 1 : null, unknownFloats },
			streams,
		})
	}
	if (flags[0]) {
		const count = r.u8(),
			bones: McsaSkeletonBone[] = []
		for (let i = 0; i < count; i++) {
			const name = r.string(),
				parent = r.u8(),
				position = Array.from({ length: 3 }, () => r.f32()),
				rotation = Array.from({ length: 3 }, () => r.f32())
			if (parent >= count) throw new Error('Invalid bone parent')
			bones.push({
				name,
				parent: parent === i ? -1 : parent,
				positionRaw: position,
				rotationRaw: rotation,
				convention: 'unknown-euler',
			})
		}
		for (let i = 0; i < count; i++) {
			const seen = new Set<number>()
			let id = i
			while (id >= 0) {
				if (seen.has(id)) throw new Error('Cyclic model skeleton')
				seen.add(id)
				id = bones[id].parent
			}
		}
		result.skeleton = bones
		if (r.offset < input.length) {
			const clipStart = r.offset
			const clips = r.u32()
			if (clips > 1000) {
				result.trailing = input.subarray(clipStart)
				return result
			}
			let total = 0
			for (let i = 0; i < clips; i++) {
				const name = r.string(),
					frames = r.count(1_000_000),
					rate = r.f32(),
					size = frames * count * 7
				total += size
				if (total > 20_000_000 || rate < 0)
					throw new Error('Animation resource limit')
				result.clips.push({
					name,
					frames,
					rateRaw: rate,
					raw: size ? r.bytes(size * 2) : Buffer.alloc(0),
				})
			}
		}
	}
	if (r.offset < input.length) result.trailing = input.subarray(r.offset)
	return result
}
