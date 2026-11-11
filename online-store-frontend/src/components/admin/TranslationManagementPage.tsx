import { useState, useEffect, useRef } from 'react';
import { useTranslation } from '../../lib/i18n';
import { getAuthToken } from '../../lib/api';
import { Locale, SUPPORTED_LOCALES, DEFAULT_LOCALE } from '../../lib/i18n/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import styles from './TranslationManagementPage.module.css';

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

const MESSAGE_TYPE_CLASSES = {
  success: styles.success,
  error: styles.error,
  info: styles.info,
};

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
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h1>{t('translation_management_title', 'admin')}</h1>
        <p>{t('translation_management_description', 'admin')}</p>
      </div>

      {message && (
        <div className={`${styles.message} ${MESSAGE_TYPE_CLASSES[message.type]}`}>
          {message.text}
        </div>
      )}

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('translation_management_cache_statistics_title', 'admin')}</h2>

        {cacheStats ? (
          <>
            <div className={styles.statsGrid}>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>{t('translation_management_total_cached_label', 'admin')}</div>
                <div className={styles.statValue}>{cacheStats.totalCachedTranslations}</div>
              </div>

              {cacheStats.byLanguage.map((lang) => (
                <div key={lang._id} className={styles.statCard}>
                  <div className={styles.statLabel}>{lang._id}</div>
                  <div className={styles.statValue}>{lang.count}</div>
                </div>
              ))}
            </div>

            <button className={`${styles.btn} ${styles.btnDanger}`} onClick={handleClearCache}>
              {t('translation_management_clear_cache_button', 'admin')}
            </button>
          </>
        ) : (
          <p>{t('translation_management_loading_cache_statistics', 'admin')}</p>
        )}
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('translation_management_bulk_translate_title', 'admin')}</h2>

        <p className="mb-5 text-sm text-muted-foreground">
          {t('translation_management_bulk_translate_description', 'admin')}
        </p>

        <div className={styles.formRow}>
          <div className={styles.formGroup}>
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

          <div className={styles.formGroup}>
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

        <div className={styles.buttonGroup}>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={handleBulkTranslate}
            disabled={isTranslating || !selectedLang}
          >
            {isTranslating && <span className={styles.loadingSpinner}></span>}
            {isTranslating ? t('translation_management_translating_label', 'admin') : t('translation_management_start_bulk_translation_button', 'admin')}
          </button>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('translation_management_how_it_works_title', 'admin')}</h2>
        <div className="text-sm leading-[1.6] text-muted-foreground">
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

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('translation_management_supported_languages_title', 'admin')}</h2>
        <div>
          {SUPPORTED_LOCALES.map((lang) => (
            <span key={lang} className={styles.languageBadge}>
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
