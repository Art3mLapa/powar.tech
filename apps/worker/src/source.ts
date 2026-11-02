import { createHash } from 'node:crypto'
import { mkdir, rename } from 'node:fs/promises'
import { resolve } from 'node:path'
import { downloadAsset } from '@bscp/game-assets'
import { storageRoot } from './storage'
export async function loadGameFile(file: {
	url: string
	size: bigint
	hash: string
}) {
	if (!/^[a-f0-9]{40}$/.test(file.hash)) throw new Error('Invalid file hash')
	const directory = resolve(storageRoot, 'sources'),
		path = resolve(directory, file.hash),
		cached = Bun.file(path)
	if (await cached.exists()) {
		if (BigInt(cached.size) !== file.size)
			throw new Error('Cached source size mismatch')
		const data = Buffer.from(await cached.arrayBuffer())
		if (createHash('sha1').update(data).digest('hex') !== file.hash)
			throw new Error('Cached source hash mismatch')
		return data
	}
	const data = await downloadAsset(file.url, file.size, file.hash)
	await mkdir(directory, { recursive: true })
	if (!(await Bun.file(path).exists())) {
		const temporary = resolve(directory, `${crypto.randomUUID()}.tmp`)
		await Bun.write(temporary, data)
		await rename(temporary, path)
	}
	return data
}
