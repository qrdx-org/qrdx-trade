/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  productionBrowserSourceMaps: process.env.NEXT_PUBLIC_SOURCE_MAPS === 'true',
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
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

// `next dev` with the Worker's bindings (wrangler.jsonc), as the deployed Worker has them.
if (process.env.NODE_ENV === 'development') {
  const { initOpenNextCloudflareForDev } = await import('@opennextjs/cloudflare')
  initOpenNextCloudflareForDev()
}
