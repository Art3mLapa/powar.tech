import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

type Textures = {
	diff?: string
	normal?: string
	roughness?: string
	emissive?: string
	alpha?: 'opaque' | 'soft' | 'cutout'
}
type RenderInput = {
	model: string
	families: Record<string, Textures>
	fallback?: string
}
declare global {
	interface Window {
		loadModel: (input: RenderInput) => Promise<void>
		captureModel: (angle: number) => string
	}
}
const renderer = new THREE.WebGLRenderer({
	antialias: true,
	preserveDrawingBuffer: true,
	alpha: false,
})
renderer.setSize(1024, 1024)
renderer.setPixelRatio(1)
renderer.setClearColor(0x5f5f5f, 1)
renderer.outputColorSpace = THREE.SRGBColorSpace
const scene = new THREE.Scene(),
	camera = new THREE.PerspectiveCamera(60, 1, 0.01, 10000)
document.body.style.margin = '0'
document.body.appendChild(renderer.domElement)
const sunlight = new THREE.DirectionalLight(0xffffff, 3)
sunlight.position.set(0, 2, 4)
scene.add(sunlight)
const fill = new THREE.DirectionalLight(0xffffff, 0.8)
fill.position.set(-3, 1, -2)
scene.add(fill)
const ambient = new THREE.AmbientLight(0xffffff, 0.3)
scene.add(ambient)
let center = new THREE.Vector3(),
	distance = 1
window.loadModel = async (input) => {
	const gltf = await new GLTFLoader().loadAsync(input.model),
		loader = new THREE.TextureLoader()
	const familyTextures = new Map<
		string,
		Promise<{
			map: THREE.Texture | null
			normal: THREE.Texture | null
			roughness: THREE.Texture | null
			emissive: THREE.Texture | null
		}>
	>()
	async function load(url?: string, color = false) {
		if (!url) return null
		const texture = await loader.loadAsync(url)
		texture.flipY = false
		texture.wrapS = THREE.RepeatWrapping
		texture.wrapT = THREE.RepeatWrapping
		texture.needsUpdate = true
		if (color) texture.colorSpace = THREE.SRGBColorSpace
		return texture
	}
	for (const [key, value] of Object.entries(input.families))
		familyTextures.set(
			key.toLowerCase(),
			Promise.all([
				load(value.diff, true),
				load(value.normal),
				load(value.roughness),
				load(value.emissive, true),
			]).then(([map, normal, roughness, emissive]) => ({
				map,
				normal,
				roughness,
				emissive,
			}))
		)
	const meshes: THREE.Mesh[] = []
	gltf.scene.traverse((obj) => {
		if (obj instanceof THREE.Mesh) meshes.push(obj)
	})
	for (const mesh of meshes) {
		const parts = mesh.name.toLowerCase().split('/')
		if (parts.includes('stencil')) {
			mesh.removeFromParent()
			continue
		}
		const material = Array.isArray(mesh.material)
				? mesh.material[0]
				: mesh.material,
			key = material.name.toLowerCase(),
			family = familyTextures.has(key) ? key : (input.fallback ?? ''),
			textures = familyTextures.has(family)
				? await familyTextures.get(family)
				: null,
			config = input.families[family]
		const lens = parts.some((p) =>
			['ekran', 'lens', 'not_aiming_lens'].includes(p)
		)
		mesh.material = new THREE.MeshStandardMaterial({
			color: lens ? 0x000000 : 0xffffff,
			map: lens ? null : textures?.map,
			normalMap: lens ? null : textures?.normal,
			roughnessMap: lens ? null : textures?.roughness,
			emissiveMap: lens ? null : textures?.emissive,
			emissive: textures?.emissive && !lens ? 0xffffff : 0x000000,
			metalness: lens ? 0 : 1,
			roughness: lens ? 1 : 0.35,
			transparent: !lens && config?.alpha === 'soft',
			alphaTest: !lens && config?.alpha === 'cutout' ? 0.5 : 0,
			side: THREE.DoubleSide,
		})
		if (!mesh.geometry.attributes.normal)
			mesh.geometry.computeVertexNormals()
	}
	scene.add(gltf.scene)
	const bounds = new THREE.Box3().setFromObject(gltf.scene),
		size = bounds.getSize(new THREE.Vector3())
	center = bounds.getCenter(new THREE.Vector3())
	distance = Math.max(size.x, size.y, size.z) * 1.2
	camera.near = Math.max(distance / 1000, 0.001)
	camera.far = distance * 20
	camera.updateProjectionMatrix()
}
window.captureModel = (angle) => {
	const yaw = (angle * Math.PI) / 180
	camera.position
		.copy(center)
		.add(
			new THREE.Vector3(
				Math.sin(yaw) * distance,
				0,
				Math.cos(yaw) * distance
			)
		)
	camera.lookAt(center)
	renderer.render(scene, camera)
	return renderer.domElement.toDataURL('image/png')
}
