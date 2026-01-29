import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  /**
   * API Proxy Configuration
   * Chuyển tiếp requests /api/* đến backend server
   *
   * Cách hoạt động:
   * 1. Frontend gọi /api/products
   * 2. Next.js rewrite tới backend (https://backend.manln.online)
   * 3. Server-to-server communication (no CORS issues)
   *
   * Backend URL: https://backend.manln.online (Cloudflare Tunnel)
   *
   * NOTE: Next.js 16 dùng Turbopack by default
   * - Không support webpack config
   * - Không support allowedDevOrigins experimental option
   * - Cross-origin warnings từ Cloudflare Tunnel là normal
   * - HMR issues có thể fix bằng cách refresh browser (F5)
   */
  async rewrites() {
    const backendUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://backend.manln.online';

    return {
      beforeFiles: [
        {
          source: '/api/:path*',
          destination: `${backendUrl}/api/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
