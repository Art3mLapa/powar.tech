import { resolve } from 'node:path'
import { db } from '@bscp/database'
import {
	applyWatermark,
	createCollages,
	decodeModel,
	decodeTexarr,
	isRelevantTextureRoot,
	type McmtlMaterial,
	materialTexturePaths,
	micToPng,
	modelToGlb,
	olToDds,
	olToPng,
	parseMcmtl,
	type RenderTexture,
	renderModel,
	scoreTextureFamily,
} from '@bscp/game-assets'
import { loadGameFile } from './source'
import { storeAsset } from './storage'

const downloadAsset = (url: string, size: bigint, hash: string) =>
	loadGameFile({ url, size, hash })
export const watermarkPath = resolve(
	import.meta.dir,
	'../../../packages/game-assets/assets/watermark.png'
)
const sectionOf = (path: string) => path.slice(0, path.lastIndexOf('/') + 1)
const escapeLike = (value: string) => value.replace(/([%_\\])/g, '\\$1')
type FileRow = {
	id: string
	path: string
	url: string
	hash: string
	size: bigint
}
type MaterialRef = {
	family: string
	kind: 'diff' | 'nrm' | 'spek' | 'emi'
	paths: { ol: string[]; dds: string[] }
	alpha?: 'soft'
}

async function branchFiles(
	snapshotId: string,
	section: string
): Promise<FileRow[]> {
	return (await db.orm.public.GameFile.where({ snapshotId })
		.select('id', 'path', 'url', 'hash', 'size')
		.where((f) => f.path.ilike(`${escapeLike(section)}%\\.mc%`))
		.limit(120)
		.all()) as unknown as FileRow[]
}

async function chooseMaterials(
	mcmtlRows: FileRow[],
	stem: string,
	needed: Set<string>
): Promise<McmtlMaterial[] | null> {
	const parsed: {
			materials: McmtlMaterial[]
			exact: boolean
			hits: number
			pathLength: number
		}[] = [],
		segment = `/${stem}.mcmtl`.toLowerCase()
	const ordered = [...mcmtlRows].sort(
		(a, b) =>
			Number(b.path.toLowerCase().endsWith(segment)) -
				Number(a.path.toLowerCase().endsWith(segment)) ||
			a.path.length - b.path.length
	)
	for (const row of ordered.slice(0, 16)) {
		let materials: McmtlMaterial[] | null = null
		try {
			materials = parseMcmtl(
				await downloadAsset(row.url, row.size, row.hash)
			)
		} catch {
			materials = null
		}
		if (!materials?.length) continue
		const hits = materials.filter((material) =>
			needed.has(material.name.toLowerCase())
		).length
		parsed.push({
			materials,
			exact: row.path.toLowerCase().endsWith(segment),
			hits,
			pathLength: row.path.length,
		})
	}
	parsed.sort(
		(a, b) =>
			b.hits - a.hits ||
			Number(b.exact) - Number(a.exact) ||
			a.pathLength - b.pathLength
	)
	return parsed[0]?.hits ? parsed[0].materials : null
}

function materialRefs(
	materials: McmtlMaterial[],
	needed: Set<string>
): MaterialRef[] | null {
	const refs: MaterialRef[] = [],
		seen = new Set<string>()
	for (const material of materials) {
		const family = material.name.toLowerCase()
		if (!needed.has(family)) continue
		for (const [kind, path] of [
			['diff', material.diff],
			['nrm', material.normal],
			['spek', material.spek],
			['emi', material.emi],
		] as const) {
			const paths = path ? materialTexturePaths(path) : null
			if (!paths) continue
			const key = `${family}:${kind}`
			if (seen.has(key)) continue
			seen.add(key)
			refs.push({
				family,
				kind,
				paths,
				...(kind === 'diff' && material.alpha === true
					? { alpha: 'soft' as const }
					: {}),
			})
		}
	}
	const bounded = refs.slice(0, 40)
	return bounded.some((ref) => ref.kind === 'diff') ? bounded : null
}

async function materialTextures(
	snapshotId: string,
	refs: MaterialRef[]
): Promise<RenderTexture[] | null> {
	const wanted = [
		...new Set(refs.flatMap((ref) => [...ref.paths.ol, ...ref.paths.dds])),
	]
	if (!wanted.length) return null
	const rows = (await db.orm.public.GameFile.where({ snapshotId })
		.select('id', 'path', 'url', 'hash', 'size')
		.where((f) =>
			f.path.in([
				...new Set([
					...wanted,
					...wanted.map((path) => path.toLowerCase()),
				]),
			])
		)
		.limit(wanted.length)
		.all()) as unknown as FileRow[]
	const byPath = new Map(rows.map((row) => [row.path.toLowerCase(), row])),
		textures: RenderTexture[] = [],
		done = new Set<string>()
	for (const ref of refs) {
		const row = [...ref.paths.ol, ...ref.paths.dds]
			.map((path) => byPath.get(path.toLowerCase()))
			.find(Boolean)
		if (!row) continue
		if (done.has(`${row.id}:${ref.kind}`)) continue
		done.add(`${row.id}:${ref.kind}`)
		textures.push({
			name: row.path,
			data: await downloadAsset(row.url, row.size, row.hash),
			family: ref.family,
			kind: ref.kind,
			...(ref.alpha ? { alpha: ref.alpha } : {}),
		})
	}
	return textures.some((texture) => texture.kind === 'diff') ? textures : null
}

export async function processAsset(fileId: string) {
	const file = await db.orm.public.GameFile.first({ id: fileId })
	if (!file) throw new Error('File not found')
	const source = await downloadAsset(file.url, file.size, file.hash),
		outputs: { name: string; assetId: string; preview: boolean }[] = [],
		originalName = file.path.split('/').pop() ?? file.path
	const original = await storeAsset(
		source,
		file.path,
		'application/octet-stream',
		file.snapshotId
	)
	outputs.push({ name: originalName, assetId: original, preview: false })
	const watermarkFile = Bun.file(watermarkPath),
		mark = (await watermarkFile.exists())
			? Buffer.from(await watermarkFile.arrayBuffer())
			: null
	const previewAsset = async (data: Buffer, name: string) => {
		const preview = mark ? await applyWatermark(data, mark) : data
		return {
			name,
			assetId: await storeAsset(
				preview,
				name,
				'image/png',
				file.snapshotId
			),
			preview: true,
		}
	}
	const addRenders = async (
		renders: { name: string; data: Buffer }[],
		stem: string
	) => {
		for (const render of renders)
			outputs.push(
				await previewAsset(render.data, `${stem}-${render.name}.png`)
			)
		if (renders.length > 1) {
			const collages = await createCollages(
				renders.map((render) => render.data),
				mark ?? undefined
			)
			for (const [collageIndex, collage] of collages.entries())
				outputs.push({
					name: `${stem}-collage-${collageIndex + 1}.png`,
					assetId: await storeAsset(
						collage,
						`${stem}-collage-${collageIndex + 1}.png`,
						'image/png',
						file.snapshotId
					),
					preview: true,
				})
		}
	}
	const ext = file.path.slice(file.path.lastIndexOf('.')).toLowerCase()
	if (['.mcsb', '.mcsa', '.mcvd'].includes(ext)) {
		const stem = originalName.replace(/\.[^.]+$/, '').toLowerCase(),
			meshes = decodeModel(source, ext),
			glb = modelToGlb(meshes),
			materialNames = new Set(
				meshes.map((mesh) => mesh.material.toLowerCase())
			),
			section = sectionOf(file.path)
		outputs.push({
			name: `${stem}.glb`,
			assetId: await storeAsset(
				glb,
				`${stem}.glb`,
				'model/gltf-binary',
				file.snapshotId
			),
			preview: false,
		})
		let textures: RenderTexture[] | null = null
		const mcmtlRows = (await branchFiles(file.snapshotId, section)).filter(
			(row) => /\.mcmtl$/i.test(row.path)
		)
		if (mcmtlRows.length) {
			const materials = await chooseMaterials(
				mcmtlRows,
				stem,
				materialNames
			)
			const refs = materials
				? materialRefs(materials, materialNames)
				: null
			textures = refs
				? await materialTextures(file.snapshotId, refs)
				: null
		}
		if (!textures) {
			const candidates = await db.orm.public.GameFile.where({
					snapshotId: file.snapshotId,
				})
					.where((f) => f.path.ilike('%\\.ol'))
					.all(),
				modelNameFull = stem.replace(/^old_|^acc_/, '')
			const modelNameBase =
					modelNameFull.length > 5
						? modelNameFull.slice(0, 5)
						: modelNameFull,
				parentFolder =
					sectionOf(file.path).replace(/\/$/, '').split('/').pop() ??
					'',
				groups = new Map<
					string,
					{
						files: (typeof candidates)[number][]
						meta: {
							root: string
							samplePath: string
							entries: number
							hasDiff: boolean
						}
					}
				>()
			for (const candidate of candidates) {
				const match = candidate.path
					.toLowerCase()
					.match(/([^/]+)_(diff|nrm|spek|emi)\.ol$/)
				if (
					!match ||
					!isRelevantTextureRoot(
						match[1],
						modelNameFull,
						modelNameBase
					)
				)
					continue
				const root = match[1],
					group = groups.get(root) ?? {
						files: [],
						meta: {
							root,
							samplePath: candidate.path,
							entries: 0,
							hasDiff: false,
						},
					}
				group.files.push(candidate)
				group.meta.entries++
				if (match[2] === 'diff') group.meta.hasDiff = true
				groups.set(root, group)
			}
			const ranked = [...groups.values()]
					.map((group) => ({
						group,
						score:
							scoreTextureFamily(
								group.meta,
								modelNameFull,
								modelNameBase,
								parentFolder,
								file.path,
								parentFolder
							) +
							(materialNames.has(group.meta.root.toLowerCase())
								? 100
								: 0),
					}))
					.filter((item) => item.score >= 40)
					.sort((a, b) => b.score - a.score),
				textures2: RenderTexture[] = []
			for (const item of ranked.slice(0, 10))
				for (const candidate of item.group.files.slice(0, 4))
					textures2.push({
						name: candidate.path,
						data: await downloadAsset(
							candidate.url,
							candidate.size,
							candidate.hash
						),
					})
			textures = textures2
		}
		const renders = await renderModel(glb, textures)
		await addRenders(renders, stem)
	} else if (ext === '.mcmtl') {
		const stem = originalName.replace(/\.mcmtl$/i, '').toLowerCase()
		const materials = parseMcmtl(source)
		if (materials.length) {
			const needed = new Set(
					materials.map((material) => material.name.toLowerCase())
				),
				modelRows = (
					await branchFiles(file.snapshotId, sectionOf(file.path))
				).filter((row) => /\.(mcsb|mcsa|mcvd)$/i.test(row.path))
			const ordered = [...modelRows].sort((a, b) => {
				const bx = b.path.toLowerCase().split('/').pop() ?? '',
					ax = a.path.toLowerCase().split('/').pop() ?? ''
				return (
					Number(bx.startsWith(`${stem}.`)) -
						Number(ax.startsWith(`${stem}.`)) ||
					a.path.length - b.path.length
				)
			})
			for (const modelRow of ordered.slice(0, 3)) {
				let meshes: ReturnType<typeof decodeModel>
				try {
					meshes = decodeModel(
						await downloadAsset(
							modelRow.url,
							modelRow.size,
							modelRow.hash
						),
						modelRow.path.slice(modelRow.path.lastIndexOf('.'))
					)
				} catch {
					continue
				}
				const modelMaterials = new Set(
					meshes.map((mesh) => mesh.material.toLowerCase())
				)
				if (![...modelMaterials].some((name) => needed.has(name)))
					continue
				const refs = materialRefs(materials, modelMaterials)
				if (!refs) continue
				const textures = await materialTextures(file.snapshotId, refs)
				if (!textures) continue
				const renders = await renderModel(modelToGlb(meshes), textures)
				await addRenders(renders, stem)
				break
			}
		}
	} else if (ext === '.ol') {
		const png = await olToPng(source)
		outputs.push({
			name: `${file.path}.dds`,
			assetId: await storeAsset(
				olToDds(source),
				`${file.path}.dds`,
				'application/octet-stream',
				file.snapshotId
			),
			preview: false,
		})
		outputs.push(await previewAsset(png, `${file.path}.png`))
	} else if (ext === '.mic')
		outputs.push(
			await previewAsset(await micToPng(source), `${file.path}.png`)
		)
	else if (ext === '.texarr') {
		const { createZip } = await import('@bscp/game-assets'),
			zip = createZip(decodeTexarr(source))
		outputs.push({
			name: `${file.path}.zip`,
			assetId: await storeAsset(
				zip,
				`${file.path}.zip`,
				'application/zip',
				file.snapshotId
			),
			preview: false,
		})
	} else if (/\.(png|jpg|jpeg|webp)$/i.test(ext)) {
		if (mark)
			outputs.push(await previewAsset(source, `${file.path}.preview.png`))
		else outputs[0].preview = true
	}
	return { fileId, outputs }
}
