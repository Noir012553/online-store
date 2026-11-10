import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { Save, X, Check, AlertCircle, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { withAdminLayout } from '../../components/admin/withAdminLayout';
import { getAuthToken } from '../../lib/api';
import { getUserFriendlyErrorMessage } from '../../lib/errorHandler';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, AVAILABLE_LOCALES, Locale } from '../../lib/i18n/types';
import styles from './translationManualOverride.module.css';

const messageTypeClasses = {
  success: styles.overrideMessageSuccess,
  error: styles.overrideMessageError,
  warning: styles.overrideMessageWarning,
  info: styles.overrideMessageInfo,
};

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
    try {
      const stored = localStorage.getItem('recentTranslationOverrides');
      if (stored) setRecentOverrides(JSON.parse(stored).slice(0, 5));
    } catch {}
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
      const response = await fetch('/api/translations/admin/manual-override', {
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
      try {
        localStorage.setItem('recentTranslationOverrides', JSON.stringify(newRecent));
      } catch {}

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
    } catch (error) {
      setMessage({
        type: 'error',
        text: getUserFriendlyErrorMessage(error, t),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.overrideContainer}>
      <div className={styles.overrideHeader}>
        <div>
          <h1 className={styles.overrideTitle}>
            {t('admin_override_title', 'admin-translation-override')}
          </h1>
          <p className={styles.overrideSubtitle}>
            {t('admin_override_subtitle', 'admin-translation-override')}
          </p>
        </div>
      </div>

      {message && (
        <div className={`${styles.overrideMessage} ${messageTypeClasses[message.type]}`}>
          <div className={styles.overrideMessageContent}>
            {message.type === 'success' && <Check size={18} />}
            {message.type === 'error' && <AlertCircle size={18} />}
            {message.type === 'warning' && <AlertCircle size={18} />}
            {message.type === 'info' && <AlertCircle size={18} />}
            <span>{message.text}</span>
          </div>
          <button
            onClick={() => setMessage(null)}
            className={styles.overrideMessageClose}
            aria-label={t('close_button', 'admin')}
          >
            <X size={18} />
          </button>
        </div>
      )}

      <div className={styles.overrideContent}>
        <div className={styles.overrideFormSection}>
          <form onSubmit={handleSubmit} className={styles.overrideForm}>
            <div className={styles.overrideFormGroup}>
              <label htmlFor="entityId" className={styles.overrideLabel}>
                {t('admin_override_entity_id', 'admin-translation-override')} *
              </label>
              <input
                id="entityId"
                type="text"
                placeholder={t('admin_override_entity_id_placeholder', 'admin-translation-override')}
                value={form.entityId}
                onChange={e => handleFormChange('entityId', e.target.value)}
                className={styles.overrideInput}
                disabled={submitting}
              />
              <small className={styles.overrideHelpText}>
                {t('admin_override_entity_id_help', 'admin-translation-override')}
              </small>
            </div>

            <div className={styles.overrideFormRow}>
              <div className={styles.overrideFormGroup}>
                <label htmlFor="entityType" className={styles.overrideLabel}>
                  {t('admin_override_entity_type', 'admin-translation-override')} *
                </label>
                <select
                  id="entityType"
                  value={form.entityType}
                  onChange={e => handleFormChange('entityType', e.target.value)}
                  className={styles.overrideSelect}
                  disabled={submitting}
                >
                  {getEntityTypes(t).map(type => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.overrideFormGroup}>
                <label htmlFor="targetLang" className={styles.overrideLabel}>
                  {t('admin_override_language', 'admin-translation-override')}
                </label>
                <select
                  id="targetLang"
                  value={form.targetLang}
                  onChange={e => handleFormChange('targetLang', e.target.value)}
                  className={styles.overrideSelect}
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

            <div className={styles.overrideFormGroup}>
              <label htmlFor="oldValue" className={styles.overrideLabel}>
                {t('admin_override_old_value', 'admin-translation-override')}
              </label>
              <textarea
                id="oldValue"
                placeholder={t('admin_override_old_value_placeholder', 'admin-translation-override')}
                value={form.oldValue}
                onChange={e => handleFormChange('oldValue', e.target.value)}
                className={styles.overrideTextarea}
                disabled={submitting}
                rows={3}
              />
              <small className={styles.overrideHelpText}>
                {t('admin_override_old_value_help', 'admin-translation-override')}
              </small>
            </div>

            <div className={styles.overrideFormGroup}>
              <label htmlFor="newValue" className={styles.overrideLabel}>
                {t('admin_override_new_value', 'admin-translation-override')} *
              </label>
              <textarea
                id="newValue"
                placeholder={t('admin_override_new_value_placeholder', 'admin-translation-override')}
                value={form.newValue}
                onChange={e => handleFormChange('newValue', e.target.value)}
                className={styles.overrideTextarea}
                disabled={submitting}
                rows={4}
              />
              <small className={styles.overrideHelpText}>
                {t('admin_override_new_value_help', 'admin-translation-override')}
              </small>
            </div>

            <div className={styles.overrideFormGroup}>
              <label htmlFor="reason" className={styles.overrideLabel}>
                {t('admin_override_reason', 'admin-translation-override')} *
              </label>
              <textarea
                id="reason"
                placeholder={t('admin_override_reason_placeholder', 'admin-translation-override')}
                value={form.reason}
                onChange={e => handleFormChange('reason', e.target.value)}
                className={styles.overrideTextarea}
                disabled={submitting}
                rows={3}
              />
              <small className={styles.overrideHelpText}>
                {t('admin_override_reason_help', 'admin-translation-override')}
              </small>
            </div>

            <div className={styles.overrideFormActions}>
              <button
                type="button"
                onClick={() => setShowPreview(!showPreview)}
                className={styles.overridePreviewBtn}
                disabled={submitting}
              >
                {showPreview ? <EyeOff size={16} /> : <Eye size={16} />}
                {showPreview ? t('admin_override_hide_preview', 'admin-translation-override') : t('admin_override_show_preview', 'admin-translation-override')}
              </button>

              <button
                type="submit"
                className={styles.overrideSubmitBtn}
                disabled={submitting || !form.entityId || !form.newValue}
              >
                {submitting ? (
                  <>
                    <span className={styles.overrideSpinner}></span>
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
            <div className={styles.overridePreview}>
              <h3>{t('admin_override_preview_title', 'admin-translation-override')}</h3>
              <div className={styles.overridePreviewGrid}>
                <div className={styles.overridePreviewItem}>
                  <span className={styles.overridePreviewLabel}>{t('admin_override_preview_entity', 'admin-translation-override')}:</span>
                  <span className={styles.overridePreviewValue}>{form.entityId || '-'}</span>
                </div>
                <div className={styles.overridePreviewItem}>
                  <span className={styles.overridePreviewLabel}>{t('admin_override_preview_type', 'admin-translation-override')}:</span>
                  <span className={styles.overridePreviewValue}>{form.entityType}</span>
                </div>
                <div className={styles.overridePreviewItem}>
                  <span className={styles.overridePreviewLabel}>{t('admin_override_preview_language', 'admin-translation-override')}:</span>
                  <span className={styles.overridePreviewValue}>{getLanguageName(form.targetLang as Locale)}</span>
                </div>
                <div className={styles.overridePreviewItem}>
                  <span className={styles.overridePreviewLabel}>{t('admin_override_preview_reason', 'admin-translation-override')}:</span>
                  <span className={styles.overridePreviewValue}>{form.reason || '-'}</span>
                </div>
              </div>
              <div className={styles.overridePreviewChange}>
                <div className={styles.overridePreviewOld}>
                  <h4>{t('admin_override_old_value', 'admin-translation-override')}</h4>
                  <pre>{form.oldValue || t('admin_override_empty', 'admin-translation-override')}</pre>
                </div>
                <div className={styles.overridePreviewArrow}><ArrowRight className="h-5 w-5" aria-hidden="true" /></div>
                <div className={styles.overridePreviewNew}>
                  <h4>{t('admin_override_new_value', 'admin-translation-override')}</h4>
                  <pre>{form.newValue || t('admin_override_empty', 'admin-translation-override')}</pre>
                </div>
              </div>
            </div>
          )}
        </div>

        {recentOverrides.length > 0 && (
          <div className={styles.overrideRecentSection}>
            <h2>{t('admin_override_recent_title', 'admin-translation-override')}</h2>
            <div className={styles.overrideRecentList}>
              {recentOverrides.map((override, idx) => (
                <div key={idx} className={styles.overrideRecentItem}>
                  <div className={styles.overrideRecentHeader}>
                    <span className={styles.overrideRecentEntity}>{override.entityId}</span>
                    <span className={styles.overrideRecentLang}>{getLanguageName(override.targetLang as Locale)}</span>
                    <span className={styles.overrideRecentType}>{override.entityType}</span>
                  </div>
                  <div className={styles.overrideRecentPreview}>
                    <div className={styles.overrideRecentOld}>{override.oldValue?.substring(0, 50)}...</div>
                    <div className={styles.overrideRecentArrow}>→</div>
                    <div className={styles.overrideRecentNew}>{override.newValue?.substring(0, 50)}...</div>
                  </div>
                  <button
                    onClick={() => handlePrefillFromRecent(override)}
                    className={styles.overrideRecentBtn}
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
