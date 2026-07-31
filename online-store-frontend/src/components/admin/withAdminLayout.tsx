import React from 'react';
import type { PagePermission } from './ProtectedAdminPage';

interface AdminPageOptions {
  permission: PagePermission;
  featureName: string;
}

/**
 * Helper to add admin metadata to a page component
 * The _app.tsx will use this metadata to apply AdminLayout + ProtectedAdminPage
 *
 * Usage:
 * ```tsx
 * const DashboardContent = () => <div>...</div>;
 *
 * export default withAdminMeta(DashboardContent, {
 *   permission: 'admin',
 *   featureName: 'Dashboard'
 * });
 * ```
 */
export function withAdminMeta<P extends object>(
  Component: React.ComponentType<P>,
  options: AdminPageOptions
) {
  (Component as any).adminMeta = {
    permission: options.permission,
    featureName: options.featureName,
  };

  return Component;
}

/**
 * @deprecated Use withAdminMeta instead. This is kept for backwards compatibility.
 */
export function withAdminLayout<P extends object>(
  Component: React.ComponentType<P>,
  options: AdminPageOptions
) {
  return withAdminMeta(Component, options);
}
