import { useState, useEffect, Fragment } from 'react';
import { useRouter } from 'next/router';
import { Search, RefreshCw, Download, Filter, Eye, EyeOff } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { SUPPORTED_LOCALES, Locale } from '../../lib/i18n/types';
import { getIntlLocale } from '../../lib/localeUtils';
import { withAdminLayout } from '../../components/admin/withAdminLayout';
import { getAuthToken } from '../../lib/api';
import { UI_EMOJI } from '../../lib/uiEmoji';

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
  const router = useRouter();

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

    const token = getAuthToken();
    if (!token) {
      router.push('/auth/login');
      return;
    }

    fetchLogs();
  }, [loadNamespace, t]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const token = getAuthToken();
      if (!token) {
        router.push('/auth/login');
        return;
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
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error(t('error_fetching_logs', 'admin-errors'), error);
      }
      setMessage({
        type: 'error',
        text: error.message || t('admin_audit_log_fetch_error'),
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
    <div className="audit-log-container">
      <div className="audit-log-header">
        <div>
          <h1 className="audit-log-title">{t('admin_audit_log_title')}</h1>
          <p className="audit-log-subtitle">
            {t('admin_audit_log_subtitle')}
          </p>
        </div>
        <div className="audit-log-actions">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="audit-log-filter-btn"
            title={t('admin_audit_log_toggle_filters')}
          >
            <Filter size={18} />
            {t('admin_audit_log_filters')}
          </button>
          <button
            onClick={handleRefresh}
            className="audit-log-refresh-btn"
            disabled={loading}
            title={t('admin_audit_log_refresh')}
          >
            <RefreshCw size={18} className={loading ? 'audit-log-spin' : ''} />
          </button>
          <button
            onClick={handleExportCSV}
            className="audit-log-export-btn"
            title={t('admin_audit_log_export_csv')}
          >
            <Download size={18} />
            {t('admin_audit_log_export')}
          </button>
        </div>
      </div>

      {message && (
        <div className={`audit-log-message audit-log-message-${message.type}`}>
          {message.text}
          <button onClick={() => setMessage(null)} className="audit-log-message-close">×</button>
        </div>
      )}

      {showFilters && (
        <div className="audit-log-filters">
          <div className="audit-log-filters-grid">
            <div className="audit-log-filter-group">
              <label>{t('admin_audit_log_search')}</label>
              <input
                type="text"
                placeholder={t('admin_audit_log_search_placeholder')}
                value={filters.searchText}
                onChange={e => handleFilterChange('searchText', e.target.value)}
                className="audit-log-filter-input"
              />
            </div>

            <div className="audit-log-filter-group">
              <label>{t('admin_audit_log_language')}</label>
              <select
                value={filters.selectedLang}
                onChange={e => handleFilterChange('selectedLang', e.target.value)}
                className="audit-log-filter-select"
              >
                <option value="">{t('admin_audit_log_all_languages')}</option>
                {SUPPORTED_LOCALES.map(lang => (
                  <option key={lang} value={lang}>
                    {t(`admin_lang_${lang}`, 'admin-translation')}
                  </option>
                ))}
              </select>
            </div>

            <div className="audit-log-filter-group">
              <label>{t('admin_audit_log_action_type')}</label>
              <select
                value={filters.selectedAction}
                onChange={e => handleFilterChange('selectedAction', e.target.value)}
                className="audit-log-filter-select"
              >
                <option value="">{t('admin_audit_log_all_actions')}</option>
                {ACTION_TYPES.map(action => (
                  <option key={action.value} value={action.value}>
                    {t(`admin_audit_log_action_${action.value}`)}
                  </option>
                ))}
              </select>
            </div>

            <div className="audit-log-filter-group">
              <label>{t('admin_audit_log_date_from')}</label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={e => handleFilterChange('dateFrom', e.target.value)}
                className="audit-log-filter-input"
              />
            </div>

            <div className="audit-log-filter-group">
              <label>{t('admin_audit_log_date_to')}</label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={e => handleFilterChange('dateTo', e.target.value)}
                className="audit-log-filter-input"
              />
            </div>

            <div className="audit-log-filter-group">
              <label>{t('admin_audit_log_user_id')}</label>
              <input
                type="text"
                placeholder={t('admin_audit_log_user_id_placeholder')}
                value={filters.selectedUserId}
                onChange={e => handleFilterChange('selectedUserId', e.target.value)}
                className="audit-log-filter-input"
              />
            </div>
          </div>

          <div className="audit-log-filter-actions">
            <button
              onClick={handleApplyFilters}
              className="audit-log-apply-filters-btn"
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
              className="audit-log-reset-filters-btn"
            >
              {t('admin_audit_log_reset_filters')}
            </button>
          </div>
        </div>
      )}

      <div className="audit-log-content">
        {loading && !logs.length ? (
          <div className="audit-log-loading">
            <div className="audit-log-spinner"></div>
            <p>{t('admin_audit_log_loading')}</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="audit-log-empty">
            <p>{t('admin_audit_log_no_records')}</p>
          </div>
        ) : (
          <>
            <div className="audit-log-table-wrapper">
              <table className="audit-log-table">
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
                      <tr className="audit-log-table-row">
                        <td className="audit-log-timestamp">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="audit-log-user">
                          <div className="audit-log-user-info">
                            <div className="audit-log-user-name">{log.userName}</div>
                            <div className="audit-log-user-id">{log.userId}</div>
                          </div>
                        </td>
                        <td className="audit-log-action">
                          <span className={`audit-log-action-badge audit-log-action-${log.action}`}>
                            {t(`admin_audit_log_action_${log.action}`)}
                          </span>
                        </td>
                        <td className="audit-log-entity">
                          {log.entityId}
                        </td>
                        <td className="audit-log-lang">
                          <span className="audit-log-lang-badge">{t(`locale_label_${log.targetLang}`, 'admin-translation')}</span>
                        </td>
                        <td className="audit-log-changes">
                          {log.oldValue || log.newValue ? (
                            <div className="audit-log-change-preview">
                              <div className="audit-log-old">{log.oldValue?.substring(0, 30)}...</div>
                              <div className="audit-log-arrow">{UI_EMOJI.arrowRight}</div>
                              <div className="audit-log-new">{log.newValue?.substring(0, 30)}...</div>
                            </div>
                          ) : (
                            <span className="audit-log-no-change">-</span>
                          )}
                        </td>
                        <td className="audit-log-expand">
                          <button
                            onClick={() => setExpandedId(expandedId === log._id ? null : log._id)}
                            className="audit-log-expand-btn"
                            title={t('admin_audit_log_view_details')}
                          >
                            {expandedId === log._id ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </td>
                      </tr>
                      {expandedId === log._id && (
                        <tr className="audit-log-expanded-row">
                          <td colSpan={7}>
                            <div className="audit-log-details">
                              <div className="audit-log-details-grid">
                                <div className="audit-log-detail-item">
                                  <span className="audit-log-detail-label">{t('admin_audit_log_entity_type')}:</span>
                                  <span className="audit-log-detail-value">{log.entityType || '-'}</span>
                                </div>
                                <div className="audit-log-detail-item">
                                  <span className="audit-log-detail-label">{t('admin_audit_log_reason')}:</span>
                                  <span className="audit-log-detail-value">{log.reason || t('admin_audit_log_no_reason')}</span>
                                </div>
                                <div className="audit-log-detail-item">
                                  <span className="audit-log-detail-label">{t('admin_audit_log_ip_address')}:</span>
                                  <span className="audit-log-detail-value">{log.ipAddress || '-'}</span>
                                </div>
                                <div className="audit-log-detail-item">
                                  <span className="audit-log-detail-label">{t('admin_audit_log_user_agent')}:</span>
                                  <span className="audit-log-detail-value audit-log-user-agent">{log.userAgent || '-'}</span>
                                </div>
                                {log.oldValue && (
                                  <div className="audit-log-detail-item audit-log-full-width">
                                    <span className="audit-log-detail-label">{t('admin_audit_log_old_value')}:</span>
                                    <div className="audit-log-detail-value-full">{log.oldValue}</div>
                                  </div>
                                )}
                                {log.newValue && (
                                  <div className="audit-log-detail-item audit-log-full-width">
                                    <span className="audit-log-detail-label">{t('admin_audit_log_new_value')}:</span>
                                    <div className="audit-log-detail-value-full">{log.newValue}</div>
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

            <div className="audit-log-pagination">
              <div className="audit-log-pagination-info">
                {t('admin_audit_log_showing')} {pagination.pageIndex * pagination.pageSize + 1} {t('admin_audit_log_to')} {Math.min((pagination.pageIndex + 1) * pagination.pageSize, pagination.totalCount)} {t('admin_audit_log_of')} {pagination.totalCount}
              </div>
              <div className="audit-log-pagination-buttons">
                <button
                  onClick={() => {
                    setPagination(prev => ({ ...prev, pageIndex: Math.max(0, prev.pageIndex - 1) }));
                    fetchLogs();
                  }}
                  disabled={pagination.pageIndex === 0 || loading}
                  className="audit-log-pagination-btn"
                >
                  {t('admin_audit_log_previous')}
                </button>
                <span className="audit-log-pagination-current">
                  {t('admin_audit_log_page')} {pagination.pageIndex + 1} {t('admin_audit_log_of')} {totalPages}
                </span>
                <button
                  onClick={() => {
                    setPagination(prev => ({ ...prev, pageIndex: Math.min(totalPages - 1, prev.pageIndex + 1) }));
                    fetchLogs();
                  }}
                  disabled={pagination.pageIndex >= totalPages - 1 || loading}
                  className="audit-log-pagination-btn"
                >
                  {t('admin_audit_log_next')}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <style jsx>{`
        .audit-log-container {
          padding: 20px;
          max-width: 1400px;
          margin: 0 auto;
        }

        .audit-log-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 24px;
          flex-wrap: wrap;
          gap: 16px;
        }

        .audit-log-title {
          font-size: 28px;
          font-weight: 700;
          margin: 0 0 4px 0;
          color: #1a1a1a;
        }

        .audit-log-subtitle {
          font-size: 14px;
          color: #666;
          margin: 0;
        }

        .audit-log-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .audit-log-filter-btn,
        .audit-log-refresh-btn,
        .audit-log-export-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          background-color: #f5f5f5;
          border: 1px solid #ddd;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s ease;
        }

        .audit-log-filter-btn:hover,
        .audit-log-refresh-btn:hover,
        .audit-log-export-btn:hover {
          background-color: #e8e8e8;
          border-color: #999;
        }

        .audit-log-filter-btn:disabled,
        .audit-log-refresh-btn:disabled,
        .audit-log-export-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .audit-log-spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .audit-log-message {
          padding: 12px 16px;
          border-radius: 6px;
          margin-bottom: 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 14px;
        }

        .audit-log-message-success {
          background-color: #d4edda;
          color: #155724;
          border: 1px solid #c3e6cb;
        }

        .audit-log-message-error {
          background-color: #f8d7da;
          color: #721c24;
          border: 1px solid #f5c6cb;
        }

        .audit-log-message-info {
          background-color: #d1ecf1;
          color: #0c5460;
          border: 1px solid #bee5eb;
        }

        .audit-log-message-close {
          background: none;
          border: none;
          color: inherit;
          cursor: pointer;
          font-size: 20px;
          padding: 0;
          line-height: 1;
        }

        .audit-log-filters {
          background-color: #f9f9f9;
          border: 1px solid #ddd;
          border-radius: 6px;
          padding: 16px;
          margin-bottom: 20px;
        }

        .audit-log-filters-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px;
          margin-bottom: 12px;
        }

        .audit-log-filter-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .audit-log-filter-group label {
          font-size: 12px;
          font-weight: 600;
          color: #333;
        }

        .audit-log-filter-input,
        .audit-log-filter-select {
          padding: 8px 12px;
          border: 1px solid #ccc;
          border-radius: 4px;
          font-size: 14px;
          font-family: inherit;
        }

        .audit-log-filter-input:focus,
        .audit-log-filter-select:focus {
          outline: none;
          border-color: #007bff;
          box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.1);
        }

        .audit-log-filter-actions {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
        }

        .audit-log-apply-filters-btn,
        .audit-log-reset-filters-btn {
          padding: 8px 16px;
          border-radius: 4px;
          border: 1px solid #ddd;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s ease;
        }

        .audit-log-apply-filters-btn {
          background-color: #007bff;
          color: white;
          border-color: #007bff;
        }

        .audit-log-apply-filters-btn:hover {
          background-color: #0056b3;
        }

        .audit-log-reset-filters-btn {
          background-color: #fff;
          color: #333;
        }

        .audit-log-reset-filters-btn:hover {
          background-color: #e8e8e8;
        }

        .audit-log-apply-filters-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .audit-log-content {
          background-color: white;
          border: 1px solid #ddd;
          border-radius: 6px;
          overflow: hidden;
        }

        .audit-log-loading,
        .audit-log-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 20px;
          color: #666;
        }

        .audit-log-spinner {
          border: 3px solid #f3f3f3;
          border-top: 3px solid #007bff;
          border-radius: 50%;
          width: 40px;
          height: 40px;
          animation: spin 1s linear infinite;
          margin-bottom: 16px;
        }

        .audit-log-table-wrapper {
          overflow-x: auto;
        }

        .audit-log-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }

        .audit-log-table thead {
          background-color: #f5f5f5;
          border-bottom: 2px solid #ddd;
        }

        .audit-log-table th {
          padding: 12px 16px;
          text-align: left;
          font-weight: 600;
          color: #333;
        }

        .audit-log-table-row {
          border-bottom: 1px solid #eee;
          transition: background-color 0.2s ease;
        }

        .audit-log-table-row:hover {
          background-color: #f9f9f9;
        }

        .audit-log-table td {
          padding: 12px 16px;
          vertical-align: top;
        }

        .audit-log-timestamp {
          font-size: 13px;
          color: #666;
          white-space: nowrap;
        }

        .audit-log-user-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .audit-log-user-name {
          font-weight: 500;
          color: #333;
        }

        .audit-log-user-id {
          font-size: 12px;
          color: #999;
          font-family: monospace;
        }

        .audit-log-action-badge {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
        }

        .audit-log-action-manual_override {
          background-color: #fff3cd;
          color: #856404;
        }

        .audit-log-action-batch_update {
          background-color: #d1ecf1;
          color: #0c5460;
        }

        .audit-log-action-auto_translate {
          background-color: #d4edda;
          color: #155724;
        }

        .audit-log-action-delete {
          background-color: #f8d7da;
          color: #721c24;
        }

        .audit-log-lang-badge {
          display: inline-block;
          padding: 4px 8px;
          background-color: #e8f4f8;
          color: #0c5460;
          border-radius: 4px;
          font-weight: 500;
          font-size: 12px;
        }

        .audit-log-change-preview {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
        }

        .audit-log-old {
          color: #d32f2f;
          max-width: 80px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .audit-log-arrow {
          color: #999;
        }

        .audit-log-new {
          color: #388e3c;
          max-width: 80px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .audit-log-no-change {
          color: #999;
        }

        .audit-log-expand-btn {
          background: none;
          border: none;
          cursor: pointer;
          color: #007bff;
          padding: 4px;
          display: flex;
          align-items: center;
        }

        .audit-log-expand-btn:hover {
          color: #0056b3;
        }

        .audit-log-expanded-row {
          background-color: #f9f9f9;
        }

        .audit-log-expanded-row td {
          padding: 0;
        }

        .audit-log-details {
          padding: 16px;
        }

        .audit-log-details-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 16px;
        }

        .audit-log-detail-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .audit-log-detail-item.audit-log-full-width {
          grid-column: 1 / -1;
        }

        .audit-log-detail-label {
          font-weight: 600;
          color: #333;
          font-size: 12px;
        }

        .audit-log-detail-value {
          color: #666;
          font-size: 14px;
          word-break: break-word;
        }

        .audit-log-detail-value-full {
          background-color: white;
          border: 1px solid #ddd;
          border-radius: 4px;
          padding: 10px;
          font-family: monospace;
          font-size: 12px;
          max-height: 200px;
          overflow-y: auto;
          color: #333;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .audit-log-user-agent {
          max-width: 400px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .audit-log-pagination {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          border-top: 1px solid #eee;
          background-color: #f9f9f9;
          flex-wrap: wrap;
          gap: 10px;
        }

        .audit-log-pagination-info {
          font-size: 14px;
          color: #666;
        }

        .audit-log-pagination-buttons {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .audit-log-pagination-btn {
          padding: 6px 12px;
          border: 1px solid #ddd;
          background-color: white;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          transition: all 0.2s ease;
        }

        .audit-log-pagination-btn:hover:not(:disabled) {
          background-color: #f5f5f5;
          border-color: #999;
        }

        .audit-log-pagination-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .audit-log-pagination-current {
          font-size: 14px;
          color: #666;
        }

        @media (max-width: 768px) {
          .audit-log-header {
            flex-direction: column;
          }

          .audit-log-filters-grid {
            grid-template-columns: 1fr;
          }

          .audit-log-table {
            font-size: 12px;
          }

          .audit-log-table th,
          .audit-log-table td {
            padding: 8px 10px;
          }

          .audit-log-pagination {
            flex-direction: column;
            gap: 12px;
          }

          .audit-log-pagination-info,
          .audit-log-pagination-buttons {
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>
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
