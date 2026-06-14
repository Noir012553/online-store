import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Save, X, Check, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import AdminLayout from '../../components/admin/_AdminLayout';
import { getAuthToken } from '../../lib/api';

interface OverrideForm {
  entityId: string;
  entityType: string;
  targetLang: string;
  oldValue: string;
  newValue: string;
  reason: string;
}

const ENTITY_TYPES = [
  { value: 'product', label: 'Product' },
  { value: 'review', label: 'Review' },
  { value: 'category', label: 'Category' },
  { value: 'feature', label: 'Feature' },
  { value: 'spec', label: 'Specification' },
  { value: 'description', label: 'Description' },
  { value: 'ad_hoc', label: 'Ad-hoc Text' },
];

const SUPPORTED_LANGUAGES = [
  { code: 'vi', name: 'Tiếng Việt' },
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' },
  { code: 'zh', name: '中文' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'th', name: 'ไทย' },
  { code: 'id', name: 'Bahasa Indonesia' },
];

const TranslationManualOverride = () => {
  const { t, loadNamespace } = useTranslation();
  const router = useRouter();

  const [form, setForm] = useState<OverrideForm>({
    entityId: '',
    entityType: 'product',
    targetLang: 'vi',
    oldValue: '',
    newValue: '',
    reason: '',
  });

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error' | 'info' | 'warning';
    text: string;
  } | null>(null);

  const [showPreview, setShowPreview] = useState(false);
  const [recentOverrides, setRecentOverrides] = useState<any[]>([]);
  const [fetchingRecent, setFetchingRecent] = useState(false);

  const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '');

  useEffect(() => {
    loadNamespace('admin-translation-override').catch(err => {
      console.error('Failed to load namespace:', err);
    });

    const token = getAuthToken();
    if (!token) {
      router.push('/auth/login');
      return;
    }

    fetchRecentOverrides();
  }, []);

  const fetchRecentOverrides = async () => {
    setFetchingRecent(true);
    try {
      const token = getAuthToken();
      if (!token) return;

      const response = await fetch(`${API_BASE}/api/translations/manual/recent?limit=5`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Failed to fetch recent overrides');

      const data = await response.json();
      setRecentOverrides(data.data || []);
    } catch (error: any) {
      console.error('Error fetching recent overrides:', error);
    } finally {
      setFetchingRecent(false);
    }
  };

  const handleFormChange = (field: string, value: any) => {
    setForm(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const validateForm = (): string | null => {
    if (!form.entityId.trim()) return 'Entity ID is required';
    if (!form.newValue.trim()) return 'New value is required';
    if (form.newValue.trim() === form.oldValue.trim()) return 'New value must be different from old value';
    if (!form.reason.trim()) return 'Reason is required';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const error = validateForm();
    if (error) {
      setMessage({ type: 'error', text: error });
      return;
    }

    setSubmitting(true);
    try {
      const token = getAuthToken();
      if (!token) {
        router.push('/auth/login');
        return;
      }

      const response = await fetch(`${API_BASE}/api/translations/manual/override`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          entityId: form.entityId.trim(),
          entityType: form.entityType,
          targetLang: form.targetLang,
          oldValue: form.oldValue.trim(),
          newValue: form.newValue.trim(),
          reason: form.reason.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to save override');
      }

      const data = await response.json();

      setMessage({
        type: 'success',
        text: 'Translation override saved successfully',
      });

      // Reset form
      setForm({
        entityId: '',
        entityType: 'product',
        targetLang: 'vi',
        oldValue: '',
        newValue: '',
        reason: '',
      });

      // Refresh recent overrides
      fetchRecentOverrides();

      // Hide message after 3 seconds
      setTimeout(() => setMessage(null), 3000);
    } catch (error: any) {
      console.error('Error saving override:', error);
      setMessage({
        type: 'error',
        text: error.message || 'Failed to save override',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrefillFromRecent = (override: any) => {
    setForm({
      entityId: override.entityId,
      entityType: override.entityType || 'product',
      targetLang: override.targetLang,
      oldValue: override.oldValue || '',
      newValue: override.newValue || '',
      reason: '',
    });
    setMessage({
      type: 'info',
      text: 'Form prefilled with recent override details',
    });
  };

  return (
    <AdminLayout>
      <div className="override-container">
        <div className="override-header">
          <div>
            <h1 className="override-title">
              {t('admin_override_title', 'Manual Translation Override')}
            </h1>
            <p className="override-subtitle">
              {t('admin_override_subtitle', 'Manually override a specific translation with full audit logging')}
            </p>
          </div>
        </div>

        {message && (
          <div className={`override-message override-message-${message.type}`}>
            <div className="override-message-content">
              {message.type === 'success' && <Check size={18} />}
              {message.type === 'error' && <AlertCircle size={18} />}
              {message.type === 'warning' && <AlertCircle size={18} />}
              {message.type === 'info' && <AlertCircle size={18} />}
              <span>{message.text}</span>
            </div>
            <button
              onClick={() => setMessage(null)}
              className="override-message-close"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        )}

        <div className="override-content">
          <div className="override-form-section">
            <form onSubmit={handleSubmit} className="override-form">
              <div className="override-form-group">
                <label htmlFor="entityId" className="override-label">
                  {t('admin_override_entity_id', 'Entity ID')} *
                </label>
                <input
                  id="entityId"
                  type="text"
                  placeholder={t('admin_override_entity_id_placeholder', 'e.g., prod_12345')}
                  value={form.entityId}
                  onChange={e => handleFormChange('entityId', e.target.value)}
                  className="override-input"
                  disabled={submitting}
                />
                <small className="override-help-text">
                  {t('admin_override_entity_id_help', 'Product, Review, or other entity ID')}
                </small>
              </div>

              <div className="override-form-row">
                <div className="override-form-group">
                  <label htmlFor="entityType" className="override-label">
                    {t('admin_override_entity_type', 'Entity Type')} *
                  </label>
                  <select
                    id="entityType"
                    value={form.entityType}
                    onChange={e => handleFormChange('entityType', e.target.value)}
                    className="override-select"
                    disabled={submitting}
                  >
                    {ENTITY_TYPES.map(type => (
                      <option key={type.value} value={type.value}>
                        {t(`admin_override_entity_type_${type.value}`, type.label)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="override-form-group">
                  <label htmlFor="targetLang" className="override-label">
                    {t('admin_override_language', 'Language')} *
                  </label>
                  <select
                    id="targetLang"
                    value={form.targetLang}
                    onChange={e => handleFormChange('targetLang', e.target.value)}
                    className="override-select"
                    disabled={submitting}
                  >
                    {SUPPORTED_LANGUAGES.map(lang => (
                      <option key={lang.code} value={lang.code}>
                        {lang.name} ({lang.code.toUpperCase()})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="override-form-group">
                <label htmlFor="oldValue" className="override-label">
                  {t('admin_override_old_value', 'Current Value')}
                </label>
                <textarea
                  id="oldValue"
                  placeholder={t('admin_override_old_value_placeholder', 'Current translation (optional - for reference)')}
                  value={form.oldValue}
                  onChange={e => handleFormChange('oldValue', e.target.value)}
                  className="override-textarea"
                  disabled={submitting}
                  rows={3}
                />
                <small className="override-help-text">
                  {t('admin_override_old_value_help', 'Leave empty if unknown')}
                </small>
              </div>

              <div className="override-form-group">
                <label htmlFor="newValue" className="override-label">
                  {t('admin_override_new_value', 'New Value')} *
                </label>
                <textarea
                  id="newValue"
                  placeholder={t('admin_override_new_value_placeholder', 'Enter the corrected translation')}
                  value={form.newValue}
                  onChange={e => handleFormChange('newValue', e.target.value)}
                  className="override-textarea"
                  disabled={submitting}
                  rows={4}
                />
                <small className="override-help-text">
                  {t('admin_override_new_value_help', 'This will replace the current value')}
                </small>
              </div>

              <div className="override-form-group">
                <label htmlFor="reason" className="override-label">
                  {t('admin_override_reason', 'Reason for Override')} *
                </label>
                <textarea
                  id="reason"
                  placeholder={t('admin_override_reason_placeholder', 'Explain why this override is necessary')}
                  value={form.reason}
                  onChange={e => handleFormChange('reason', e.target.value)}
                  className="override-textarea"
                  disabled={submitting}
                  rows={3}
                />
                <small className="override-help-text">
                  {t('admin_override_reason_help', 'This will be logged in the audit trail')}
                </small>
              </div>

              <div className="override-form-actions">
                <button
                  type="button"
                  onClick={() => setShowPreview(!showPreview)}
                  className="override-preview-btn"
                  disabled={submitting}
                >
                  {showPreview ? <EyeOff size={16} /> : <Eye size={16} />}
                  {showPreview ? t('admin_override_hide_preview', 'Hide Preview') : t('admin_override_show_preview', 'Show Preview')}
                </button>

                <button
                  type="submit"
                  className="override-submit-btn"
                  disabled={submitting || !form.entityId || !form.newValue}
                >
                  {submitting ? (
                    <>
                      <span className="override-spinner"></span>
                      {t('admin_override_saving', 'Saving...')}
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      {t('admin_override_save', 'Save Override')}
                    </>
                  )}
                </button>
              </div>
            </form>

            {showPreview && (
              <div className="override-preview">
                <h3>{t('admin_override_preview_title', 'Preview')}</h3>
                <div className="override-preview-grid">
                  <div className="override-preview-item">
                    <span className="override-preview-label">Entity:</span>
                    <span className="override-preview-value">{form.entityId || '-'}</span>
                  </div>
                  <div className="override-preview-item">
                    <span className="override-preview-label">Type:</span>
                    <span className="override-preview-value">{form.entityType}</span>
                  </div>
                  <div className="override-preview-item">
                    <span className="override-preview-label">Language:</span>
                    <span className="override-preview-value">{form.targetLang.toUpperCase()}</span>
                  </div>
                  <div className="override-preview-item">
                    <span className="override-preview-label">Reason:</span>
                    <span className="override-preview-value">{form.reason || '-'}</span>
                  </div>
                </div>
                <div className="override-preview-change">
                  <div className="override-preview-old">
                    <h4>{t('admin_override_old_value', 'Current Value')}</h4>
                    <pre>{form.oldValue || '(empty)'}</pre>
                  </div>
                  <div className="override-preview-arrow">→</div>
                  <div className="override-preview-new">
                    <h4>{t('admin_override_new_value', 'New Value')}</h4>
                    <pre>{form.newValue || '(empty)'}</pre>
                  </div>
                </div>
              </div>
            )}
          </div>

          {recentOverrides.length > 0 && (
            <div className="override-recent-section">
              <h2>{t('admin_override_recent_title', 'Recent Overrides')}</h2>
              <div className="override-recent-list">
                {recentOverrides.map((override, idx) => (
                  <div key={idx} className="override-recent-item">
                    <div className="override-recent-header">
                      <span className="override-recent-entity">{override.entityId}</span>
                      <span className="override-recent-lang">{override.targetLang.toUpperCase()}</span>
                      <span className="override-recent-type">{override.entityType}</span>
                    </div>
                    <div className="override-recent-preview">
                      <div className="override-recent-old">{override.oldValue?.substring(0, 50)}...</div>
                      <div className="override-recent-arrow">→</div>
                      <div className="override-recent-new">{override.newValue?.substring(0, 50)}...</div>
                    </div>
                    <button
                      onClick={() => handlePrefillFromRecent(override)}
                      className="override-recent-btn"
                      disabled={submitting}
                    >
                      {t('admin_override_use_this', 'Use This')}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .override-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
        }

        .override-header {
          margin-bottom: 24px;
        }

        .override-title {
          font-size: 28px;
          font-weight: 700;
          margin: 0 0 4px 0;
          color: #1a1a1a;
        }

        .override-subtitle {
          font-size: 14px;
          color: #666;
          margin: 0;
        }

        .override-message {
          padding: 12px 16px;
          border-radius: 6px;
          margin-bottom: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 14px;
        }

        .override-message-success {
          background-color: #d4edda;
          color: #155724;
          border: 1px solid #c3e6cb;
        }

        .override-message-error {
          background-color: #f8d7da;
          color: #721c24;
          border: 1px solid #f5c6cb;
        }

        .override-message-warning {
          background-color: #fff3cd;
          color: #856404;
          border: 1px solid #ffeaa7;
        }

        .override-message-info {
          background-color: #d1ecf1;
          color: #0c5460;
          border: 1px solid #bee5eb;
        }

        .override-message-content {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .override-message-close {
          background: none;
          border: none;
          color: inherit;
          cursor: pointer;
          padding: 0;
          line-height: 1;
        }

        .override-content {
          display: grid;
          grid-template-columns: 1fr 350px;
          gap: 20px;
        }

        .override-form-section {
          background-color: white;
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 24px;
        }

        .override-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .override-form-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .override-form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .override-label {
          font-size: 14px;
          font-weight: 600;
          color: #333;
        }

        .override-input,
        .override-select,
        .override-textarea {
          padding: 10px 12px;
          border: 1px solid #ccc;
          border-radius: 4px;
          font-size: 14px;
          font-family: inherit;
          background-color: white;
        }

        .override-input:focus,
        .override-select:focus,
        .override-textarea:focus {
          outline: none;
          border-color: #007bff;
          box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.1);
        }

        .override-input:disabled,
        .override-select:disabled,
        .override-textarea:disabled {
          background-color: #f5f5f5;
          color: #999;
        }

        .override-help-text {
          font-size: 12px;
          color: #666;
        }

        .override-form-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
          padding-top: 12px;
          border-top: 1px solid #eee;
        }

        .override-preview-btn,
        .override-submit-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          border-radius: 4px;
          border: 1px solid #ddd;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s ease;
        }

        .override-preview-btn {
          background-color: white;
          color: #333;
        }

        .override-preview-btn:hover:not(:disabled) {
          background-color: #f5f5f5;
        }

        .override-submit-btn {
          background-color: #007bff;
          color: white;
          border-color: #007bff;
        }

        .override-submit-btn:hover:not(:disabled) {
          background-color: #0056b3;
        }

        .override-submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .override-spinner {
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

        .override-preview {
          margin-top: 24px;
          padding: 16px;
          background-color: #f9f9f9;
          border: 1px solid #ddd;
          border-radius: 4px;
        }

        .override-preview h3 {
          margin: 0 0 16px 0;
          font-size: 16px;
          font-weight: 600;
        }

        .override-preview-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
          margin-bottom: 16px;
        }

        .override-preview-item {
          display: flex;
          justify-content: space-between;
          padding: 8px;
          background-color: white;
          border-radius: 4px;
        }

        .override-preview-label {
          font-weight: 600;
          font-size: 12px;
          color: #666;
        }

        .override-preview-value {
          font-size: 13px;
          color: #333;
          text-align: right;
        }

        .override-preview-change {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          gap: 12px;
          align-items: center;
        }

        .override-preview-old,
        .override-preview-new {
          background-color: white;
          border-radius: 4px;
          padding: 12px;
        }

        .override-preview-old h4 {
          margin: 0 0 8px 0;
          font-size: 12px;
          color: #d32f2f;
        }

        .override-preview-new h4 {
          margin: 0 0 8px 0;
          font-size: 12px;
          color: #388e3c;
        }

        .override-preview-old pre,
        .override-preview-new pre {
          margin: 0;
          font-size: 12px;
          white-space: pre-wrap;
          word-break: break-word;
          max-height: 100px;
          overflow-y: auto;
        }

        .override-preview-old pre {
          color: #d32f2f;
        }

        .override-preview-new pre {
          color: #388e3c;
        }

        .override-preview-arrow {
          text-align: center;
          color: #999;
          font-weight: 600;
        }

        .override-recent-section {
          background-color: white;
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 16px;
          max-height: 600px;
          overflow-y: auto;
        }

        .override-recent-section h2 {
          margin: 0 0 12px 0;
          font-size: 16px;
          font-weight: 600;
        }

        .override-recent-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .override-recent-item {
          padding: 10px;
          background-color: #f9f9f9;
          border: 1px solid #eee;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .override-recent-item:hover {
          background-color: #f0f0f0;
          border-color: #ddd;
        }

        .override-recent-header {
          display: flex;
          gap: 8px;
          margin-bottom: 6px;
          font-size: 11px;
        }

        .override-recent-entity {
          font-weight: 600;
          color: #333;
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .override-recent-lang {
          background-color: #e7f3ff;
          color: #0056b3;
          padding: 2px 6px;
          border-radius: 2px;
          font-weight: 500;
        }

        .override-recent-type {
          background-color: #f0f0f0;
          color: #666;
          padding: 2px 6px;
          border-radius: 2px;
          font-size: 10px;
        }

        .override-recent-preview {
          display: flex;
          gap: 4px;
          margin-bottom: 8px;
          font-size: 11px;
        }

        .override-recent-old,
        .override-recent-new {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          padding: 4px;
          background-color: white;
          border-radius: 2px;
        }

        .override-recent-old {
          color: #d32f2f;
        }

        .override-recent-new {
          color: #388e3c;
        }

        .override-recent-arrow {
          color: #999;
          font-size: 10px;
        }

        .override-recent-btn {
          width: 100%;
          padding: 6px 10px;
          background-color: #007bff;
          color: white;
          border: none;
          border-radius: 3px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .override-recent-btn:hover:not(:disabled) {
          background-color: #0056b3;
        }

        .override-recent-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        @media (max-width: 968px) {
          .override-content {
            grid-template-columns: 1fr;
          }

          .override-form-row {
            grid-template-columns: 1fr;
          }

          .override-recent-section {
            max-height: none;
          }
        }

        @media (max-width: 600px) {
          .override-preview-change {
            grid-template-columns: 1fr;
          }

          .override-preview-arrow {
            text-align: center;
            margin: 0;
          }
        }
      `}</style>
    </AdminLayout>
  );
};

export default TranslationManualOverride;
