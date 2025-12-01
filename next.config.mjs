/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    // !! WARN !!
    ignoreBuildErrors: true,
  },
  output: 'standalone',
  // Enable production browser source maps via env (default: false for speed)
  productionBrowserSourceMaps: process.env.NEXT_PUBLIC_SOURCE_MAPS === 'true',
  
  // Parallel build optimization
  experimental: {
    // Package import optimizations - reduces bundle size
    optimizePackageImports: ['lucide-react'],
    
    // Server Components HMR cache - faster hot reloading
    serverComponentsHmrCache: true,
    
    // Enable worker threads for parallel compilation
    workerThreads: false,
  },
}

export default nextConfig
