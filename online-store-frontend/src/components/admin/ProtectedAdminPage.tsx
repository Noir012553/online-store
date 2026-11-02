import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../lib/context/AuthContext';
import { PermissionDenied } from './PermissionDenied';

export type PagePermission =
  | 'admin'
  | 'super-admin'
  | 'manage:products'
  | 'manage:orders'
  | 'manage:customers'
  | 'manage:coupons'
  | 'manage:banners'
  | 'manage:users'
  | 'manage:currency'
  | 'manage:translations';

interface ProtectedAdminPageProps {
  permission: PagePermission;
  children: React.ReactNode;
  featureName: string;
}

export const ProtectedAdminPage: React.FC<ProtectedAdminPageProps> = ({
  permission,
  children,
  featureName,
}) => {
  const { isAdmin, isSuperAdmin, can, isInitialized, user } = useAuth();
  const router = useRouter();

  // Signed-out visitors on an admin page are redirected to /login (keeping the
  // target path so login can bring them back). Access Denied is only for users
  // who ARE signed in but lack the required role — previously a signed-out
  // user got "Access Denied" with a "Back to Dashboard" button that kept them
  // trapped inside the admin area after logging out.
  // Same last-resort safety net as AdminLayout: if auth init is stuck
  // (isInitialized never flips true), fail closed after 12s.
  useEffect(() => {
    if (isInitialized) return;
    const timer = setTimeout(() => {
      if (router.pathname.startsWith('/login')) return;
      void router.replace(`/login?from=${encodeURIComponent(router.asPath)}`);
    }, 12000);
    return () => clearTimeout(timer);
  }, [isInitialized, router]);

  useEffect(() => {
    if (!isInitialized || user) return;
    if (router.pathname.startsWith('/login')) return;
    void router.replace(`/login?from=${encodeURIComponent(router.asPath)}`);
  }, [isInitialized, user, router]);

  const hasPermission = (() => {
    switch (permission) {
      case 'admin':
        return isAdmin;
      case 'super-admin':
        return isSuperAdmin;
      case 'manage:products':
        return can.manageProducts;
      case 'manage:orders':
        return can.manageOrders;
      case 'manage:customers':
        return can.manageCustomers;
      case 'manage:coupons':
        return can.manageCoupons;
      case 'manage:banners':
        return can.manageBanners;
      case 'manage:users':
        return can.manageUsers;
      case 'manage:currency':
        return can.manageCurrency;
      case 'manage:translations':
        return can.manageTranslations;
      default:
        return false;
    }
  })();


  if (!isInitialized || !user) {
    // Signed-out: redirect effect above sends the user to /login. Render
    // nothing meanwhile to avoid flashing Access Denied during logout.
    return null;
  }

  if (!hasPermission) {
    // Signed-in but lacking the role: explain instead of silently redirecting.
    return <PermissionDenied feature={featureName} />;
  }

  return <>{children}</>;
};
