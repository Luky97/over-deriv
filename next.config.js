/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  basePath: '/over-deriv',
  assetPrefix: '/over-deriv/',
  images: { unoptimized: true },
}

module.exports = nextConfig
