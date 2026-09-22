import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  CheckCircle2,
  FileCheck2,
  FileWarning,
  Info,
  Loader2,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import { withAdminLayout } from '../../components/admin/withAdminLayout';
import { apiCall, getAuthToken, productTranslationAPI } from '../../lib/api';
import { useTranslation } from '@/lib/i18n';
import { getUserFriendlyErrorMessage } from '@/lib/errorHandler';

const MAX_IMPORT_ZIP_FILE_SIZE_BYTES = 100 * 1024 * 1024;
type ImportMode = 'insert' | 'update' | 'upsert';

type ImportResult = {
  success?: boolean;
  message?: string;
  code?: string;
  dryRun?: boolean;
  totalProducts?: number;
  restoredImageAssets?: number;
  results?: {
    inserted?: number;
    updated?: number;
    unchanged?: number;
    skipped?: number;
  };
  errors?: Array<string | Record<string, any>>;
  warnings?: Array<string | Record<string, any>>;
  preview?: unknown[];
};

const formatBytes = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const getServerSideProps = async () => ({ props: {} });

function ImportProductsContent() {
  const { t, loadNamespace, locale } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mode, setMode] = useState<ImportMode>('upsert');
  const [dryRun, setDryRun] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const importInFlightRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [guide, setGuide] = useState<any>(null);
  const [replaceManualTranslations, setReplaceManualTranslations] = useState(false);
  const [translationResult, setTranslationResult] = useState<any>(null);
  const [translationImport, setTranslationImport] = useState<{
    records: Array<Record<string, unknown>>;
    idempotencyKey: string;
  } | null>(null);
  const [isTranslationLoading, setIsTranslationLoading] = useState(false);
  const translationInFlightRef = useRef(false);

  useEffect(() => {
    loadNamespace('admin');
    loadNamespace('admin-import');
  }, [loadNamespace]);

  useEffect(() => {
    let isMounted = true;
    apiCall(`/products/admin/import-guide?lang=${locale}`)
      .then((data) => {
        if (isMounted && data.success) setGuide(data);
      })
      .catch(() => {
        if (isMounted) setGuide(null);
      });

    return () => {
      isMounted = false;
    };
  }, [locale]);

  const validateFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      toast.error(t('zip_only_error', 'admin-import'));
      return false;
    }
    if (file.size === 0) {
      toast.error(t('empty_file_error', 'admin-import'));
      return false;
    }
    if (file.size > MAX_IMPORT_ZIP_FILE_SIZE_BYTES) {
      toast.error(t('zip_max_size_label', 'admin-import'));
      return false;
    }
    return true;
  };

  const selectFile = (file?: File) => {
    if (!file || !validateFile(file)) return;
    setSelectedFile(file);
    setResult(null);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    selectFile(event.target.files?.[0]);
    event.target.value = '';
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    selectFile(event.dataTransfer.files?.[0]);
  };

  const handleImport = async (shouldDryRun: boolean) => {
    if (importInFlightRef.current) return;
    if (!selectedFile) {
      toast.error(t('choose_file_first', 'admin-import'));
      return;
    }

    importInFlightRef.current = true;
    try {
      setIsImporting(true);
      const token = getAuthToken();
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('format', 'zip');
      formData.append('mode', mode);
      formData.append('dryRun', String(shouldDryRun));

      const response = await fetch(`/api/products/admin/import-file?lang=${locale}`, {
        method: 'POST',
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: formData,
        credentials: 'include',
      });

      let data: ImportResult;
      try {
        data = await response.json();
      } catch {
        throw new Error(t('upload_failed', 'admin-import'));
      }

      if (!response.ok || !data.success) {
        const message = data.message || getUserFriendlyErrorMessage({ code: (data as any).code }, t);
        setResult({ ...data, message, success: false });
        toast.error(message);
        return;
      }

      setResult(data);
      toast.success(data.message || t('upload_success', 'admin-import'));
      if (!shouldDryRun) setSelectedFile(null);
    } catch (error) {
      const message = getUserFriendlyErrorMessage(error, t);
      setResult({ success: false, message });
      toast.error(message);
    } finally {
      importInFlightRef.current = false;
      setIsImporting(false);
    }
  };

  const handleTranslationFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (translationInFlightRef.current) return;

    if (!file.name.toLowerCase().endsWith('.json')) {
      toast.error(t('translation_json_only', 'admin-import'));
      return;
    }

    translationInFlightRef.current = true;
    try {
      setIsTranslationLoading(true);
      const parsed = JSON.parse(await file.text());
      const records = Array.isArray(parsed) ? parsed : parsed?.data?.records || parsed?.records;
      if (!Array.isArray(records) || records.length === 0) throw new Error('translation_records_invalid');

      const idempotencyKey = `translation-import-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const data = await productTranslationAPI.importProductTranslations({
        records,
        replaceManualTranslations,
        idempotencyKey,
        dryRun: true,
      });
      setTranslationImport({ records, idempotencyKey });
      setTranslationResult(data);
      toast.success(t('translation_preview_success', 'admin-import'));
    } catch (error) {
      const message = getUserFriendlyErrorMessage(error, t);
      setTranslationResult({ success: false, message });
      toast.error(message);
    } finally {
      translationInFlightRef.current = false;
      setIsTranslationLoading(false);
    }
  };

  const confirmTranslationImport = async () => {
    if (!translationImport || translationInFlightRef.current) return;

    translationInFlightRef.current = true;
    try {
      setIsTranslationLoading(true);
      const data = await productTranslationAPI.importProductTranslations({
        ...translationImport,
        replaceManualTranslations,
        dryRun: false,
      });
      setTranslationResult(data);
      setTranslationImport(null);
      toast.success(t('translation_success', 'admin-import'));
    } catch (error) {
      const message = getUserFriendlyErrorMessage(error, t);
      setTranslationResult({ success: false, message });
      toast.error(message);
    } finally {
      translationInFlightRef.current = false;
      setIsTranslationLoading(false);
    }
  };

  const formatIssue = (issue: string | Record<string, any>) => {
    if (typeof issue === 'string') return getUserFriendlyErrorMessage({ message: issue }, t);
    const details = [issue.name, issue.brand, issue.reason || issue.message].filter(Boolean);
    return details.length > 0 ? details.join(' · ') : t('review_error', 'admin-import');
  };

  const hasImportErrors = Boolean(result?.errors?.length);
  const isPreviewResult = Boolean(result?.success && result?.dryRun);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container mx-auto max-w-6xl px-4 py-8 lg:px-6">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-blue-700">
              <Archive className="h-4 w-4" />
              {t('import_export_title', 'admin')}
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              {t('products_title', 'admin-import')}
            </h1>
            <p className="mt-2 max-w-2xl text-slate-600">
              {t('zip_import_description', 'admin-import')}
            </p>
          </div>
          <Link href="/admin/importExport">
            <Button variant="outline" className="bg-white">
              <ArrowLeft className="h-4 w-4" />
              {t('back', 'admin')}
            </Button>
          </Link>
        </div>

        <div className="mb-8 grid gap-3 sm:grid-cols-3">
          {[
            { number: '01', title: t('choose_file', 'admin-import'), description: t('zip_max_size_label', 'admin-import'), active: Boolean(selectedFile) },
            { number: '02', title: t('preview', 'admin-import'), description: t('preview_desc', 'admin-import'), active: isPreviewResult },
            { number: '03', title: t('start_import', 'admin-import'), description: t('confirm_import', 'admin-import'), active: Boolean(result?.success && !result?.dryRun) },
          ].map((step) => (
            <div
              key={step.number}
              className={`rounded-xl border px-4 py-3 ${step.active ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white'}`}
            >
              <div className="flex items-center gap-3">
                <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${step.active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {step.number}
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{step.title}</p>
                  <p className="text-xs text-slate-500">{step.description}</p>
                </div>
                {step.active && <CheckCircle2 className="ml-auto h-4 w-4 text-blue-600" />}
              </div>
            </div>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <main className="space-y-6">
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-6 py-5">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-blue-100 p-3 text-blue-700">
                    <UploadCloud className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">{t('step_upload', 'admin-import')}</p>
                    <h2 className="mt-1 text-xl font-bold text-slate-950">{t('choose_file', 'admin-import')}</h2>
                    <p className="mt-1 text-sm text-slate-500">{t('zip_import_description', 'admin-import')}</p>
                  </div>
                </div>
              </div>

              <div className="p-6">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') fileInputRef.current?.click();
                  }}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/50'}`}
                >
                  <input ref={fileInputRef} type="file" accept=".zip" onChange={handleFileChange} className="hidden" disabled={isImporting} />
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white text-blue-600 shadow-sm">
                    <Archive className="h-7 w-7" />
                  </div>
                  <h3 className="mt-4 font-semibold text-slate-900">
                    {selectedFile ? t('replace_zip_file', 'admin-import') : t('drop_zip_here', 'admin-import')}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">{t('choose_from_computer', 'admin-import')}</p>
                  <p className="mt-4 text-xs font-medium text-slate-500">{t('zip_format_limit', 'admin-import')}</p>
                </div>

                {selectedFile && (
                  <div className="mt-4 flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
                    <div className="rounded-lg bg-white p-2 text-blue-600">
                      <FileCheck2 className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{selectedFile.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{formatBytes(selectedFile.size)} · {t('file_ready', 'admin-import')}</p>
                    </div>
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-start gap-3">
                <div className="rounded-xl bg-violet-100 p-3 text-violet-700">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">{t('step_settings', 'admin-import')}</p>
                  <h2 className="mt-1 text-xl font-bold text-slate-950">{t('modes_label', 'admin-import')}</h2>
                  <p className="mt-1 text-sm text-slate-500">{t('preview_desc', 'admin-import')}</p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">{t('mode_label', 'admin-import')}</span>
                  <select
                    value={mode}
                    onChange={(event) => setMode(event.target.value as ImportMode)}
                    className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    disabled={isImporting}
                  >
                    <option value="upsert">{t('mode_upsert_desc', 'admin-import')}</option>
                    <option value="insert">{t('mode_insert_desc', 'admin-import')}</option>
                    <option value="update">{t('mode_update_desc', 'admin-import')}</option>
                  </select>
                </label>
                <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
                  <p className="text-sm font-semibold text-emerald-900">{t('safe_check_title', 'admin-import')}</p>
                  <p className="mt-1 text-xs leading-5 text-emerald-800">{t('safe_check_description', 'admin-import')}</p>
                </div>
              </div>

              <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 transition hover:border-blue-300 hover:bg-blue-50/40">
                <input
                  type="checkbox"
                  checked={dryRun}
                  onChange={(event) => setDryRun(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-blue-600"
                  disabled={isImporting}
                />
                <span>
                  <span className="block text-sm font-semibold text-slate-900">{t('dry_run_label', 'admin-import')}</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">{t('dry_run_description', 'admin-import')}</span>
                </span>
              </label>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button
                  type="button"
                  onClick={() => handleImport(dryRun)}
                  disabled={!selectedFile || isImporting}
                  className="h-11 bg-blue-600 px-6 text-white hover:bg-blue-700"
                >
                  {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : dryRun ? <ShieldCheck className="h-4 w-4" /> : <UploadCloud className="h-4 w-4" />}
                  {isImporting ? t('processing', 'admin-import') : dryRun ? t('preview', 'admin-import') : t('start_import', 'admin-import')}
                </Button>
                {!selectedFile && <span className="text-xs text-slate-500">{t('choose_file_first', 'admin-import')}</span>}
              </div>
            </section>

            {isPreviewResult && (
              <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
                <div className="flex items-start gap-3">
                  <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                  <div className="flex-1">
                    <h2 className="font-bold text-amber-950">{t('dry_run_complete_title', 'admin-import')}</h2>
                    <p className="mt-1 text-sm text-amber-800">{t('dry_run_complete_description', 'admin-import')}</p>
                    <Button
                      type="button"
                      onClick={() => handleImport(false)}
                      disabled={isImporting}
                      className="mt-4 h-10 bg-amber-600 text-white hover:bg-amber-700"
                    >
                      {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      {t('confirm_import', 'admin-import')}
                    </Button>
                  </div>
                </div>
              </section>
            )}

            {result && (
              <section className={`rounded-2xl border p-6 shadow-sm ${hasImportErrors ? 'border-red-200 bg-red-50' : result.success ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                <div className="flex items-start gap-3">
                  {hasImportErrors || result.success === false ? <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />}
                  <div className="min-w-0 flex-1">
                    <h2 className="font-bold text-slate-950">{hasImportErrors || result.success === false ? t('import_failed', 'admin-import') : result.dryRun ? t('results_title', 'admin-import') : t('import_success', 'admin-import')}</h2>
                    {result.message && <p className="mt-1 text-sm text-slate-700">{result.message}</p>}
                  </div>
                </div>

                {(result.totalProducts !== undefined || result.results) && (
                  <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      [t('total_products_label', 'admin-import'), result.totalProducts ?? 0, 'text-slate-900'],
                      [t('inserted_label', 'admin-import'), result.results?.inserted ?? 0, 'text-emerald-700'],
                      [t('updated_label', 'admin-import'), result.results?.updated ?? 0, 'text-blue-700'],
                      [t('skipped_or_error', 'admin-import'), (result.results?.skipped ?? 0) + (result.errors?.length ?? 0), 'text-red-700'],
                    ].map(([label, value, color]) => (
                      <div key={String(label)} className="rounded-xl border border-white/80 bg-white p-3">
                        <p className="text-xs text-slate-500">{label}</p>
                        <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
                      </div>
                    ))}
                  </div>
                )}

                {result.errors && result.errors.length > 0 && (
                  <div className="mt-5 rounded-xl border border-red-200 bg-white p-4">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-800">
                      <FileWarning className="h-4 w-4" />
                      {t('error_details_label', 'admin-import')} ({result.errors.length})
                    </div>
                    <ul className="max-h-56 space-y-2 overflow-auto text-sm text-red-700">
                      {result.errors.slice(0, 20).map((error, index) => <li key={index}>• {formatIssue(error)}</li>)}
                    </ul>
                  </div>
                )}

                {result.warnings && result.warnings.length > 0 && (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-white p-4 text-sm text-amber-800">
                    <p className="font-semibold">{t('warnings_title', 'admin-import')} ({result.warnings.length})</p>
                    <ul className="mt-2 space-y-1">
                      {result.warnings.slice(0, 10).map((warning, index) => <li key={index}>• {formatIssue(warning)}</li>)}
                    </ul>
                  </div>
                )}

                {result.preview && (
                  <details className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-700">{t('preview_first_3', 'admin-import')}</summary>
                    <pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(result.preview, null, 2)}</pre>
                  </details>
                )}
              </section>
            )}
          </main>

          <aside className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-slate-950">
                <Info className="h-5 w-5 text-blue-600" />
                <h2 className="font-bold">{t('valid_file_title', 'admin-import')}</h2>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">{t('zip_root_description', 'admin-import')}</p>
              <div className="mt-3 space-y-2">
                {[t('required_products_file', 'admin-import'), t('required_product_fields', 'admin-import'), t('required_currency_image', 'admin-import'), t('required_description_stock', 'admin-import'), t('required_specs', 'admin-import')].map((item) => (
                  <div key={item} className="flex items-start gap-2 text-sm text-slate-700">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-500">{t('zip_compatibility_note', 'admin-import')}</div>
            </section>

            <section className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
              <div className="flex items-center gap-2 text-blue-950">
                <ShieldCheck className="h-5 w-5 text-blue-700" />
                <h2 className="font-bold">{t('safe_process_title', 'admin-import')}</h2>
              </div>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-blue-900">
                <li>1. {t('safe_process_step_1', 'admin-import')}</li>
                <li>2. {t('safe_process_step_2', 'admin-import')}</li>
                <li>3. {t('safe_process_step_3', 'admin-import')}</li>
                <li>4. {t('safe_process_step_4', 'admin-import')}</li>
              </ul>
            </section>

            {guide?.requiredFields?.length > 0 && (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="font-bold text-slate-950">{t('required_fields_server_title', 'admin-import')}</h2>
                <p className="mt-2 text-xs leading-5 text-slate-500">{t('required_fields_server_description', 'admin-import')}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {guide.requiredFields.map((field: string) => <span key={field} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{field}</span>)}
                </div>
              </section>
            )}
          </aside>
        </div>

        <section className="mt-8 rounded-2xl border border-purple-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <div className="flex items-center gap-2 text-purple-700"><FileCheck2 className="h-5 w-5" /><h2 className="font-bold text-slate-950">{t('translation_import_title', 'admin-import')}</h2></div>
              <p className="mt-1 text-sm text-slate-500">{t('translation_import_description', 'admin-import')}</p>
            </div>
            <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-purple-700 has-[:disabled]:opacity-60">
              <input type="file" accept=".json,application/json" onChange={handleTranslationFileUpload} className="hidden" disabled={isTranslationLoading} />
              {isTranslationLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              {t('choose_json_file', 'admin-import')}
            </label>
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={replaceManualTranslations} onChange={(event) => setReplaceManualTranslations(event.target.checked)} disabled={isTranslationLoading} className="h-4 w-4 accent-purple-600" />
            {t('replace_manual_translations', 'admin-import')}
          </label>
          {translationResult && (
            <div className={`mt-4 rounded-xl border p-4 ${translationResult.success ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
              <p className="text-sm font-medium text-slate-800">{translationResult.message}</p>
              {translationResult.success && <p className="mt-1 text-xs text-slate-600">{translationResult.data?.importedCount ?? translationResult.data?.totalRecords ?? 0} {t('records_checked', 'admin-import')}</p>}
              {translationResult.dryRun && translationImport && <Button type="button" onClick={confirmTranslationImport} disabled={isTranslationLoading} className="mt-3 bg-purple-600 text-white hover:bg-purple-700">{isTranslationLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} {t('confirm_translation_import', 'admin-import')}</Button>}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default withAdminLayout(ImportProductsContent, {
  permission: 'admin',
  featureName: 'Import Products',
});
