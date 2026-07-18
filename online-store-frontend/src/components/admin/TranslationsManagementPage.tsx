import { useState, useEffect, Fragment } from 'react';
import { Trash2, Plus, Edit2, ChevronLeft, ChevronRight, RotateCcw, ArchiveX, Archive } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
import { getAuthToken } from '../../lib/api';
import { getLanguageLabelKey } from '../../lib/i18n/localeLabels';
import { Locale } from '../../lib/i18n/types';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';

interface StaticTranslation {
  _id: string;
  code: string;
  namespace: string;
  translations: Record<string, string>;
  createdAt?: string;
  updatedAt?: string;
  isDeleted?: boolean;
  deletedAt?: string;
}

interface PaginationData {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const TranslationsManagementPage = () => {
  const { t, locale } = useTranslation();
  const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '');

  const [translations, setTranslations] = useState<StaticTranslation[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState<PaginationData>({
    page: 1,
    limit: 10,
    total: 0,
    pages: 0,
  });
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingKeyId, setEditingKeyId] = useState<string | null>(null);
  const [editingKeyName, setEditingKeyName] = useState('');
  const [editingKeyValue, setEditingKeyValue] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean; type: 'softDelete' | 'hardDelete'; translationId?: string; keyName?: string }>({ isOpen: false, type: 'softDelete' });

  const fetchTranslations = async (page = 1) => {
    setLoading(true);
    try {
      const token = getAuthToken();
      const response = await fetch(
        `${API_BASE}/api/translations/admin/list?page=${page}&limit=${pagination.limit}&includeDeleted=${includeDeleted}&lang=${locale}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();
      if (data.success) {
        setTranslations(data.data.translations || data.data);
        setPagination(data.data.pagination || { total: 0, limit: 50, skip: 0 });
      } else {
        toast.error(t('error_load_data', 'common'));
      }
    } catch (error) {
      toast.error(t('error_load_data', 'common'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTranslations(pagination.page);
  }, [includeDeleted, locale]);

  const handleUpdateKey = async (translationId: string) => {
    if (!editingKeyName.trim() || !editingKeyValue.trim()) {
      toast.error(t('error_fill_required', 'common'));
      return;
    }

    try {
      const token = getAuthToken();
      const response = await fetch(
        `${API_BASE}/api/translations/admin/${translationId}/key?lang=${locale}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            key: editingKeyName,
            value: editingKeyValue,
          }),
        }
      );

      const data = await response.json();
      if (data.success) {
        toast.success(t('admin_translations_updated_successfully', 'common'));
        setEditingKeyId(null);
        setEditingKeyName('');
        setEditingKeyValue('');
        fetchTranslations(pagination.page);
      } else {
        toast.error(data.message || t('error_save_data', 'common'));
      }
    } catch (error) {
      toast.error(t('error_save_data', 'common'));
    }
  };

  const handleDeleteKey = async (translationId: string, keyName: string) => {
    setConfirmDialog({ isOpen: true, type: 'softDelete', translationId, keyName });
  };

  const confirmDeleteKey = async () => {
    const { translationId, keyName } = confirmDialog;
    setConfirmDialog({ isOpen: false, type: 'softDelete' });

    try {
      const token = getAuthToken();
      const response = await fetch(
        `${API_BASE}/api/translations/admin/${translationId}/key?lang=${locale}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ key: keyName }),
        }
      );

      const data = await response.json();
      if (data.success) {
        toast.success(t('admin_translations_deleted_successfully', 'common'));
        fetchTranslations(pagination.page);
      } else {
        toast.error(data.message || t('error_delete_data', 'common'));
      }
    } catch (error) {
      toast.error(t('error_delete_data', 'common'));
    }
  };

  const handleSoftDelete = async (translationId: string) => {
    setConfirmDialog({ isOpen: true, type: 'softDelete', translationId });
  };

  const confirmSoftDelete = async () => {
    const { translationId } = confirmDialog;
    setConfirmDialog({ isOpen: false, type: 'softDelete' });

    try {
      const token = getAuthToken();
      const response = await fetch(
        `${API_BASE}/api/translations/admin/${translationId}/soft?lang=${locale}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();
      if (data.success) {
        toast.success(t('admin_translations_deleted_successfully', 'common'));
        fetchTranslations(pagination.page);
      } else {
        toast.error(data.message || t('error_delete_data', 'common'));
      }
    } catch (error) {
      toast.error(t('error_delete_data', 'common'));
    }
  };

  const handleHardDelete = async (translationId: string) => {
    setConfirmDialog({ isOpen: true, type: 'hardDelete', translationId });
  };

  const confirmHardDelete = async () => {
    const { translationId } = confirmDialog;
    setConfirmDialog({ isOpen: false, type: 'softDelete' });

    try {
      const token = getAuthToken();
      const response = await fetch(
        `${API_BASE}/api/translations/admin/${translationId}/hard?lang=${locale}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();
      if (data.success) {
        toast.success(t('admin_translations_deleted_successfully', 'common'));
        fetchTranslations(pagination.page);
      } else {
        toast.error(data.message || t('error_delete_data', 'common'));
      }
    } catch (error) {
      toast.error(t('error_delete_data', 'common'));
    }
  };

  const handleRestore = async (translationId: string) => {
    try {
      const token = getAuthToken();
      const response = await fetch(
        `${API_BASE}/api/translations/admin/${translationId}/restore?lang=${locale}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();
      if (data.success) {
        toast.success(t('admin_translations_restored_successfully', 'common'));
        fetchTranslations(pagination.page);
      } else {
        toast.error(data.message || t('error_save_data', 'common'));
      }
    } catch (error) {
      toast.error(t('error_save_data', 'common'));
    }
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.pages) {
      fetchTranslations(newPage);
    }
  };

  const getLangDisplay = (code: string) => {
    const key = getLanguageLabelKey(code as Locale);
    return t(key, 'common');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t('admin_translations_title', 'common')}</h1>
          <p className="mt-1 text-gray-600">{t('admin_translations_description', 'common')}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-6">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeDeleted}
              onChange={(e) => {
                setIncludeDeleted(e.target.checked);
                setPagination({ ...pagination, page: 1 });
              }}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm text-gray-700">{t('admin_translations_include_deleted', 'common')}</span>
          </label>
          <span className="text-sm text-gray-600">
            {t('admin_translations_total', 'common')}: {pagination.total}
          </span>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <span className="text-gray-500">{t('loading', 'common')}</span>
          </div>
        ) : translations.length === 0 ? (
          <div className="text-center py-12">
            <span className="text-gray-500">{t('admin_translations_empty', 'common')}</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    {t('admin_translations_language', 'common')}
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    {t('admin_translations_namespace', 'common')}
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    {t('admin_translations_keys_count', 'common')}
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    {t('admin_translations_updated_at', 'common')}
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    {t('admin_translations_actions', 'common')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {translations.map((translation) => (
                  <Fragment key={translation._id}>
                    <tr className={translation.isDeleted ? 'bg-red-50' : ''}>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {getLangDisplay(translation.code)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-md text-xs font-medium">
                          {translation.namespace}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {Object.keys(translation.translations).length}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {translation.updatedAt ? new Date(translation.updatedAt).toLocaleDateString() : t('admin_translations_management_no_date_placeholder', 'common')}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <button
                          onClick={() =>
                            setExpandedId(expandedId === translation._id ? null : translation._id)
                          }
                          className="text-blue-600 hover:text-blue-800 mr-3 inline-block"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {translation.isDeleted ? (
                          <button
                            onClick={() => handleRestore(translation._id)}
                            className="text-green-600 hover:text-green-800 mr-3 inline-block"
                            title={t('admin_translations_restore', 'common')}
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleSoftDelete(translation._id)}
                            className="text-orange-600 hover:text-orange-800 mr-3 inline-block"
                            title={t('admin_translations_soft_delete', 'common')}
                          >
                            <Archive className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleHardDelete(translation._id)}
                          className="text-red-600 hover:text-red-800 inline-block"
                          title={t('admin_translations_hard_delete', 'common')}
                        >
                          <ArchiveX className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>

                    {expandedId === translation._id && (
                      <tr className={translation.isDeleted ? 'bg-red-50' : 'bg-gray-50'}>
                        <td colSpan={5} className="px-6 py-4">
                          <div className="space-y-4">
                            <h4 className="font-semibold text-gray-900 mb-4">
                              {t('admin_translations_list', 'common')} ({Object.keys(translation.translations).length})
                            </h4>

                            {Object.keys(translation.translations).length === 0 ? (
                              <p className="text-gray-500 text-sm">{t('admin_translations_no_keys', 'common')}</p>
                            ) : (
                              <div className="space-y-3 max-h-96 overflow-y-auto">
                                {Object.entries(translation.translations).map(([key, value]) => (
                                  <div key={key} className="bg-white border rounded p-3 flex items-start gap-3">
                                    {editingKeyId === `${translation._id}-${key}` ? (
                                      <div className="flex-1 space-y-2">
                                        <input
                                          type="text"
                                          value={editingKeyName}
                                          onChange={(e) => setEditingKeyName(e.target.value)}
                                          placeholder={t('admin_translations_key', 'common')}
                                          className="w-full px-2 py-1 border rounded text-sm"
                                        />
                                        <textarea
                                          value={editingKeyValue}
                                          onChange={(e) => setEditingKeyValue(e.target.value)}
                                          placeholder={t('admin_translations_value', 'common')}
                                          className="w-full px-2 py-1 border rounded text-sm"
                                          rows={2}
                                        />
                                        <div className="flex gap-2 justify-end">
                                          <button
                                            onClick={() => handleUpdateKey(translation._id)}
                                            className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                                          >
                                            {t('form_save_button', 'contact') || t('admin_translations_management_save_button', 'common')}
                                          </button>
                                          <button
                                            onClick={() => {
                                              setEditingKeyId(null);
                                              setEditingKeyName('');
                                              setEditingKeyValue('');
                                            }}
                                            className="px-3 py-1 bg-gray-400 text-white rounded text-sm hover:bg-gray-500"
                                          >
                                            {t('cancel', 'common')}
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <>
                                        <div className="flex-1 min-w-0">
                                          <div className="text-sm font-mono text-gray-600 break-all">{key}</div>
                                          <div className="text-sm text-gray-900 mt-1 break-words">{value}</div>
                                        </div>
                                        <div className="flex gap-2 shrink-0">
                                          <button
                                            onClick={() => {
                                              setEditingKeyId(`${translation._id}-${key}`);
                                              setEditingKeyName(key);
                                              setEditingKeyValue(value);
                                            }}
                                            className="p-1 text-blue-600 hover:text-blue-800"
                                          >
                                            <Edit2 className="w-4 h-4" />
                                          </button>
                                          <button
                                            onClick={() => handleDeleteKey(translation._id, key)}
                                            className="p-1 text-red-600 hover:text-red-800"
                                          >
                                            <Trash2 className="w-4 h-4" />
                                          </button>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagination.pages > 1 && (
          <div className="mt-6 flex items-center justify-between">
            <div className="text-sm text-gray-600">
              {t('admin_translations_page', 'common')} {pagination.page} {t('of', 'common')}{' '}
              {pagination.pages}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page === 1}
                className="p-2 border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-600 px-2 py-2">
                {t('admin_translations_page', 'common')} {pagination.page} {t('admin_translations_management_of_separator', 'common')} {pagination.pages}
              </span>
              <button
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page === pagination.pages}
                className="p-2 border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={confirmDialog.isOpen} onOpenChange={(open: boolean) => !open && setConfirmDialog({ isOpen: false, type: confirmDialog.type })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('common_confirm', 'common')}</DialogTitle>
          </DialogHeader>
          <p>
            {confirmDialog.type === 'softDelete'
              ? t('admin_translations_confirm_soft_delete', 'common')
              : t('admin_translations_confirm_hard_delete', 'common')}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog({ isOpen: false, type: confirmDialog.type })}>
              {t('common_cancel', 'common')}
            </Button>
            <Button
              variant="destructive"
              onClick={
                confirmDialog.keyName
                  ? confirmDeleteKey
                  : confirmDialog.type === 'softDelete'
                  ? confirmSoftDelete
                  : confirmHardDelete
              }
            >
              {t('common_confirm', 'common')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TranslationsManagementPage;
