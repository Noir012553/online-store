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
  // Keep production as the default; NEXT_PUBLIC_API_BASE_URL is an explicit override for local/staging.
  const backendUrl = (process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || 'https://backend.manln.online').replace(/\/+$/, '');

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
      {
        source: '/sitemap',
        destination: '/site-map',
      },
    ],
  };
  },

  /**
   * Security Headers Configuration
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ];
  },
};

export default nextConfig;
