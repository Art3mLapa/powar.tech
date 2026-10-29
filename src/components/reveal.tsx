'use client'

import { motion, useScroll, useTransform } from 'motion/react'
import { type ReactNode, useRef } from 'react'
import { useReducedMotionPreference } from './use-reduced-motion'

export function Reveal({
	children,
	className = '',
}: {
	children: ReactNode
	className?: string
}) {
	const ref = useRef<HTMLDivElement>(null)
	const reduced = useReducedMotionPreference()
	const { scrollYProgress } = useScroll({
		target: ref,
		offset: ['start 94%', 'start 62%'],
	})
	const opacity = useTransform(scrollYProgress, (p) => p)
	const y = useTransform(scrollYProgress, (p) => 36 * (1 - p))
	const filter = useTransform(
		scrollYProgress,
		(p) => `blur(${9 * (1 - p)}px)`
	)
	return (
		<motion.div
			className={className}
			ref={ref}
			style={{ opacity, y: reduced ? 0 : y, filter }}
		>
			{children}
		</motion.div>
	)
}
