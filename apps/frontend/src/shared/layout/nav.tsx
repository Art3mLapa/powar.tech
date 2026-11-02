'use client'

import { Icon } from '@iconify/react'
import { motion, useScroll, useTransform } from 'motion/react'
import Image from 'next/image'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { useReducedMotionPreference } from '../../components/use-reduced-motion'

const LINK_REVEAL_START = 80
const LINK_REVEAL_END = 320
const LINK_TOGGLE_POINT = 160

export function SiteHeader() {
	const { scrollY } = useScroll()
	const reduced = useReducedMotionPreference()
	const { resolvedTheme, setTheme } = useTheme()

	const sidesOpacity = useTransform(
		scrollY,
		[LINK_REVEAL_START, LINK_REVEAL_END],
		[0, 1]
	)
	const titleOpacity = useTransform(
		scrollY,
		[LINK_REVEAL_START, LINK_REVEAL_END],
		[1, 0]
	)
	const sidesVisibility = useTransform(scrollY, (p) =>
		p < LINK_TOGGLE_POINT ? 'hidden' : 'visible'
	)
	const sidesPointerEvents = useTransform(scrollY, (p) =>
		p < LINK_TOGGLE_POINT ? 'none' : 'auto'
	)
	const titleVisibility = useTransform(scrollY, (p) =>
		p < LINK_TOGGLE_POINT ? 'visible' : 'hidden'
	)
	const linksY = useTransform(
		scrollY,
		[LINK_REVEAL_START, LINK_REVEAL_END],
		[-8, 0]
	)

	return (
		<header className="site-header right-0 mx-auto max-w-360">
			<motion.div
				className="site-header-slot"
				style={{
					opacity: sidesOpacity,
					visibility: sidesVisibility,
					pointerEvents: sidesPointerEvents,
				}}
			>
				<button
					aria-label="Сменить тему"
					className="site-header-brand site-header-toggle"
					onClick={() =>
						setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
					}
					type="button"
				>
					<Image
						alt="BSCP"
						className="theme-icon theme-icon-dark"
						height={42}
						src="/svg/dark/madbuilder.svg"
						width={42}
					/>
					<Image
						alt="BSCP"
						className="theme-icon theme-icon-light"
						height={42}
						src="/svg/light/madbuilder.svg"
						width={42}
					/>
				</button>
			</motion.div>
			<motion.div
				className="site-header-title type-display"
				style={{
					opacity: titleOpacity,
					visibility: titleVisibility,
				}}
			>
				Билдерс СЗ Продакшн
			</motion.div>
			<motion.nav
				aria-label="Разделы"
				className="site-header-links type-display"
				style={{
					opacity: sidesOpacity,
					visibility: sidesVisibility,
					pointerEvents: sidesPointerEvents,
					y: reduced ? 0 : linksY,
				}}
			>
				<Link className="site-header-link" href="/articles">
					<Icon icon="simple-icons:telegraph" />
				</Link>
				<Link
					className="site-header-link"
					href="https://www.youtube.com/@buildersc_production"
					rel="noopener noreferrer"
					target="_blank"
				>
					<Icon icon="akar-icons:youtube-fill" />
				</Link>
				<Link
					className="site-header-link"
					href="https://stalzone.gay"
					rel="noopener noreferrer"
					target="_blank"
				>
					<Icon icon="bxl:telegram" />
				</Link>
				<Link
					className="site-header-link"
					href="https://github.com/Art3mLapa/powar.tech"
					rel="noopener noreferrer"
					target="_blank"
				>
					<Icon icon="akar-icons:github-fill" />
				</Link>
			</motion.nav>
		</header>
	)
}
