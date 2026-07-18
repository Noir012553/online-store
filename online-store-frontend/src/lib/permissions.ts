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

export const getAccessDeniedMessage = (permission: Permission): string => {
  const messages: Record<Permission, string> = {
    'manage:users': 'Only super admins can manage users',
    'manage:currency': 'Only super admins can manage currencies',
    'manage:translations': 'Admins can manage translations',
    'manage:products': 'Only admins can manage products',
    'manage:orders': 'Only admins can manage orders',
    'manage:customers': 'Only admins can manage customers',
    'manage:coupons': 'Only admins can manage coupons',
    'manage:banners': 'Only admins can manage banners',
  };
  return messages[permission];
};
