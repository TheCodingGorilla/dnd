const { PHASE_DEVELOPMENT_SERVER } = require('next/constants')

/**
 * Use a separate dist directory in dev so running `next build` does not
 * overwrite artifacts used by an active `next dev` server.
 */
module.exports = phase => ({
	distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
	/** @type {import('next').NextConfig} */
	async rewrites() {
		return [
			{
				source: '/temple-entrance-puzzle',
				destination: '/static-apps/temple-entrance-puzzle/index.html',
			},
			{
				source: '/temple-entrance-puzzle/:path*',
				destination: '/static-apps/temple-entrance-puzzle/:path*',
			},
			{
				source: '/water-puzzle',
				destination: '/static-apps/water-puzzle/index.html',
			},
			{
				source: '/water-puzzle/:path*',
				destination: '/static-apps/water-puzzle/:path*',
			},
		]
	},
})
