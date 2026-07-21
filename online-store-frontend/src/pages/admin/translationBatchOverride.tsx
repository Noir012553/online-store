import { useState, useEffect, Fragment } from 'react';
import { useRouter } from 'next/router';
import { Upload, Download, Play, Check, AlertCircle, X, Eye, FileDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, Locale } from '../../lib/i18n/types';
import { withAdminLayout } from '../../components/admin/withAdminLayout';
import { useAuth } from '../../lib/context/AuthContext';
import { getAuthToken } from '../../lib/api';
import { UI_EMOJI } from '../../lib/uiEmoji';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { PermissionDenied } from '../../components/admin/PermissionDenied';

interface BatchOverrideRow {
  entityId: string;
  entityType: string;
  targetLang: string;
  oldValue: string;
  newValue: string;
  reason: string;
  status?: 'pending' | 'success' | 'error';
  error?: string;
}

interface BatchResult {
  totalProcessed: number;
  successCount: number;
  failureCount: number;
  failures: Array<{
    rowIndex: number;
    entityId: string;
    error: string;
  }>;
}

const ENTITY_TYPES = [
  'product',
  'review',
  'category',
  'feature',
  'spec',
  'description',
  'ad_hoc',
];

const TranslationBatchOverride = () => {
  const { t, loadNamespace, locale } = useTranslation();
  const { isAdmin } = useAuth();
  const router = useRouter();

  if (!isAdmin) {
    return <PermissionDenied feature="Translation Batch Override" />;
  }

  const [rows, setRows] = useState<BatchOverrideRow[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error' | 'info' | 'warning';
    text: string;
  } | null>(null);

  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean; rowCount: number }>({ isOpen: false, rowCount: 0 });

  const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '');

  useEffect(() => {
    loadNamespace('admin-translation-batch').catch(err => {
      if (process.env.NODE_ENV === 'development') {
        console.error(t('failed_load_namespace', 'admin-errors'), err);
      }
    });

    const token = getAuthToken();
    if (!token) {
      router.push('/auth/login');
      return;
    }
  }, [loadNamespace]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const lines = content.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

        // Validate headers
        const requiredHeaders = ['entityid', 'entitytype', 'targetlang', 'newvalue', 'reason'];
        const hasRequiredHeaders = requiredHeaders.every(h => headers.includes(h));

        if (!hasRequiredHeaders) {
          setMessage({
          type: 'error',
          text: t('admin_batch_csv_columns_error', 'admin-translation-batch'),
        });
        return;
        }

        const newRows: BatchOverrideRow[] = [];
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(v => v.trim());
          const row: BatchOverrideRow = {
            entityId: values[headers.indexOf('entityid')] || '',
            entityType: values[headers.indexOf('entitytype')] || '',
            targetLang: values[headers.indexOf('targetlang')] || '',
            oldValue: values[headers.indexOf('oldvalue')] || '',
            newValue: values[headers.indexOf('newvalue')] || '',
            reason: values[headers.indexOf('reason')] || '',
            status: 'pending',
          };

          if (row.entityId && row.newValue && row.targetLang) {
            newRows.push(row);
          }
        }

        if (newRows.length === 0) {
          setMessage({
            type: 'error',
            text: t('admin_batch_no_valid_rows_error', 'admin-translation-batch'),
          });
          return;
        }

        setRows(newRows);
        setCurrentPage(1);
        setSelectedRows(new Set(newRows.map((_, i) => i)));
        setBatchResult(null);
        setMessage({
          type: 'success',
          text: t('admin_batch_csv_loaded', 'admin-translation-batch'),
        });
      } catch (error: any) {
        setMessage({
          type: 'error',
          text: t('admin_batch_csv_parse_error', 'admin-translation-batch'),
        });
      }
    };

    reader.readAsText(file);
  };

  const handleAddRow = () => {
    const newRow: BatchOverrideRow = {
      entityId: '',
      entityType: 'product',
      targetLang: DEFAULT_LOCALE,
      oldValue: '',
      newValue: '',
      reason: '',
      status: 'pending',
    };
    setRows([...rows, newRow]);
    setCurrentPage(Math.ceil((rows.length + 1) / pageSize));
  };

  const handleUpdateRow = (index: number, field: keyof BatchOverrideRow, value: any) => {
    const newRows = [...rows];
    newRows[index] = {
      ...newRows[index],
      [field]: value,
    };
    setRows(newRows);
  };

  const handleDeleteRow = (index: number) => {
    setRows(rows.filter((_, i) => i !== index));
    setSelectedRows(new Set(Array.from(selectedRows).filter(rowIndex => rowIndex !== index).map(rowIndex => rowIndex > index ? rowIndex - 1 : rowIndex)));
    setCurrentPage(page => Math.min(page, Math.max(1, Math.ceil((rows.length - 1) / pageSize))));
  };

  const handleSelectRow = (index: number) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedRows(newSelected);
  };

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const visibleRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const handleSelectAll = () => {
    if (selectedRows.size === rows.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(rows.map((_, i) => i)));
    }
  };

  const validateRows = (): string | null => {
    if (selectedRows.size === 0) return t('admin_batch_select_rows_error', 'admin-translation-batch');

    for (const idx of selectedRows) {
      const row = rows[idx];
      if (!row.entityId.trim()) return `${t('admin_batch_row_label', 'admin-translation-batch')} ${idx + 1}: ${t('admin_batch_entity_id_required', 'admin-translation-batch')}`;
      if (!row.newValue.trim()) return `${t('admin_batch_row_label', 'admin-translation-batch')} ${idx + 1}: ${t('admin_batch_new_value_required', 'admin-translation-batch')}`;
      if (!row.targetLang.trim()) return `${t('admin_batch_row_label', 'admin-translation-batch')} ${idx + 1}: ${t('admin_batch_language_required', 'admin-translation-batch')}`;
      if (!row.entityType.trim()) return `${t('admin_batch_row_label', 'admin-translation-batch')} ${idx + 1}: ${t('admin_batch_entity_type_required', 'admin-translation-batch')}`;
      if (!row.reason.trim()) return `${t('admin_batch_row_label', 'admin-translation-batch')} ${idx + 1}: ${t('admin_batch_reason_required', 'admin-translation-batch')}`;
    }
    return null;
  };

  const handleProcessBatch = async () => {
    const error = validateRows();
    if (error) {
      setMessage({ type: 'error', text: error });
      return;
    }

    setConfirmDialog({ isOpen: true, rowCount: selectedRows.size });
  };

  const confirmProcessBatch = async () => {
    setConfirmDialog({ isOpen: false, rowCount: 0 });
    setProcessing(true);
    try {
      const token = getAuthToken();
      if (!token) {
        router.push('/auth/login');
        return;
      }

      const dataToProcess = Array.from(selectedRows).map(idx => rows[idx]);

      const response = await fetch(`${API_BASE}/api/translations/batch/override?lang=${locale}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ overrides: dataToProcess }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || t('admin_batch_process_error', 'admin-translation-batch'));
      }

      const data = await response.json();
      setBatchResult(data.result);

      // Update row statuses
      const newRows = [...rows];
      data.result.failures.forEach((failure: any) => {
        newRows[failure.rowIndex].status = 'error';
        newRows[failure.rowIndex].error = failure.error;
      });

      // Mark successful rows
      for (let i = 0; i < newRows.length; i++) {
        if (!data.result.failures.some((f: any) => f.rowIndex === i) && selectedRows.has(i)) {
          newRows[i].status = 'success';
        }
      }

      setRows(newRows);

      setMessage({
        type: 'success',
        text: t('admin_batch_process_success', 'admin-translation-batch'),
      });
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.message || t('admin_batch_process_error', 'admin-translation-batch'),
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleExportTemplate = () => {
    const headers = [
      t('admin_batch_col_entity', 'admin-translation-batch'),
      t('admin_batch_col_type', 'admin-translation-batch'),
      t('admin_batch_col_lang', 'admin-translation-batch'),
      t('admin_batch_col_old', 'admin-translation-batch'),
      t('admin_batch_col_new', 'admin-translation-batch'),
      t('admin_batch_col_reason', 'admin-translation-batch'),
    ];
    const exampleEntity = 'prod_123';
    const exampleType = 'product';
    const exampleLang = DEFAULT_LOCALE;
    const exampleOld = t('admin_batch_example_old', 'admin-translation-batch');
    const exampleNew = t('admin_batch_example_new', 'admin-translation-batch');
    const exampleReason = t('admin_batch_example_reason', 'admin-translation-batch');

    const template = [
      headers.join(','),
      [exampleEntity, exampleType, exampleLang, exampleOld, exampleNew, exampleReason].join(','),
    ].join('\n');

    const blob = new Blob([template], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'translation-batch-template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    setMessage({
      type: 'info',
      text: t('admin_batch_template_exported', 'admin-translation-batch'),
    });
  };

  const handleExportResults = () => {
    if (!batchResult) return;

    const csv = [
      [t('admin_batch_col_entity', 'admin-translation-batch'), t('admin_batch_col_status', 'admin-translation-batch'), t('admin_batch_col_error', 'admin-translation-batch')].join(','),
      ...rows.map((row, idx) => [
        row.entityId,
        row.status || 'pending',
        row.error || '',
      ].map(v => `"${v}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `batch-results-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    setMessage({
      type: 'success',
      text: t('admin_batch_results_exported', 'admin-translation-batch'),
    });
  };

  return (
    <>
    <div className="batch-container">
      <div className="batch-header">
        <div>
          <h1 className="batch-title">
            {t('admin_batch_override_title', 'admin-translation-batch')}
          </h1>
          <p className="batch-subtitle">
            {t('admin_batch_override_subtitle', 'admin-translation-batch')}
          </p>
        </div>
      </div>

      {message && (
        <div className={`batch-message batch-message-${message.type}`}>
          <div className="batch-message-content">
            {message.type === 'success' && <Check size={18} />}
            {message.type === 'error' && <AlertCircle size={18} />}
            {message.type === 'warning' && <AlertCircle size={18} />}
            {message.type === 'info' && <AlertCircle size={18} />}
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="batch-message-close">
            <X size={18} />
          </button>
        </div>
      )}

      <div className="batch-content">
        {/* Upload Section */}
        <div className="batch-upload-section">
          <div className="batch-card">
            <h2>{t('admin_batch_upload_title', 'admin-translation-batch')}</h2>
            
            <div className="batch-upload-area">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="batch-file-input"
                id="csv-upload"
              />
              <label htmlFor="csv-upload" className="batch-upload-label">
                <Upload size={32} />
                <p>{t('admin_batch_upload_drag', 'admin-translation-batch')}</p>
                <small>{t('admin_batch_upload_format', 'admin-translation-batch')}</small>
              </label>
            </div>

            <div className="batch-template-actions">
              <button
                onClick={handleExportTemplate}
                className="batch-template-btn"
              >
                <FileDown size={16} />
                {t('admin_batch_download_template', 'admin-translation-batch')}
              </button>
              <button
                onClick={handleAddRow}
                className="batch-add-row-btn"
                disabled={rows.length > 0}
              >
                {t('admin_batch_add_manual', 'admin-translation-batch')}
              </button>
            </div>
          </div>
        </div>

        {/* Data Preview Section */}
        {rows.length > 0 && (
          <div className="batch-data-section">
            <div className="batch-card">
              <div className="batch-data-header">
                <h2>{t('admin_batch_preview_title', 'admin-translation-batch')} ({rows.length} rows)</h2>
                <button
                  onClick={() => setShowPreview(!showPreview)}
                  className="batch-preview-toggle"
                >
                  {showPreview ? <Eye size={16} /> : <Eye size={16} />}
                  {showPreview ? t('admin_batch_hide_preview', 'admin-translation-batch') : t('admin_batch_show_preview', 'admin-translation-batch')}
                </button>
              </div>

              {showPreview && (
                <div className="batch-table-wrapper">
                  <table className="batch-table">
                    <thead>
                      <tr>
                        <th style={{ width: '40px' }}>
                          <input
                            type="checkbox"
                            checked={selectedRows.size === rows.length}
                            onChange={handleSelectAll}
                          />
                        </th>
                        <th>{t('admin_batch_col_entity', 'admin-translation-batch')}</th>
                        <th>{t('admin_batch_col_type', 'admin-translation-batch')}</th>
                        <th>{t('admin_batch_col_lang', 'admin-translation-batch')}</th>
                        <th>{t('admin_batch_col_new_value', 'admin-translation-batch')}</th>
                        <th>{t('admin_batch_col_reason', 'admin-translation-batch')}</th>
                        <th>{t('admin_batch_col_status', 'admin-translation-batch')}</th>
                        <th>{t('admin_batch_col_actions', 'admin-translation-batch')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((row, visibleIndex) => {
                        const idx = (currentPage - 1) * pageSize + visibleIndex;
                        return (
                        <tr key={idx} className={`batch-row batch-row-${row.status}`}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedRows.has(idx)}
                              onChange={() => handleSelectRow(idx)}
                              disabled={row.status === 'success'}
                            />
                          </td>
                          <td title={row.entityId}>{row.entityId}</td>
                          <td>{row.entityType}</td>
                          <td>{t(`language_${row.targetLang}`, 'admin')}</td>
                          <td className="batch-value-cell" title={row.newValue}>
                            {row.newValue.substring(0, 40)}...
                          </td>
                          <td className="batch-reason-cell" title={row.reason}>
                            {row.reason.substring(0, 30)}...
                          </td>
                          <td>
                            {row.status === 'success' && (
                              <span className="batch-status-success">{UI_EMOJI.statusSuccessText} {t('admin_batch_status_success', 'admin-translation-batch')}</span>
                            )}
                            {row.status === 'error' && (
                              <span className="batch-status-error" title={row.error}>{UI_EMOJI.statusErrorText} {t('admin_batch_status_error', 'admin-translation-batch')}</span>
                            )}
                            {row.status === 'pending' && (
                              <span className="batch-status-pending">{UI_EMOJI.statusPendingText} {t('admin_batch_status_pending', 'admin-translation-batch')}</span>
                            )}
                          </td>
                          <td>
                            <button
                              onClick={() => handleDeleteRow(idx)}
                              className="batch-row-delete-btn"
                              disabled={row.status === 'success'}
                            >
                              <X size={14} />
                            </button>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-gray-500">{currentPage} / {totalPages}</span>
                  <div className="flex gap-2">
                    <button onClick={() => setCurrentPage(page => Math.max(1, page - 1))} disabled={currentPage === 1} className="p-2 border rounded disabled:opacity-40">
                      <ChevronLeft size={16} />
                    </button>
                    <button onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages} className="p-2 border rounded disabled:opacity-40">
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}

              <div className="batch-data-summary">
                <div className="batch-summary-item">
                  <span className="batch-summary-label">{t('admin_batch_summary_total', 'admin-translation-batch')}:</span>
                  <span className="batch-summary-value">{rows.length}</span>
                </div>
                <div className="batch-summary-item">
                  <span className="batch-summary-label">{t('admin_batch_summary_selected', 'admin-translation-batch')}:</span>
                  <span className="batch-summary-value">{selectedRows.size}</span>
                </div>
                {batchResult && (
                  <>
                    <div className="batch-summary-item success">
                      <span className="batch-summary-label">{t('admin_batch_summary_success', 'admin-translation-batch')}:</span>
                      <span className="batch-summary-value">{batchResult.successCount}</span>
                    </div>
                    <div className="batch-summary-item error">
                      <span className="batch-summary-label">{t('admin_batch_summary_failed', 'admin-translation-batch')}:</span>
                      <span className="batch-summary-value">{batchResult.failureCount}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Results Section */}
        {batchResult && (
          <div className="batch-results-section">
            <div className="batch-card">
              <h2>{t('admin_batch_results_title', 'admin-translation-batch')}</h2>
              
              <div className="batch-results-summary">
                <div className="batch-result-item">
                  <span>{t('admin_batch_result_total', 'admin-translation-batch')}</span>
                  <span className="batch-result-value">{batchResult.totalProcessed}</span>
                </div>
                <div className="batch-result-item success">
                  <span>{t('admin_batch_result_success', 'admin-translation-batch')}</span>
                  <span className="batch-result-value">{batchResult.successCount}</span>
                </div>
                <div className="batch-result-item error">
                  <span>{t('admin_batch_result_failure', 'admin-translation-batch')}</span>
                  <span className="batch-result-value">{batchResult.failureCount}</span>
                </div>
              </div>

              {batchResult.failures.length > 0 && (
                <div className="batch-failures">
                  <h3>{t('admin_batch_failures_title', 'admin-translation-batch')}</h3>
                  <div className="batch-failures-list">
                    {batchResult.failures.map((failure, idx) => (
                      <div key={idx} className="batch-failure-item">
                        <span className="batch-failure-row">{t('admin_batch_row_label', 'admin-translation-batch')} {failure.rowIndex + 1}</span>
                        <span className="batch-failure-entity">{failure.entityId}</span>
                        <span className="batch-failure-error">{failure.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="batch-results-actions">
                <button
                  onClick={handleExportResults}
                  className="batch-export-results-btn"
                >
                  <Download size={16} />
                  {t('admin_batch_export_results', 'admin-translation-batch')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      {rows.length > 0 && (
        <div className="batch-actions">
          <button
            onClick={handleProcessBatch}
            className="batch-process-btn"
            disabled={processing || selectedRows.size === 0}
          >
            {processing ? (
              <>
                <span className="batch-spinner"></span>
                {t('admin_batch_processing', 'admin-translation-batch')}
              </>
            ) : (
              <>
                <Play size={16} />
                {t('admin_batch_process', 'admin-translation-batch')} ({selectedRows.size} selected)
              </>
            )}
          </button>
        </div>
      )}
    </div>

    <style jsx>{`
      .batch-container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 20px;
      }

      .batch-header {
        margin-bottom: 24px;
      }

      .batch-title {
        font-size: 28px;
        font-weight: 700;
        margin: 0 0 4px 0;
        color: #1a1a1a;
      }

      .batch-subtitle {
        font-size: 14px;
        color: #666;
        margin: 0;
      }

      .batch-message {
        padding: 12px 16px;
        border-radius: 6px;
        margin-bottom: 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 14px;
      }

      .batch-message-success {
        background-color: #d4edda;
        color: #155724;
        border: 1px solid #c3e6cb;
      }

      .batch-message-error {
        background-color: #f8d7da;
        color: #721c24;
        border: 1px solid #f5c6cb;
      }

      .batch-message-warning {
        background-color: #fff3cd;
        color: #856404;
        border: 1px solid #ffeaa7;
      }

      .batch-message-info {
        background-color: #d1ecf1;
        color: #0c5460;
        border: 1px solid #bee5eb;
      }

      .batch-message-content {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .batch-message-close {
        background: none;
        border: none;
        color: inherit;
        cursor: pointer;
        padding: 0;
        line-height: 1;
      }

      .batch-content {
        display: grid;
        grid-template-columns: 1fr;
        gap: 20px;
        margin-bottom: 24px;
      }

      .batch-card {
        background-color: white;
        border: 1px solid #ddd;
        border-radius: 8px;
        padding: 24px;
      }

      .batch-card h2 {
        margin: 0 0 16px 0;
        font-size: 18px;
        font-weight: 600;
      }

      .batch-card h3 {
        margin: 0 0 12px 0;
        font-size: 16px;
        font-weight: 600;
      }

      .batch-upload-area {
        position: relative;
        border: 2px dashed #ddd;
        border-radius: 8px;
        padding: 40px 20px;
        text-align: center;
        transition: all 0.2s ease;
        margin-bottom: 16px;
      }

      .batch-upload-area:hover {
        border-color: #007bff;
        background-color: #f9f9f9;
      }

      .batch-file-input {
        display: none;
      }

      .batch-upload-label {
        cursor: pointer;
        display: block;
      }

      .batch-upload-label svg {
        color: #007bff;
        margin-bottom: 12px;
      }

      .batch-upload-label p {
        margin: 0 0 8px 0;
        font-size: 16px;
        font-weight: 500;
        color: #333;
      }

      .batch-upload-label small {
        display: block;
        color: #999;
        font-size: 12px;
      }

      .batch-template-actions {
        display: flex;
        gap: 12px;
      }

      .batch-template-btn,
      .batch-add-row-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 16px;
        border: 1px solid #ddd;
        background-color: white;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.2s ease;
      }

      .batch-template-btn:hover {
        background-color: #f5f5f5;
      }

      .batch-add-row-btn {
        background-color: #007bff;
        color: white;
        border-color: #007bff;
      }

      .batch-add-row-btn:hover:not(:disabled) {
        background-color: #0056b3;
      }

      .batch-add-row-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .batch-data-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
      }

      .batch-preview-toggle {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        background-color: #f5f5f5;
        border: 1px solid #ddd;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        transition: all 0.2s ease;
      }

      .batch-preview-toggle:hover {
        background-color: #e8e8e8;
      }

      .batch-table-wrapper {
        overflow-x: auto;
        margin-bottom: 16px;
        border: 1px solid #eee;
        border-radius: 4px;
      }

      .batch-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }

      .batch-table thead {
        background-color: #f5f5f5;
        border-bottom: 1px solid #ddd;
      }

      .batch-table th {
        padding: 10px 12px;
        text-align: left;
        font-weight: 600;
        color: #333;
      }

      .batch-table td {
        padding: 10px 12px;
        border-bottom: 1px solid #eee;
      }

      .batch-table input[type="checkbox"] {
        cursor: pointer;
      }

      .batch-value-cell,
      .batch-reason-cell {
        max-width: 150px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: #666;
      }

      .batch-status-success {
        color: #28a745;
        font-weight: 600;
        font-size: 12px;
      }

      .batch-status-error {
        color: #dc3545;
        font-weight: 600;
        font-size: 12px;
      }

      .batch-status-pending {
        color: #999;
        font-weight: 600;
        font-size: 12px;
      }

      .batch-row-delete-btn {
        background: none;
        border: none;
        color: #dc3545;
        cursor: pointer;
        padding: 4px;
        display: flex;
        align-items: center;
        transition: all 0.2s ease;
      }

      .batch-row-delete-btn:hover:not(:disabled) {
        color: #c82333;
      }

      .batch-row-delete-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .batch-data-summary {
        display: flex;
        gap: 20px;
        padding-top: 16px;
        border-top: 1px solid #eee;
      }

      .batch-summary-item {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .batch-summary-item.success {
        color: #28a745;
      }

      .batch-summary-item.error {
        color: #dc3545;
      }

      .batch-summary-label {
        font-size: 12px;
        color: #666;
      }

      .batch-summary-value {
        font-size: 16px;
        font-weight: 700;
      }

      .batch-results-summary {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 16px;
        margin-bottom: 24px;
      }

      .batch-result-item {
        background-color: #f9f9f9;
        border: 1px solid #eee;
        border-radius: 4px;
        padding: 16px;
        text-align: center;
      }

      .batch-result-item.success {
        background-color: #f0f8f4;
        border-color: #c3e6cb;
      }

      .batch-result-item.error {
        background-color: #fef5f5;
        border-color: #f5c6cb;
      }

      .batch-result-item span:first-child {
        display: block;
        font-size: 12px;
        color: #666;
        margin-bottom: 8px;
      }

      .batch-result-value {
        display: block;
        font-size: 24px;
        font-weight: 700;
      }

      .batch-result-item.success .batch-result-value {
        color: #28a745;
      }

      .batch-result-item.error .batch-result-value {
        color: #dc3545;
      }

      .batch-failures {
        background-color: #fef5f5;
        border: 1px solid #f5c6cb;
        border-radius: 4px;
        padding: 16px;
        margin-bottom: 16px;
      }

      .batch-failures-list {
        display: grid;
        gap: 8px;
      }

      .batch-failure-item {
        display: grid;
        grid-template-columns: 60px 150px 1fr;
        gap: 12px;
        padding: 10px;
        background-color: white;
        border-radius: 4px;
        border: 1px solid #f0d5d5;
        font-size: 12px;
      }

      .batch-failure-row {
        font-weight: 600;
        color: #dc3545;
      }

      .batch-failure-entity {
        color: #666;
        font-family: monospace;
      }

      .batch-failure-error {
        color: #d32f2f;
      }

      .batch-results-actions {
        display: flex;
        gap: 12px;
        padding-top: 16px;
        border-top: 1px solid #eee;
      }

      .batch-export-results-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 16px;
        background-color: #007bff;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.2s ease;
      }

      .batch-export-results-btn:hover {
        background-color: #0056b3;
      }

      .batch-actions {
        display: flex;
        gap: 12px;
        justify-content: flex-end;
        padding-top: 20px;
        border-top: 1px solid #eee;
      }

      .batch-process-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 24px;
        background-color: #28a745;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 16px;
        font-weight: 600;
        transition: all 0.2s ease;
      }

      .batch-process-btn:hover:not(:disabled) {
        background-color: #218838;
      }

      .batch-process-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .batch-spinner {
        display: inline-block;
        width: 14px;
        height: 14px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-top-color: white;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      @media (max-width: 768px) {
        .batch-results-summary {
          grid-template-columns: 1fr;
        }

        .batch-failure-item {
          grid-template-columns: 1fr;
        }

        .batch-data-summary {
          flex-wrap: wrap;
        }
      }
    `}</style>
    <Dialog open={confirmDialog.isOpen} onOpenChange={(open: boolean) => !open && setConfirmDialog({ isOpen: false, rowCount: 0 })}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('common_confirm', 'common')}</DialogTitle>
        </DialogHeader>
        <p>{t('admin_batch_process_confirm', 'admin-translation-batch')}</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirmDialog({ isOpen: false, rowCount: 0 })}>
            {t('common_cancel', 'common')}
          </Button>
          <Button onClick={confirmProcessBatch}>
            {t('common_confirm', 'common')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
};

export default withAdminLayout(TranslationBatchOverride, {
  permission: 'manage:translations',
  featureName: 'Translation Batch Override'
});

export const getServerSideProps = () => {
  return { props: {} };
};
