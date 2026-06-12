import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Plus, Loader2, AlertCircle } from 'lucide-react';
import { useTranslation as useLanguageTranslation } from '../../lib/i18n';
import AdminLayout from '../../components/admin/_AdminLayout';
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

const LanguagesConfig = () => {
  const { t, loadNamespace } = useLanguageTranslation();
  const router = useRouter();

  const [languages, setLanguages] = useState<Language[]>([]);
  const [supportedLanguages, setSupportedLanguages] = useState<SupportedLanguage[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedLangCode, setSelectedLangCode] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
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
  }, [loadNamespace]);

  const fetchLanguages = async () => {
    try {
      setLoading(true);
      const token = getAuthToken();

      if (!token) {
        showMessage('error', t('admin_not_logged_in'));
        return;
      }

      const response = await fetch(`${API_BASE}/api/languages`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.status === 401) {
        showMessage('error', t('admin_session_expired'));
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
      console.error('Error fetching languages:', error);
      showMessage('error', t('admin_error_load_languages'));
    } finally {
      setLoading(false);
    }
  };

  const fetchSupportedLanguages = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/languages/supported`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.success) {
        setSupportedLanguages(data.data);
      }
    } catch (error) {
      console.error('Error fetching supported languages:', error);
    }
  };

  const showMessage = (type: 'success' | 'error' | 'info', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleAddLanguage = async () => {
    if (!selectedLangCode) {
      showMessage('error', t('admin_select_language'));
      return;
    }

    const selectedLang = supportedLanguages.find((l) => l.code === selectedLangCode);
    if (!selectedLang) {
      showMessage('error', t('admin_invalid_language'));
      return;
    }

    setIsProcessing(true);
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE}/api/languages`, {
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
        throw new Error(data.message || t('admin_error_add_language'));
      }

      showMessage('success', data.message || t('admin_language_added'));
      setIsModalOpen(false);
      setSelectedLangCode('');
      fetchLanguages();
    } catch (error: any) {
      showMessage('error', error.message || t('admin_error_add_language'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleToggleLanguage = async (langId: string, currentStatus: boolean) => {
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE}/api/languages/${langId}`, {
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
        throw new Error(t('admin_error_update_status'));
      }

      fetchLanguages();
      showMessage('success', t('admin_language_status_updated'));
    } catch (error: any) {
      showMessage('error', error.message);
    }
  };

  // Danh sách ngôn ngữ đã được thêm (để disable trong dropdown)
  const existingLangCodes = languages.map((l) => l.code);
  const availableLanguages = supportedLanguages.filter((l) => !existingLangCodes.includes(l.code));

  if (loading) {
    return (
      <AdminLayout>
        <div className="p-6 flex items-center justify-center min-h-screen">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
            <p>{t('admin_loading_data')}</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">🌐 {t('admin_languages_config_title')}</h1>
            <p className="text-gray-600">{t('admin_languages_config_desc')}</p>
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
            {t('admin_add_language')}
          </button>
        </div>

        {/* Message */}
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

        {/* Languages Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">{t('admin_language_code')}</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">{t('admin_language_display_name')}</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">{t('admin_language_native_name')}</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">{t('admin_language_status')}</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">{t('admin_language_default')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {languages.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                      {t('admin_no_languages')}
                    </td>
                  </tr>
                ) : (
                  languages.map((lang) => (
                    <tr key={lang._id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <code className="bg-gray-100 px-2 py-1 rounded text-sm font-mono">{lang.code}</code>
                      </td>
                      <td className="px-6 py-4 font-medium">{lang.name}</td>
                      <td className="px-6 py-4">{lang.nativeName || '-'}</td>
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
                          {lang.isActive ? t('admin_language_active') : t('admin_language_inactive')}
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        {lang.isSystemDefault ? (
                          <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                            {t('admin_language_default_vi')}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal Thêm Ngôn Ngữ */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4 p-6">
            <h3 className="text-xl font-bold mb-2 text-orange-600 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              {t('admin_add_language_confirm_title')}
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              {t('admin_add_language_confirm_desc')}
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('admin_select_language_to_expand')}
              </label>
              <select
                value={selectedLangCode}
                onChange={(e) => setSelectedLangCode(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="">{t('admin_select_language_placeholder')}</option>
                {availableLanguages.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name}
                  </option>
                ))}
              </select>
            </div>

            <p className="text-xs text-gray-500 mb-6 bg-yellow-50 border border-yellow-200 rounded p-3">
              {t('admin_add_language_note')}
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setSelectedLangCode('');
                }}
                disabled={isProcessing}
                className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 font-medium transition-colors"
              >
                {t('admin_cancel')}
              </button>
              <button
                onClick={handleAddLanguage}
                disabled={isProcessing || !selectedLangCode}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-white transition-colors ${
                  isProcessing || !selectedLangCode
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-orange-600 hover:bg-orange-700'
                }`}
              >
                {isProcessing && <Loader2 className="w-4 h-4 animate-spin" />}
                {isProcessing ? t('admin_processing') : t('admin_confirm_and_translate')}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export async function getServerSideProps(context: any) {
  return {
    props: {},
  };
}

export default LanguagesConfig;
