import { useCallback, useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../lib/context/AuthContext';
import { getSafeReturnPath, isLoginPath } from '../lib/utils';
import { useRouter } from 'next/router';
import { useTranslation } from '../lib/i18n';

/**
 * Hook quản lý logout confirmation
 * Hiển thị dialog xác nhận trước khi logout
 *
 * Usage:
 * const { handleLogoutClick, ConfirmDialog } = useLogoutConfirm();
 *
 * Trong JSX:
 * <button onClick={handleLogoutClick}>Logout</button>
 * <ConfirmDialog />
 */

export const useLogoutConfirm = () => {
  const { logout } = useAuth();
  const { t } = useTranslation();
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [returnTo, setReturnTo] = useState('/');
  const router = useRouter();

  const handleLogoutClick = useCallback(() => {
    if (router?.isReady) {
      setReturnTo(router.asPath || '/');
    }
    setShowConfirm(true);
  }, [router]);

  const handleConfirmLogout = useCallback(async () => {
    try {
      setIsLoggingOut(true);
      // Capture the current path BEFORE logout clears the route context.
      const currentPath = router?.isReady ? (router.asPath || '/') : returnTo;
      await logout();
      setShowConfirm(false);
      // Success feedback — a distinct message, NOT the login one.
      toast.success(t('logout_success', 'auth'));
      // Always land on /login after logging out. The page we were on is
      // preserved as ?from= so login can bring the user back to it.
      // Never push the user back to the page itself: non-admin pages have no
      // guard to bounce them to /login, and admin pages may hang on their
      // signed-out "Loading…" shell if the /login chunk is slow to fetch.
      const target = getSafeReturnPath(currentPath);
      if (router?.isReady) {
        router.push(isLoginPath(target) ? target : `/login?from=${encodeURIComponent(target)}`);
      } else if (typeof window !== 'undefined') {
        window.location.assign(isLoginPath(currentPath) ? '/login' : `/login?from=${encodeURIComponent(currentPath)}`);
      }
    } catch (error) {
      // Silent fail
    } finally {
      setIsLoggingOut(false);
    }
  }, [logout, router, returnTo]);

  const handleCancel = useCallback(() => {
    setShowConfirm(false);
  }, []);

  /**
   * Component Dialog - hiển thị confirmation
   * Dùng HTML native dialog thay vì Modal phức tạp để keep it simple
   */
  const ConfirmDialog = () => {
    if (!showConfirm) return null;

    return (
      <div className="fixed inset-0 z-[2147483647] bg-black/50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm mx-4">
          <h2 className="text-lg font-semibold mb-2">{t('logout_confirm_title', 'auth')}</h2>
          <p className="text-gray-600 mb-6">
            {t('logout_confirm_desc', 'auth')}
          </p>
          <div className="flex gap-3 justify-end">
            <button
              onClick={handleCancel}
              disabled={isLoggingOut}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors"
            >
              {t('logout_cancel', 'auth')}
            </button>
            <button
              onClick={handleConfirmLogout}
              disabled={isLoggingOut}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {isLoggingOut ? t('logout_processing', 'auth') : t('logout_button', 'auth')}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return {
    handleLogoutClick,
    ConfirmDialog,
  };
};
