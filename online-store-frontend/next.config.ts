import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  /**
   * API Proxy Configuration
   * Forwarding /api/* requests to backend server
   * No CORS needed - server-to-server communication
   */
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/api/:path*',
          destination: 'https://online-store-backend-production-3628.up.railway.app/api/:path*',
        },
      ],
    };
  },
};

export default nextConfig;
