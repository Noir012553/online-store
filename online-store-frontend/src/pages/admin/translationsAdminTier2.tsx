import { useRouter } from 'next/router';
import { useState, useEffect, Fragment } from 'react';
import { Trash2, Search, RefreshCw, Eye } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, Locale } from '../../lib/i18n/types';
import { withAdminLayout } from '../../components/admin/withAdminLayout';
import { useAuth } from '../../lib/context/AuthContext';
import { getAuthToken } from '../../lib/api';
import { getIntlLocale } from '../../lib/localeUtils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';

interface CacheStats {
  totalCachedTranslations: number;
  byLanguage: Array<{ _id: string; count: number }>;
}

interface CacheRecord {
  _id: string;
  hashKey: string;
  originalText: string;
  targetLang: string;
  translatedText: string;
  createdAt: string;
  expiresAt?: string;
  ttlDays?: number;
}

const TranslationsAdminTier2Content = () => {
  const { t, loadNamespace, locale } = useTranslation();

  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [cacheRecords, setCacheRecords] = useState<CacheRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<CacheRecord[]>([]);
  const [selectedLang, setSelectedLang] = useState<Locale>(DEFAULT_LOCALE);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [message, setMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isClearingOld, setIsClearingOld] = useState(false);
  const [isRetranslating, setIsRetranslating] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean; type: 'delete' | 'clearOld' | 'retranslate'; recordId?: string }>({ isOpen: false, type: 'delete' });

  const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '');

  useEffect(() => {
    Promise.all([
      loadNamespace('admin-translation'),
    ]).then(() => {
      fetchCacheStats();
    });
  }, [loadNamespace, locale]);

  useEffect(() => {
    fetchCacheRecords();
  }, [selectedLang, pageIndex, locale]);

  useEffect(() => {
    filterRecords();
  }, [cacheRecords, searchText]);

  const fetchCacheStats = async () => {
    try {
      const token = getAuthToken();
      if (!token) {
        setMessage({ type: 'error', text: t('error_login_required_cache_stats', 'admin-translation') });
        return;
      }

      const response = await fetch(`${API_BASE}/api/translations/admin/cache-stats?lang=${locale}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setCacheStats(data.data);
    } catch (error) {
      setMessage({ type: 'error', text: t('error_load_cache_stats', 'admin-translation') });
    }
  };

  const fetchCacheRecords = async () => {
    setLoading(true);
    try {
      const token = getAuthToken();
      if (!token) {
        setMessage({ type: 'error', text: t('error_login_required_cache_records', 'admin-translation') });
        setLoading(false);
        return;
      }

      const skip = pageIndex * pageSize;
      const response = await fetch(
        `${API_BASE}/api/translations/admin/cache-records?lang=${locale}&targetLang=${selectedLang}&skip=${skip}&limit=${pageSize}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setCacheRecords(data.data || []);
      setTotalCount(data.pagination?.total || 0);
    } catch (error) {
      setMessage({ type: 'error', text: t('error_load_cache_stats', 'admin-translation') });
    } finally {
      setLoading(false);
    }
  };

  const filterRecords = () => {
    let filtered = cacheRecords;

    if (searchText.trim()) {
      const searchLower = searchText.toLowerCase();
      filtered = filtered.filter(
        (record) =>
          record.originalText.toLowerCase().includes(searchLower) ||
          record.translatedText.toLowerCase().includes(searchLower) ||
          record.hashKey.includes(searchText)
      );
    }

    setFilteredRecords(filtered);
    setPageIndex(0);
  };

  const handleDeleteRecord = async (id: string) => {
    setConfirmDialog({ isOpen: true, type: 'delete', recordId: id });
  };

  const confirmDeleteRecord = async () => {
    const { recordId } = confirmDialog;
    setConfirmDialog({ isOpen: false, type: 'delete' });

    try {
      const token = getAuthToken();
      if (!token) {
        setMessage({ type: 'error', text: t('admin_tier2_login_required_delete_cache_record', 'admin-translation') });
        return;
      }

      const response = await fetch(`${API_BASE}/api/translations/admin/cache/${recordId}?lang=${locale}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (data.success) {
        setMessage({ type: 'success', text: t('admin_tier2_delete_success', 'admin-translation') });
        fetchCacheStats();
        fetchCacheRecords();
      }
    } catch (error) {
      setMessage({ type: 'error', text: t('admin_tier2_delete_error', 'admin-translation') });
    }
  };

  const handleClearOldCache = async () => {
    setConfirmDialog({ isOpen: true, type: 'clearOld' });
  };

  const handleRetranslate = () => {
    if (!isRetranslating) {
      setConfirmDialog({ isOpen: true, type: 'retranslate' });
    }
  };

  const confirmRetranslate = async () => {
    setConfirmDialog({ isOpen: false, type: 'retranslate' });
    setIsRetranslating(true);

    try {
      const token = getAuthToken();
      if (!token) {
        setMessage({ type: 'error', text: t('error_login_required_cache_stats', 'admin-translation') });
        return;
      }

      const response = await fetch(`${API_BASE}/api/translations/admin/retranslate-dynamic`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ lang: selectedLang, limit: 100 }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Retranslation failed');
      }

      setMessage({
        type: 'success',
        text: t('admin_tier2_retranslate_result', 'admin-translation')
          .replace('{fixed}', String(data.data.fixedCount))
          .replace('{broken}', String(data.data.stillBrokenCount)),
      });
      await Promise.all([fetchCacheStats(), fetchCacheRecords()]);
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : t('admin_tier2_retranslate_error', 'admin-translation'),
      });
    } finally {
      setIsRetranslating(false);
    }
  };

  const confirmClearOldCache = async () => {
    setConfirmDialog({ isOpen: false, type: 'clearOld' });
    setIsClearingOld(true);
    try {
      const token = getAuthToken();
      if (!token) {
        setMessage({ type: 'error', text: t('admin_tier2_login_required_clear_cache', 'admin-translation') });
        setIsClearingOld(false);
        return;
      }

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
          text: t('admin_tier2_clear_old_cache_success', 'admin-translation').replace('{count}', data.data.deletedCount),
        });
        fetchCacheStats();
        fetchCacheRecords();
      }
    } catch (error) {
      setMessage({ type: 'error', text: t('admin_tier2_clear_old_cache_error', 'admin-translation') });
    } finally {
      setIsClearingOld(false);
    }
  };

  const handleRefresh = () => {
    fetchCacheStats();
    fetchCacheRecords();
    setMessage({ type: 'info', text: t('admin_tier2_refresh_status', 'admin-translation') });
  };

  const getLanguageName = (code: string) => {
    return SUPPORTED_LOCALES.includes(code as any) ? t(`admin_lang_${code}`, 'admin-translation') : code;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const intlLocale = getIntlLocale(selectedLang as Locale);
    return date.toLocaleString(intlLocale);
  };

  const calculateTTL = (createdAt: string): { daysRemaining: number; expiresAt: Date; percentage: number } => {
    const created = new Date(createdAt);
    const ttlMs = 30 * 24 * 60 * 60 * 1000; // 30 days
    const expiresAt = new Date(created.getTime() + ttlMs);
    const now = new Date();
    const remaining = expiresAt.getTime() - now.getTime();
    const daysRemaining = Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
    const percentage = Math.max(0, Math.min(100, (daysRemaining / 30) * 100));
    return { daysRemaining, expiresAt, percentage };
  };

  const getTTLStatus = (daysRemaining: number) => {
    if (daysRemaining <= 0) return 'expired';
    if (daysRemaining <= 3) return 'critical';
    if (daysRemaining <= 7) return 'warning';
    return 'healthy';
  };

  return (
    <>
    <div className="tier2-cache-container">
        <style>{`
          .tier2-cache-container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
          }

          .tier2-header {
            margin-bottom: 30px;
          }

          .tier2-header h1 {
            margin: 0 0 10px 0;
            font-size: 28px;
            font-weight: 600;
            color: #1a1a1a;
          }

          .tier2-header p {
            margin: 0;
            color: #666;
            font-size: 14px;
          }

          .tier2-stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 30px;
          }

          .tier2-stat-card {
            background: white;
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
          }

          .tier2-stat-label {
            font-size: 12px;
            color: #666;
            text-transform: uppercase;
            margin-bottom: 8px;
            font-weight: 600;
          }

          .tier2-stat-value {
            font-size: 32px;
            font-weight: 600;
            color: #007bff;
            margin-bottom: 10px;
          }

          .tier2-stat-language {
            font-size: 12px;
            color: #999;
          }

          .tier2-controls {
            display: flex;
            gap: 15px;
            margin-bottom: 25px;
            flex-wrap: wrap;
            align-items: flex-end;
          }

          .tier2-select-group {
            display: flex;
            flex-direction: column;
            gap: 5px;
          }

          .tier2-select-group label {
            font-size: 12px;
            font-weight: 600;
            color: #555;
            text-transform: uppercase;
          }

          .tier2-select-group select {
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
            background: white;
            min-width: 150px;
          }

          .tier2-search-group {
            display: flex;
            align-items: center;
            gap: 8px;
            flex: 1;
            min-width: 250px;
          }

          .tier2-search-input {
            flex: 1;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
          }

          .tier2-btn {
            padding: 10px 16px;
            border: none;
            border-radius: 4px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 6px;
          }

          .tier2-btn-primary {
            background: #007bff;
            color: white;
          }

          .tier2-btn-primary:hover:not(:disabled) {
            background: #0056b3;
          }

          .tier2-btn-danger {
            background: #dc3545;
            color: white;
          }

          .tier2-btn-danger:hover:not(:disabled) {
            background: #c82333;
          }

          .tier2-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          .tier2-message {
            padding: 12px 16px;
            border-radius: 4px;
            margin-bottom: 20px;
            font-size: 14px;
          }

          .tier2-message.success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
          }

          .tier2-message.error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
          }

          .tier2-message.info {
            background: #d1ecf1;
            color: #0c5460;
            border: 1px solid #bee5eb;
          }

          .tier2-table-wrapper {
            background: white;
            border-radius: 8px;
            border: 1px solid #ddd;
            overflow-x: auto;
          }

          .tier2-table {
            width: 100%;
            border-collapse: collapse;
          }

          .tier2-table thead {
            background: #f5f5f5;
            border-bottom: 1px solid #ddd;
          }

          .tier2-table th {
            padding: 12px;
            text-align: left;
            font-size: 11px;
            font-weight: 600;
            color: #555;
            text-transform: uppercase;
            white-space: nowrap;
          }

          .tier2-table td {
            padding: 12px;
            border-bottom: 1px solid #eee;
            font-size: 13px;
          }

          .tier2-table th:nth-child(2),
          .tier2-table td:nth-child(2) {
            display: none;
          }

          .tier2-table tr:hover {
            background: #f9f9f9;
          }

          .tier2-hash-key {
            font-family: 'Courier New', monospace;
            color: #0056b3;
            font-size: 11px;
            word-break: break-all;
            max-width: 150px;
          }

          .tier2-text-cell {
            color: #333;
            max-width: 250px;
            word-break: break-word;
            line-height: 1.4;
            overflow: hidden;
          }

          .tier2-text-truncated {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            cursor: pointer;
            color: #666;
          }

          .tier2-lang-badge {
            display: inline-block;
            background: #e7f3ff;
            color: #0056b3;
            padding: 4px 8px;
            border-radius: 3px;
            font-size: 11px;
            font-weight: 600;
          }

          .tier2-date-cell {
            font-size: 12px;
            color: #999;
            white-space: nowrap;
          }

          .tier2-ttl-cell {
            font-size: 12px;
            padding: 8px 12px;
            display: flex;
            flex-direction: column;
            gap: 6px;
          }

          .tier2-ttl-days {
            font-weight: 600;
            font-size: 13px;
          }

          .tier2-ttl-healthy .tier2-ttl-days {
            color: #28a745;
          }

          .tier2-ttl-warning .tier2-ttl-days {
            color: #ffc107;
          }

          .tier2-ttl-critical .tier2-ttl-days,
          .tier2-ttl-expired .tier2-ttl-days {
            color: #dc3545;
          }

          .tier2-ttl-bar {
            width: 100%;
            height: 6px;
            background-color: #f0f0f0;
            border-radius: 3px;
            overflow: hidden;
          }

          .tier2-ttl-fill {
            height: 100%;
            transition: width 0.3s ease;
            border-radius: 3px;
          }

          .tier2-actions-cell {
            display: flex;
            gap: 6px;
          }

          .tier2-icon-btn {
            width: 28px;
            height: 28px;
            border: none;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.2s ease;
            font-size: 12px;
          }

          .tier2-icon-btn-view {
            background: #e7f3ff;
            color: #0056b3;
          }

          .tier2-icon-btn-view:hover {
            background: #0056b3;
            color: white;
          }

          .tier2-icon-btn-delete {
            background: #ffe7e7;
            color: #dc3545;
          }

          .tier2-icon-btn-delete:hover {
            background: #dc3545;
            color: white;
          }

          .tier2-expanded-row {
            display: none;
          }

          .tier2-expanded-row.show {
            display: table-row;
          }

          .tier2-expanded-content {
            background: #f0f8ff;
            padding: 20px;
            border-radius: 4px;
          }

          .tier2-expanded-field {
            margin-bottom: 15px;
          }

          .tier2-expanded-field label {
            font-size: 11px;
            font-weight: 600;
            color: #0056b3;
            text-transform: uppercase;
            display: block;
            margin-bottom: 8px;
          }

          .tier2-expanded-field pre {
            margin: 0;
            background: white;
            border: 1px solid #ddd;
            border-radius: 4px;
            padding: 12px;
            font-size: 13px;
            overflow-x: auto;
            color: #333;
            line-height: 1.5;
            max-height: 300px;
            overflow-y: auto;
            white-space: pre-wrap;
            word-wrap: break-word;
          }

          .tier2-loading {
            text-align: center;
            padding: 40px;
            color: #666;
          }

          .tier2-empty {
            text-align: center;
            padding: 40px;
            color: #999;
            font-size: 14px;
          }

          .tier2-pagination {
            display: flex;
            gap: 10px;
            justify-content: center;
            align-items: center;
            margin-top: 20px;
            padding: 20px;
          }

          .tier2-pagination button {
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            background: white;
            cursor: pointer;
            font-size: 13px;
          }

          .tier2-pagination button:hover {
            background: #f5f5f5;
          }

          .tier2-pagination button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }

          @media (max-width: 1024px) {
            .tier2-controls {
              flex-direction: column;
            }

            .tier2-search-group {
              min-width: 100%;
            }

            .tier2-table {
              font-size: 12px;
            }

            .tier2-table td,
            .tier2-table th {
              padding: 8px;
            }
          }
        `}</style>

        <div className="tier2-header">
          <h1>{t('tier2_title', 'admin-translation')}</h1>
          <p>{t('tier2_description', 'admin-translation')}</p>
        </div>

        {message && (
          <div className={`tier2-message ${message.type}`}>
            {message.text}
          </div>
        )}

        {cacheStats && (
          <div className="tier2-stats-grid">
            <div className="tier2-stat-card">
              <div className="tier2-stat-label">{t('tier2_total_cache', 'admin-translation')}</div>
              <div className="tier2-stat-value">{cacheStats.totalCachedTranslations}</div>
              <div className="tier2-stat-language">{t('tier2_translations', 'admin-translation')}</div>
            </div>

            {cacheStats.byLanguage && cacheStats.byLanguage.map((lang) => (
              <div key={lang._id} className="tier2-stat-card">
                <div className="tier2-stat-label">{getLanguageName(lang._id)}</div>
                <div className="tier2-stat-value">{lang.count}</div>
                <div className="tier2-stat-language">{lang._id.toUpperCase()}</div>
              </div>
            ))}
          </div>
        )}

        <div className="tier2-controls">
          <div className="tier2-select-group">
            <label htmlFor="lang-select">{t('tier2_language_label', 'admin-translation')}</label>
            <select
              id="lang-select"
              value={selectedLang}
              onChange={(e) => {
                setSelectedLang(e.target.value as Locale);
                setPageIndex(0);
              }}
            >
              {SUPPORTED_LOCALES.map((lang) => (
                <option key={lang} value={lang}>
                  {t(`admin_lang_${lang}`, 'admin-translation')}
                </option>
              ))}
            </select>
          </div>

          <div className="tier2-search-group">
            <Search size={16} style={{ color: '#999' }} />
            <input
              type="text"
              placeholder={t('tier2_search_placeholder', 'admin-translation')}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="tier2-search-input"
            />
          </div>

          <button
            className="tier2-btn tier2-btn-primary"
            onClick={handleRefresh}
          >
            <RefreshCw size={16} /> {t('tier2_refresh_btn', 'admin-translation')}
          </button>

          <button
            className="tier2-btn tier2-btn-primary"
            onClick={handleRetranslate}
            disabled={isRetranslating}
          >
            <RefreshCw size={16} /> {isRetranslating
              ? t('admin_tier2_retranslating', 'admin-translation')
              : t('admin_tier2_retranslate_button', 'admin-translation')}
          </button>

          <button
            className="tier2-btn tier2-btn-danger"
            onClick={handleClearOldCache}
            disabled={isClearingOld}
          >
            {isClearingOld && `${t('admin_tier2_clearing_indicator', 'admin-translation')} `}
            {!isClearingOld && <Trash2 size={16} />} {t('tier2_clear_cache_btn', 'admin-translation')}
          </button>
        </div>

        {loading ? (
          <div className="tier2-loading">{t('admin_tier2_loading', 'admin-translation')}</div>
        ) : filteredRecords.length > 0 ? (
          <>
            <div className="tier2-table-wrapper">
              <table className="tier2-table">
                <thead>
                  <tr>
                    <th style={{ width: '30%' }}>{t('admin_tier2_table_original_text', 'admin-translation')}</th>
                    <th style={{ width: '25%' }}>{t('admin_tier2_table_translated_text', 'admin-translation')}</th>
                    <th style={{ width: '20%' }}>{t('admin_tier2_table_hash_key', 'admin-translation')}</th>
                    <th style={{ width: '10%' }}>{t('admin_tier2_table_language', 'admin-translation')}</th>
                    <th style={{ width: '15%' }}>{t('admin_tier2_table_created_at', 'admin-translation')}</th>
                    <th style={{ width: '15%' }}>{t('admin_tier2_table_ttl', 'admin-translation')}</th>
                    <th style={{ width: '10%' }}>{t('admin_tier2_table_actions', 'admin-translation')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map((record) => (
                    <Fragment key={record._id}>
                      <tr>
                        <td className="tier2-text-cell">
                          <span
                            className="tier2-text-truncated"
                            title={record.originalText}
                            onClick={() =>
                              setExpandedId(expandedId === record._id ? null : record._id)
                            }
                          >
                            {record.originalText}
                          </span>
                        </td>
                        <td className="tier2-text-cell">
                          <span
                            className="tier2-text-truncated"
                            title={record.translatedText}
                            onClick={() =>
                              setExpandedId(expandedId === record._id ? null : record._id)
                            }
                          >
                            {record.translatedText}
                          </span>
                        </td>
                        <td>
                          <div className="tier2-hash-key">{record.hashKey}</div>
                        </td>
                        <td>
                          <span className="tier2-lang-badge">
                            {t(`locale_label_${record.targetLang}`, 'admin-translation')}
                          </span>
                        </td>
                        <td className="tier2-date-cell">{formatDate(record.createdAt)}</td>
                        <td>
                          {(() => {
                            const ttl = calculateTTL(record.createdAt);
                            const status = getTTLStatus(ttl.daysRemaining);
                            return (
                              <div className={`tier2-ttl-cell tier2-ttl-${status}`} title={`${t('admin_tier2_ttl_expires', 'admin-translation')}: ${ttl.expiresAt.toLocaleString()}`}>
                                <div className="tier2-ttl-days">{ttl.daysRemaining}{t('admin_tier2_ttl_days_suffix', 'admin-translation')}</div>
                                <div className="tier2-ttl-bar">
                                  <div
                                    className="tier2-ttl-fill"
                                    style={{
                                      width: `${ttl.percentage}%`,
                                      backgroundColor:
                                        status === 'expired' ? '#dc3545' :
                                        status === 'critical' ? '#dc3545' :
                                        status === 'warning' ? '#ffc107' : '#28a745'
                                    }}
                                  ></div>
                                </div>
                              </div>
                            );
                          })()}
                        </td>
                        <td>
                          <div className="tier2-actions-cell">
                            <button
                              className="tier2-icon-btn tier2-icon-btn-view"
                              onClick={() =>
                                setExpandedId(expandedId === record._id ? null : record._id)
                              }
                              title={t('admin_tier2_view_details_title', 'admin-translation')}
                  >
                    <Eye size={14} />
                  </button>
                  <button
                    className="tier2-icon-btn tier2-icon-btn-delete"
                    onClick={() => handleDeleteRecord(record._id)}
                    title={t('admin_tier2_delete_title', 'admin-translation')}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expandedId === record._id && (
                        <tr className={`tier2-expanded-row show`}>
                          <td colSpan={7}>
                            <div className="tier2-expanded-content">
                              <div className="tier2-expanded-field">
                                <label>{t('admin_tier2_expanded_original_text', 'admin-translation')}</label>
                                <pre>{record.originalText}</pre>
                              </div>
                              <div className="tier2-expanded-field">
                                <label>{t('admin_tier2_expanded_translated_text', 'admin-translation').replace('{lang}', t(`locale_label_${record.targetLang}`, 'admin-translation'))}</label>
                                <pre>{record.translatedText}</pre>
                              </div>
                              <div className="tier2-expanded-field">
                                <label>{t('admin_tier2_expanded_hash_key', 'admin-translation')}</label>
                                <pre>{record.hashKey}</pre>
                              </div>
                              <div className="tier2-expanded-field">
                                <label>{t('admin_tier2_expanded_created_at', 'admin-translation')}</label>
                                <pre>{formatDate(record.createdAt)}</pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="tier2-pagination">
              <button
                onClick={() => setPageIndex(Math.max(0, pageIndex - 1))}
                disabled={pageIndex === 0}
              >
                {t('admin_tier2_previous_page', 'admin-translation')}
              </button>
              <span>{t('admin_tier2_current_page', 'admin-translation').replace('{page}', String(pageIndex + 1))}</span>
              <button
                onClick={() => setPageIndex(pageIndex + 1)}
                disabled={(pageIndex + 1) * pageSize >= totalCount}
              >
                {t('admin_tier2_next_page', 'admin-translation')}
              </button>
            </div>
          </>
        ) : (
          <div className="tier2-empty">{t('admin_tier2_empty_state', 'admin-translation')}</div>
        )}
      </div>

      <Dialog open={confirmDialog.isOpen} onOpenChange={(open: boolean) => !open && setConfirmDialog({ isOpen: false, type: confirmDialog.type })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('common_confirm', 'common')}</DialogTitle>
          </DialogHeader>
          <p>
            {confirmDialog.type === 'delete'
              ? t('admin_tier2_confirm_delete_cache_record', 'admin-translation')
              : confirmDialog.type === 'clearOld'
                ? t('admin_tier2_confirm_clear_old_cache', 'admin-translation')
                : t('admin_tier2_confirm_retranslate', 'admin-translation')}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog({ isOpen: false, type: confirmDialog.type })}>
              {t('common_cancel', 'common')}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDialog.type === 'delete'
                ? confirmDeleteRecord
                : confirmDialog.type === 'clearOld'
                  ? confirmClearOldCache
                  : confirmRetranslate}
            >
              {t('common_confirm', 'common')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export async function getServerSideProps() {
  return {
    redirect: {
      destination: '/admin/translationsAdminTier1',
      permanent: false,
    },
  };
}

export default withAdminLayout(TranslationsAdminTier2Content, {
  permission: 'manage:translations',
  featureName: 'Tier 2 Translations',
});
