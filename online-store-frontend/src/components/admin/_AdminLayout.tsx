import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/compat/router";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  LogOut,
  Menu,
  X,
  Home,
  TicketPercent,
  ArrowDownUp,
  BarChart3,
  ChevronDown,
  Megaphone,
  Shield,
  Languages,
  Globe,
  DollarSign,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../../lib/context/AuthContext";
import { useLanguage } from "../../lib/i18n";
import { Button } from "../../components/ui/button";
import { RoleBadge } from "./RoleBadge";
import { Header } from "../Header";
import { Footer } from "../Footer";

const NotificationBell = dynamic(() => import("../../components/admin/NotificationBell").then((mod) => mod.NotificationBell), {
  ssr: false,
});

const SIDEBAR_STORAGE_KEY = 'admin-sidebar-open';

type AdminMenuLink = {
  path: string;
  icon: LucideIcon;
  label: string;
};

type AdminMenuGroup = {
  id: string;
  title: string;
  icon: LucideIcon;
  children: AdminMenuLink[];
};

const DEFAULT_OPEN_GROUPS = {
  dashboard: true,
  'import-export': true,
  management: true,
  design: true,
  translations: true,
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { isAdmin, logout, user, isInitialized } = useAuth();
  const { t, loadNamespace, isLoadingNamespace, locale, setLocale } = useLanguage();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [hasLoadedSidebarState, setHasLoadedSidebarState] = useState(false);
  const [openGroups, setOpenGroups] = useState(DEFAULT_OPEN_GROUPS);
  const [adminNamespaceLoaded, setAdminNamespaceLoaded] = useState(false);
  const [isChangingLanguage, setIsChangingLanguage] = useState(false);

  useEffect(() => {
    // Load all admin translations when user enters admin section
    // Reset adminNamespaceLoaded when locale changes so we reload translations
    setAdminNamespaceLoaded(false);
    Promise.all([
      loadNamespace('admin'),
      loadNamespace('admin-common'),
      loadNamespace('admin-banners'),
      loadNamespace('admin-coupons'),
      loadNamespace('admin-customers'),
      loadNamespace('admin-export'),
      loadNamespace('admin-import'),
      loadNamespace('admin-notifications'),
      loadNamespace('admin-orders'),
      loadNamespace('admin-translation'),
      loadNamespace('admin-users'),
      loadNamespace('export'),
      loadNamespace('import'),
    ]).then(() => {
      setAdminNamespaceLoaded(true);
    });
  }, [loadNamespace, locale]);

  useEffect(() => {
    if (!router || !isInitialized) return;
    if (!user) {
    }
  }, [isInitialized, user, router]);

  useEffect(() => {
    const savedSidebarState = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);

    if (window.matchMedia('(max-width: 767px)').matches) {
      setSidebarOpen(false);
    } else if (savedSidebarState !== null) {
      setSidebarOpen(savedSidebarState === 'true');
    }

    setHasLoadedSidebarState(true);
  }, []);

  useEffect(() => {
    if (!hasLoadedSidebarState) return;

    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarOpen));
  }, [sidebarOpen, hasLoadedSidebarState]);

  if (!router || !isInitialized) {
    return null;
  }

  if (!user) {
    return null;
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <h2>{t('access_denied', 'errors')}</h2>
        <p className="text-gray-600 mb-6">{t('access_denied_desc', 'admin')}</p>
        <Link href="/">
          <Button className="bg-red-600 hover:bg-red-700">{t('back_home', 'admin')}</Button>
        </Link>
      </div>
    );
  }

  const menuItems: Array<{ type: "link"; id: string; item: AdminMenuLink } | { type: "group"; group: AdminMenuGroup }> = adminNamespaceLoaded ? [
    {
      type: "group" as const,
      group: {
        id: "dashboard",
        title: t('dashboard_title', 'admin'),
        icon: LayoutDashboard,
        children: [
          { path: "/admin/dashboard", icon: LayoutDashboard, label: t('dashboard_title', 'admin') },
          { path: "/admin/statistics", icon: BarChart3, label: t('statistics_title', 'admin') },
        ],
      },
    },
    {
      type: "group" as const,
      group: {
        id: "import-export",
        title: t('import_export_title', 'admin'),
        icon: ArrowDownUp,
        children: [
          { path: "/admin/importExport", icon: ArrowDownUp, label: t('import_export_title', 'admin') },
        ],
      },
    },
    {
      type: "group" as const,
      group: {
        id: "management",
        title: t('management', 'admin'),
        icon: Package,
        children: [
          { path: "/admin/products", icon: Package, label: t('menu_products', 'admin') },
          { path: "/admin/orders", icon: ShoppingCart, label: t('menu_orders', 'admin') },
          { path: "/admin/customers", icon: Users, label: t('menu_customers', 'admin') },
          ...(user?.role === 'super-admin' ? [
            { path: "/admin/usersAdmin", icon: Shield, label: t('menu_users', 'admin') },
          ] : []),
          { path: "/admin/coupons", icon: TicketPercent, label: t('menu_coupons', 'admin') },
        ],
      },
    },
    {
      type: "group" as const,
      group: {
        id: "design",
        title: t('menu_marketing', 'admin'),
        icon: Megaphone,
        children: [{ path: "/admin/bannersAdmin", icon: Megaphone, label: t('menu_banners', 'admin') }],
      },
    },
    ...(user?.role === 'super-admin' ? [
      {
        type: "group" as const,
        group: {
          id: "currency",
          title: t('admin_currency_management', 'admin-common'),
          icon: DollarSign,
          children: [{ path: "/admin/currencyAdmin", icon: DollarSign, label: t('admin_currency_management', 'admin-common') }],
        },
      },
    ] : []),
    ...(isAdmin ? [
      {
        type: "group" as const,
        group: {
          id: "translations",
          title: t('admin_translations_title', 'common'),
          icon: Languages,
          children: [
            { path: "/admin/languagesConfig", icon: Languages, label: t('admin_languages_config', 'admin-common') },
            { path: "/admin/translationsAdminTier1", icon: Languages, label: t('admin_translations_tier1', 'admin-common') },
            { path: "/admin/translationsAdminTier2", icon: Languages, label: t('admin_translations_tier2', 'admin-common') },
            { path: "/admin/productsTranslationsAdmin", icon: Globe, label: t('admin_products_translations', 'admin-common') },
          ],
        },
      },
    ] : []),
  ] : [];

  const isChildActive = (path: string) => router.isReady && router.pathname === path;
  const closeSidebarOnMobile = () => {
    if (window.matchMedia('(max-width: 767px)').matches) {
      setSidebarOpen(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-white relative">
      <Header />
      <div className="relative flex min-h-0 flex-1">
      {isLoadingNamespace('admin-common') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm">
          <div className="text-center">
            <div className="inline-block relative w-12 h-12 mb-4">
              <div className="absolute inset-0 rounded-full border-4 border-gray-200 border-t-red-600 animate-spin"></div>
            </div>
            <p className="text-gray-600 font-medium">{t('loading_admin_ui', 'admin')}</p>
          </div>
        </div>
      )}
      {sidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label={adminNamespaceLoaded ? t('sidebar_close', 'admin') : ''}
        />
      )}
      <aside className={`fixed bottom-0 left-0 top-20 z-50 flex w-64 flex-col bg-black text-white transition-all duration-300 ease-in-out md:static md:z-auto ${sidebarOpen ? 'translate-x-0 md:w-64' : '-translate-x-full md:translate-x-0 md:w-20'}`}>
        <div className={`p-4 border-b border-gray-700 flex ${sidebarOpen ? 'flex-row items-center justify-between' : 'flex-col items-center gap-4'}`}>
          <div className={`bg-red-600 text-white px-3 py-2 rounded shrink-0 ${!sidebarOpen && 'w-full text-center'}`}>
            <span className="text-xl">{t('logo_text', 'admin')}</span>
          </div>
          {sidebarOpen && adminNamespaceLoaded && (
            <div>
              <div className="text-lg">{t('store_name', 'admin')}</div>
              <div className="text-xs text-green-100">{t('management', 'admin')}</div>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-gray-300 hover:text-white p-2 rounded transition-colors shrink-0"
            title={adminNamespaceLoaded ? (sidebarOpen ? t('sidebar_close', 'admin') : t('sidebar_open', 'admin')) : ''}
            aria-label={adminNamespaceLoaded ? (sidebarOpen ? t('sidebar_close', 'admin') : t('sidebar_open', 'admin')) : ''}
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        <nav className={`flex-1 overflow-y-auto ${sidebarOpen ? 'p-4' : 'p-2'}`}>
          <div className="space-y-2">
            {menuItems.map((entry) => {
              if (entry.type === "link") {
                const Icon = entry.item.icon;
                const isActive = isChildActive(entry.item.path);

                return (
                  <Link
                    key={entry.id}
                    href={entry.item.path}
                    onClick={closeSidebarOnMobile}
                    className={`flex items-center gap-3 rounded-lg px-4 py-3 transition-colors ${sidebarOpen ? 'justify-start' : 'justify-center'} ${isActive
                        ? 'bg-red-600 text-white'
                        : 'text-gray-300 hover:bg-gray-800'
                      }`}
                    title={sidebarOpen ? undefined : entry.item.label}
                  >
                    <Icon className={`shrink-0 ${sidebarOpen ? 'w-5 h-5' : 'w-6 h-6'}`} />
                    {sidebarOpen && <span>{entry.item.label}</span>}
                  </Link>
                );
              }

              const isGroupOpen =
                openGroups[entry.group.id as keyof typeof openGroups];
              const isGroupActive = entry.group.children.some((child) => isChildActive(child.path));
              const GroupIcon = entry.group.icon;

              return (
                <div key={entry.group.id} className="rounded-lg">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenGroups((prev) => ({
                        ...prev,
                        [entry.group.id]:
                          !prev[entry.group.id as keyof typeof prev],
                      }))
                    }
                    className={`flex w-full items-center rounded-lg px-4 py-3 transition-colors ${sidebarOpen ? 'justify-between' : 'justify-center'} ${isGroupActive
                        ? 'bg-gray-700 text-white'
                        : 'text-gray-300 hover:bg-gray-800'
                      }`}
                    title={sidebarOpen ? undefined : entry.group.title}
                    aria-label={entry.group.title}
                  >
                    <span className={`flex items-center gap-3 ${sidebarOpen ? 'justify-start' : 'justify-center'}`}>
                      <GroupIcon className={`shrink-0 ${sidebarOpen ? 'w-5 h-5' : 'w-6 h-6'}`} />
                      {sidebarOpen && <span>{entry.group.title}</span>}
                    </span>
                    {sidebarOpen && (
                      <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isGroupOpen ? 'rotate-180' : ''}`} />
                    )}
                  </button>

                  {sidebarOpen && isGroupOpen && (
                    <ul className="ml-4 mt-2 space-y-2 border-l border-gray-700 pl-3">
                      {entry.group.children.map((child) => {
                        const Icon = child.icon;
                        const isActive = isChildActive(child.path);

                        return (
                          <li key={child.path}>
                            <Link
                              href={child.path}
                              onClick={closeSidebarOnMobile}
                              className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm transition-colors ${isActive
                                  ? 'bg-red-600 text-white'
                                  : 'text-gray-300 hover:bg-gray-800'
                                }`}
                            >
                              <Icon className="h-4 w-4 shrink-0" />
                              <span>{child.label}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </nav>

        <div className={`border-t border-red-600 bg-red-600 ${sidebarOpen ? 'p-4' : 'p-2'}`}>
          {sidebarOpen && (
            <div className="flex items-center gap-3 mb-3 px-2">
              <div className="w-10 h-10 bg-orange-300 rounded-full flex items-center justify-center shrink-0 text-gray-800 font-semibold">
                <span>{(user.name || t('user_unnamed', 'admin'))[0]?.toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{user.name || t('user_unnamed', 'admin')}</div>
                <div className="text-xs text-red-100 truncate">{user.role}</div>
              </div>
            </div>
          )}
          <Link href="/">
            <Button
              variant="ghost"
              size="sm"
              className={`w-full mb-2 text-white hover:bg-red-700 flex items-center ${sidebarOpen ? 'justify-start gap-2' : 'justify-center'}`}
              title={sidebarOpen || !adminNamespaceLoaded ? undefined : t('back_home', 'admin')}
            >
              <Home className="w-5 h-5 text-white shrink-0" />
              {sidebarOpen && adminNamespaceLoaded && <span>{t('back_home', 'admin')}</span>}
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className={`w-full text-white hover:bg-red-700 flex items-center ${sidebarOpen ? 'justify-start gap-2' : 'justify-center'}`}
            onClick={logout}
            title={sidebarOpen || !adminNamespaceLoaded ? undefined : t('logout', 'admin')}
          >
            <LogOut className="w-5 h-5 text-white shrink-0" />
            {sidebarOpen && adminNamespaceLoaded && <span>{t('logout', 'admin')}</span>}
          </Button>
        </div>
      </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b bg-white px-4 py-4 shadow-sm sm:px-8">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="rounded p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 md:hidden"
                onClick={() => setSidebarOpen(true)}
                aria-label={adminNamespaceLoaded ? t('sidebar_open', 'admin') : ''}
              >
                <Menu className="h-5 w-5" />
              </button>
              <RoleBadge />
            </div>
            <NotificationBell />
          </div>
          <div className="flex-1 overflow-y-auto p-4 sm:p-8">
            {children}
          </div>
        </main>
      </div>
      <Footer />
    </div>
  );
}
