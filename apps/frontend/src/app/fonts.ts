import localFont from 'next/font/local'

export const bebas = localFont({
	src: '../assets/bebas-neue-cyrillic.ttf',
	variable: '--font-bebas',
	display: 'swap',
	weight: '400',
})

export const zed = localFont({
	src: '../assets/zed-display-semi-condensed-cyrillic-vf.ttf',
	variable: '--font-zed',
	display: 'swap',
	weight: '400 900',
})
