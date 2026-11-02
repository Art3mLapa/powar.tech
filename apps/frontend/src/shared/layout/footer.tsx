'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { bebas } from '@/app/fonts'

export default function FooterLayout() {
	const pathname = usePathname()
	const [mounted, setMounted] = useState(false)

	useEffect(() => {
		setMounted(true)
	}, [])

	if (!mounted) return null

	if (
		pathname.startsWith('/map') ||
		pathname.startsWith('/calcs/hideout') ||
		pathname.startsWith('/dashboard') ||
		pathname.startsWith('/me/onboarding')
	)
		return null

	return (
		<footer className="relative mx-auto flex max-w-[105rem] flex-col gap-3 overflow-hidden px-6 pt-20 pb-16 sm:flex-row sm:items-center lg:px-12 lg:pt-28 lg:pb-0">
			<div className="text-muted flex shrink-0 flex-col gap-2 tracking-widest">
                <div className='h-px bg-(--surface-inverse)'/>
				<p>САЙТ ДЕРЖИТ ПАБЛИК «БИЛДЕРС СЗ ПРОДАКШН»</p>
				<p>
					АФФИЛИРОВАН ПРОТИВ <span className="italic">EXBO EAST</span>
				</p>
			</div>
			<svg
				aria-hidden
				className="text-foreground w-full min-w-0 tracking-[120]"
				preserveAspectRatio="xMidYMid meet"
				viewBox="0 0 1000 200"
			>
				<text
					className={`${bebas.className} font-bold`}
					fill="none"
					fontSize="220"
					stroke="currentColor"
					strokeOpacity="0.08"
					strokeWidth="3"
					textAnchor="end"
					x="1000"
					y="177"
				>
					BSZP
				</text>
			</svg>
		</footer>
	)
}
