'use client'

import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { IDLE_DELAY_MS } from '@/lib/timeline'
import { useReducedMotionPreference } from './use-reduced-motion'

export function ScrollHint() {
	const [visible, setVisible] = useState(false)
	const reduced = useReducedMotionPreference()

	useEffect(() => {
		let timer: ReturnType<typeof setTimeout>
		const reset = () => {
			clearTimeout(timer)
			setVisible(false)
			if (window.scrollY < window.innerHeight * 0.35)
				timer = setTimeout(() => setVisible(true), IDLE_DELAY_MS)
		}
		reset()
		window.addEventListener('scroll', reset, { passive: true })
		return () => {
			clearTimeout(timer)
			window.removeEventListener('scroll', reset)
		}
	}, [])

	return (
		<motion.button
			animate={{ opacity: visible ? 1 : 0, y: visible ? 0 : 6 }}
			aria-hidden={!visible}
			aria-label="Прокрутить вниз"
			className="scroll-hint type-display"
			initial={false}
			onClick={() =>
				window.scrollBy({
					top: window.innerHeight * 0.8,
					behavior: reduced ? 'instant' : 'smooth',
				})
			}
			style={{ pointerEvents: visible ? 'auto' : 'none' }}
			tabIndex={visible ? 0 : -1}
			transition={{ duration: reduced ? 0 : 0.7 }}
			type="button"
		>
			(СКРОЛЛЬ ВНИЗ)
		</motion.button>
	)
}
