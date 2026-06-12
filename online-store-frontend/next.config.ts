import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  skipTrailingSlashRedirect: true,
  skipProxyUrlNormalize: true,

  /**
   * Experimental Configuration
   * Cấu hình cho Server Actions (cho phép gọi từ domain của bạn)
   */
  experimental: {
    serverActions: {
      allowedOrigins: ['manln.online'],
    },
  },

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'cdn.hstatic.net',
      },
      {
        protocol: 'https',
        hostname: 'product.hstatic.net',
      },
      {
        protocol: 'https',
        hostname: 'upload.wikimedia.org',
      },
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        pathname: '/**',
      },
    ],
  },

  /**
   * API & Static Files Proxy Configuration
   * Chuyển tiếp requests tới backend server thông qua Next.js Rewrite.
   * Cách này giúp giải quyết vấn đề CORS và CSP một cách triệt để.
   */
  async rewrites() {
  // Ensure backendUrl doesn't have a trailing slash for rewrite destination
  const backendUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || 'https://backend.manln.online').replace(/\/$/, '');

  return {
    beforeFiles: [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: '/uploads/:path*',
        destination: `${backendUrl}/uploads/:path*`,
      },
    ],
  };
  },

  /**
   * Security Headers Configuration
   */
  async headers() {
    return [];
  },
};

export default nextConfig;
