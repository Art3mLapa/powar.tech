'use client'

import { motion, useScroll, useTransform } from 'motion/react'
import Link from 'next/link'
import { useRef } from 'react'
import { segmentProgress } from '@/lib/timeline'
import { FrameSequence } from './frame-sequence'
import { ScrollHint } from './scroll-hint'
import { useReducedMotionPreference } from './use-reduced-motion'

export function Experience() {
	const section = useRef<HTMLElement>(null)
	const reduced = useReducedMotionPreference()

	const { scrollYProgress } = useScroll({
		target: section,
		offset: ['start start', 'end end'],
	})

	const titleOpacity = useTransform(
		scrollYProgress,
		(p) => 1 - segmentProgress(p, 0.025, 0.15)
	)

	const titleBlur = useTransform(
		scrollYProgress,
		(p) => `blur(${22 * segmentProgress(p, 0, 0.15)}px)`
	)

	const titleScale = useTransform(
		scrollYProgress,
		(p) => 1 + 0.035 * segmentProgress(p, 0, 0.15)
	)

	const frameOpacity = useTransform(scrollYProgress, (p) =>
		segmentProgress(p, 0.04, 0.15)
	)

	return (
		<section
			aria-labelledby="hero-title"
			className="experience"
			ref={section}
		>
			<header className="site-header flex items-center justify-center">
				<Link
					aria-label="Билдерс СЗ Продакшн — наверх"
					className="type-display transition-opacity hover:opacity-60"
					href="#top"
				>
					БИЛДЕРС СЗ ПРОДАКШН
				</Link>
			</header>
			<div className="experience-sticky">
				<motion.div
					className="hero-title-wrap"
					style={{
						opacity: titleOpacity,
						filter: titleBlur,
						scale: reduced ? 1 : titleScale,
					}}
				>
					<h1 className="hero-title type-display" id="hero-title">
						UNDERГРАУНД STAЛZОНА
					</h1>
				</motion.div>
				<motion.div
					className="sequence-layer"
					style={{ opacity: frameOpacity }}
				>
					<FrameSequence progress={scrollYProgress} />
				</motion.div>
				<ScrollHint />
			</div>
		</section>
	)
}
