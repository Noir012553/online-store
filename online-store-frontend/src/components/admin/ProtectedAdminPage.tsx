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

  // Signed-out visitors are redirected by the admin layout. Access Denied is
  // only for users who are signed in but lack the required role.
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
