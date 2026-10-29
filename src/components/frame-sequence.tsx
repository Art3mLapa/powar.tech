'use client'

import type { MotionValue } from 'motion/react'
import NextImage from 'next/image'
import { useEffect, useRef, useState } from 'react'
import manifest from '@/lib/frame-manifest.json'
import {
	frameDockFactor,
	frameIndex,
	frameWindow,
	MAX_DECODED_FRAMES,
} from '@/lib/timeline'

export function FrameSequence({ progress }: { progress: MotionValue<number> }) {
	const canvas = useRef<HTMLCanvasElement>(null)
	const [failed, setFailed] = useState(false)
	useEffect(() => {
		if (failed) return
		const context = canvas.current?.getContext('2d', { alpha: true })
		const surface = canvas.current?.parentElement
		if (!context || !surface) {
			setFailed(true)
			return
		}
		const ready = new Map<number, HTMLImageElement>()
		const loading = new Map<number, HTMLImageElement>()
		const unavailable = new Set<number>()
		let wanted = frameIndex(progress.get(), manifest.frames.length)
		let queue: number[] = []
		let disposed = false
		let raf = 0
		let drawn = -1

		const paint = () => {
			raf = 0
			if (disposed || ready.size === 0) return
		const nearest = ready.has(wanted)
			? wanted
			: [...ready.keys()].reduce((a, b) =>
					Math.abs(a - wanted) <= Math.abs(b - wanted) ? a : b
				)
		const image = ready.get(nearest)
		if (drawn === nearest || !image) return
		context.clearRect(0, 0, manifest.width, manifest.height)
		context.drawImage(
			image,
			0,
			0,
			manifest.width,
			manifest.height
		)

			const dock = frameDockFactor(
				nearest,
				manifest.bottomEdges,
				manifest.height
			)
			surface.style.transform = `translateY(calc((50dvh - 50%) * ${dock}))`
			context.canvas.dataset.frame = String(nearest)
			drawn = nearest
		}
		const schedulePaint = () => {
			if (!raf) raf = requestAnimationFrame(paint)
		}
		const pump = () => {
			while (!disposed && loading.size < 2 && queue.length) {
			const index = queue.shift()
			if (index === undefined) break
			if (
					ready.has(index) ||
					loading.has(index) ||
					unavailable.has(index)
				)
					continue
				const image = new Image()
				image.decoding = 'async'
				loading.set(index, image)
				image.onload = () => {
					if (disposed) return
					loading.delete(index)
					ready.set(index, image)
					while (ready.size > MAX_DECODED_FRAMES) {
						const farthest = [...ready.keys()].reduce((a, b) =>
							Math.abs(a - wanted) >= Math.abs(b - wanted) ? a : b
						)
						ready.delete(farthest)
					}
					schedulePaint()
					pump()
				}
				image.onerror = () => {
					if (disposed) return
					loading.delete(index)
					unavailable.add(index)
					if (index === wanted) setFailed(true)
					pump()
				}
				image.src = manifest.frames[index]
			}
		}
		const update = (value: number) => {
			const index = frameIndex(value, manifest.frames.length)
			const direction = index - wanted
			wanted = index
			if (unavailable.has(index)) {
				setFailed(true)
				return
			}
			queue = frameWindow(index, manifest.frames.length, direction)
			pump()
			schedulePaint()
		}
		update(progress.get())
		const unsubscribe = progress.on('change', update)
		return () => {
			disposed = true
			unsubscribe()
			cancelAnimationFrame(raf)
			for (const image of loading.values()) {
				image.onload = null
				image.onerror = null
			}
			loading.clear()
			ready.clear()
		}
	}, [progress, failed])
	return (
		<div
			aria-label="Анимация: объёмная эмблема Билдерс собирается по мере прокрутки"
			className="sequence-art"
			role="img"
			style={failed ? { transform: 'none' } : undefined}
		>
			{failed ? (
				<NextImage
					alt=""
					draggable={false}
					height={manifest.height}
					src={manifest.frames.at(-1) || 'none'}
					width={manifest.width}
				/>
			) : (
				<canvas
					height={manifest.height}
					ref={canvas}
					width={manifest.width}
				/>
			)}
		</div>
	)
}
