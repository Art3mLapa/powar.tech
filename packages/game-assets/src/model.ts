import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import { BinaryReader } from './binary'
export type ModelMesh = {
	name: string
	material: string
	positions: number[]
	uv: number[]
	normals: number[]
	indices: number[]
	joints?: number[]
	weights?: number[]
}
export type ModelBone = {
	name: string
	parent: number
	position: number[]
	rotation: number[]
}
export type ModelClip = {
	name: string
	frames: number
	rate: number
	transforms: number[]
}
export type ModelMeshes = ModelMesh[] & {
	bones?: ModelBone[]
	clips?: ModelClip[]
}
export function decodeModel(input: Buffer, extension: string): ModelMeshes {
	const r = new BinaryReader(input, true)
	if (extension.toLowerCase() === '.mcsb') {
		const size = new BinaryReader(r.bytes(4)).i32()
		r.bytes(size)
	}
	if (r.bytes(4).toString() !== 'MCSA')
		throw new Error('Invalid MCSA model signature')
	const version = r.f32(),
		flagsCount: Record<number, number> = {
			7: 4,
			8: 5,
			10: 6,
			11: 6,
			12: 6,
		},
		flagCount = flagsCount[version]
	if (!flagCount) throw new Error(`Unsupported MCSA version ${version}`)
	const flags = Array.from({ length: flagCount }, () => r.u8() !== 0),
		positionScale = r.f32(),
		uvScale = flags[1] ? r.f32() : 1
	if (flags[2] && version >= 10) r.f32()
	const meshCount = r.count(10000),
		meshes: ModelMeshes = []
	let totalVertices = 0
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
		totalVertices += vertices
		if (totalVertices > 5_000_000) throw new Error('Model too large')
		if (version >= 12) r.u8()
		const polygons = r.count()
		if (flags[1]) r.f32()
		if (version >= 10) for (let i = 0; i < 6; i++) r.f32()
		if (version >= 11) r.f32()
		const positions: number[] = [],
			uv: number[] = [],
			normals: number[] = [],
			indices: number[] = [],
			joints: number[] = [],
			weights: number[] = []
		for (let i = 0; i < vertices; i++)
			for (let j = 0; j < 4; j++) {
				const n = (r.i16() * positionScale) / 32767
				if (j < 3) positions.push(n)
			}
		if (flags[1])
			for (let i = 0; i < vertices * 2; i++)
				uv.push((r.i16() * uvScale) / 32767)
		if (flags[4]) r.bytes(vertices * 4)
		if (flags[2])
			for (let i = 0; i < vertices; i++)
				for (let j = 0; j < 4; j++) {
					const n = r.i8() / 127
					if (j < 3) normals.push(n)
				}
		if (flags[3]) r.bytes(vertices * 4)
		if (flags[0] && links) {
			const ids: number[] = [],
				rawWeights: number[] = []
			if (links <= 2)
				for (let i = 0; i < vertices; i++) {
					ids.push(r.u8(), r.u8(), 0, 0)
					rawWeights.push(r.u8(), r.u8(), 0, 0)
				}
			else {
				for (let i = 0; i < vertices * 4; i++) ids.push(r.u8())
				for (let i = 0; i < vertices * 4; i++) rawWeights.push(r.u8())
			}
			for (let i = 0; i < ids.length; i++) {
				if (rawWeights[i] && mapping[ids[i]] === undefined)
					throw new Error('Invalid local bone index')
				joints.push(rawWeights[i] ? mapping[ids[i]] : 0)
				weights.push(rawWeights[i] / 255)
			}
		}
		if (flags[5]) r.bytes(vertices * 4)
		for (let i = 0; i < polygons * 3; i++) {
			const index = polygons * 3 <= 65535 ? r.u16() : r.u32()
			if (index >= vertices) throw new Error('Invalid vertex index')
			indices.push(index)
		}
		meshes.push({
			name,
			material,
			positions,
			uv,
			normals,
			indices,
			...(joints.length ? { joints, weights } : {}),
		})
	}
	if (flags[0]) {
		const count = r.u8(),
			bones: ModelBone[] = []
		for (let i = 0; i < count; i++) {
			const name = r.string(),
				parent = r.u8(),
				position = Array.from({ length: 3 }, () => r.f32()),
				rotation = Array.from({ length: 3 }, () => r.f32())
			if (parent >= count) throw new Error('Invalid bone parent')
			bones.push({
				name,
				parent: parent === i ? -1 : parent,
				position,
				rotation,
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
		for (const mesh of meshes)
			if (mesh.joints?.some((j) => j >= count))
				throw new Error('Invalid skeleton joint')
		meshes.bones = bones
		meshes.clips = []
		if (r.offset < input.length) {
			const clips = r.count(1000)
			let total = 0
			for (let i = 0; i < clips; i++) {
				const name = r.string(),
					frames = r.count(1_000_000),
					rate = r.f32(),
					size = frames * count * 7
				total += size
				if (total > 20_000_000 || rate < 0)
					throw new Error('Animation resource limit')
				const transforms = Array.from(
					{ length: size },
					() => r.i16() / 32767
				)
				meshes.clips.push({ name, frames, rate, transforms })
			}
		}
	}
	if (r.offset !== input.length)
		throw new Error('Unexpected model trailing data')
	return meshes
}
export function modelToGlb(meshes: ModelMeshes): Buffer {
	const chunks: Buffer[] = [],
		views: { buffer: number; byteOffset: number; byteLength: number }[] =
			[],
		accessors: Record<string, unknown>[] = [],
		nodes: Record<string, unknown>[] = [],
		gltfMeshes: Record<string, unknown>[] = [],
		sceneNodes: number[] = []
	let byteOffset = 0
	function attribute(
		data: number[],
		components: number,
		componentType = 5126,
		bounds = false
	) {
		const array =
				componentType === 5125
					? new Uint32Array(data)
					: componentType === 5123
						? new Uint16Array(data)
						: new Float32Array(data),
			bytes = Buffer.from(array.buffer)
		if (data.length % components || data.some((n) => !Number.isFinite(n)))
			throw new Error('Invalid model attribute')
		const padding = (4 - (byteOffset % 4)) % 4
		if (padding) {
			chunks.push(Buffer.alloc(padding))
			byteOffset += padding
		}
		const view = views.length
		views.push({ buffer: 0, byteOffset, byteLength: bytes.length })
		chunks.push(bytes)
		byteOffset += bytes.length
		const accessor: Record<string, unknown> = {
			bufferView: view,
			componentType,
			count: data.length / components,
			type:
				components === 1
					? 'SCALAR'
					: components === 2
						? 'VEC2'
						: components === 3
							? 'VEC3'
							: components === 4
								? 'VEC4'
								: 'MAT4',
		}
		if (bounds) {
			accessor.min = Array.from({ length: components }, (_, i) => {
				let value = Infinity
				for (let j = i; j < data.length; j += components)
					value = Math.min(value, data[j])
				return value
			})
			accessor.max = Array.from({ length: components }, (_, i) => {
				let value = -Infinity
				for (let j = i; j < data.length; j += components)
					value = Math.max(value, data[j])
				return value
			})
		}
		accessors.push(accessor)
		return accessors.length - 1
	}
	const materials: { name: string }[] = [],
		bones = meshes.bones ?? [],
		clips = meshes.clips ?? []
	for (const mesh of meshes) {
		if (!mesh.positions.length || !mesh.indices.length) continue
		const attrs: Record<string, number> = {
			POSITION: attribute(mesh.positions, 3, 5126, true),
		}
		if (mesh.uv.length) attrs.TEXCOORD_0 = attribute(mesh.uv, 2)
		if (mesh.normals.length) attrs.NORMAL = attribute(mesh.normals, 3)
		const node: Record<string, unknown> = {
			name: mesh.name,
			mesh: gltfMeshes.length,
		}
		if (bones.length && mesh.joints?.length && mesh.weights?.length) {
			attrs.JOINTS_0 = attribute(mesh.joints, 4, 5123)
			attrs.WEIGHTS_0 = attribute(mesh.weights, 4)
			node.skin = 0
		}
		const material = materials.length
		materials.push({ name: mesh.material })
		sceneNodes.push(nodes.length)
		nodes.push(node)
		gltfMeshes.push({
			name: mesh.name,
			primitives: [
				{
					attributes: attrs,
					indices: attribute(mesh.indices, 1, 5125),
					material,
				},
			],
		})
	}
	if (!nodes.length) throw new Error('No mesh geometry')
	const document: Record<string, unknown> = {
		asset: { version: '2.0', generator: 'bscp-game-assets' },
		scene: 0,
		scenes: [{ nodes: sceneNodes }],
		nodes,
		meshes: gltfMeshes,
		materials,
		bufferViews: views,
		accessors,
		buffers: [{ byteLength: 0 }],
	}
	if (bones.length) {
		const base = nodes.length,
			localPositions = bones.map((b) =>
				b.position.map(
					(n, i) =>
						n - (b.parent < 0 ? 0 : bones[b.parent].position[i])
				)
			),
			localMatrices: Matrix4[] = [],
			globals: Matrix4[] = []
		for (const [boneId, bone] of bones.entries()) {
			const rotation = new Quaternion().setFromEuler(
					new Euler(
						...(bone.rotation.map((n) => (n * Math.PI) / 180) as [
							number,
							number,
							number,
						]),
						'ZYX'
					)
				),
				translation = localPositions[boneId]
			localMatrices.push(
				new Matrix4().compose(
					new Vector3(...(translation as [number, number, number])),
					rotation,
					new Vector3(1, 1, 1)
				)
			)
			const children = bones.flatMap((b, i) =>
				b.parent === boneId ? [base + i] : []
			)
			nodes.push({
				name: bone.name,
				translation,
				rotation: rotation.toArray(),
				...(children.length ? { children } : {}),
			})
			if (bone.parent < 0) sceneNodes.push(base + boneId)
		}
		const global = (i: number): Matrix4 => {
			const cached = globals[i]
			if (cached) return cached
			const value =
				bones[i].parent < 0
					? localMatrices[i].clone()
					: global(bones[i].parent).clone().multiply(localMatrices[i])
			globals[i] = value
			return value
		}
		document.skins = [
			{
				name: 'Armature',
				joints: bones.map((_, i) => base + i),
				inverseBindMatrices: attribute(
					bones.flatMap((_, i) =>
						Array.from(global(i).clone().invert().elements)
					),
					16
				),
			},
		]
		document.animations = clips
			.filter((c) => c.frames > 0)
			.map((clip) => {
				const times = attribute(
						Array.from(
							{ length: clip.frames },
							(_, i) => i * clip.rate
						),
						1,
						5126,
						true
					),
					samplers: Record<string, unknown>[] = [],
					channels: Record<string, unknown>[] = []
				for (let bone = 0; bone < bones.length; bone++) {
					const rotations: number[] = [],
						translations: number[] = []
					for (let frame = 0; frame < clip.frames; frame++) {
						const offset = (frame * bones.length + bone) * 7
						rotations.push(
							...clip.transforms.slice(offset, offset + 4)
						)
						for (let i = 0; i < 3; i++)
							translations.push(
								clip.transforms[offset + 4 + i] +
									localPositions[bone][i]
							)
					}
					for (const [path, values, components] of [
						['translation', translations, 3],
						['rotation', rotations, 4],
					] as const) {
						channels.push({
							sampler: samplers.length,
							target: { node: base + bone, path },
						})
						samplers.push({
							input: times,
							output: attribute(values, components),
							interpolation: 'LINEAR',
						})
					}
				}
				return { name: clip.name, samplers, channels }
			})
	}
	document.buffers = [{ byteLength: byteOffset }]
	const binPadding = (4 - (byteOffset % 4)) % 4
	if (binPadding) chunks.push(Buffer.alloc(binPadding))
	const json = Buffer.from(JSON.stringify(document)),
		jsonPadding = (4 - (json.length % 4)) % 4,
		bin = Buffer.concat(chunks),
		header = Buffer.alloc(20),
		binHeader = Buffer.alloc(8)
	header.write('glTF')
	header.writeUInt32LE(2, 4)
	header.writeUInt32LE(28 + json.length + jsonPadding + bin.length, 8)
	header.writeUInt32LE(json.length + jsonPadding, 12)
	header.write('JSON', 16)
	binHeader.writeUInt32LE(bin.length)
	binHeader.writeUInt32LE(0x004e4942, 4)
	return Buffer.concat([
		header,
		json,
		Buffer.alloc(jsonPadding, 32),
		binHeader,
		bin,
	])
}
