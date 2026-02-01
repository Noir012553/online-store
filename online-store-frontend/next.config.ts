import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  /**
   * Allowed Dev Origins
   * Cho phép dev server nhận requests từ domain external
   * Sử dụng khi chạy qua Cloudflare Tunnel hoặc domain khác
   */
  allowedDevOrigins: ['manln.online'],

  /**
   * Experimental Configuration
   * Cấu hình cho Next.js 16 (Turbopack)
   */
  experimental: {
    serverActions: {
      allowedOrigins: ['manln.online'],
    },
  },

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
   * - Hỗ trợ allowedDevOrigins experimental option từ bản này
   * - Cross-origin warnings từ Cloudflare Tunnel sẽ được fix
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

  /**
   * Security Headers Configuration
   * Block Cloudflare beacon tracking script
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "script-src 'self' 'unsafe-inline' 'unsafe-eval' https: data:; connect-src 'self' https: data: wss:; img-src 'self' https: data:; font-src 'self' https: data:; style-src 'self' 'unsafe-inline' https:;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
