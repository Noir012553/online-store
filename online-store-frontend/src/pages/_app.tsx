import '../styles/index.css';
import type { AppProps } from 'next/app';
import { Toaster } from "../components/ui/sonner";
import { CartProvider } from "../lib/context/CartContext";
import { AuthProvider } from "../lib/context/AuthContext";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { ScrollToTop } from "../components/ScrollToTop";
import { FloatingCart } from "../components/FloatingCart";

function MyApp({ Component, pageProps }: AppProps) {
  return (
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
  );
}

export default MyApp;