import React from 'react';
import { Button } from '../../components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../components/ui/tooltip';
import { useAuth } from '../../lib/context/AuthContext';

type Permission =
  | 'manage:products'
  | 'manage:orders'
  | 'manage:customers'
  | 'manage:coupons'
  | 'manage:banners'
  | 'manage:users'
  | 'manage:currency'
  | 'manage:translations';

interface PermissionRequiredButtonProps extends React.ComponentProps<"button"> {
  permission?: Permission;
  permissionDeniedText?: string;
  children: React.ReactNode;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

/**
 * Button that shows a tooltip when user lacks required permission.
 * Optionally disables the button if permission is denied.
 * 
 * Usage:
 * ```tsx
 * <PermissionRequiredButton 
 *   permission="manage:users"
 *   permissionDeniedText="Only super admins can manage users"
 *   onClick={handleClick}
 * >
 *   Delete User
 * </PermissionRequiredButton>
 * ```
 */
export const PermissionRequiredButton: React.FC<PermissionRequiredButtonProps> = ({
  permission,
  permissionDeniedText,
  children,
  disabled = false,
  ...props
}) => {
  const { can } = useAuth();

  // If no permission specified, render normal button
  if (!permission) {
    return (
      <Button disabled={disabled} {...props}>
        {children}
      </Button>
    );
  }

  // Check permission
  const hasPermission = (() => {
    switch (permission) {
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

  // If user has permission, render normal button
  if (hasPermission) {
    return (
      <Button disabled={disabled} {...props}>
        {children}
      </Button>
    );
  }

  // If user lacks permission, show tooltip
  const defaultText = permissionDeniedText || `You don't have permission for this action`;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-block">
            <Button disabled={true} {...props}>
              {children}
            </Button>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="bg-red-600 text-white">
          {defaultText}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
