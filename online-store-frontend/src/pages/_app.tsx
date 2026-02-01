import '../styles/index.css';
import type { AppProps } from 'next/app';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { Toaster } from "../components/ui/sonner";
import { CartProvider } from "../lib/context/CartContext";
import { AuthProvider } from "../lib/context/AuthContext";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { ScrollToTop } from "../components/ScrollToTop";
import { FloatingCart } from "../components/FloatingCart";
import { GOOGLE_CLIENT_ID } from "../config";

function MyApp({ Component, pageProps }: AppProps) {
  // Debug: Check if GOOGLE_CLIENT_ID is loaded
  if (typeof window !== 'undefined' && !GOOGLE_CLIENT_ID) {
    console.error('[ERROR] GOOGLE_CLIENT_ID is not set. Check .env.local file.');
  } else if (typeof window !== 'undefined') {
    console.log('[DEBUG] GOOGLE_CLIENT_ID loaded:', GOOGLE_CLIENT_ID.substring(0, 20) + '...');
  }

  // Don't render GoogleOAuthProvider if clientId is empty
  if (!GOOGLE_CLIENT_ID) {
    return (
      <div className="p-4 bg-red-100 text-red-700">
        <strong>Configuration Error:</strong> GOOGLE_CLIENT_ID is not set in .env.local
      </div>
    );
  }

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <CartProvider>
          <Header />
          <main className="min-h-screen">
            <Component {...pageProps} />
          </main>
          <Footer />
          <ScrollToTop />
          <FloatingCart />
          <Toaster position="top-right" />
        </CartProvider>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}

export default MyApp;
