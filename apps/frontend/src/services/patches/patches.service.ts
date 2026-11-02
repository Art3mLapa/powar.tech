import { apiClient } from '../api'
export type Snapshot = {
	id: string
	region: string
	createdAt: string
	manifestHash: string
	previousId: string | null
}
export type GameFile = {
	id: string
	path: string
	hash: string
	size: string
	category: string
}
export type Change = {
	id: string
	path: string
	kind: string
	category: string
	oldValue: unknown
	newValue: unknown
}
export type Output = { name: string; assetId: string; preview: boolean }
export type MapAsset = {
	snapshotId: string
	preset: string
	assetId: string
	name: string
	hash: string
}
export type MapResult =
	| MapAsset
	| {
			mode: 'added' | 'removed' | 'changed'
			before?: MapAsset
			after?: MapAsset
	  }
export type Job = {
	id: string
	kind: string
	state: string
	attempts: number
	progress: number
	error: string | null
	result: unknown | null
	createdAt: string
}
export type DataSnapshot = {
	id: string
	kind: string
	region: string
	sourceHash: string
	createdAt: string
}
export const patchesService = {
	snapshots: async (region = 'RU') =>
		(await apiClient.get<Snapshot[]>('/patches', { params: { region } }))
			.data,
	changes: async (id: string, page = 1, search = '', category = '') =>
		(
			await apiClient.get<{ items: Change[]; hasMore: boolean }>(
				`/patches/snapshots/${id}/changes`,
				{ params: { page, search, category } }
			)
		).data,
	files: async (id: string, page = 1, search = '', category = '') =>
		(
			await apiClient.get<{ items: GameFile[]; hasMore: boolean }>(
				`/patches/snapshots/${id}/files`,
				{ params: { page, search, category } }
			)
		).data,
	file: async (id: string) =>
		(
			await apiClient.get<{
				file: GameFile
				job: null | {
					id: string
					state: string
					progress: number
					error: string | null
					result: null | { outputs: Output[] }
				}
			}>(`/patches/files/${id}`)
		).data,
	process: async (id: string) =>
		(await apiClient.post(`/patches/files/${id}/process`, {})).data,
	data: async (kind: string) =>
		(
			await apiClient.get<DataSnapshot[]>('/patches/data', {
				params: { kind },
			})
		).data,
	dataChanges: async (id: string, page = 1, search = '') =>
		(
			await apiClient.get<{ items: Change[]; hasMore: boolean }>(
				`/patches/data/${id}`,
				{ params: { page, search } }
			)
		).data,
}
