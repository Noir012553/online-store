import '../styles/index.css';
import type { AppProps } from 'next/app';
import { useEffect, useState } from 'react';
import dynamicImport from 'next/dynamic';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from "../components/ui/sonner";
import { CartProvider } from "../lib/context/CartContext";
import { AuthProvider } from "../lib/context/AuthContext";
import { CategoryProvider } from "../lib/context/CategoryContext";
import { LanguageProvider, useLanguage } from "../lib/context/LanguageContext";
import { useRouter } from 'next/router';
import { AnimatePresence } from 'framer-motion';
import { PageTransition, PandaRolling } from "../components/PageTransition";

const Header = dynamicImport(() => import("../components/Header").then((mod) => mod.Header), {
  ssr: false,
});

const Footer = dynamicImport(() => import("../components/Footer").then((mod) => mod.Footer), {
  ssr: false,
});

const ScrollToTop = dynamicImport(() => import("../components/ScrollToTop").then((mod) => mod.ScrollToTop), {
  ssr: false,
});

const FloatingCart = dynamicImport(() => import("../components/FloatingCart").then((mod) => mod.FloatingCart), {
  ssr: false,
});

// Create QueryClient once
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes - Data considered fresh for 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes - Cached data kept in memory for 10 minutes
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: 'always',
    },
  },
});

interface AppContentProps {
  Component: AppProps['Component'];
  pageProps: AppProps['pageProps'];
}

function AppContent({ Component, pageProps }: AppContentProps) {
  const [isPageLoading, setIsPageLoading] = useState(false);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(false);
  const [isAdminPage, setIsAdminPage] = useState(false);
  const [isRouterReady, setIsRouterReady] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const { locale } = useLanguage();

  let router: ReturnType<typeof useRouter> | null = null;
  try {
    router = useRouter();
  } catch {
    router = null;
  }

  // Update HTML lang attribute when locale changes
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  // Track when router is ready
  useEffect(() => {
    if (router?.isReady) {
      setIsRouterReady(true);
    }
  }, [router?.isReady]);

  // Smart Loading: Only show animation if navigation takes longer than 200ms
  useEffect(() => {
    if (!isRouterReady) return;

    let navigationTimer: NodeJS.Timeout | null = null;

    const handleStart = () => {
      navigationTimer = setTimeout(() => {
        setShowLoadingOverlay(true);
      }, 200);
      setIsPageLoading(true);
    };

    const handleComplete = () => {
      if (navigationTimer) clearTimeout(navigationTimer);
      setIsPageLoading(false);
      setShowLoadingOverlay(false);
    };

    router?.events?.on('routeChangeStart', handleStart);
    router?.events?.on('routeChangeComplete', handleComplete);
    router?.events?.on('routeChangeError', handleComplete);

    return () => {
      if (navigationTimer) clearTimeout(navigationTimer);
      router?.events?.off('routeChangeStart', handleStart);
      router?.events?.off('routeChangeComplete', handleComplete);
      router?.events?.off('routeChangeError', handleComplete);
    };
  }, [isRouterReady, router]);

  // Hide initial loading overlay as soon as app mounts (Hydration complete)
  useEffect(() => {
    setIsFirstLoad(false);
    setIsHydrated(true);
  }, []);

  // Check if current page is admin page
  useEffect(() => {
    if (router?.isReady && router?.pathname) {
      setIsAdminPage(router.pathname.startsWith('/admin'));
    }
  }, [router?.isReady, router?.pathname]);

  if (!isHydrated) {
    return null;
  }

  return (
    <>
      <Header />
      <main className={`${!isAdminPage ? 'min-h-screen relative bg-white' : ''}`}>
        <AnimatePresence mode="wait">
          {showLoadingOverlay && (
            <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-white/50 backdrop-blur-sm">
              <PandaRolling />
            </div>
          )}
        </AnimatePresence>
        <AnimatePresence mode="wait">
          <PageTransition key={router?.asPath || ''}>
            <Component {...pageProps} />
          </PageTransition>
        </AnimatePresence>
      </main>
      <Footer />
      {!isAdminPage && <ScrollToTop />}
      {!isAdminPage && <FloatingCart />}
      <Toaster position="top-right" />
    </>
  );
}

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <AuthProvider>
          <CategoryProvider>
            <CartProvider>
              <AppContent Component={Component} pageProps={pageProps} />
            </CartProvider>
          </CategoryProvider>
        </AuthProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

export default MyApp;
