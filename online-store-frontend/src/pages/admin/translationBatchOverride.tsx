import { useState, useEffect, Fragment } from 'react';
import styles from './translationBatchOverride.module.css';
import { Upload, Download, Play, Check, AlertCircle, X, Eye, FileDown, ChevronLeft, ChevronRight, Circle } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, Locale } from '../../lib/i18n/types';
import { withAdminLayout } from '../../components/admin/withAdminLayout';
import { useAuth } from '../../lib/context/AuthContext';
import { getAuthToken } from '../../lib/api';
import { getUserFriendlyErrorMessage } from '../../lib/errorHandler';
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

const MESSAGE_TYPE_CLASSES = {
  success: styles['batch-message-success'],
  error: styles['batch-message-error'],
  warning: styles['batch-message-warning'],
  info: styles['batch-message-info'],
} as const;

const ROW_STATUS_CLASSES = {
  pending: styles['batch-row-pending'],
  success: styles['batch-row-success'],
  error: styles['batch-row-error'],
} as const;

const STATUS_MODIFIER_CLASSES = {
  success: styles.success,
  error: styles.error,
} as const;

const ENTITY_TYPES = [
  'product',
  'review',
  'category',
  'spec',
  'description',
  'ad_hoc',
];

const TranslationBatchOverride = () => {
  const { t, loadNamespace, locale } = useTranslation();
  const { isAdmin } = useAuth();

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
        throw new Error('auth_required');
      }

      const dataToProcess = Array.from(selectedRows).map(idx => rows[idx]);

      const response = await fetch(`${API_BASE}/api/translations/admin/batch-manual-override?lang=${locale}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          overrides: dataToProcess,
          idempotencyKey: crypto.randomUUID(),
        }),
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
    } catch (error) {
      setMessage({
        type: 'error',
        text: getUserFriendlyErrorMessage(error, t),
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
    <div className={styles['batch-container']}>
      <div className={styles['batch-header']}>
        <div>
          <h1 className={styles['batch-title']}>
            {t('admin_batch_override_title', 'admin-translation-batch')}
          </h1>
          <p className={styles['batch-subtitle']}>
            {t('admin_batch_override_subtitle', 'admin-translation-batch')}
          </p>
        </div>
      </div>

      {message && (
        <div className={`${styles['batch-message']} ${MESSAGE_TYPE_CLASSES[message.type]}`}>
          <div className={styles['batch-message-content']}>
            {message.type === 'success' && <Check size={18} />}
            {message.type === 'error' && <AlertCircle size={18} />}
            {message.type === 'warning' && <AlertCircle size={18} />}
            {message.type === 'info' && <AlertCircle size={18} />}
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className={styles['batch-message-close']}>
            <X size={18} />
          </button>
        </div>
      )}

      <div className={styles['batch-content']}>
        {/* Upload Section */}
        <div className={styles['batch-upload-section']}>
          <div className={styles['batch-card']}>
            <h2>{t('admin_batch_upload_title', 'admin-translation-batch')}</h2>
            
            <div className={styles['batch-upload-area']}>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className={styles['batch-file-input']}
                id="csv-upload"
              />
              <label htmlFor="csv-upload" className={styles['batch-upload-label']}>
                <Upload size={32} />
                <p>{t('admin_batch_upload_drag', 'admin-translation-batch')}</p>
                <small>{t('admin_batch_upload_format', 'admin-translation-batch')}</small>
              </label>
            </div>

            <div className={styles['batch-template-actions']}>
              <button
                onClick={handleExportTemplate}
                className={styles['batch-template-btn']}
              >
                <FileDown size={16} />
                {t('admin_batch_download_template', 'admin-translation-batch')}
              </button>
              <button
                onClick={handleAddRow}
                className={styles['batch-add-row-btn']}
                disabled={rows.length > 0}
              >
                {t('admin_batch_add_manual', 'admin-translation-batch')}
              </button>
            </div>
          </div>
        </div>

        {/* Data Preview Section */}
        {rows.length > 0 && (
          <div className={styles['batch-data-section']}>
            <div className={styles['batch-card']}>
              <div className={styles['batch-data-header']}>
                <h2>{t('admin_batch_preview_title', 'admin-translation-batch')} ({rows.length})</h2>
                <button
                  onClick={() => setShowPreview(!showPreview)}
                  className={styles['batch-preview-toggle']}
                >
                  {showPreview ? <Eye size={16} /> : <Eye size={16} />}
                  {showPreview ? t('admin_batch_hide_preview', 'admin-translation-batch') : t('admin_batch_show_preview', 'admin-translation-batch')}
                </button>
              </div>

              {showPreview && (
                <div className={styles['batch-table-wrapper']}>
                  <table className={styles['batch-table']}>
                    <thead>
                      <tr>
                        <th className="w-10">
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
                        <tr key={idx} className={`${styles['batch-row']} ${ROW_STATUS_CLASSES[row.status || 'pending']}`}>
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
                          <td className={styles['batch-value-cell']} title={row.newValue}>
                            {row.newValue.substring(0, 40)}...
                          </td>
                          <td className={styles['batch-reason-cell']} title={row.reason}>
                            {row.reason.substring(0, 30)}...
                          </td>
                          <td>
                            {row.status === 'success' && (
                              <span className={styles['batch-status-success']}><Check className="mr-1 inline h-4 w-4 align-text-bottom" aria-hidden="true" />{t('admin_batch_status_success', 'admin-translation-batch')}</span>
                            )}
                            {row.status === 'error' && (
                              <span className={styles['batch-status-error']} title={row.error}><X className="mr-1 inline h-4 w-4 align-text-bottom" aria-hidden="true" />{t('admin_batch_status_error', 'admin-translation-batch')}</span>
                            )}
                            {row.status === 'pending' && (
                              <span className={styles['batch-status-pending']}><Circle className="mr-1 inline h-3.5 w-3.5 align-text-bottom" aria-hidden="true" />{t('admin_batch_status_pending', 'admin-translation-batch')}</span>
                            )}
                          </td>
                          <td>
                            <button
                              onClick={() => handleDeleteRow(idx)}
                              className={styles['batch-row-delete-btn']}
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

              <div className={styles['batch-data-summary']}>
                <div className={styles['batch-summary-item']}>
                  <span className={styles['batch-summary-label']}>{t('admin_batch_summary_total', 'admin-translation-batch')}:</span>
                  <span className={styles['batch-summary-value']}>{rows.length}</span>
                </div>
                <div className={styles['batch-summary-item']}>
                  <span className={styles['batch-summary-label']}>{t('admin_batch_summary_selected', 'admin-translation-batch')}:</span>
                  <span className={styles['batch-summary-value']}>{selectedRows.size}</span>
                </div>
                {batchResult && (
                  <>
                    <div className={`${styles['batch-summary-item']} ${STATUS_MODIFIER_CLASSES.success}`}>
                      <span className={styles['batch-summary-label']}>{t('admin_batch_summary_success', 'admin-translation-batch')}:</span>
                      <span className={styles['batch-summary-value']}>{batchResult.successCount}</span>
                    </div>
                    <div className={`${styles['batch-summary-item']} ${STATUS_MODIFIER_CLASSES.error}`}>
                      <span className={styles['batch-summary-label']}>{t('admin_batch_summary_failed', 'admin-translation-batch')}:</span>
                      <span className={styles['batch-summary-value']}>{batchResult.failureCount}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Results Section */}
        {batchResult && (
          <div className={styles['batch-results-section']}>
            <div className={styles['batch-card']}>
              <h2>{t('admin_batch_results_title', 'admin-translation-batch')}</h2>
              
              <div className={styles['batch-results-summary']}>
                <div className={styles['batch-result-item']}>
                  <span>{t('admin_batch_result_total', 'admin-translation-batch')}</span>
                  <span className={styles['batch-result-value']}>{batchResult.totalProcessed}</span>
                </div>
                <div className={`${styles['batch-result-item']} ${STATUS_MODIFIER_CLASSES.success}`}>
                  <span>{t('admin_batch_result_success', 'admin-translation-batch')}</span>
                  <span className={styles['batch-result-value']}>{batchResult.successCount}</span>
                </div>
                <div className={`${styles['batch-result-item']} ${STATUS_MODIFIER_CLASSES.error}`}>
                  <span>{t('admin_batch_result_failure', 'admin-translation-batch')}</span>
                  <span className={styles['batch-result-value']}>{batchResult.failureCount}</span>
                </div>
              </div>

              {batchResult.failures.length > 0 && (
                <div className={styles['batch-failures']}>
                  <h3>{t('admin_batch_failures_title', 'admin-translation-batch')}</h3>
                  <div className={styles['batch-failures-list']}>
                    {batchResult.failures.map((failure, idx) => (
                      <div key={idx} className={styles['batch-failure-item']}>
                        <span className={styles['batch-failure-row']}>{t('admin_batch_row_label', 'admin-translation-batch')} {failure.rowIndex + 1}</span>
                        <span className={styles['batch-failure-entity']}>{failure.entityId}</span>
                        <span className={styles['batch-failure-error']}>{failure.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className={styles['batch-results-actions']}>
                <button
                  onClick={handleExportResults}
                  className={styles['batch-export-results-btn']}
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
        <div className={styles['batch-actions']}>
          <button
            onClick={handleProcessBatch}
            className={styles['batch-process-btn']}
            disabled={processing || selectedRows.size === 0}
          >
            {processing ? (
              <>
                <span className={styles['batch-spinner']}></span>
                {t('admin_batch_processing', 'admin-translation-batch')}
              </>
            ) : (
              <>
                <Play size={16} />
                {t('admin_batch_process', 'admin-translation-batch')} ({selectedRows.size})
              </>
            )}
          </button>
        </div>
      )}
    </div>


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
