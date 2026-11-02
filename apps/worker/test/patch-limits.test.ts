import { expect, test } from 'bun:test'
import type { ManifestFile } from '@bscp/game-assets'
import {
	assertPatchUpdateLimit,
	PATCH_UPDATE_LIMIT_BYTES,
	patchUpdateBytes,
} from '../src/patch-limits'

const file = (path: string, size: string, hash = path): ManifestFile => ({
	path,
	size,
	hash,
	url: `https://assets.example/${hash}`,
	category: 'other',
})

test('patch update size sums added and changed files, excluding removals', () => {
	const previous = [
		file('removed.bin', '100'),
		file('changed.bin', '10', 'old'),
	]
	const next = [file('added.bin', '20'), file('changed.bin', '30', 'new')]

	expect(patchUpdateBytes(previous, next)).toBe(50n)
})

test('patch update limit accepts exactly 10 GiB and rejects larger updates', () => {
	expect(() => assertPatchUpdateLimit(PATCH_UPDATE_LIMIT_BYTES)).not.toThrow()
	expect(() => assertPatchUpdateLimit(PATCH_UPDATE_LIMIT_BYTES + 1n)).toThrow(
		'Patch update exceeds the 10 GiB manifest delta limit'
	)
})
