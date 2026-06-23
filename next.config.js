/** @type {import('next').NextConfig} */
const nextConfig = {
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
}

module.exports = nextConfig
