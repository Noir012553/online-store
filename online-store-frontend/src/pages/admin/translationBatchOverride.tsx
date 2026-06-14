import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Upload, Download, Play, Check, AlertCircle, X, Eye, FileDown } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import AdminLayout from '../../components/admin/_AdminLayout';
import { getAuthToken } from '../../lib/api';

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

const SUPPORTED_LANGUAGES = [
  'vi',
  'en',
  'fr',
  'zh',
  'ja',
  'ko',
  'th',
  'id',
];

const TranslationBatchOverride = () => {
  const { t, loadNamespace } = useTranslation();
  const router = useRouter();

  const [rows, setRows] = useState<BatchOverrideRow[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error' | 'info' | 'warning';
    text: string;
  } | null>(null);

  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '');

  useEffect(() => {
    loadNamespace('admin-translation-batch').catch(err => {
      console.error('Failed to load namespace:', err);
    });

    const token = getAuthToken();
    if (!token) {
      router.push('/auth/login');
      return;
    }
  }, []);

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
            text: `CSV must contain columns: ${requiredHeaders.join(', ')}`,
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
            text: 'No valid rows found in CSV',
          });
          return;
        }

        setRows(newRows);
        setSelectedRows(new Set(newRows.map((_, i) => i)));
        setBatchResult(null);
        setMessage({
          type: 'success',
          text: `Loaded ${newRows.length} rows from CSV`,
        });
      } catch (error: any) {
        setMessage({
          type: 'error',
          text: `Failed to parse CSV: ${error.message}`,
        });
      }
    };

    reader.readAsText(file);
  };

  const handleAddRow = () => {
    const newRow: BatchOverrideRow = {
      entityId: '',
      entityType: 'product',
      targetLang: 'vi',
      oldValue: '',
      newValue: '',
      reason: '',
      status: 'pending',
    };
    setRows([...rows, newRow]);
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
    selectedRows.delete(index);
    setSelectedRows(new Set(selectedRows));
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

  const handleSelectAll = () => {
    if (selectedRows.size === rows.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(rows.map((_, i) => i)));
    }
  };

  const validateRows = (): string | null => {
    if (selectedRows.size === 0) return 'Please select at least one row';
    
    for (const idx of selectedRows) {
      const row = rows[idx];
      if (!row.entityId.trim()) return `Row ${idx + 1}: Entity ID is required`;
      if (!row.newValue.trim()) return `Row ${idx + 1}: New value is required`;
      if (!row.targetLang.trim()) return `Row ${idx + 1}: Language is required`;
      if (!row.entityType.trim()) return `Row ${idx + 1}: Entity type is required`;
      if (!row.reason.trim()) return `Row ${idx + 1}: Reason is required`;
    }
    return null;
  };

  const handleProcessBatch = async () => {
    const error = validateRows();
    if (error) {
      setMessage({ type: 'error', text: error });
      return;
    }

    if (!confirm(`Process ${selectedRows.size} translation overrides?`)) {
      return;
    }

    setProcessing(true);
    try {
      const token = getAuthToken();
      if (!token) {
        router.push('/auth/login');
        return;
      }

      const dataToProcess = Array.from(selectedRows).map(idx => rows[idx]);

      const response = await fetch(`${API_BASE}/api/translations/batch/override`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ overrides: dataToProcess }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to process batch');
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
        text: `Batch processed: ${data.result.successCount} success, ${data.result.failureCount} failed`,
      });
    } catch (error: any) {
      console.error('Error processing batch:', error);
      setMessage({
        type: 'error',
        text: error.message || 'Failed to process batch',
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleExportTemplate = () => {
    const headers = ['EntityID', 'EntityType', 'TargetLang', 'OldValue', 'NewValue', 'Reason'];
    const template = [
      headers.join(','),
      `prod_123,product,vi,Old Text,New Text,Grammar correction`,
      `rev_456,review,en,Typo here,Typo fixed,Fixed spelling`,
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
      text: 'Template exported successfully',
    });
  };

  const handleExportResults = () => {
    if (!batchResult) return;

    const csv = [
      ['Entity ID', 'Status', 'Error Message'].join(','),
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
      text: 'Results exported successfully',
    });
  };

  return (
    <AdminLayout>
      <div className="batch-container">
        <div className="batch-header">
          <div>
            <h1 className="batch-title">
              {t('admin_batch_override_title', 'Batch Translation Override')}
            </h1>
            <p className="batch-subtitle">
              {t('admin_batch_override_subtitle', 'Upload CSV to override multiple translations at once')}
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
              <h2>{t('admin_batch_upload_title', 'Upload CSV File')}</h2>
              
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
                  <p>{t('admin_batch_upload_drag', 'Drag and drop CSV file here or click to browse')}</p>
                  <small>{t('admin_batch_upload_format', 'Format: EntityID, EntityType, TargetLang, OldValue, NewValue, Reason')}</small>
                </label>
              </div>

              <div className="batch-template-actions">
                <button
                  onClick={handleExportTemplate}
                  className="batch-template-btn"
                >
                  <FileDown size={16} />
                  {t('admin_batch_download_template', 'Download Template')}
                </button>
                <button
                  onClick={handleAddRow}
                  className="batch-add-row-btn"
                  disabled={rows.length > 0}
                >
                  {t('admin_batch_add_manual', 'Add Manual Row')}
                </button>
              </div>
            </div>
          </div>

          {/* Data Preview Section */}
          {rows.length > 0 && (
            <div className="batch-data-section">
              <div className="batch-card">
                <div className="batch-data-header">
                  <h2>{t('admin_batch_preview_title', 'Preview Data')} ({rows.length} rows)</h2>
                  <button
                    onClick={() => setShowPreview(!showPreview)}
                    className="batch-preview-toggle"
                  >
                    {showPreview ? <Eye size={16} /> : <Eye size={16} />}
                    {showPreview ? t('admin_batch_hide_preview', 'Hide') : t('admin_batch_show_preview', 'Show')}
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
                          <th>{t('admin_batch_col_entity', 'Entity ID')}</th>
                          <th>{t('admin_batch_col_type', 'Type')}</th>
                          <th>{t('admin_batch_col_lang', 'Lang')}</th>
                          <th>{t('admin_batch_col_new_value', 'New Value')}</th>
                          <th>{t('admin_batch_col_reason', 'Reason')}</th>
                          <th>{t('admin_batch_col_status', 'Status')}</th>
                          <th>{t('admin_batch_col_actions', 'Actions')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, idx) => (
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
                            <td>{row.targetLang.toUpperCase()}</td>
                            <td className="batch-value-cell" title={row.newValue}>
                              {row.newValue.substring(0, 40)}...
                            </td>
                            <td className="batch-reason-cell" title={row.reason}>
                              {row.reason.substring(0, 30)}...
                            </td>
                            <td>
                              {row.status === 'success' && (
                                <span className="batch-status-success">✓ Success</span>
                              )}
                              {row.status === 'error' && (
                                <span className="batch-status-error" title={row.error}>✗ Error</span>
                              )}
                              {row.status === 'pending' && (
                                <span className="batch-status-pending">○ Pending</span>
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
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="batch-data-summary">
                  <div className="batch-summary-item">
                    <span className="batch-summary-label">Total:</span>
                    <span className="batch-summary-value">{rows.length}</span>
                  </div>
                  <div className="batch-summary-item">
                    <span className="batch-summary-label">Selected:</span>
                    <span className="batch-summary-value">{selectedRows.size}</span>
                  </div>
                  {batchResult && (
                    <>
                      <div className="batch-summary-item success">
                        <span className="batch-summary-label">Success:</span>
                        <span className="batch-summary-value">{batchResult.successCount}</span>
                      </div>
                      <div className="batch-summary-item error">
                        <span className="batch-summary-label">Failed:</span>
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
                <h2>{t('admin_batch_results_title', 'Batch Results')}</h2>
                
                <div className="batch-results-summary">
                  <div className="batch-result-item">
                    <span>{t('admin_batch_result_total', 'Total Processed')}</span>
                    <span className="batch-result-value">{batchResult.totalProcessed}</span>
                  </div>
                  <div className="batch-result-item success">
                    <span>{t('admin_batch_result_success', 'Success')}</span>
                    <span className="batch-result-value">{batchResult.successCount}</span>
                  </div>
                  <div className="batch-result-item error">
                    <span>{t('admin_batch_result_failure', 'Failure')}</span>
                    <span className="batch-result-value">{batchResult.failureCount}</span>
                  </div>
                </div>

                {batchResult.failures.length > 0 && (
                  <div className="batch-failures">
                    <h3>{t('admin_batch_failures_title', 'Failed Rows')}</h3>
                    <div className="batch-failures-list">
                      {batchResult.failures.map((failure, idx) => (
                        <div key={idx} className="batch-failure-item">
                          <span className="batch-failure-row">Row {failure.rowIndex + 1}</span>
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
                    {t('admin_batch_export_results', 'Export Results')}
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
                  {t('admin_batch_processing', 'Processing...')}
                </>
              ) : (
                <>
                  <Play size={16} />
                  {t('admin_batch_process', 'Process Batch')} ({selectedRows.size} selected)
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
    </AdminLayout>
  );
};

export default TranslationBatchOverride;
