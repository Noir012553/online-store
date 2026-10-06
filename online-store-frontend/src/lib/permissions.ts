import { User } from './context/AuthContext';

export type Permission =
  | 'manage:users'
  | 'manage:currency'
  | 'manage:translations'
  | 'manage:products'
  | 'manage:orders'
  | 'manage:customers'
  | 'manage:coupons'
  | 'manage:banners';

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  user: [],
  admin: [
    'manage:products',
    'manage:orders',
    'manage:customers',
    'manage:coupons',
    'manage:banners',
    'manage:translations',
  ],
  'super-admin': [
    'manage:users',
    'manage:currency',
    'manage:translations',
    'manage:products',
    'manage:orders',
    'manage:customers',
    'manage:coupons',
    'manage:banners',
  ],
};

export const canAccess = (user: User | null, permission: Permission): boolean => {
  if (!user) return false;
  return ROLE_PERMISSIONS[user.role]?.includes(permission) ?? false;
};

export const canAccessPage = (user: User | null, pagePath: string): boolean => {
  if (!user) return false;

  const superAdminPages = [
    '/admin/usersAdmin',
    '/admin/currencyAdmin',
  ];

  if (superAdminPages.includes(pagePath)) {
    return user.role === 'super-admin';
  }

  return user.role === 'admin' || user.role === 'super-admin';
};
