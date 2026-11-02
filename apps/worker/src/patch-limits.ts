import { diffManifests, type ManifestFile } from '@bscp/game-assets'

export const PATCH_UPDATE_LIMIT_BYTES = 10n * 1024n * 1024n * 1024n

export class PatchUpdateLimitError extends Error {
	constructor() {
		super('Patch update exceeds the 10 GiB manifest delta limit')
		this.name = 'PatchUpdateLimitError'
	}
}

export function patchUpdateBytes(
	previous: ManifestFile[],
	next: ManifestFile[]
): bigint {
	return diffManifests(previous, next).reduce(
		(total, change) =>
			total +
			(change.kind === 'REMOVED'
				? 0n
				: BigInt(change.newValue?.size ?? '0')),
		0n
	)
}

export function assertPatchUpdateLimit(bytes: bigint) {
	if (bytes > PATCH_UPDATE_LIMIT_BYTES) throw new PatchUpdateLimitError()
}
