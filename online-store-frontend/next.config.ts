import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const trimTrailingSlashes = (value: string) => {
  let normalized = value.trim();
  while (normalized.endsWith('/')) normalized = normalized.slice(0, -1);
  return normalized;
};
const r2PublicBaseUrl = trimTrailingSlashes(
  process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || process.env.R2_PUBLIC_BASE_URL || '',
);
const r2IconStoragePrefix = (process.env.R2_ICON_STORAGE_PREFIX || 'site/icons')
  .split('/').filter(Boolean).join('/');
const frontendRoot = fileURLToPath(new URL('.', import.meta.url));
const r2IconUrls = Object.fromEntries((['fire', 'flash', 'star'] as const).map((name) => {
  const content = readFileSync(resolve(frontendRoot, 'public', 'assets', 'icons', `${name}.png`));
  const hash = createHash('sha256').update(content).digest('hex');
  return [name, r2PublicBaseUrl ? `${r2PublicBaseUrl}/${r2IconStoragePrefix}/${hash}.png` : ''];
}));

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

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_R2_ICON_URLS: JSON.stringify(r2IconUrls),
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
      ...r2PublicPatterns,
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
