import {
	createCipheriv,
	createDecipheriv,
	createHash,
	createHmac,
	randomBytes,
	timingSafeEqual,
} from 'node:crypto'
import { env } from '../env'

export const token = () => randomBytes(32).toString('hex')
export const hash = (value: string) =>
	createHash('sha256').update(value).digest('hex')
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
export function base32(bytes: Buffer): string {
	let bits = 0,
		value = 0,
		result = ''
	for (const byte of bytes) {
		value = (value << 8) | byte
		bits += 8
		while (bits >= 5) {
			bits -= 5
			result += alphabet[(value >>> bits) & 31]
		}
	}
	if (bits) result += alphabet[(value << (5 - bits)) & 31]
	return result
}
function decode32(input: string): Buffer {
	let bits = 0,
		value = 0
	const result: number[] = []
	for (const c of input) {
		const digit = alphabet.indexOf(c)
		if (digit < 0) throw new Error('Invalid TOTP secret')
		value = (value << 5) | digit
		bits += 5
		if (bits >= 8) {
			bits -= 8
			result.push((value >>> bits) & 255)
		}
	}
	return Buffer.from(result)
}
export function totp(secret: string, step: number): string {
	const counter = Buffer.alloc(8)
	counter.writeBigUInt64BE(BigInt(step))
	const digest = createHmac('sha1', decode32(secret)).update(counter).digest()
	const offset = digest[19] & 15
	return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000)
		.toString()
		.padStart(6, '0')
}
export function verifyTotp(
	secret: string,
	code: string,
	lastStep: bigint,
	now = Date.now()
): bigint | null {
	if (!/^\d{6}$/.test(code)) return null
	const current = Math.floor(now / 30000)
	for (const step of [current, current - 1, current + 1]) {
		if (
			BigInt(step) > lastStep &&
			timingSafeEqual(Buffer.from(totp(secret, step)), Buffer.from(code))
		)
			return BigInt(step)
	}
	return null
}
export function encrypt(secret: string): string {
	const iv = randomBytes(12),
		cipher = createCipheriv(
			'aes-256-gcm',
			Buffer.from(env.TOTP_ENCRYPTION_KEY, 'hex'),
			iv
		)
	const body = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
	return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')
}
export function decrypt(ciphertext: string): string {
	const data = Buffer.from(ciphertext, 'base64'),
		decipher = createDecipheriv(
			'aes-256-gcm',
			Buffer.from(env.TOTP_ENCRYPTION_KEY, 'hex'),
			data.subarray(0, 12)
		)
	decipher.setAuthTag(data.subarray(12, 28))
	return Buffer.concat([
		decipher.update(data.subarray(28)),
		decipher.final(),
	]).toString('utf8')
}
export const newSecret = () => base32(randomBytes(20))
