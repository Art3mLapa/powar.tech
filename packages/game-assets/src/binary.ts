export class BinaryReader {
	offset = 0
	constructor(
		public buffer: Buffer,
		public little = false
	) {}
	bytes(length: number) {
		if (
			!Number.isSafeInteger(length) ||
			length < 0 ||
			this.offset + length > this.buffer.length
		)
			throw new Error(`Truncated binary at ${this.offset}`)
		const data = this.buffer.subarray(this.offset, this.offset + length)
		this.offset += length
		return data
	}
	u8() {
		return this.bytes(1)[0]
	}
	i8() {
		return this.bytes(1).readInt8()
	}
	u16() {
		const b = this.bytes(2)
		return this.little ? b.readUInt16LE() : b.readUInt16BE()
	}
	i16() {
		const b = this.bytes(2)
		return this.little ? b.readInt16LE() : b.readInt16BE()
	}
	u32() {
		const b = this.bytes(4)
		return this.little ? b.readUInt32LE() : b.readUInt32BE()
	}
	i32() {
		const b = this.bytes(4)
		return this.little ? b.readInt32LE() : b.readInt32BE()
	}
	u64() {
		const b = this.bytes(8)
		return this.little ? b.readBigUInt64LE() : b.readBigUInt64BE()
	}
	i64() {
		const b = this.bytes(8)
		return this.little ? b.readBigInt64LE() : b.readBigInt64BE()
	}
	f32() {
		const b = this.bytes(4),
			n = this.little ? b.readFloatLE() : b.readFloatBE()
		if (!Number.isFinite(n)) throw new Error('Non-finite model value')
		return n
	}
	string() {
		return new TextDecoder('utf-8', { fatal: true }).decode(
			this.bytes(this.u16())
		)
	}
	count(limit = 1_000_000) {
		const n = this.u32()
		if (n > limit) throw new Error(`Binary count exceeds ${limit}`)
		return n
	}
}
export function safeGamePath(path: string) {
	const normalized = path.replaceAll('\\', '/')
	if (
		!normalized ||
		normalized.startsWith('/') ||
		normalized.includes('\0') ||
		normalized.split('/').some((p) => p === '..' || p === '.' || p === '')
	)
		throw new Error('Unsafe game path')
	return normalized
}
