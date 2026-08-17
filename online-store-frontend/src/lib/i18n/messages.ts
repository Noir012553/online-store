/**
 * Frontend i18n messages
 * 
 * ⚠️ DEPRECATED: All messages are now stored in backend (MongoDB)
 * Use the useTranslation hook to fetch translations from backend API
 * 
 * Example:
 *   const { t } = useTranslation();
 *   <p>{t('ui.commandPalette')}</p>
 * 
 * Backend endpoint: GET /api/translations?lang=vi&ns=common
 */

// Empty export for backward compatibility (if needed)
export const messages = {};

export const getMessage = (lang: string, path: string, fallback?: string): string => {
  return fallback || path;
};
