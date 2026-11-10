import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

const root = fileURLToPath(new URL('../../', import.meta.url))
const config: NextConfig = {
	output: 'standalone',
	outputFileTracingRoot: root,
	turbopack: { root },
	experimental: {
		// Backend принимает пакеты до 502 МБ (MAX_REQUEST_BODY_SIZE),
		// без этого rewrite-прокси обрезает body на внутреннем лимите 10 МБ.
		proxyClientMaxBodySize: '502mb',
	},
	async rewrites() {
		return [
			{
				source: '/api/v1/:path*',
				destination: `${process.env.BACKEND_ORIGIN ?? 'http://localhost:3001'}/api/v1/:path*`,
			},
		]
	},

	poweredByHeader: false,
	devIndicators: false,
	async headers() {
		return [
			{
				source: '/frames/:path*',
				headers: [
					{
						key: 'Cache-Control',
						value: 'public, max-age=31536000, immutable',
					},
				],
			},
			{
				source: '/(.*)',
				headers: [
					{ key: 'X-Content-Type-Options', value: 'nosniff' },
					{
						key: 'Referrer-Policy',
						value: 'strict-origin-when-cross-origin',
					},
					{
						key: 'Permissions-Policy',
						value: 'camera=(), microphone=(), geolocation=()',
					},
				],
			},
		]
	},
	images: {
		qualities: [25, 50, 75, 85, 95, 100],
		remotePatterns: [
			{
				protocol: 'https',
				hostname: 'i.ytimg.com',
				pathname: '/**',
			},
		],
	},
}

export default config
