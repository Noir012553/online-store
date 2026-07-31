import { useCallback, useState, useEffect } from 'react';
import { useAuth } from '../lib/context/AuthContext';
import { getSafeReturnPath } from '../lib/utils';
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
      await logout();
      setShowConfirm(false);
      if (router?.isReady) {
        router.push(getSafeReturnPath(returnTo));
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
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
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
