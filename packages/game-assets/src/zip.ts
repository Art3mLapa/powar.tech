import { deflateRawSync, inflateRawSync } from 'node:zlib'
import { safeGamePath } from './binary'

function crc32(data: Buffer) {
	let crc = 0xffffffff
	for (const byte of data) {
		crc ^= byte
		for (let i = 0; i < 8; i++)
			crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
	}
	return (crc ^ 0xffffffff) >>> 0
}
export function readZip(
	buffer: Buffer,
	filter: (path: string) => boolean = () => true
) {
	let end = -1
	for (
		let i = buffer.length - 22;
		i >= Math.max(0, buffer.length - 65557);
		i--
	)
		if (buffer.readUInt32LE(i) === 0x06054b50) {
			end = i
			break
		}
	if (end < 0) throw new Error('ZIP directory not found')
	const entries = buffer.readUInt16LE(end + 10),
		directory = buffer.readUInt32LE(end + 16)
	if (entries === 65535 || directory === 0xffffffff)
		throw new Error('ZIP64 is unsupported')
	let offset = directory,
		total = 0
	const results: { path: string; data: Buffer }[] = []
	for (let i = 0; i < entries; i++) {
		if (
			offset + 46 > buffer.length ||
			buffer.readUInt32LE(offset) !== 0x02014b50
		)
			throw new Error('Invalid ZIP directory')
		const flags = buffer.readUInt16LE(offset + 8),
			method = buffer.readUInt16LE(offset + 10),
			crc = buffer.readUInt32LE(offset + 16),
			packed = buffer.readUInt32LE(offset + 20),
			size = buffer.readUInt32LE(offset + 24),
			nameLength = buffer.readUInt16LE(offset + 28),
			extra = buffer.readUInt16LE(offset + 30),
			comment = buffer.readUInt16LE(offset + 32),
			local = buffer.readUInt32LE(offset + 42)
		const name = buffer
			.subarray(offset + 46, offset + 46 + nameLength)
			.toString('utf8')
		offset += 46 + nameLength + extra + comment
		if (name.endsWith('/')) continue
		const path = safeGamePath(name)
		if (!filter(path)) continue
		total += size
		if (total > 512 * 1024 * 1024 || size > 64 * 1024 * 1024 || flags & 1)
			throw new Error('ZIP resource limit')
		if (
			local + 30 > buffer.length ||
			buffer.readUInt32LE(local) !== 0x04034b50
		)
			throw new Error('Invalid ZIP local header')
		const start =
			local +
			30 +
			buffer.readUInt16LE(local + 26) +
			buffer.readUInt16LE(local + 28)
		if (start + packed > buffer.length)
			throw new Error('Truncated ZIP entry')
		const compressed = buffer.subarray(start, start + packed),
			data =
				method === 0
					? compressed
					: method === 8
						? inflateRawSync(compressed, {
								maxOutputLength: size + 1,
							})
						: null
		if (!data || data.length !== size || crc32(data) !== crc)
			throw new Error('ZIP entry checksum mismatch')
		results.push({ path, data })
	}
	return results
}
export function createZip(entries: { path: string; data: Buffer }[]) {
	const local: Buffer[] = [],
		directory: Buffer[] = []
	let offset = 0
	if (entries.length > 65534) throw new Error('Too many ZIP entries')
	for (const entry of entries) {
		const name = Buffer.from(safeGamePath(entry.path)),
			data = deflateRawSync(entry.data),
			crc = crc32(entry.data),
			header = Buffer.alloc(30)
		header.writeUInt32LE(0x04034b50)
		header.writeUInt16LE(20, 4)
		header.writeUInt16LE(0x800, 6)
		header.writeUInt16LE(8, 8)
		header.writeUInt32LE(crc, 14)
		header.writeUInt32LE(data.length, 18)
		header.writeUInt32LE(entry.data.length, 22)
		header.writeUInt16LE(name.length, 26)
		local.push(header, name, data)
		const central = Buffer.alloc(46)
		central.writeUInt32LE(0x02014b50)
		central.writeUInt16LE(20, 4)
		central.writeUInt16LE(20, 6)
		central.writeUInt16LE(0x800, 8)
		central.writeUInt16LE(8, 10)
		central.writeUInt32LE(crc, 16)
		central.writeUInt32LE(data.length, 20)
		central.writeUInt32LE(entry.data.length, 24)
		central.writeUInt16LE(name.length, 28)
		central.writeUInt32LE(offset, 42)
		directory.push(central, name)
		offset += header.length + name.length + data.length
	}
	const central = Buffer.concat(directory),
		end = Buffer.alloc(22)
	end.writeUInt32LE(0x06054b50)
	end.writeUInt16LE(entries.length, 8)
	end.writeUInt16LE(entries.length, 10)
	end.writeUInt32LE(central.length, 12)
	end.writeUInt32LE(offset, 16)
	return Buffer.concat([...local, central, end])
}
