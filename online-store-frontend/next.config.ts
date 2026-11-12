import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const imageHosts = [
  'images.unsplash.com',
  'cdn.hstatic.net',
  'product.hstatic.net',
  'upload.wikimedia.org',
  'cdn.manln.online',
];

const r2PublicPatterns = [
  process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL,
  ...Array.from({ length: 9 }, (_, index) => {
    const suffix = index === 0 ? '' : `_${index + 1}`;
    return process.env[`R2_PUBLIC_BASE_URL${suffix}`];
  }),
].flatMap((value) => {
  if (!value?.trim()) return [];
  try {
    const url = new URL(value.trim());
    return [{ protocol: url.protocol.replace(':', '') as 'http' | 'https', hostname: url.hostname, pathname: '/**' as const }];
  } catch {
    return [];
  }
});

const remotePatterns = [
  ...imageHosts.map((hostname) => ({ protocol: 'https' as const, hostname })),
  ...r2PublicPatterns,
];
const imageOptimizerSources = [...new Set(remotePatterns.map(({ hostname, protocol }) => `${protocol}://${hostname}`))];

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_IMAGE_OPTIMIZER_SOURCES: JSON.stringify(imageOptimizerSources),
  },
  outputFileTracingRoot: fileURLToPath(new URL('..', import.meta.url)),
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
    remotePatterns,
    qualities: [60, 75],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    formats: ['image/avif', 'image/webp'],
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
        source: '/sitemap.xml',
        destination: `${backendUrl}/api/products/sitemap.xml`,
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
        source: '/assets/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' },
        ],
      },
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
