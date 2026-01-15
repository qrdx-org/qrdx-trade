/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  productionBrowserSourceMaps: process.env.NEXT_PUBLIC_SOURCE_MAPS === 'true',
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  // Ensure proper server-side rendering for Workers
  outputFileTracingRoot: process.cwd(),
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'explorer.qrdx.org',
        port: '',
        pathname: '/contracts/**',
      },
    ],
  },
}

export default nextConfig
