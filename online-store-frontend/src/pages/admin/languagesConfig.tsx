import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Plus, AlertCircle, Loader2, Edit2, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation as useLanguageTranslation } from '../../lib/i18n';
import { AddLanguageModal } from '../../components/admin/AddLanguageModal';
import { withAdminLayout } from '../../components/admin/withAdminLayout';
import { useAuth } from '../../lib/context/AuthContext';
import { getAuthToken } from '../../lib/api';

interface Language {
  _id: string;
  code: string;
  name: string;
  nativeName?: string;
  isActive: boolean;
  isSystemDefault: boolean;
  createdAt?: string;
}

interface SupportedLanguage {
  code: string;
  name: string;
  nativeName: string;
}

const LanguagesConfigContent = () => {
  const { t, loadNamespace, locale } = useLanguageTranslation();
  const router = useRouter();

  const [languages, setLanguages] = useState<Language[]>([]);
  const [supportedLanguages, setSupportedLanguages] = useState<SupportedLanguage[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedLangCode, setSelectedLangCode] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const [message, setMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '');

  useEffect(() => {
    Promise.all([
      loadNamespace('admin-translation'),
    ]).then(() => {
      fetchLanguages();
      fetchSupportedLanguages();
    });
  }, [loadNamespace, locale]);

  const fetchLanguages = async () => {
    try {
      setLoading(true);
      const token = getAuthToken();

      if (!token) {
        showMessage('error', t('admin_not_logged_in', 'admin-translation'));
        return;
      }

      const response = await fetch(`${API_BASE}/api/languages?lang=${locale}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.status === 401) {
        showMessage('error', t('admin_session_expired', 'admin-translation'));
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.success) {
        setLanguages(data.data);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error(t('error_fetching_languages', 'admin-errors'), error);
      }
      showMessage('error', t('admin_error_load_languages', 'admin-translation'));
    } finally {
      setLoading(false);
    }
  };

  const fetchSupportedLanguages = async () => {
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE}/api/languages/supported?lang=${locale}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.success) {
        setSupportedLanguages(data.data);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error(t('error_fetching_supported_languages', 'admin-errors'), error);
      }
    }
  };

  const showMessage = (type: 'success' | 'error' | 'info', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleAddLanguage = async () => {
    if (!selectedLangCode) {
      showMessage('error', t('admin_select_language', 'admin-translation'));
      return;
    }

    const selectedLang = supportedLanguages.find((l) => l.code === selectedLangCode);
    if (!selectedLang) {
      showMessage('error', t('admin_invalid_language', 'admin-translation'));
      return;
    }

    setIsProcessing(true);
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE}/api/languages?lang=${locale}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          code: selectedLangCode,
          name: selectedLang.name,
          nativeName: selectedLang.nativeName,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || t('admin_error_add_language', 'admin-translation'));
      }

      showMessage('success', data.message || t('admin_language_added', 'admin-translation'));
      setIsModalOpen(false);
      setSelectedLangCode('');
      fetchLanguages();
    } catch (error: any) {
      showMessage('error', error.message || t('admin_error_add_language', 'admin-translation'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEditLanguage = async (language: Language) => {
    const name = window.prompt(t('admin_language_display_name', 'admin-translation'), language.name);
    if (!name || name === language.name) return;

    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE}/api/languages/${language._id}?lang=${locale}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, isActive: language.isActive }),
      });
      if (!response.ok) throw new Error(t('admin_error_update_status', 'admin-translation'));
      await fetchLanguages();
      showMessage('success', t('admin_language_status_updated', 'admin-translation'));
    } catch (error: any) {
      showMessage('error', error.message);
    }
  };

  const handleDeleteLanguage = async (language: Language) => {
    if (language.isSystemDefault || !window.confirm(`${t('admin_delete_language', 'admin-translation')} ${language.name}?`)) return;

    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE}/api/languages/${language._id}?lang=${locale}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || t('admin_error_delete_language', 'admin-translation'));
      await fetchLanguages();
      showMessage('success', data.message || t('admin_language_deleted', 'admin-translation'));
    } catch (error: any) {
      showMessage('error', error.message);
    }
  };

  const handleToggleLanguage = async (langId: string, currentStatus: boolean) => {
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE}/api/languages/${langId}?lang=${locale}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          isActive: !currentStatus,
        }),
      });

      if (!response.ok) {
        throw new Error(t('admin_error_update_status', 'admin-translation'));
      }

      fetchLanguages();
      showMessage('success', t('admin_language_status_updated', 'admin-translation'));
    } catch (error: any) {
      showMessage('error', error.message);
    }
  };

  const totalPages = Math.max(1, Math.ceil(languages.length / pageSize));
  const paginatedLanguages = languages.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const existingLangCodes = languages.map((l) => l.code);
  const availableLanguages = supportedLanguages.filter((l) => !existingLangCodes.includes(l.code));

  const getLanguageNameByCode = (code: string): string => {
    return t(`language_${code}`, 'admin');
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
          <p>{t('admin_loading_data', 'admin-translation')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-globe">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M12 2a14.5 14.5 0 0 1 0 20 14.5 14.5 0 0 1 0-20"></path>
              <path d="M2 12h20"></path>
            </svg>
            {t('admin_languages_config_title', 'admin-translation')}
          </h1>
          <p className="text-gray-600">{t('admin_languages_config_desc', 'admin-translation')}</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          disabled={availableLanguages.length === 0}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            availableLanguages.length === 0
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-red-600 text-white hover:bg-red-700'
          }`}
        >
          <Plus className="w-5 h-5" />
          {t('admin_add_language', 'admin-translation')}
        </button>
      </div>

      {message && (
        <div
          className={`mb-4 p-4 rounded-lg flex items-gap-2 ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : message.type === 'error'
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-blue-50 text-blue-700 border border-blue-200'
          }`}
        >
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p>{message.text}</p>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">{t('admin_language_code', 'admin-translation')}</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">{t('admin_language_display_name', 'admin-translation')}</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">{t('admin_language_native_name', 'admin-translation')}</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">{t('admin_language_status', 'admin-translation')}</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">{t('admin_language_default', 'admin-translation')}</th>
                <th className="px-6 py-4 text-right text-sm font-semibold text-gray-900">{t('admin_actions', 'admin')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {languages.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    {t('admin_no_languages', 'admin-translation')}
                  </td>
                </tr>
              ) : (
                paginatedLanguages.map((lang) => (
                  <tr key={lang._id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-gray-900">{lang.code}</span>
                    </td>
                    <td className="px-6 py-4 font-medium">{lang.nativeName || lang.name}</td>
                    <td className="px-6 py-4">{lang.nativeName || lang.name}</td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleToggleLanguage(lang._id, lang.isActive)}
                        disabled={lang.isSystemDefault}
                        className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                          lang.isActive
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        } ${lang.isSystemDefault ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                      >
                        {lang.isActive ? t('admin_language_active', 'admin-translation') : t('admin_language_inactive', 'admin-translation')}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      {lang.isSystemDefault ? (
                        <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                          {t('admin_language_default_vi', 'admin-translation')}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => handleEditLanguage(lang)} className="p-2 text-blue-600 hover:bg-blue-50 rounded" aria-label={t('edit', 'admin')}>
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDeleteLanguage(lang)} disabled={lang.isSystemDefault} className="p-2 text-red-600 hover:bg-red-50 rounded disabled:opacity-40 disabled:cursor-not-allowed" aria-label={t('delete', 'admin')}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {languages.length > 0 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-gray-500">{currentPage} / {totalPages}</span>
          <div className="flex gap-2">
            <button onClick={() => setCurrentPage(page => Math.max(1, page - 1))} disabled={currentPage === 1} className="p-2 border rounded disabled:opacity-40">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages} className="p-2 border rounded disabled:opacity-40">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <AddLanguageModal
        open={isModalOpen}
        onOpenChange={(open: boolean) => {
          setIsModalOpen(open);
          if (!open) {
            setSelectedLangCode('');
          }
        }}
        selectedLangCode={selectedLangCode}
        onSelectedLangCodeChange={setSelectedLangCode}
        availableLanguages={availableLanguages}
        isProcessing={isProcessing}
        onConfirm={handleAddLanguage}
      />
    </div>
  );
};

export async function getServerSideProps(context: any) {
  return {
    props: {},
  };
}

export default withAdminLayout(LanguagesConfigContent, {
  permission: 'manage:translations',
  featureName: 'Languages Configuration',
});
