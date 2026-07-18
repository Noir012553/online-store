import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { Save, X, Check, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { withAdminLayout } from '../../components/admin/withAdminLayout';
import { getAuthToken } from '../../lib/api';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, AVAILABLE_LOCALES, Locale } from '../../lib/i18n/types';

interface OverrideForm {
  entityId: string;
  entityType: string;
  targetLang: string;
  oldValue: string;
  newValue: string;
  reason: string;
}

const getEntityTypes = (t: any) => [
  { value: 'product', label: t('admin_entity_type_product', 'admin-translation-override') },
  { value: 'review', label: t('admin_entity_type_review', 'admin-translation-override') },
  { value: 'category', label: t('admin_entity_type_category', 'admin-translation-override') },
  { value: 'feature', label: t('admin_entity_type_feature', 'admin-translation-override') },
  { value: 'spec', label: t('admin_entity_type_spec', 'admin-translation-override') },
  { value: 'description', label: t('admin_entity_type_description', 'admin-translation-override') },
  { value: 'ad_hoc', label: t('admin_entity_type_ad_hoc', 'admin-translation-override') },
];

const TranslationManualOverride = () => {
  const { t, loadNamespace, locale } = useTranslation();
  const [form, setForm] = useState<OverrideForm>({
    entityId: '',
    entityType: 'product',
    targetLang: DEFAULT_LOCALE,
    oldValue: '',
    newValue: '',
    reason: '',
  });

  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning' | 'info'; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [recentOverrides, setRecentOverrides] = useState<OverrideForm[]>([]);

  useEffect(() => {
    loadNamespace('admin-translation-override');
  }, [loadNamespace]);

  useEffect(() => {
    const stored = localStorage.getItem('recentTranslationOverrides');
    if (stored) {
      try {
        setRecentOverrides(JSON.parse(stored).slice(0, 5));
      } catch (e) {
        // Ignore parse errors
      }
    }
  }, []);

  const handleFormChange = (field: keyof OverrideForm, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const getLanguageName = (code: Locale): string => {
    const names: Record<Locale, string> = {
      'en': 'English',
      'vi': 'Tiếng Việt',
      'pt': 'Português',
      'fr': 'Français',
      'de': 'Deutsch',
      'it': 'Italiano',
      'es': 'Español',
      'nl': 'Nederlands',
      'sv': 'Svenska',
    };
    return names[code] || code;
  };

  const handlePrefillFromRecent = (override: OverrideForm) => {
    setForm(override);
    setShowPreview(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.entityId.trim() || !form.newValue.trim() || !form.reason.trim()) {
      setMessage({
        type: 'error',
        text: t('admin_override_validation_error', 'admin-translation-override'),
      });
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/admin/translations/manual-override', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`,
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
        const error = await response.json();
        throw new Error(error.message || 'Failed to save override');
      }

      setMessage({
        type: 'success',
        text: t('admin_override_success', 'admin-translation-override'),
      });

      // Save to recent overrides
      const newRecent = [form, ...recentOverrides].slice(0, 5);
      setRecentOverrides(newRecent);
      localStorage.setItem('recentTranslationOverrides', JSON.stringify(newRecent));

      // Reset form
      setForm({
        entityId: '',
        entityType: 'product',
        targetLang: DEFAULT_LOCALE,
        oldValue: '',
        newValue: '',
        reason: '',
      });
      setShowPreview(false);
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.message || t('admin_override_error', 'admin-translation-override'),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="override-container">
      <div className="override-header">
        <div>
          <h1 className="override-title">
            {t('admin_override_title', 'admin-translation-override')}
          </h1>
          <p className="override-subtitle">
            {t('admin_override_subtitle', 'admin-translation-override')}
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
            aria-label={t('close_button', 'admin')}
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
                {t('admin_override_entity_id', 'admin-translation-override')} *
              </label>
              <input
                id="entityId"
                type="text"
                placeholder={t('admin_override_entity_id_placeholder', 'admin-translation-override')}
                value={form.entityId}
                onChange={e => handleFormChange('entityId', e.target.value)}
                className="override-input"
                disabled={submitting}
              />
              <small className="override-help-text">
                {t('admin_override_entity_id_help', 'admin-translation-override')}
              </small>
            </div>

            <div className="override-form-row">
              <div className="override-form-group">
                <label htmlFor="entityType" className="override-label">
                  {t('admin_override_entity_type', 'admin-translation-override')} *
                </label>
                <select
                  id="entityType"
                  value={form.entityType}
                  onChange={e => handleFormChange('entityType', e.target.value)}
                  className="override-select"
                  disabled={submitting}
                >
                  {getEntityTypes(t).map(type => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="override-form-group">
                <label htmlFor="targetLang" className="override-label">
                  {t('admin_override_language', 'admin-translation-override')}
                </label>
                <select
                  id="targetLang"
                  value={form.targetLang}
                  onChange={e => handleFormChange('targetLang', e.target.value)}
                  className="override-select"
                  disabled={submitting}
                >
                  {SUPPORTED_LOCALES.map((code: Locale) => (
                    <option key={code} value={code}>
                      {getLanguageName(code)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="override-form-group">
              <label htmlFor="oldValue" className="override-label">
                {t('admin_override_old_value', 'admin-translation-override')}
              </label>
              <textarea
                id="oldValue"
                placeholder={t('admin_override_old_value_placeholder', 'admin-translation-override')}
                value={form.oldValue}
                onChange={e => handleFormChange('oldValue', e.target.value)}
                className="override-textarea"
                disabled={submitting}
                rows={3}
              />
              <small className="override-help-text">
                {t('admin_override_old_value_help', 'admin-translation-override')}
              </small>
            </div>

            <div className="override-form-group">
              <label htmlFor="newValue" className="override-label">
                {t('admin_override_new_value', 'admin-translation-override')} *
              </label>
              <textarea
                id="newValue"
                placeholder={t('admin_override_new_value_placeholder', 'admin-translation-override')}
                value={form.newValue}
                onChange={e => handleFormChange('newValue', e.target.value)}
                className="override-textarea"
                disabled={submitting}
                rows={4}
              />
              <small className="override-help-text">
                {t('admin_override_new_value_help', 'admin-translation-override')}
              </small>
            </div>

            <div className="override-form-group">
              <label htmlFor="reason" className="override-label">
                {t('admin_override_reason', 'admin-translation-override')} *
              </label>
              <textarea
                id="reason"
                placeholder={t('admin_override_reason_placeholder', 'admin-translation-override')}
                value={form.reason}
                onChange={e => handleFormChange('reason', e.target.value)}
                className="override-textarea"
                disabled={submitting}
                rows={3}
              />
              <small className="override-help-text">
                {t('admin_override_reason_help', 'admin-translation-override')}
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
                {showPreview ? t('admin_override_hide_preview', 'admin-translation-override') : t('admin_override_show_preview', 'admin-translation-override')}
              </button>

              <button
                type="submit"
                className="override-submit-btn"
                disabled={submitting || !form.entityId || !form.newValue}
              >
                {submitting ? (
                  <>
                    <span className="override-spinner"></span>
                    {t('admin_override_saving', 'admin-translation-override')}
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    {t('admin_override_save', 'admin-translation-override')}
                  </>
                )}
              </button>
            </div>
          </form>

          {showPreview && (
            <div className="override-preview">
              <h3>{t('admin_override_preview_title', 'admin-translation-override')}</h3>
              <div className="override-preview-grid">
                <div className="override-preview-item">
                  <span className="override-preview-label">{t('admin_override_preview_entity', 'admin-translation-override')}:</span>
                  <span className="override-preview-value">{form.entityId || '-'}</span>
                </div>
                <div className="override-preview-item">
                  <span className="override-preview-label">{t('admin_override_preview_type', 'admin-translation-override')}:</span>
                  <span className="override-preview-value">{form.entityType}</span>
                </div>
                <div className="override-preview-item">
                  <span className="override-preview-label">{t('admin_override_preview_language', 'admin-translation-override')}:</span>
                  <span className="override-preview-value">{getLanguageName(form.targetLang as Locale)}</span>
                </div>
                <div className="override-preview-item">
                  <span className="override-preview-label">{t('admin_override_preview_reason', 'admin-translation-override')}:</span>
                  <span className="override-preview-value">{form.reason || '-'}</span>
                </div>
              </div>
              <div className="override-preview-change">
                <div className="override-preview-old">
                  <h4>{t('admin_override_old_value', 'admin-translation-override')}</h4>
                  <pre>{form.oldValue || t('admin_override_empty', 'admin-translation-override')}</pre>
                </div>
                <div className="override-preview-arrow">→</div>
                <div className="override-preview-new">
                  <h4>{t('admin_override_new_value', 'admin-translation-override')}</h4>
                  <pre>{form.newValue || t('admin_override_empty', 'admin-translation-override')}</pre>
                </div>
              </div>
            </div>
          )}
        </div>

        {recentOverrides.length > 0 && (
          <div className="override-recent-section">
            <h2>{t('admin_override_recent_title', 'admin-translation-override')}</h2>
            <div className="override-recent-list">
              {recentOverrides.map((override, idx) => (
                <div key={idx} className="override-recent-item">
                  <div className="override-recent-header">
                    <span className="override-recent-entity">{override.entityId}</span>
                    <span className="override-recent-lang">{getLanguageName(override.targetLang as Locale)}</span>
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
                    {t('admin_override_use_this', 'admin-translation-override')}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
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
    </div>
  );
};

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

export default withAdminLayout(TranslationManualOverride, {
  permission: 'manage:translations',
  featureName: 'Translation Manual Override'
});
