import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Trash2, Plus, Edit2, Check, X, RefreshCw } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import AdminLayout from '../../components/admin/_AdminLayout';
import { getAuthToken } from '../../lib/api';

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

const SUPPORTED_LANGUAGES = [
  { code: 'vi', name: 'admin_lang_vi' },
  { code: 'en', name: 'admin_lang_en' },
];

const TranslationsAdminTier1 = () => {
  const { t, loadNamespace } = useTranslation();
  const router = useRouter();

  const [translations, setTranslations] = useState<StaticTranslation[]>([]);
  const [selectedLang, setSelectedLang] = useState('vi');
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

  const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '');

  useEffect(() => {
    Promise.all([
      loadNamespace('admin-translation'),
    ]).then(() => {
      fetchNamespaces();
    });
  }, [loadNamespace]);

  useEffect(() => {
    fetchTranslations();
  }, [selectedLang, selectedNamespace]);

  const fetchNamespaces = async () => {
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE}/api/translations/namespaces`, {
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
        `${API_BASE}/api/translations?lang=${selectedLang}&ns=${selectedNamespace}`,
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

      const response = await fetch(`${API_BASE}/api/translations`, {
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

      const response = await fetch(`${API_BASE}/api/translations`, {
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
    if (!confirm(t('tier1_confirm_delete', 'admin-translation').replace('{key}', keyName))) return;

    try {
      const token = getAuthToken();
      const currentTranslation = translations[0];
      const { [keyName]: _, ...updatedTranslations } = currentTranslation.translations;

      const response = await fetch(`${API_BASE}/api/translations`, {
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
    if (selectedLang === 'vi') {
      setMessage({ type: 'error', text: t('tier1_error_cannot_translate_vi', 'admin-translation') });
      return;
    }

    setIsTranslating(true);
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE}/api/translations/bulk-translate-static`, {
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
    <AdminLayout>
      <div className="tier1-translations-container">
        <style>{`
          .tier1-translations-container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
          }

          .tier1-header {
            margin-bottom: 30px;
          }

          .tier1-header h1 {
            margin: 0 0 10px 0;
            font-size: 28px;
            font-weight: 600;
            color: #1a1a1a;
          }

          .tier1-header p {
            margin: 0;
            color: #666;
            font-size: 14px;
          }

          .tier1-controls {
            display: flex;
            gap: 20px;
            margin-bottom: 30px;
            padding: 20px;
            background: #f5f5f5;
            border-radius: 8px;
            flex-wrap: wrap;
          }

          .tier1-select-group {
            display: flex;
            flex-direction: column;
            gap: 5px;
            min-width: 200px;
          }

          .tier1-select-group label {
            font-size: 12px;
            font-weight: 600;
            color: #555;
            text-transform: uppercase;
          }

          .tier1-select-group select {
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
            background: white;
            cursor: pointer;
          }

          .tier1-actions {
            display: flex;
            gap: 10px;
            align-items: flex-end;
          }

          .tier1-btn {
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

          .tier1-btn-primary {
            background: #007bff;
            color: white;
          }

          .tier1-btn-primary:hover:not(:disabled) {
            background: #0056b3;
          }

          .tier1-btn-success {
            background: #28a745;
            color: white;
          }

          .tier1-btn-success:hover:not(:disabled) {
            background: #218838;
          }

          .tier1-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          .tier1-message {
            padding: 12px 16px;
            border-radius: 4px;
            margin-bottom: 20px;
            font-size: 14px;
          }

          .tier1-message.success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
          }

          .tier1-message.error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
          }

          .tier1-message.info {
            background: #d1ecf1;
            color: #0c5460;
            border: 1px solid #bee5eb;
          }

          .tier1-table-wrapper {
            background: white;
            border-radius: 8px;
            border: 1px solid #ddd;
            overflow: hidden;
          }

          .tier1-table {
            width: 100%;
            border-collapse: collapse;
          }

          .tier1-table thead {
            background: #f5f5f5;
            border-bottom: 1px solid #ddd;
          }

          .tier1-table th {
            padding: 15px;
            text-align: left;
            font-size: 12px;
            font-weight: 600;
            color: #555;
            text-transform: uppercase;
          }

          .tier1-table td {
            padding: 15px;
            border-bottom: 1px solid #eee;
            font-size: 14px;
          }

          .tier1-table tr:hover {
            background: #f9f9f9;
          }

          .tier1-table tr:last-child td {
            border-bottom: none;
          }

          .tier1-key-cell {
            color: #0056b3;
            font-family: 'Courier New', monospace;
            font-weight: 500;
          }

          .tier1-value-cell {
            color: #333;
            word-break: break-word;
            max-width: 500px;
          }

          .tier1-value-input {
            width: 100%;
            padding: 8px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
            font-family: 'Courier New', monospace;
          }

          .tier1-actions-cell {
            display: flex;
            gap: 8px;
          }

          .tier1-icon-btn {
            width: 32px;
            height: 32px;
            border: none;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.2s ease;
            font-size: 14px;
          }

          .tier1-icon-btn-edit {
            background: #e7f3ff;
            color: #0056b3;
          }

          .tier1-icon-btn-edit:hover {
            background: #0056b3;
            color: white;
          }

          .tier1-icon-btn-delete {
            background: #ffe7e7;
            color: #dc3545;
          }

          .tier1-icon-btn-delete:hover {
            background: #dc3545;
            color: white;
          }

          .tier1-icon-btn-check {
            background: #d4edda;
            color: #28a745;
          }

          .tier1-icon-btn-check:hover {
            background: #28a745;
            color: white;
          }

          .tier1-icon-btn-cancel {
            background: #f5f5f5;
            color: #666;
          }

          .tier1-icon-btn-cancel:hover {
            background: #ddd;
          }

          .tier1-add-section {
            margin: 20px 0;
            padding: 20px;
            background: #f0f8ff;
            border: 1px solid #b3d9ff;
            border-radius: 4px;
          }

          .tier1-add-section h3 {
            margin: 0 0 15px 0;
            font-size: 16px;
            color: #0056b3;
          }

          .tier1-add-inputs {
            display: grid;
            grid-template-columns: 1fr 1fr auto;
            gap: 10px;
            margin-bottom: 10px;
          }

          .tier1-add-input {
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
          }

          .tier1-loading {
            text-align: center;
            padding: 40px;
            color: #666;
          }

          .tier1-empty {
            text-align: center;
            padding: 40px;
            color: #999;
            font-size: 14px;
          }

          @media (max-width: 768px) {
            .tier1-add-inputs {
              grid-template-columns: 1fr;
            }

            .tier1-controls {
              flex-direction: column;
            }

            .tier1-actions {
              flex-direction: column;
              width: 100%;
            }

            .tier1-btn {
              width: 100%;
            }
          }
        `}</style>

        <div className="tier1-header">
          <h1>{t('tier1_title', 'admin-translation')}</h1>
          <p>{t('tier1_description', 'admin-translation')}</p>
        </div>

        {message && (
          <div className={`tier1-message ${message.type}`}>
            {message.text}
          </div>
        )}

        <div className="tier1-controls">
          <div className="tier1-select-group">
            <label htmlFor="lang-select">{t('tier1_language_label', 'admin-translation')}</label>
            <select
              id="lang-select"
              value={selectedLang}
              onChange={(e) => setSelectedLang(e.target.value)}
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {t(lang.name, 'admin-translation')}
                </option>
              ))}
            </select>
          </div>

          <div className="tier1-select-group">
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

          <div className="tier1-select-group" style={{ flex: 1, minWidth: 200 }}>
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
              className="tier1-add-input"
              style={{ margin: 0 }}
            />
          </div>

          <div className="tier1-actions">
            <button
              className="tier1-btn tier1-btn-success"
              onClick={handleBulkTranslate}
              disabled={isTranslating || selectedLang === 'vi'}
            >
              <RefreshCw size={16} /> {t('tier1_bulk_translate_btn', 'admin-translation')}
            </button>
            <button
              className="tier1-btn tier1-btn-primary"
              onClick={() => setIsAddingNew(!isAddingNew)}
            >
              <Plus size={16} /> {t('tier1_add_key_btn', 'admin-translation')}
            </button>
          </div>
        </div>

        {isAddingNew && (
          <div className="tier1-add-section">
            <h3>{t('tier1_add_key_title', 'admin-translation')}</h3>
            <div className="tier1-add-inputs">
              <input
                type="text"
                placeholder={t('tier1_key_placeholder', 'admin-translation')}
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                className="tier1-add-input"
              />
              <input
                type="text"
                placeholder={t('tier1_value_placeholder', 'admin-translation')}
                value={newKeyValue}
                onChange={(e) => setNewKeyValue(e.target.value)}
                className="tier1-add-input"
              />
              <div style={{ display: 'flex', gap: '5px' }}>
                <button
                  className="tier1-btn tier1-btn-primary"
                  onClick={handleAddNewKey}
                >
                  <Check size={16} /> {t('tier1_save_btn', 'admin-translation')}
                </button>
                <button
                  className="tier1-btn"
                  style={{ background: '#ddd', color: '#333' }}
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
          <div className="tier1-loading">{t('tier1_loading', 'admin-translation')}</div>
        ) : currentTranslation && translationKeys.length > 0 ? (
          <>
            <div className="tier1-table-wrapper">
              <table className="tier1-table">
                <thead>
                  <tr>
                    <th style={{ width: '25%' }}>{t('tier1_key_column', 'admin-translation')}</th>
                    <th style={{ width: '60%' }}>{t('tier1_value_column', 'admin-translation').replace('{lang}', selectedLang.toUpperCase())}</th>
                    <th style={{ width: '15%' }}>{t('tier1_action_column', 'admin-translation')}</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedKeys.map((item) => (
                  <tr key={item.key}>
                    <td className="tier1-key-cell">{item.key}</td>
                    <td className="tier1-value-cell">
                      {editingKey === item.key ? (
                        <input
                          type="text"
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          className="tier1-value-input"
                          autoFocus
                        />
                      ) : (
                        item.value
                      )}
                    </td>
                    <td>
                      <div className="tier1-actions-cell">
                        {editingKey === item.key ? (
                          <>
                            <button
                              className="tier1-icon-btn tier1-icon-btn-check"
                              onClick={handleUpdateKey}
                              title={t('admin_save', 'admin-translation')}
                            >
                              <Check size={16} />
                            </button>
                            <button
                              className="tier1-icon-btn tier1-icon-btn-cancel"
                              onClick={() => {
                                setEditingKey(null);
                                setEditingValue('');
                              }}
                              title={t('admin_cancel', 'admin-translation')}
                            >
                              <X size={16} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="tier1-icon-btn tier1-icon-btn-edit"
                              onClick={() => {
                                setEditingKey(item.key);
                                setEditingValue(item.value);
                              }}
                              title={t('admin_edit', 'admin-translation')}
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              className="tier1-icon-btn tier1-icon-btn-delete"
                              onClick={() => handleDeleteKey(item.key)}
                              title={t('admin_delete', 'admin-translation')}
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
              <div className="tier1-pagination" style={{ marginTop: 20, textAlign: 'center' }}>
                <button
                  onClick={() => setPageIndex(Math.max(0, pageIndex - 1))}
                  disabled={pageIndex === 0}
                  className="tier1-btn"
                  style={{ background: pageIndex === 0 ? '#ddd' : '#007bff', color: 'white' }}
                >
                  ← {t('tier1_prev_page', 'admin-translation')}
                </button>
                <span style={{ margin: '0 15px' }}>{t('tier1_page_info', 'admin-translation').replace('{page}', `${pageIndex + 1}/${totalPages}`)}</span>
                <button
                  onClick={() => setPageIndex(pageIndex + 1)}
                  disabled={pageIndex === totalPages - 1}
                  className="tier1-btn"
                  style={{ background: pageIndex === totalPages - 1 ? '#ddd' : '#007bff', color: 'white' }}
                >
                  {t('tier1_next_page', 'admin-translation')} →
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="tier1-empty">{t('tier1_no_translations', 'admin-translation')}</div>
        )}
      </div>
    </AdminLayout>
  );
};

export async function getServerSideProps(context: any) {
  return {
    props: {},
  };
}

export default TranslationsAdminTier1;
