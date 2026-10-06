import { useState, useEffect, useRef } from 'react';
import { useTranslation } from '../../lib/i18n';
import { getAuthToken } from '../../lib/api';
import { Locale, SUPPORTED_LOCALES, DEFAULT_LOCALE } from '../../lib/i18n/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';

interface CacheStats {
  totalCachedTranslations: number;
  byLanguage: Array<{ _id: string; count: number }>;
}

interface BulkTranslateResponse {
  success: boolean;
  message: string;
  data: {
    targetLang: string;
    namespace: string;
    translatedCount: number;
    failedCount: number;
  };
}
const NAMESPACES = ['common', 'checkout', 'products', 'admin'];

// Language configuration - derived from SUPPORTED_LOCALES
const LANGUAGE_CONFIG: Record<string, { labelKey: string; badgeKey: string }> = Object.fromEntries(
  SUPPORTED_LOCALES.map(lang => [
    lang,
    {
      labelKey: `translation_management_language_${lang}`,
      badgeKey: `translation_management_language_${lang}_badge`
    }
  ])
);

export function TranslationManagementPage() {
  const { t, locale } = useTranslation();
  const [selectedLang, setSelectedLang] = useState(DEFAULT_LOCALE);
  const [selectedNamespace, setSelectedNamespace] = useState('common');
  const [isTranslating, setIsTranslating] = useState(false);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [message, setMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean; action: 'clearCache' }>({ isOpen: false, action: 'clearCache' });
  const cacheStatTimerRef = useRef<NodeJS.Timeout | null>(null);

  const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '');

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (cacheStatTimerRef.current) {
        clearTimeout(cacheStatTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    fetchCacheStats();
  }, [locale]);

  const fetchCacheStats = async () => {
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE}/api/translations/admin/cache-stats?lang=${locale}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setCacheStats(data.data);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error fetching cache stats:', error);
      }
    }
  };

  const handleBulkTranslate = async () => {
    if (!selectedLang) {
      setMessage({ type: 'error', text: t('translation_management_select_language_error', 'admin') });
      return;
    }

    setIsTranslating(true);
    setMessage({ type: 'info', text: t('translation_management_starting_bulk_translation', 'admin') });

    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE}/api/translations/bulk-sync?lang=${locale}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          targetLang: selectedLang,
          namespace: selectedNamespace,
        }),
      });

      const data: BulkTranslateResponse = await response.json();

      if (data.success) {
        setMessage({
          type: 'success',
          text: `${data.message} (${data.data.translatedCount} ${t('translation_management_translated_label', 'admin')}, ${data.data.failedCount} ${t('translation_management_failed_label', 'admin')})`,
        });
        if (cacheStatTimerRef.current) {
          clearTimeout(cacheStatTimerRef.current);
        }
        cacheStatTimerRef.current = setTimeout(() => fetchCacheStats(), 1000);
      } else {
        setMessage({
          type: 'error',
          text: data.message,
        });
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: `${t('translation_management_error_prefix', 'admin')} ${error instanceof Error ? error.message : t('unknown_error', 'admin')}`,
      });
    } finally {
      setIsTranslating(false);
    }
  };

  const handleClearCache = async () => {
    setConfirmDialog({ isOpen: true, action: 'clearCache' });
  };

  const confirmClearCache = async () => {
    setConfirmDialog({ isOpen: false, action: 'clearCache' });

    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE}/api/translations/admin/clear-cache?lang=${locale}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (data.success) {
        setMessage({
          type: 'success',
          text: data.message,
        });
        if (cacheStatTimerRef.current) {
          clearTimeout(cacheStatTimerRef.current);
        }
        cacheStatTimerRef.current = setTimeout(() => fetchCacheStats(), 1000);
      } else {
        setMessage({
          type: 'error',
          text: t('translation_management_clear_cache_failed', 'admin'),
        });
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: `${t('translation_management_error_prefix', 'admin')} ${error instanceof Error ? error.message : t('unknown_error', 'admin')}`,
      });
    }
  };

  return (
    <div className="translation-management">
      <style>{`
        .translation-management {
          max-width: 900px;
          margin: 0 auto;
          padding: 20px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }

        .page-header {
          margin-bottom: 30px;
        }

        .page-header h1 {
          margin: 0 0 10px 0;
          font-size: 28px;
          color: #333;
        }

        .page-header p {
          margin: 0;
          color: #666;
          font-size: 14px;
        }

        .section {
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 20px;
          background: #f9f9f9;
        }

        .section-title {
          font-size: 16px;
          font-weight: 600;
          margin: 0 0 15px 0;
          color: #333;
        }

        .form-group {
          margin-bottom: 15px;
        }

        .form-group label {
          display: block;
          margin-bottom: 5px;
          font-size: 14px;
          font-weight: 500;
          color: #555;
        }

        .form-group select {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
          background: white;
          cursor: pointer;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 15px;
        }

        .button-group {
          display: flex;
          gap: 10px;
          margin-top: 20px;
        }

        .btn {
          flex: 1;
          padding: 10px 16px;
          border: none;
          border-radius: 4px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .btn-primary {
          background: #007bff;
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          background: #0056b3;
        }

        .btn-danger {
          background: #dc3545;
          color: white;
        }

        .btn-danger:hover:not(:disabled) {
          background: #c82333;
        }

        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .message {
          padding: 12px 16px;
          border-radius: 4px;
          margin-bottom: 15px;
          font-size: 14px;
          animation: slideIn 0.3s ease;
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .message.success {
          background: #d4edda;
          color: #155724;
          border: 1px solid #c3e6cb;
        }

        .message.error {
          background: #f8d7da;
          color: #721c24;
          border: 1px solid #f5c6cb;
        }

        .message.info {
          background: #d1ecf1;
          color: #0c5460;
          border: 1px solid #bee5eb;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 15px;
          margin-bottom: 20px;
        }

        .stat-card {
          background: white;
          border: 1px solid #ddd;
          border-radius: 4px;
          padding: 15px;
          text-align: center;
        }

        .stat-label {
          font-size: 12px;
          color: #666;
          text-transform: uppercase;
          margin-bottom: 5px;
        }

        .stat-value {
          font-size: 24px;
          font-weight: 600;
          color: #333;
        }

        .language-badge {
          display: inline-block;
          background: #e7f3ff;
          color: #0056b3;
          padding: 4px 8px;
          border-radius: 3px;
          font-size: 12px;
          margin-right: 5px;
          margin-bottom: 5px;
        }

        .loading-spinner {
          display: inline-block;
          width: 16px;
          height: 16px;
          border: 2px solid #f3f3f3;
          border-top: 2px solid #007bff;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-right: 8px;
          vertical-align: middle;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>

      <div className="page-header">
        <h1>{t('translation_management_title', 'admin')}</h1>
        <p>{t('translation_management_description', 'admin')}</p>
      </div>

      {message && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}

      <div className="section">
        <h2 className="section-title">{t('translation_management_cache_statistics_title', 'admin')}</h2>

        {cacheStats ? (
          <>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-label">{t('translation_management_total_cached_label', 'admin')}</div>
                <div className="stat-value">{cacheStats.totalCachedTranslations}</div>
              </div>

              {cacheStats.byLanguage.map((lang) => (
                <div key={lang._id} className="stat-card">
                  <div className="stat-label">{lang._id}</div>
                  <div className="stat-value">{lang.count}</div>
                </div>
              ))}
            </div>

            <button className="btn btn-danger" onClick={handleClearCache}>
              {t('translation_management_clear_cache_button', 'admin')}
            </button>
          </>
        ) : (
          <p>{t('translation_management_loading_cache_statistics', 'admin')}</p>
        )}
      </div>

      <div className="section">
        <h2 className="section-title">{t('translation_management_bulk_translate_title', 'admin')}</h2>

        <p style={{ margin: '0 0 20px 0', color: '#666', fontSize: '14px' }}>
          {t('translation_management_bulk_translate_description', 'admin')}
        </p>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="lang-select">{t('translation_management_target_language_label', 'admin')}</label>
            <select
              id="lang-select"
              value={selectedLang}
              onChange={(e) => setSelectedLang(e.target.value as Locale)}
              disabled={isTranslating}
            >
              <option value="">{t('translation_management_select_language_placeholder', 'admin')}</option>
              {SUPPORTED_LOCALES.map((lang) => (
                <option key={lang} value={lang}>
                  {t(LANGUAGE_CONFIG[lang].labelKey, 'admin')}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="ns-select">{t('translation_management_namespace_label', 'admin')}</label>
            <select
              id="ns-select"
              value={selectedNamespace}
              onChange={(e) => setSelectedNamespace(e.target.value)}
              disabled={isTranslating}
            >
              {NAMESPACES.map((ns) => (
                <option key={ns} value={ns}>
                  {ns}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="button-group">
          <button
            className="btn btn-primary"
            onClick={handleBulkTranslate}
            disabled={isTranslating || !selectedLang}
          >
            {isTranslating && <span className="loading-spinner"></span>}
            {isTranslating ? t('translation_management_translating_label', 'admin') : t('translation_management_start_bulk_translation_button', 'admin')}
          </button>
        </div>
      </div>

      <div className="section">
        <h2 className="section-title">{t('translation_management_how_it_works_title', 'admin')}</h2>
        <div style={{ color: '#666', fontSize: '14px', lineHeight: '1.6' }}>
          <p>
            {t('translation_management_tier_1_info', 'admin')}
          </p>
          <p>
            {t('translation_management_tier_2_info', 'admin')}
          </p>
          <p>
            {t('translation_management_tier_3_info', 'admin')}
          </p>
        </div>
      </div>

      <div className="section">
        <h2 className="section-title">{t('translation_management_supported_languages_title', 'admin')}</h2>
        <div>
          {SUPPORTED_LOCALES.map((lang) => (
            <span key={lang} className="language-badge">
              {t(LANGUAGE_CONFIG[lang].badgeKey, 'admin')}
            </span>
          ))}
        </div>
      </div>

      <Dialog open={confirmDialog.isOpen} onOpenChange={(open: boolean) => !open && setConfirmDialog({ isOpen: false, action: 'clearCache' })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('common_confirm', 'common')}</DialogTitle>
          </DialogHeader>
          <p>{t('translation_management_clear_cache_confirm', 'admin')}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog({ isOpen: false, action: 'clearCache' })}>
              {t('common_cancel', 'common')}
            </Button>
            <Button variant="destructive" onClick={confirmClearCache}>
              {t('common_confirm', 'common')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
