import '../styles/index.css';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import { useEffect, useState } from 'react';
import dynamicImport from 'next/dynamic';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Toaster } from "../components/ui/sonner";
import { CartProvider } from "../lib/context/CartContext";
import { AuthProvider } from "../lib/context/AuthContext";
import { CategoryProvider } from "../lib/context/CategoryContext";
import { LanguageProvider, useLanguage } from "../lib/context/LanguageContext";
import { CurrencyProvider } from "../lib/context/CurrencyContext";
import { LoadingGate } from "../components/LoadingGate";
import { useRouter } from 'next/router';
import { PageTransition } from "../components/PageTransition";
import { HamsterLoader } from "../components/HamsterLoader";
import AdminLayout from "../components/admin/_AdminLayout";
import { DEFAULT_SITE_DESCRIPTION, DEFAULT_SITE_IMAGE, DEFAULT_SITE_TITLE, SITE_NAME } from '../lib/seo';
import { ProtectedAdminPage, type PagePermission } from "../components/admin/ProtectedAdminPage";

const Header = dynamicImport(() => import("../components/Header").then((mod) => mod.Header), {
  ssr: false,
  loading: () => <div className="h-20" aria-hidden="true" />,
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

type PageWithAdminMeta = AppProps['Component'] & {
  adminMeta?: {
    permission: PagePermission;
    featureName: string;
  };
};

// Clear all cached query data (including admin data) when the user logs out,
// so sensitive data does not linger in memory (gcTime up to 10 minutes).
function useClearQueryCacheOnLogout() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const handleLogout = () => {
      queryClient.clear();
      queryClient.cancelQueries();
    };
    window.addEventListener('auth:logout', handleLogout);
    return () => window.removeEventListener('auth:logout', handleLogout);
  }, [queryClient]);
}

function AppContent({ Component, pageProps }: AppContentProps) {
  useClearQueryCacheOnLogout();
  const [isPageLoading, setIsPageLoading] = useState(false);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(false);
  const [isAdminPage, setIsAdminPage] = useState(false);
  const [isRouterReady, setIsRouterReady] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isCriticalTranslationsReady, setIsCriticalTranslationsReady] = useState(false);
  const { locale, isLoadingNamespace } = useLanguage();

  const componentWithMeta = Component as PageWithAdminMeta;
  const adminMeta = componentWithMeta.adminMeta;

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

    let navigationTimer: ReturnType<typeof setTimeout> | null = null;
    let navigationFailSafeTimer: ReturnType<typeof setTimeout> | null = null;
    let activeNavigationUrl: string | null = null;
    const clearNavigationTimer = () => {
      if (navigationTimer) {
        clearTimeout(navigationTimer);
        navigationTimer = null;
      }
    };
    const clearNavigationFailSafeTimer = () => {
      if (navigationFailSafeTimer) {
        clearTimeout(navigationFailSafeTimer);
        navigationFailSafeTimer = null;
      }
    };
    const getRoutePath = (url: string) => url.split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/';

    const handleStart = (url: string, { shallow }: { shallow: boolean }) => {
      if (shallow) return;
      clearNavigationTimer();
      clearNavigationFailSafeTimer();
      activeNavigationUrl = url;
      navigationTimer = setTimeout(() => {
        navigationTimer = null;
        setShowLoadingOverlay(true);
      }, 200);
      navigationFailSafeTimer = setTimeout(() => {
        navigationFailSafeTimer = null;
        clearNavigationTimer();
        activeNavigationUrl = null;
        setIsPageLoading(false);
        setShowLoadingOverlay(false);
      }, 15000);
      setIsPageLoading(true);
    };

    const handleComplete = (url: string, { shallow }: { shallow: boolean }) => {
      if (shallow || (activeNavigationUrl && getRoutePath(url) !== getRoutePath(activeNavigationUrl))) return;
      clearNavigationTimer();
      clearNavigationFailSafeTimer();
      activeNavigationUrl = null;
      setIsPageLoading(false);
      setShowLoadingOverlay(false);
    };
    const handleError = (_error: Error, url: string, options: { shallow: boolean }) => {
      handleComplete(url, options);
    };

    router?.events?.on('routeChangeStart', handleStart);
    router?.events?.on('routeChangeComplete', handleComplete);
    router?.events?.on('routeChangeError', handleError);

    return () => {
      clearNavigationTimer();
      clearNavigationFailSafeTimer();
      activeNavigationUrl = null;
      setIsPageLoading(false);
      setShowLoadingOverlay(false);
      router?.events?.off('routeChangeStart', handleStart);
      router?.events?.off('routeChangeComplete', handleComplete);
      router?.events?.off('routeChangeError', handleError);
    };
  }, [isRouterReady, router]);

  // Hide initial loading overlay as soon as app mounts (Hydration complete)
  useEffect(() => {
    setIsFirstLoad(false);
    setIsHydrated(true);
  }, []);

  // Wait for critical translations (common namespace) to load
  useEffect(() => {
    if (isHydrated && !isLoadingNamespace('common')) {
      setIsCriticalTranslationsReady(true);
    }
  }, [isHydrated, isLoadingNamespace]);

  // Check if current page is admin page
  useEffect(() => {
    if (router?.isReady && router?.pathname) {
      setIsAdminPage(router.pathname.startsWith('/admin'));
    }
  }, [router?.isReady, router?.pathname]);

  if ((!isHydrated || !isCriticalTranslationsReady) && router?.pathname !== '/') {
    return (
      <LoadingGate />
    );
  }

  if (isAdminPage) {
    return (
      <AdminLayout>
        <ProtectedAdminPage
          permission={adminMeta?.permission || 'admin'}
          featureName={adminMeta?.featureName || 'Admin'}
        >
          {showLoadingOverlay && (
            <div className="fixed inset-0 z-9998 flex items-center justify-center bg-white/50 backdrop-blur-sm">
              <HamsterLoader size={144} />
            </div>
          )}
          <PageTransition key={router?.asPath?.split('?')[0] || ''}>
            <Component {...pageProps} />
          </PageTransition>
        </ProtectedAdminPage>
      </AdminLayout>
    );
  }

  return (
    <>
      <Header />
      <main className="min-h-screen relative bg-white">
        {showLoadingOverlay && (
          <div className="fixed inset-0 z-9998 flex items-center justify-center bg-white/50 backdrop-blur-sm">
            <HamsterLoader size={144} />
          </div>
        )}
        {router?.pathname === '/' ? (
          <Component {...pageProps} />
        ) : (
          <PageTransition key={router?.asPath?.split('?')[0] || ''}>
            <Component {...pageProps} />
          </PageTransition>
        )}
      </main>
      <Footer />
      <ScrollToTop />
      <FloatingCart />
      <Toaster position="top-right" />
    </>
  );
}

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <Head>
        <title>{DEFAULT_SITE_TITLE}</title>
        <meta name="description" content={DEFAULT_SITE_DESCRIPTION} key="description" />
        <meta property="og:type" content="website" key="og-type" />
        <meta property="og:site_name" content={SITE_NAME} key="og-site-name" />
        <meta property="og:title" content={DEFAULT_SITE_TITLE} key="og-title" />
        <meta property="og:description" content={DEFAULT_SITE_DESCRIPTION} key="og-description" />
        <meta property="og:image" content={DEFAULT_SITE_IMAGE} key="og-image" />
        <meta name="twitter:card" content="summary_large_image" key="twitter-card" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <LanguageProvider>
        <CurrencyProvider>
          <AuthProvider>
            <CategoryProvider>
              <CartProvider>
                <AppContent Component={Component} pageProps={pageProps} />
              </CartProvider>
            </CategoryProvider>
          </AuthProvider>
        </CurrencyProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

export default MyApp;
