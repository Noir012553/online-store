import React, { useEffect } from 'react';
import { useAuth } from '../../lib/context/AuthContext';
import { useRouter } from 'next/router';
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

const getDenialKey = (feature: string) => `denied_${feature}`;

export const ProtectedAdminPage: React.FC<ProtectedAdminPageProps> = ({
  permission,
  children,
  featureName,
}) => {
  const { isAdmin, isSuperAdmin, can, logout } = useAuth();
  const router = useRouter();

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

  useEffect(() => {
    if (!hasPermission) {
      const denialKey = getDenialKey(featureName);
      const wasDeniedBefore = sessionStorage.getItem(denialKey);

      if (wasDeniedBefore) {
        // Đã show denied message lần trước → auto logout + redirect home
        sessionStorage.removeItem(denialKey);
        logout();
        router.push('/');
      } else {
        // Lần đầu tiên → set flag, show PermissionDenied
        sessionStorage.setItem(denialKey, 'true');
      }
    }
  }, [hasPermission, featureName, logout, router]);

  if (!hasPermission) {
    return <PermissionDenied feature={featureName} />;
  }

  return <>{children}</>;
};
