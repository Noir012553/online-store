import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { Trash2, Plus, Edit2, Check, X, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, Locale } from '../../lib/i18n/types';
import { withAdminLayout } from '../../components/admin/withAdminLayout';
import { getAuthToken } from '../../lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { API_BASE_PATH } from '../../config';
import styles from './translationsStatic.module.css';

interface StaticTranslation {
  _id: string;
  code: string;
  namespace: string;
  translations: Record<string, string>;
  createdAt?: string;
  updatedAt?: string;
}

interface TranslationKey {
  key: string;
  value: string;
}

const messageTypeClasses = {
  success: styles.success,
  error: styles.error,
  info: styles.info,
};

const TranslationsAdminTier1Content = () => {
  const { t, loadNamespace, locale } = useTranslation();

  const [translations, setTranslations] = useState<StaticTranslation[]>([]);
  const [selectedLang, setSelectedLang] = useState<Locale>(DEFAULT_LOCALE);
  const [selectedNamespace, setSelectedNamespace] = useState('common');
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean; keyName: string }>({ isOpen: false, keyName: '' });

  const API_BASE = API_BASE_PATH;

  useEffect(() => {
    Promise.all([
      loadNamespace('admin-translation'),
    ]).then(() => {
      fetchNamespaces();
    });
  }, [loadNamespace, locale]);

  useEffect(() => {
    fetchTranslations();
  }, [selectedLang, selectedNamespace, locale]);

  const fetchNamespaces = async () => {
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE}/translations/namespaces?lang=${locale}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.success) {
        setNamespaces(Array.isArray(data.data) ? data.data : data.data.namespaces || []);
      }
    } catch (error) {
      setMessage({ type: 'error', text: t('error_load_namespaces', 'admin-translation') });
    }
  };

  const fetchTranslations = async () => {
    setLoading(true);
    try {
      const token = getAuthToken();
      const response = await fetch(
        `${API_BASE}/translations?lang=${selectedLang}&ns=${selectedNamespace}`,
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
      if (data.success) {
        setTranslations([data.data]);
      }
    } catch (error) {
      setMessage({ type: 'error', text: t('tier1_error_load_translations', 'admin-translation') });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateKey = async () => {
    if (!editingKey || !editingValue.trim()) {
      setMessage({ type: 'error', text: t('tier1_error_empty_value', 'admin-translation') });
      return;
    }

    try {
      const token = getAuthToken();
      const currentTranslation = translations[0];

      const updatedTranslations = {
        ...currentTranslation.translations,
        [editingKey]: editingValue,
      };

      const response = await fetch(`${API_BASE}/translations?lang=${selectedLang}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          code: selectedLang,
          namespace: selectedNamespace,
          translations: updatedTranslations,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setMessage({ type: 'success', text: t('tier1_success_update', 'admin-translation') });
        setEditingKey(null);
        setEditingValue('');
        fetchTranslations();
      }
    } catch (error) {
      setMessage({ type: 'error', text: t('tier1_error_update', 'admin-translation') });
    }
  };

  const handleAddNewKey = async () => {
    if (!newKeyName.trim() || !newKeyValue.trim()) {
      setMessage({ type: 'error', text: t('tier1_error_empty_key', 'admin-translation') });
      return;
    }

    try {
      const token = getAuthToken();
      const currentTranslation = translations[0];

      const updatedTranslations = {
        ...currentTranslation.translations,
        [newKeyName]: newKeyValue,
      };

      const response = await fetch(`${API_BASE}/translations?lang=${selectedLang}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          code: selectedLang,
          namespace: selectedNamespace,
          translations: updatedTranslations,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setMessage({ type: 'success', text: t('tier1_success_add', 'admin-translation') });
        setNewKeyName('');
        setNewKeyValue('');
        setIsAddingNew(false);
        fetchTranslations();
      }
    } catch (error) {
      setMessage({ type: 'error', text: t('tier1_error_add', 'admin-translation') });
    }
  };

  const handleDeleteKey = async (keyName: string) => {
    setConfirmDialog({ isOpen: true, keyName });
  };

  const confirmDeleteKey = async () => {
    const { keyName } = confirmDialog;
    setConfirmDialog({ isOpen: false, keyName: '' });

    try {
      const token = getAuthToken();
      const currentTranslation = translations[0];
      const { [keyName]: _, ...updatedTranslations } = currentTranslation.translations;

      const response = await fetch(`${API_BASE}/translations?lang=${selectedLang}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          code: selectedLang,
          namespace: selectedNamespace,
          translations: updatedTranslations,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setMessage({ type: 'success', text: t('tier1_success_delete', 'admin-translation') });
        fetchTranslations();
      }
    } catch (error) {
      setMessage({ type: 'error', text: t('tier1_error_delete', 'admin-translation') });
    }
  };

  const handleBulkTranslate = async () => {
    setIsTranslating(true);
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE}/translations/bulk-translate-static?lang=${locale}`, {
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

      const data = await response.json();
      if (data.success) {
        setMessage({
          type: 'success',
          text: t('tier1_success_translate', 'admin-translation')
            .replace('{translated}', data.data.translatedCount)
            .replace('{total}', data.data.translatedCount + data.data.failedCount),
        });
        fetchTranslations();
      } else {
        setMessage({ type: 'error', text: data.message });
      }
    } catch (error) {
      setMessage({ type: 'error', text: t('tier1_error_translate', 'admin-translation') });
    } finally {
      setIsTranslating(false);
    }
  };

  const currentTranslation = translations[0];
  let translationKeys: TranslationKey[] = currentTranslation
    ? Object.entries(currentTranslation.translations).map(([key, value]) => ({ key, value }))
    : [];

  // Filter by search text
  if (searchText.trim()) {
    const searchLower = searchText.toLowerCase();
    translationKeys = translationKeys.filter(
      (item) =>
        item.key.toLowerCase().includes(searchLower) ||
        item.value.toLowerCase().includes(searchLower)
    );
  }

  // Pagination
  const totalPages = Math.ceil(translationKeys.length / pageSize);
  const paginatedKeys = translationKeys.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);

  return (
    <>
    <div className={styles['tier1-translations-container']}>

        <div className={styles['tier1-header']}>
          <h1>{t('tier1_title', 'admin-translation')}</h1>
          <p>{t('tier1_description', 'admin-translation')}</p>
        </div>

        {message && (
          <div className={`${styles['tier1-message']} ${messageTypeClasses[message.type]}`}>
            {message.text}
          </div>
        )}

        <div className={styles['tier1-controls']}>
          <div className={styles['tier1-select-group']}>
            <label htmlFor="lang-select">{t('tier1_language_label', 'admin-translation')}</label>
            <select
              id="lang-select"
              value={selectedLang}
              onChange={(e) => setSelectedLang(e.target.value as Locale)}
            >
              {SUPPORTED_LOCALES.map((lang) => (
                <option key={lang} value={lang}>
                  {t(`admin_lang_${lang}`, 'admin-translation')}
                </option>
              ))}
            </select>
          </div>

          <div className={styles['tier1-select-group']}>
            <label htmlFor="namespace-select">{t('tier1_namespace_label', 'admin-translation')}</label>
            <select
              id="namespace-select"
              value={selectedNamespace}
              onChange={(e) => setSelectedNamespace(e.target.value)}
            >
              {namespaces.map((ns) => (
                <option key={ns} value={ns}>
                  {ns}
                </option>
              ))}
            </select>
          </div>

          <div className={styles['tier1-select-group'] + ' ' + styles['tier1-search-group']}>
            <label htmlFor="search-input">{t('search_label', 'admin-translation')}</label>
            <input
              id="search-input"
              type="text"
              placeholder={t('tier1_search_placeholder', 'admin-translation')}
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                setPageIndex(0);
              }}
              className={styles['tier1-add-input'] + ' ' + styles['tier1-search-input']}
            />
          </div>

          <div className={styles['tier1-actions']}>
            <button
              className={styles['tier1-btn'] + ' ' + styles['tier1-btn-success']}
              onClick={handleBulkTranslate}
              disabled={isTranslating}
            >
              <RefreshCw size={16} /> {t('tier1_bulk_translate_btn', 'admin-translation')}
            </button>
            <button
              className={styles['tier1-btn'] + ' ' + styles['tier1-btn-primary']}
              onClick={() => setIsAddingNew(!isAddingNew)}
            >
              <Plus size={16} /> {t('tier1_add_key_btn', 'admin-translation')}
            </button>
          </div>
        </div>

        {isAddingNew && (
          <div className={styles['tier1-add-section']}>
            <h3>{t('tier1_add_key_title', 'admin-translation')}</h3>
            <div className={styles['tier1-add-inputs']}>
              <input
                type="text"
                placeholder={t('tier1_key_placeholder', 'admin-translation')}
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                className={styles['tier1-add-input']}
              />
              <input
                type="text"
                placeholder={t('tier1_value_placeholder', 'admin-translation')}
                value={newKeyValue}
                onChange={(e) => setNewKeyValue(e.target.value)}
                className={styles['tier1-add-input']}
              />
              <div className={styles['tier1-add-actions']}>
                <button
                  className={styles['tier1-btn'] + ' ' + styles['tier1-btn-primary']}
                  onClick={handleAddNewKey}
                >
                  <Check size={16} /> {t('tier1_save_btn', 'admin-translation')}
                </button>
                <button
                  className={styles['tier1-btn'] + ' ' + styles['tier1-btn-secondary']}
                  onClick={() => {
                    setIsAddingNew(false);
                    setNewKeyName('');
                    setNewKeyValue('');
                  }}
                >
                  <X size={16} /> {t('tier1_cancel_btn', 'admin-translation')}
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className={styles['tier1-loading']}>{t('tier1_loading', 'admin-translation')}</div>
        ) : currentTranslation && translationKeys.length > 0 ? (
          <>
            <div className={styles['tier1-table-wrapper']}>
              <table className={styles['tier1-table']}>
                <thead>
                  <tr>
                    <th>{t('tier1_key_column', 'admin-translation')}</th>
                    <th>{t('tier1_value_column', 'admin-translation').replace('{lang}', selectedLang.toUpperCase())}</th>
                    <th>{t('tier1_action_column', 'admin-translation')}</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedKeys.map((item) => (
                  <tr key={item.key}>
                    <td className={styles['tier1-key-cell']}>{item.key}</td>
                    <td className={styles['tier1-value-cell']}>
                      {editingKey === item.key ? (
                        <input
                          type="text"
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          className={styles['tier1-value-input']}
                          autoFocus
                        />
                      ) : (
                        item.value
                      )}
                    </td>
                    <td>
                      <div className={styles['tier1-actions-cell']}>
                        {editingKey === item.key ? (
                          <>
                            <button
                              className={styles['tier1-icon-btn'] + ' ' + styles['tier1-icon-btn-check']}
                              onClick={handleUpdateKey}
                              title={t('admin_save', 'admin')}
                            >
                              <Check size={16} />
                            </button>
                            <button
                              className={styles['tier1-icon-btn'] + ' ' + styles['tier1-icon-btn-cancel']}
                              onClick={() => {
                                setEditingKey(null);
                                setEditingValue('');
                              }}
                              title={t('admin_cancel', 'admin')}
                            >
                              <X size={16} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className={styles['tier1-icon-btn'] + ' ' + styles['tier1-icon-btn-edit']}
                              onClick={() => {
                                setEditingKey(item.key);
                                setEditingValue(item.value);
                              }}
                              title={t('admin_edit', 'admin')}
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              className={styles['tier1-icon-btn'] + ' ' + styles['tier1-icon-btn-delete']}
                              onClick={() => handleDeleteKey(item.key)}
                              title={t('admin_delete', 'admin')}
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className={styles['tier1-pagination']}>
                <button
                  onClick={() => setPageIndex(Math.max(0, pageIndex - 1))}
                  disabled={pageIndex === 0}
                  className={styles['tier1-btn'] + ' ' + styles['tier1-pagination-btn']}
                >
                  <ChevronLeft size={16} aria-hidden="true" />
                  {t('tier1_prev_page', 'admin-translation')}
                </button>
                <span className={styles['tier1-pagination-status']}>{t('tier1_page_info', 'admin-translation').replace('{page}', `${pageIndex + 1}/${totalPages}`)}</span>
                <button
                  onClick={() => setPageIndex(pageIndex + 1)}
                  disabled={pageIndex === totalPages - 1}
                  className={styles['tier1-btn'] + ' ' + styles['tier1-pagination-btn']}
                >
                  {t('tier1_next_page', 'admin-translation')}
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </div>
            )}
          </>
        ) : (
          <div className={styles['tier1-empty']}>{t('tier1_no_translations', 'admin-translation')}</div>
        )}
      </div>

      <Dialog open={confirmDialog.isOpen} onOpenChange={(open: boolean) => !open && setConfirmDialog({ isOpen: false, keyName: '' })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('common_confirm', 'admin')}</DialogTitle>
          </DialogHeader>
          <p>{t('tier1_confirm_delete', 'admin-translation').replace('{key}', confirmDialog.keyName)}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog({ isOpen: false, keyName: '' })}>
              {t('common_cancel', 'admin')}
            </Button>
            <Button variant="destructive" onClick={confirmDeleteKey}>
              {t('common_delete', 'admin')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export async function getServerSideProps(context: any) {
  return {
    props: {},
  };
}

export default withAdminLayout(TranslationsAdminTier1Content, {
  permission: 'manage:translations',
  featureName: 'translations_static',
});
