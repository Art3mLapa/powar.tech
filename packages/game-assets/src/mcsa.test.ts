import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { classifyModelPayload, decodeModelStreams } from './mcsa'
import { decodeModel } from './model'

const signature = Buffer.from('MCSA', 'ascii')

export const header = (version: number, flags: boolean[]) => {
	const b = Buffer.alloc(6)
	for (let i = 0; i < 6; i++) if (flags[i]) b[i] = 1
	return Buffer.concat([
		signature,
		(() => {
			const f = Buffer.alloc(4)
			f.writeFloatLE(version, 0)
			return f
		})(),
		b,
		Buffer.from(new Float32Array([2, 2]).buffer),
	])
}

export const count32 = (value: number) => {
	const b = Buffer.alloc(4)
	b.writeUInt32LE(value, 0)
	return b
}

export const wrapperSize32 = (value: number) => {
	const b = Buffer.alloc(4)
	b.writeUInt32BE(value, 0)
	return b
}

export const name16 = (text: string) => {
	const b = Buffer.alloc(2 + text.length)
	b.writeUInt16LE(text.length, 0)
	b.write(text, 2)
	return b
}

export const meshFixture = (
	vertices: number,
	polygons: number,
	flags: boolean[]
): Buffer => {
	const parts: Buffer[] = []
	parts.push(count32(1), name16('mesh'), name16('m1'))
	if (flags[0]) {
		parts.push(Buffer.from([1, 1, 0]))
	}
	parts.push(count32(vertices))
	parts.push(count32(polygons))
	if (flags[1]) parts.push(Buffer.from(new Float32Array([2]).buffer))
	parts.push(
		Buffer.from(new Float32Array(6).buffer),
		Buffer.from(new Float32Array(1).buffer)
	)
	const positions = Buffer.alloc(vertices * 4 * 2)
	for (let i = 0; i < vertices * 4; i++)
		positions.writeInt16LE(i % 300, i * 2)
	parts.push(positions)
	if (flags[1]) {
		const uv = Buffer.alloc(vertices * 2 * 2)
		for (let i = 0; i < vertices * 2; i++) uv.writeInt16LE(i % 7, i * 2)
		parts.push(uv)
	}
	if (flags[4]) parts.push(Buffer.alloc(vertices * 4))
	if (flags[2]) {
		const n = Buffer.alloc(vertices * 4)
		for (let i = 0; i < vertices * 4; i++) n.writeInt8(i % 5, i)
		parts.push(n)
	}
	if (flags[3]) parts.push(Buffer.alloc(vertices * 4))
	if (flags[0]) parts.push(Buffer.alloc(vertices * 4, 0))
	if (flags[5]) parts.push(Buffer.alloc(vertices * 4, 0))
	const idx = Buffer.alloc(polygons * 3 * 2)
	for (let i = 0; i < polygons * 3; i++)
		idx.writeUInt16LE(i % vertices, i * 2)
	parts.push(idx)
	parts.push(
		Buffer.from([1]),
		name16('bone'),
		Buffer.from([0]),
		Buffer.from(new Float32Array([0, 0, 0, 0, 0, 0]).buffer)
	)
	return Buffer.concat(parts)
}

test('classifyModelPayload detects plain MCSA and runtime wrapper containers', () => {
	const flags: boolean[] = [true, true, false, true, true, false]
	const inner = Buffer.concat([header(11, flags), meshFixture(3, 2, flags)])
	const plain = classifyModelPayload(inner)
	expect(plain.class).toBe('mcsa')
	expect(plain.version).toBe(11)

	const wrapped = Buffer.concat([
		wrapperSize32(24),
		Buffer.alloc(24, 7),
		inner,
	])
	const runtime = classifyModelPayload(wrapped)
	expect(runtime.class).toBe('mcsb-wrapper')
	expect(runtime.version).toBe(11)
	expect(
		runtime.reason.startsWith(
			'runtime container: 24-byte metadata block precedes the MCSA header'
		)
	).toBe(true)

	const unknown = classifyModelPayload(Buffer.alloc(64, 3))
	expect(unknown.class).toBe('unknown')
	expect(unknown.reason).toBe(
		'MCSA signature not at offset 0; size-prefixed wrapper block without MCSA tail; extension must not override payload classification'
	)
})

test('decodeModelStreams skips runtime wrapper block and matches decodeModel semantics', () => {
	const flags: boolean[] = [true, true, false, true, true, false]
	const mesh = meshFixture(4, 2, flags)
	const payload = Buffer.concat([header(11, flags), mesh])
	const wrapped = Buffer.concat([
		wrapperSize32(32),
		Buffer.alloc(32, 9),
		payload,
	])

	const streams = decodeModelStreams(wrapped)
	const plain = decodeModelStreams(payload)
	expect(streams.version).toBe(11)
	expect(streams.meshes.length).toBe(1)
	expect(streams.meshes[0].vertices).toBe(4)
	expect(streams.meshes[0].streams.map((s) => s.slot)).toEqual(
		plain.meshes[0].streams.map((s) => s.slot)
	)

	const positions = streams.meshes[0].streams.find(
		(s) => s.slot === 'positions'
	)
	expect(positions?.perVertex).toBe(4)

	const reference = decodeModel(wrapped, '.mcsb')
	expect(reference.length).toBe(1)
	for (let i = 0; i < 4; i++)
		for (let c = 0; c < 3; c++)
			expect(reference[0].positions[i * 3 + c]).toBe(
				((positions?.data.readInt16LE(i * 8 + c * 2) ?? 0) * 2) / 32767
			)
})

test('decodeModel matches model.ts decode on the runtime 6P62 MCSB fixture when present', async () => {
	const path =
		process.env.WORKER_ASSET_FIXTURE_ROOT &&
		join(
			process.env.WORKER_ASSET_FIXTURE_ROOT,
			'weapons/models/weapons/6p62/6p62.mcsb'
		)
	if (!path) return
	const { readFile } = await import('node:fs/promises')
	const input = await readFile(path)
	const cls = classifyModelPayload(input)
	expect(cls.class).toBe('mcsb-wrapper')
	const streams = decodeModelStreams(input)
	expect(streams.trailing).toBeNull()
	const reference = decodeModel(input, '.mcsb')
	expect(streams.meshes.length).toBe(reference.length)
	for (let m = 0; m < reference.length; m++) {
		const mesh = streams.meshes[m]
		const positions = mesh.streams.find((s) => s.slot === 'positions')
		const uv = mesh.streams.find((s) => s.slot === 'uv')
		for (let i = 0; i < mesh.vertices; i++)
			for (let c = 0; c < 3; c++)
				expect(reference[m].positions[i * 3 + c]).toBe(
					((positions?.data.readInt16LE(i * 8 + c * 2) ?? 0) *
						(streams.positionScale ?? 1)) /
						32767
				)
		for (let i = 0; i < mesh.vertices; i++)
			for (let c = 0; c < 2; c++)
				expect(reference[m].uv[i * 2 + c]).toBe(
					((uv?.data.readInt16LE(i * 4 + c * 2) ?? 0) *
						(streams.uvScale ?? 1)) /
						32767
				)
	}
})
