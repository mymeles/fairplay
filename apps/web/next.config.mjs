/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  transpilePackages: ['@fairplay/shared-types', '@fairplay/shared-utils'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'i.scdn.co' },
      { protocol: 'https', hostname: 'mosaic.scdn.co' },
    ],
  },
  env: {
    NEXT_PUBLIC_API_BASE_URL:
      process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api/v1',
    NEXT_PUBLIC_REALTIME_URL:
      process.env.NEXT_PUBLIC_REALTIME_URL ?? 'http://localhost:3000',
  },
};

export default nextConfig;
