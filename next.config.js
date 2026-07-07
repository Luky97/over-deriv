/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  basePath: '/over-deriv',
  images: {
    unoptimized: true,
  },
  transpilePackages: ['@deriv/core'],
}

module.exports = nextConfig
