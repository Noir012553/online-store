import { useState, useEffect, Fragment } from 'react';
import { Search, RefreshCw, Download, Filter, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { SUPPORTED_LOCALES, Locale } from '../../lib/i18n/types';
import { getIntlLocale } from '../../lib/localeUtils';
import { withAdminLayout } from '../../components/admin/withAdminLayout';
import { getAuthToken } from '../../lib/api';
import { getUserFriendlyErrorMessage } from '../../lib/errorHandler';
import { HamsterLoader } from '../../components/HamsterLoader';
import styles from '../../css/pages/admin/auditLogViewer.module.css';

const MESSAGE_TYPE_CLASSES = {
  success: styles['audit-log-message-success'],
  error: styles['audit-log-message-error'],
  info: styles['audit-log-message-info'],
} as const;

const ACTION_BADGE_CLASSES: Record<string, string> = {
  manual_override: styles['audit-log-action-manual_override'],
  batch_update: styles['audit-log-action-batch_update'],
  auto_translate: styles['audit-log-action-auto_translate'],
  delete: styles['audit-log-action-delete'],
};

interface AuditLogRecord {
  _id: string;
  userId: string;
  userName: string;
  action: string;
  oldValue?: string;
  newValue?: string;
  entityId: string;
  entityType?: string;
  targetLang: string;
  timestamp: string;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}

const ACTION_TYPES = [
  { value: 'manual_override', label: 'manual_override' },
  { value: 'batch_update', label: 'batch_update' },
  { value: 'auto_translate', label: 'auto_translate' },
  { value: 'delete', label: 'delete' },
];

const AuditLogViewerContent = () => {
  const { t, loadNamespace, locale } = useTranslation();

  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // Filter states
  const [filters, setFilters] = useState({
    searchText: '',
    selectedLang: '',
    selectedAction: '',
    selectedUserId: '',
    dateFrom: '',
    dateTo: '',
  });

  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 20,
    totalCount: 0,
  });

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '');

  useEffect(() => {
    Promise.all([
      loadNamespace('admin-audit-log'),
    ]).catch(err => {
      setMessage({
        type: 'error',
        text: t('admin_audit_log_loading_error'),
      });
    });

    fetchLogs();
  }, [loadNamespace, t]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const token = getAuthToken();
      if (!token) {
        throw new Error('auth_required');
      }

      const params = new URLSearchParams();
      params.append('page', (pagination.pageIndex + 1).toString());
      params.append('pageSize', pagination.pageSize.toString());
      params.append('lang', locale);

      if (filters.searchText) params.append('search', filters.searchText);
      if (filters.selectedLang) params.append('targetLang', filters.selectedLang);
      if (filters.selectedAction) params.append('action', filters.selectedAction);
      if (filters.selectedUserId) params.append('userId', filters.selectedUserId);
      if (filters.dateFrom) params.append('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.append('dateTo', filters.dateTo);

      const response = await fetch(`${API_BASE}/api/audit-logs?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(t('admin_audit_log_fetch_failed'));
      }

      const data = await response.json();
      setLogs(data.logs || []);
      setPagination(prev => ({
        ...prev,
        totalCount: data.totalCount || 0,
      }));

      if (data.logs?.length === 0) {
        setMessage({
          type: 'info',
          text: t('admin_audit_log_no_records', 'admin-audit-log'),
        });
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error(t('error_fetching_logs', 'admin-errors'), error);
      }
      setMessage({
        type: 'error',
        text: getUserFriendlyErrorMessage(error, t),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key: string, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
    }));
    setPagination(prev => ({
      ...prev,
      pageIndex: 0,
    }));
  };

  const handleApplyFilters = () => {
    setPagination(prev => ({
      ...prev,
      pageIndex: 0,
    }));
    fetchLogs();
  };

  const handleRefresh = () => {
    fetchLogs();
  };

  const handleExportCSV = () => {
    if (logs.length === 0) {
      setMessage({
        type: 'info',
        text: t('admin_audit_log_no_logs_export'),
      });
      return;
    }

    const headers = [
      t('admin_audit_log_col_timestamp'),
      t('admin_audit_log_col_user'),
      t('admin_audit_log_col_action'),
      t('admin_audit_log_csv_col_entity_id'),
      t('admin_audit_log_col_language'),
      t('admin_audit_log_old_value'),
      t('admin_audit_log_new_value'),
      t('admin_audit_log_reason'),
    ];
    const rows = logs.map(log => [
      new Date(log.timestamp).toLocaleString(getIntlLocale(locale as Locale)),
      log.userName,
      log.action,
      log.entityId,
      log.targetLang,
      log.oldValue || '',
      log.newValue || '',
      log.reason || '',
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${(cell || '').toString().replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    setMessage({
      type: 'success',
      text: t('admin_audit_log_export_success').replace('{{count}}', logs.length.toString()),
    });
  };

  const totalPages = Math.ceil(pagination.totalCount / pagination.pageSize);

  return (
    <div className={styles['audit-log-container']}>
      <div className={styles['audit-log-header']}>
        <div>
          <h1 className={styles['audit-log-title']}>{t('admin_audit_log_title')}</h1>
          <p className={styles['audit-log-subtitle']}>
            {t('admin_audit_log_subtitle')}
          </p>
        </div>
        <div className={styles['audit-log-actions']}>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={styles['audit-log-filter-btn']}
            title={t('admin_audit_log_toggle_filters')}
          >
            <Filter size={18} />
            {t('admin_audit_log_filters')}
          </button>
          <button
            onClick={handleRefresh}
            className={styles['audit-log-refresh-btn']}
            disabled={loading}
            title={t('admin_audit_log_refresh')}
          >
            <RefreshCw size={18} className={loading ? styles['audit-log-spin'] : ''} />
          </button>
          <button
            onClick={handleExportCSV}
            className={styles['audit-log-export-btn']}
            title={t('admin_audit_log_export_csv')}
          >
            <Download size={18} />
            {t('admin_audit_log_export')}
          </button>
        </div>
      </div>

      {message && (
        <div className={`${styles['audit-log-message']} ${MESSAGE_TYPE_CLASSES[message.type]}`}>
          {message.text}
          <button onClick={() => setMessage(null)} className={styles['audit-log-message-close']}>×</button>
        </div>
      )}

      {showFilters && (
        <div className={styles['audit-log-filters']}>
          <div className={styles['audit-log-filters-grid']}>
            <div className={styles['audit-log-filter-group']}>
              <label>{t('admin_audit_log_search')}</label>
              <input
                type="text"
                placeholder={t('admin_audit_log_search_placeholder')}
                value={filters.searchText}
                onChange={e => handleFilterChange('searchText', e.target.value)}
                className={styles['audit-log-filter-input']}
              />
            </div>

            <div className={styles['audit-log-filter-group']}>
              <label>{t('admin_audit_log_language')}</label>
              <select
                value={filters.selectedLang}
                onChange={e => handleFilterChange('selectedLang', e.target.value)}
                className={styles['audit-log-filter-select']}
              >
                <option value="">{t('admin_audit_log_all_languages')}</option>
                {SUPPORTED_LOCALES.map(lang => (
                  <option key={lang} value={lang}>
                    {t(`admin_lang_${lang}`, 'admin-translation')}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles['audit-log-filter-group']}>
              <label>{t('admin_audit_log_action_type')}</label>
              <select
                value={filters.selectedAction}
                onChange={e => handleFilterChange('selectedAction', e.target.value)}
                className={styles['audit-log-filter-select']}
              >
                <option value="">{t('admin_audit_log_all_actions')}</option>
                {ACTION_TYPES.map(action => (
                  <option key={action.value} value={action.value}>
                    {t(`admin_audit_log_action_${action.value}`)}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles['audit-log-filter-group']}>
              <label>{t('admin_audit_log_date_from')}</label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={e => handleFilterChange('dateFrom', e.target.value)}
                className={styles['audit-log-filter-input']}
              />
            </div>

            <div className={styles['audit-log-filter-group']}>
              <label>{t('admin_audit_log_date_to')}</label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={e => handleFilterChange('dateTo', e.target.value)}
                className={styles['audit-log-filter-input']}
              />
            </div>

            <div className={styles['audit-log-filter-group']}>
              <label>{t('admin_audit_log_user_id')}</label>
              <input
                type="text"
                placeholder={t('admin_audit_log_user_id_placeholder')}
                value={filters.selectedUserId}
                onChange={e => handleFilterChange('selectedUserId', e.target.value)}
                className={styles['audit-log-filter-input']}
              />
            </div>
          </div>

          <div className={styles['audit-log-filter-actions']}>
            <button
              onClick={handleApplyFilters}
              className={styles['audit-log-apply-filters-btn']}
              disabled={loading}
            >
              {loading ? t('admin_audit_log_loading') : t('admin_audit_log_apply_filters')}
            </button>
            <button
              onClick={() => {
                setFilters({
                  searchText: '',
                  selectedLang: '',
                  selectedAction: '',
                  selectedUserId: '',
                  dateFrom: '',
                  dateTo: '',
                });
                setPagination(prev => ({ ...prev, pageIndex: 0 }));
              }}
              className={styles['audit-log-reset-filters-btn']}
            >
              {t('admin_audit_log_reset_filters')}
            </button>
          </div>
        </div>
      )}

      <div className={styles['audit-log-content']}>
        {loading && !logs.length ? (
          <div className={styles['audit-log-loading']}>
            <HamsterLoader size={96} className="mb-4" />
            <p>{t('admin_audit_log_loading')}</p>
          </div>
        ) : logs.length === 0 ? (
          <div className={styles['audit-log-empty']}>
            <p>{t('admin_audit_log_no_records')}</p>
          </div>
        ) : (
          <>
            <div className={styles['audit-log-table-wrapper']}>
              <table className={styles['audit-log-table']}>
                <thead>
                  <tr>
                    <th>{t('admin_audit_log_col_timestamp')}</th>
                    <th>{t('admin_audit_log_col_user')}</th>
                    <th>{t('admin_audit_log_col_action')}</th>
                    <th>{t('admin_audit_log_col_entity')}</th>
                    <th>{t('admin_audit_log_col_language')}</th>
                    <th>{t('admin_audit_log_col_changes')}</th>
                    <th>{t('admin_audit_log_col_details')}</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <Fragment key={log._id}>
                      <tr className={styles['audit-log-table-row']}>
                        <td className={styles['audit-log-timestamp']}>
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className={styles['audit-log-user']}>
                          <div className={styles['audit-log-user-info']}>
                            <div className={styles['audit-log-user-name']}>{log.userName}</div>
                            <div className={styles['audit-log-user-id']}>{log.userId}</div>
                          </div>
                        </td>
                        <td className={styles['audit-log-action']}>
                          <span className={`${styles['audit-log-action-badge']} ${ACTION_BADGE_CLASSES[log.action] ?? ''}`}>
                            {t(`admin_audit_log_action_${log.action}`)}
                          </span>
                        </td>
                        <td className={styles['audit-log-entity']}>
                          {log.entityId}
                        </td>
                        <td className={styles['audit-log-lang']}>
                          <span className={styles['audit-log-lang-badge']}>{t(`locale_label_${log.targetLang}`, 'admin-translation')}</span>
                        </td>
                        <td className={styles['audit-log-changes']}>
                          {log.oldValue || log.newValue ? (
                            <div className={styles['audit-log-change-preview']}>
                              <div className={styles['audit-log-old']}>{log.oldValue?.substring(0, 30)}...</div>
                              <div className={styles['audit-log-arrow']}><ArrowRight className="h-4 w-4" aria-hidden="true" /></div>
                              <div className={styles['audit-log-new']}>{log.newValue?.substring(0, 30)}...</div>
                            </div>
                          ) : (
                            <span className={styles['audit-log-no-change']}>-</span>
                          )}
                        </td>
                        <td className={styles['audit-log-expand']}>
                          <button
                            onClick={() => setExpandedId(expandedId === log._id ? null : log._id)}
                            className={styles['audit-log-expand-btn']}
                            title={t('admin_audit_log_view_details')}
                          >
                            {expandedId === log._id ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </td>
                      </tr>
                      {expandedId === log._id && (
                        <tr className={styles['audit-log-expanded-row']}>
                          <td colSpan={7}>
                            <div className={styles['audit-log-details']}>
                              <div className={styles['audit-log-details-grid']}>
                                <div className={styles['audit-log-detail-item']}>
                                  <span className={styles['audit-log-detail-label']}>{t('admin_audit_log_entity_type')}:</span>
                                  <span className={styles['audit-log-detail-value']}>{log.entityType || '-'}</span>
                                </div>
                                <div className={styles['audit-log-detail-item']}>
                                  <span className={styles['audit-log-detail-label']}>{t('admin_audit_log_reason')}:</span>
                                  <span className={styles['audit-log-detail-value']}>{log.reason || t('admin_audit_log_no_reason')}</span>
                                </div>
                                <div className={styles['audit-log-detail-item']}>
                                  <span className={styles['audit-log-detail-label']}>{t('admin_audit_log_ip_address')}:</span>
                                  <span className={styles['audit-log-detail-value']}>{log.ipAddress || '-'}</span>
                                </div>
                                <div className={styles['audit-log-detail-item']}>
                                  <span className={styles['audit-log-detail-label']}>{t('admin_audit_log_user_agent')}:</span>
                                  <span className={`${styles['audit-log-detail-value']} ${styles['audit-log-user-agent']}`}>{log.userAgent || '-'}</span>
                                </div>
                                {log.oldValue && (
                                  <div className={`${styles['audit-log-detail-item']} ${styles['audit-log-full-width']}`}>
                                    <span className={styles['audit-log-detail-label']}>{t('admin_audit_log_old_value')}:</span>
                                    <div className={styles['audit-log-detail-value-full']}>{log.oldValue}</div>
                                  </div>
                                )}
                                {log.newValue && (
                                  <div className={`${styles['audit-log-detail-item']} ${styles['audit-log-full-width']}`}>
                                    <span className={styles['audit-log-detail-label']}>{t('admin_audit_log_new_value')}:</span>
                                    <div className={styles['audit-log-detail-value-full']}>{log.newValue}</div>
                                  </div>
                                )}
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

            <div className={styles['audit-log-pagination']}>
              <div className={styles['audit-log-pagination-info']}>
                {t('admin_audit_log_showing')} {pagination.pageIndex * pagination.pageSize + 1} {t('admin_audit_log_to')} {Math.min((pagination.pageIndex + 1) * pagination.pageSize, pagination.totalCount)} {t('admin_audit_log_of')} {pagination.totalCount}
              </div>
              <div className={styles['audit-log-pagination-buttons']}>
                <button
                  onClick={() => {
                    setPagination(prev => ({ ...prev, pageIndex: Math.max(0, prev.pageIndex - 1) }));
                    fetchLogs();
                  }}
                  disabled={pagination.pageIndex === 0 || loading}
                  className={styles['audit-log-pagination-btn']}
                >
                  {t('admin_audit_log_previous')}
                </button>
                <span className={styles['audit-log-pagination-current']}>
                  {t('admin_audit_log_page')} {pagination.pageIndex + 1} {t('admin_audit_log_of')} {totalPages}
                </span>
                <button
                  onClick={() => {
                    setPagination(prev => ({ ...prev, pageIndex: Math.min(totalPages - 1, prev.pageIndex + 1) }));
                    fetchLogs();
                  }}
                  disabled={pagination.pageIndex >= totalPages - 1 || loading}
                  className={styles['audit-log-pagination-btn']}
                >
                  {t('admin_audit_log_next')}
                </button>
              </div>
            </div>
          </>
        )}
      </div>


    </div>
  );
};

export const getServerSideProps = () => {
  return { props: {} };
};

export default withAdminLayout(AuditLogViewerContent, {
  permission: 'manage:translations',
  featureName: 'Audit Log Viewer',
});
