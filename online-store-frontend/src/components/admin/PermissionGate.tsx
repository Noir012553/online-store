import { ReactNode } from 'react';
import { useAuth } from '../../lib/context/AuthContext';
import { Permission } from '../../lib/permissions';

interface PermissionGateProps {
  permission: Permission;
  children: ReactNode;
  fallback?: ReactNode;
}

export const PermissionGate: React.FC<PermissionGateProps> = ({
  permission,
  children,
  fallback = null,
}) => {
  const { can } = useAuth();

  const permissionMap: Record<Permission, boolean> = {
    'manage:users': can.manageUsers,
    'manage:currency': can.manageCurrency,
    'manage:translations': can.manageTranslations,
    'manage:products': can.manageProducts,
    'manage:orders': can.manageOrders,
    'manage:customers': can.manageCustomers,
    'manage:coupons': can.manageCoupons,
    'manage:banners': can.manageBanners,
  };

  if (!permissionMap[permission]) {
    return fallback;
  }

  return <>{children}</>;
};
