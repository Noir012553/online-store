import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import { withAdminLayout } from '../../components/admin/withAdminLayout';
import { apiCall, getAuthToken } from '../../lib/api';
import { useTranslation } from '@/lib/i18n';
import { UI_EMOJI } from '@/lib/uiEmoji';

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

function ImportProductsContent() {
  const { t, loadNamespace, locale } = useTranslation();

  useEffect(() => {
    loadNamespace('admin');
  }, [loadNamespace]);

  const [fileData, setFileData] = useState('');
  const [format, setFormat] = useState<'json' | 'csv'>('json');
  const [mode, setMode] = useState<'insert' | 'update' | 'upsert'>('upsert');
  const [dryRun, setDryRun] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [guide, setGuide] = useState<any>(null);
  const [formats, setFormats] = useState<any>(null);

  // Fetch guide & formats khi mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        // FIX: Use apiCall instead of fetch to include Authorization header
        const [guideData, formatsData] = await Promise.all([
          apiCall(`/products/admin/import-guide?lang=${locale}`),
          apiCall(`/products/admin/import-formats?lang=${locale}`),
        ]);

        if (guideData.success) setGuide(guideData);
        if (formatsData.success) setFormats(formatsData);
      } catch (err) {
        // Error loading data - UI will show placeholder
      }
    };
    fetchData();
  }, [locale]);

  // Download template
  const downloadTemplate = async () => {
    try {
      // FIX: Add Authorization header
      const token = getAuthToken();
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`/api/products/admin/import-template?format=${format}&lang=${locale}`, {
        headers,
      });

      if (!res.ok) {
        throw new Error(`${t('http_error_status', 'admin-errors')} ${res.status}`);
      }

      if (format === 'csv') {
        const csvText = await res.text();
        const blob = new Blob([csvText], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `products-template.${format}`;
        a.click();
      } else {
        const data = await res.json();
        if (data.success) {
          const jsonStr = JSON.stringify(data.template, null, 2);
          const blob = new Blob([jsonStr], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `products-template.${format}`;
          a.click();
        }
      }
      toast.success(t('save_success'));
    } catch (err) {
      toast.error(t('error_load_data'));
    }
  };

  // Handle direct file upload to backend
  const handleDirectFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      toast.error(t('max_file_size_error'));
      return;
    }

    // Validate file type
    const detectedFormat = file.name.endsWith('.csv') ? 'csv' : file.name.endsWith('.json') ? 'json' : null;
    if (!detectedFormat) {
      toast.error(t('import.invalid_file_error'));
      return;
    }

    try {
      setIsLoading(true);
      const token = getAuthToken();

      // Create FormData for file upload
      const formData = new FormData();
      formData.append('file', file);
      formData.append('format', detectedFormat);
      formData.append('mode', mode);
      formData.append('dryRun', String(dryRun)); // Preview mode by default

      // Send file directly to backend
      const response = await fetch(`/api/products/admin/import-file?lang=${locale}`, {
        method: 'POST',
        headers: {
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        let errorMessage = t('error_save_data');
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorData.error || t('import.upload_failed');
          if (errorData.error && !errorMessage.includes(errorData.error)) {
            errorMessage += ` - ${errorData.error}`;
          }
        } catch (e) {
          // Response wasn't JSON, use status text
          errorMessage = response.statusText || t('import.upload_failed');
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();

      if (data.success) {
        setFormat(detectedFormat);
        setResult(data);
        toast.success(data.message);

        // Auto-clear input
        e.target.value = '';
      } else {
        toast.error(data.message);
        setResult(data);
      }
    } catch (err: any) {
      toast.error(err.message || t('error_save_data'));
    } finally {
      setIsLoading(false);
    }
  };

  // Handle file content paste/edit (keep for flexibility)
  const handleFileUploadForTextarea = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;

        // Detect format từ file extension
        const detectedFormat = file.name.endsWith('.csv') ? 'csv' : 'json';
        setFormat(detectedFormat);

        setFileData(content);
        toast.success(t('save_success'));
      } catch (err) {
        toast.error(t('error_load_data'));
      }
    };
    reader.readAsText(file);
  };

  // Import data
  const handleImport = async () => {
    if (!fileData.trim()) {
      toast.error(t('error_fill_required'));
      return;
    }

    try {
      setIsLoading(true);

      const payload: any = {
        format,
        mode,
        dryRun,
      };

      // Parse data based on format
      if (format === 'json') {
        const parsedData = JSON.parse(fileData);
        payload.data = parsedData;
      } else if (format === 'csv') {
        payload.data = fileData;
      }

      // FIX: Add Authorization header
      const token = getAuthToken();
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`/api/products/admin/import?lang=${locale}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!data.success) {
        toast.error(data.message);
        if (data.errors?.length > 0) {
          setResult({ errors: data.errors.slice(0, 10) });
        }
      } else {
        toast.success(data.message);
        setResult(data);
        if (!dryRun) {
          setFileData('');
        }
      }
    } catch (err: any) {
      toast.error(t('error_save_data') + ': ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
        <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">{t('products_title')}</h1>

      {/* Hướng dẫn */}
      {guide && formats && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-bold mb-4">{UI_EMOJI.guide} {t('guide_title')}</h2>
          <div className="space-y-2 text-sm">
            <p>
              <strong>{t('supported_formats')}</strong> {formats.supportedFormats.join(', ').toUpperCase()}
            </p>
            <p>
              <strong>{t('required_fields')}</strong> {guide.requiredFields.join(', ')}
            </p>
            <div>
              <strong>{t('modes_label')}</strong>
              <ul className="list-disc ml-5">
                <li>{t('mode_insert')}: {t('mode_insert_desc')}</li>
                <li>{t('mode_update')}: {t('mode_update_desc')}</li>
                <li>{t('mode_upsert')}: {t('mode_upsert_desc')}</li>
              </ul>
            </div>
            <p>
              <strong>{t('preview_label')}</strong> {t('preview_desc')}
            </p>
            <div className="mt-3 pt-3 border-t border-blue-200">
              <strong>{t('adapters_label')}</strong>
              <ul className="list-disc ml-5 mt-1">
                {formats.adapters.map((adapter: any) => {
                  const descriptionKey =
                    adapter.name === 'JSONAdapter' ? 'adapter_json_description' :
                    adapter.name === 'CSVAdapter' ? 'adapter_csv_description' :
                    null;
                  const description = descriptionKey ? t(descriptionKey) : adapter.description;
                  return (
                    <li key={adapter.name}>
                      {adapter.name}: {description}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Upload & Input */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Tải lên tệp */}
        <div className="lg:col-span-1 space-y-4">
          <div className="border rounded-lg p-4 bg-blue-50">
            <h3 className="font-bold mb-4">{UI_EMOJI.folder} 1. {t('step_upload')}</h3>

            {/* File input with better styling */}
            <label htmlFor="file-upload" className="mb-4 p-3 border-2 border-dashed border-blue-300 rounded bg-white hover:bg-blue-50 transition block text-center cursor-pointer">
              <input
                type="file"
                accept=".json,.csv"
                onChange={handleDirectFileUpload}
                className="hidden"
                id="file-upload"
                disabled={isLoading}
              />
              <p className="text-sm text-blue-600 font-medium">
                {isLoading ? t('exporting') : `${UI_EMOJI.folder} ${t('choose_file')}`}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {isLoading ? '' : t('max_size_label')}
              </p>
            </label>

            <Button
              onClick={downloadTemplate}
              variant="outline"
              className="w-full mb-3"
            >
              {UI_EMOJI.download} {t('download_template')}
            </Button>

            <div className="bg-white p-3 rounded text-xs text-gray-600 space-y-1">
              <p className="font-medium text-gray-700">{UI_EMOJI.statusSuccess} {t('supports_label')}</p>
              <ul className="list-disc ml-4">
                <li>{t('format_label')} {t('format_json_extension')}</li>
                <li>{t('format_label')} {t('format_csv_extension')}</li>
                <li>{t('max_size_label')}</li>
              </ul>
            </div>
          </div>

          {/* Cài đặt */}
          <div className="border rounded-lg p-4">
            <h3 className="font-bold mb-4">2. {t('step_settings')}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-2">{t('format_label')}</label>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as 'json' | 'csv')}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="json">{t('format_json')}</option>
                  <option value="csv">{t('format_csv')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">{t('mode_label')}</label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as 'insert' | 'update' | 'upsert')}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="upsert">{t('mode_upsert_desc')}</option>
                  <option value="insert">{t('mode_insert_desc')}</option>
                  <option value="update">{t('mode_update_desc')}</option>
                </select>
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={dryRun}
                  onChange={(e) => setDryRun(e.target.checked)}
                />
                <span className="text-sm">
                  {UI_EMOJI.search} {t('dry_run_label')}
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Trình chỉnh sửa dữ liệu */}
        <div className="lg:col-span-2">
          <h3 className="font-bold mb-2">3. {t('data_label').replace('{{format}}', format.toUpperCase())}</h3>
          <textarea
            value={fileData}
            onChange={(e) => setFileData(e.target.value)}
            placeholder={t(`import_placeholder_${format}`, 'admin')}
            className="w-full h-96 border rounded p-3 font-mono text-sm"
          />
          <p className="text-xs text-gray-500 mt-2">
            {t('import_data_hint').replace('{{format}}', format.toUpperCase())}
          </p>

          {/* Import Button */}
          <div className="flex gap-4 mt-6">
            <Button
              onClick={handleImport}
              disabled={isLoading || !fileData.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3"
            >
              {isLoading ? t('processing') : (dryRun ? `${UI_EMOJI.preview} ${t('preview_label').replace(':', '')}` : `${UI_EMOJI.run} ${t('start')}`)}
            </Button>
            <Link href="/admin/dashboard">
              <Button variant="outline">{t('back')}</Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Result */}
      {result && (
        <div className={`border rounded-lg p-6 ${result.errors?.length > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
          <h2 className="text-xl font-bold mb-4">
            {result.errors?.length > 0 ? `${UI_EMOJI.statusError} ${t('errors_title')}` : `${UI_EMOJI.statusSuccess} ${t('results_title')}`}
          </h2>

          {result.message && (
            <p className="mb-4">{result.message}</p>
          )}

          {result.dryRun && (
            <div className="mb-4 p-3 bg-yellow-100 border border-yellow-300 rounded">
              {t('dry_run_note')}
            </div>
          )}

          {result.results && (
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="p-3 bg-white rounded border">
                <div className="text-sm text-gray-600">{t('inserted_label')}</div>
                <div className="text-2xl font-bold text-green-600">
                  {result.results.inserted}
                </div>
              </div>
              <div className="p-3 bg-white rounded border">
                <div className="text-sm text-gray-600">{t('updated_label')}</div>
                <div className="text-2xl font-bold text-blue-600">
                  {result.results.updated}
                </div>
              </div>
              <div className="p-3 bg-white rounded border">
                <div className="text-sm text-gray-600">{t('skipped_label')}</div>
                <div className="text-2xl font-bold text-orange-600">
                  {result.results.skipped || 0}
                </div>
              </div>
            </div>
          )}

          {result.errors?.length > 0 && (
            <div className="mb-4">
              <h3 className="font-bold text-red-700 mb-2">{t('errors_title')}:</h3>
              <ul className="space-y-1 text-sm text-red-600">
                {result.errors.map((err: any, i: number) => {
                  let errorText = '';
                  if (typeof err === 'string') {
                    errorText = err;
                  } else if (typeof err === 'object' && err !== null) {
                    // Handle error objects with name, brand, reason, etc.
                    const parts = [];
                    if (err.name) parts.push(`${t('admin_product_name')}: ${err.name}`);
                    if (err.brand) parts.push(`${t('admin_brand')}: ${err.brand}`);
                    if (err.reason) parts.push(`${t('reason_label')} ${err.reason}`);
                    if (parts.length === 0 && err.message) {
                      errorText = err.message;
                    } else {
                      errorText = parts.join(', ');
                    }
                  }
                  return <li key={i}>{UI_EMOJI.bullet} {errorText || t('review_error')}</li>;
                })}
              </ul>
            </div>
          )}

          {result.warnings?.length > 0 && (
            <div className="mb-4">
              <h3 className="font-bold text-orange-700 mb-2">{t('warnings_title')}</h3>
              <ul className="space-y-1 text-sm text-orange-600">
                {result.warnings.map((warn: any, i: number) => {
                  let warnText = '';
                  if (typeof warn === 'string') {
                    warnText = warn;
                  } else if (typeof warn === 'object' && warn !== null) {
                    const parts = [];
                    if (warn.name) parts.push(`${t('admin_product_name')}: ${warn.name}`);
                    if (warn.brand) parts.push(`${t('admin_brand')}: ${warn.brand}`);
                    if (warn.reason) parts.push(`${t('reason_label')} ${warn.reason}`);
                    if (parts.length === 0 && warn.message) {
                      warnText = warn.message;
                    } else {
                      warnText = parts.join(', ');
                    }
                  }
                  return <li key={i}>{UI_EMOJI.bullet} {warnText || t('review_error')}</li>;
                })}
              </ul>
            </div>
          )}

          {result.preview && (
            <div className="mt-4 pt-4 border-t">
              <h3 className="font-bold mb-2">{t('preview_first_3')}</h3>
              <pre className="bg-white p-3 rounded border text-xs overflow-auto max-h-48">
                {JSON.stringify(result.preview, null, 2)}
              </pre>
            </div>
          )}

          <div className="mt-6 flex gap-4">
            <Link href="/admin/dashboard">
              <Button variant="outline">{t('back')}</Button>
            </Link>
          </div>
        </div>
      )}
        </div>
  );
}

export default withAdminLayout(ImportProductsContent, {
  permission: 'admin',
  featureName: 'Import Products'
});
