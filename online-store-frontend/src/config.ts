/**
 * Application Configuration
 * Centralized configuration for backend URL and other settings
 * All frontend files should import from this file instead of hardcoding URLs
 */

/**
 * Backend API URL
 *
 * Unified backend: https://backend.manln.online (Cloudflare Tunnel)
 *
 * Used for:
 * - API proxy rewrites in next.config.ts
 * - Direct image URL construction
 * - Any direct backend requests
 */
export const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://backend.manln.online';

/**
 * Frontend port (Development)
 * Used locally for development server
 */
export const FRONTEND_PORT = 3000;

/**
 * API Base path (used when proxying through Next.js)
 * Frontend makes requests to /api/... which gets proxied to BACKEND_URL/api/...
 */
export const API_BASE_PATH = '/api';

/**
 * Google OAuth Configuration
 * Used for Google Sign-In integration
 * Requires NEXT_PUBLIC_GOOGLE_CLIENT_ID environment variable
 */
export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';

if (!GOOGLE_CLIENT_ID && typeof window !== 'undefined') {
  console.warn('[CONFIG] NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set in environment variables');
}
