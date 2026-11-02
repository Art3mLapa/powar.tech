export type McmtlKind = 'diff' | 'nrm' | 'spek' | 'emi'
export type McmtlMaterial = {
	name: string
	diff?: string
	normal?: string
	spek?: string
	emi?: string
	alpha?: boolean
}
const MCMTL_KEYS: [key: string, field: 'diff' | 'normal' | 'spek' | 'emi'][] = [
	['diffuse map', 'diff'],
	['normal map', 'normal'],
	['specular map', 'spek'],
	['emission map', 'emi'],
]
export function parseMcmtl(input: Buffer): McmtlMaterial[] {
	const materials: McmtlMaterial[] = []
	let material: McmtlMaterial | null = null
	for (let line of input.toString('utf8').split(/\r?\n/)) {
		line = line.trim()
		if (!line || line.startsWith('#') || line.startsWith('//')) continue
		if (line.startsWith('newmtl')) {
			material = { name: line.slice(6).trim() }
			if (material.name) materials.push(material)
			else material = null
			continue
		}
		if (!material) continue
		for (const [key, field] of MCMTL_KEYS) {
			if (!line.startsWith(`${key} `) && line !== key) continue
			const value = line.slice(key.length).trim()
			if (value && value !== 'none') material[field] = value
			break
		}
		const alpha = line.match(/^alpha (?:transparency|blending)\s+(\S+)$/i)
		if (alpha) {
			if (alpha[1]?.toLowerCase() === 'true') material.alpha = true
			else if (material.alpha !== true) material.alpha = false
		}
	}
	return materials
}
export function materialTexturePaths(
	reference: string
): { ol: string[]; dds: string[] } | null {
	const value = reference.trim().replaceAll('\\', '/')
	const separator = value.indexOf(':'),
		tree = value.slice(separator + 1)
	if (
		separator < 1 ||
		!tree ||
		tree.includes('..') ||
		tree.includes('\0') ||
		/\s/.test(tree)
	)
		return null
	const stem = tree.replace(/\.dds$/, ''),
		namespace = value.slice(0, separator),
		unique = (paths: string[]) => [...new Set(paths)]
	return {
		ol: unique([
			`assets/${namespace}/${stem}.ol`,
			`assets/${namespace}/${stem.toLowerCase()}.ol`,
		]),
		dds: unique([
			`assets/${namespace}/${stem}.dds`,
			`assets/${namespace}/${stem.toLowerCase()}.dds`,
		]),
	}
}
