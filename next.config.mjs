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
}

export default nextConfig
