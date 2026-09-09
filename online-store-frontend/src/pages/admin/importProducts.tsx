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
      toast.error(t('import.zip_only_error', 'admin', 'Chỉ được nhập file ZIP chứa đầy đủ dữ liệu sản phẩm.'));
      return false;
    }
    if (file.size === 0) {
      toast.error(t('import.empty_file_error', 'admin', 'File ZIP không được rỗng.'));
      return false;
    }
    if (file.size > MAX_IMPORT_ZIP_FILE_SIZE_BYTES) {
      toast.error(t('zip_max_size_label', 'admin', 'ZIP tối đa 100 MB'));
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
      toast.error(t('import.choose_file_first', 'admin', 'Hãy chọn file ZIP trước.'));
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
        throw new Error(t('import.upload_failed', 'admin', 'Không thể đọc kết quả từ máy chủ.'));
      }

      if (!response.ok || !data.success) {
        const message = data.message || getUserFriendlyErrorMessage({ code: (data as any).code }, t);
        setResult({ ...data, message, success: false });
        toast.error(message);
        return;
      }

      setResult(data);
      toast.success(data.message || t('import.upload_success', 'admin', 'Đã xử lý file ZIP thành công.'));
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
      toast.error(t('import.translation_json_only', 'admin', 'File bản dịch phải có định dạng JSON.'));
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
      toast.success(t('import.translation_preview_success', 'admin', 'Đã kiểm tra bản dịch; chưa có dữ liệu nào được ghi.'));
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
      toast.success(t('import.translation_success', 'admin', 'Đã import bản dịch sản phẩm.'));
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
    return details.length > 0 ? details.join(' · ') : t('review_error');
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
              {t('import_export_title', 'admin', 'Nhập / xuất dữ liệu')}
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              {t('products_title', 'admin', 'Nhập sản phẩm')}
            </h1>
            <p className="mt-2 max-w-2xl text-slate-600">
              {t('zip_import_description', 'admin', 'Tải lên file ZIP đã xuất từ hệ thống, kiểm tra dữ liệu trước rồi xác nhận nhập vào cửa hàng.')}
            </p>
          </div>
          <Link href="/admin/importExport">
            <Button variant="outline" className="bg-white">
              <ArrowLeft className="h-4 w-4" />
              {t('back', 'admin', 'Quay lại')}
            </Button>
          </Link>
        </div>

        <div className="mb-8 grid gap-3 sm:grid-cols-3">
          {[
            { number: '01', title: 'Chọn file', description: 'ZIP tối đa 100 MB', active: Boolean(selectedFile) },
            { number: '02', title: 'Kiểm tra', description: 'Xem trước dữ liệu', active: isPreviewResult },
            { number: '03', title: 'Xác nhận', description: 'Ghi vào cửa hàng', active: Boolean(result?.success && !result?.dryRun) },
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
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Bước 1</p>
                    <h2 className="mt-1 text-xl font-bold text-slate-950">Chọn file sản phẩm</h2>
                    <p className="mt-1 text-sm text-slate-500">Chỉ nhận ZIP có đầy đủ dữ liệu sản phẩm.</p>
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
                    {selectedFile ? 'Đổi file ZIP' : 'Kéo thả file ZIP vào đây'}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">hoặc bấm để chọn từ máy tính</p>
                  <p className="mt-4 text-xs font-medium text-slate-500">Định dạng .zip · Tối đa 100 MB</p>
                </div>

                {selectedFile && (
                  <div className="mt-4 flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
                    <div className="rounded-lg bg-white p-2 text-blue-600">
                      <FileCheck2 className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{selectedFile.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{formatBytes(selectedFile.size)} · Sẵn sàng kiểm tra</p>
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
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">Bước 2</p>
                  <h2 className="mt-1 text-xl font-bold text-slate-950">Cấu hình lượt nhập</h2>
                  <p className="mt-1 text-sm text-slate-500">Nên giữ chế độ xem trước để tránh ghi nhầm dữ liệu.</p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">Cách xử lý sản phẩm</span>
                  <select
                    value={mode}
                    onChange={(event) => setMode(event.target.value as ImportMode)}
                    className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    disabled={isImporting}
                  >
                    <option value="upsert">Cập nhật hoặc thêm mới</option>
                    <option value="insert">Chỉ thêm sản phẩm mới</option>
                    <option value="update">Chỉ cập nhật sản phẩm có sẵn</option>
                  </select>
                </label>
                <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
                  <p className="text-sm font-semibold text-emerald-900">Kiểm tra an toàn</p>
                  <p className="mt-1 text-xs leading-5 text-emerald-800">File sẽ được kiểm tra toàn bộ trước khi có dữ liệu được ghi.</p>
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
                  <span className="block text-sm font-semibold text-slate-900">Kiểm tra trước khi nhập</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">Khuyến nghị bật. Hệ thống sẽ hiển thị số lượng thêm mới, cập nhật và lỗi trước khi ghi dữ liệu.</span>
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
                  {isImporting ? 'Đang kiểm tra...' : dryRun ? 'Kiểm tra file ZIP' : 'Nhập sản phẩm'}
                </Button>
                {!selectedFile && <span className="text-xs text-slate-500">Chọn file ZIP để tiếp tục.</span>}
              </div>
            </section>

            {isPreviewResult && (
              <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
                <div className="flex items-start gap-3">
                  <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                  <div className="flex-1">
                    <h2 className="font-bold text-amber-950">Đã kiểm tra, chưa ghi dữ liệu</h2>
                    <p className="mt-1 text-sm text-amber-800">Nếu kết quả bên dưới chính xác, hãy xác nhận để nhập sản phẩm vào cửa hàng.</p>
                    <Button
                      type="button"
                      onClick={() => handleImport(false)}
                      disabled={isImporting}
                      className="mt-4 h-10 bg-amber-600 text-white hover:bg-amber-700"
                    >
                      {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Xác nhận nhập chính thức
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
                    <h2 className="font-bold text-slate-950">{hasImportErrors || result.success === false ? 'Nhập sản phẩm chưa thành công' : result.dryRun ? 'Kết quả kiểm tra' : 'Nhập sản phẩm thành công'}</h2>
                    {result.message && <p className="mt-1 text-sm text-slate-700">{result.message}</p>}
                  </div>
                </div>

                {(result.totalProducts !== undefined || result.results) && (
                  <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      ['Tổng sản phẩm', result.totalProducts ?? 0, 'text-slate-900'],
                      ['Thêm mới', result.results?.inserted ?? 0, 'text-emerald-700'],
                      ['Cập nhật', result.results?.updated ?? 0, 'text-blue-700'],
                      ['Bỏ qua / lỗi', (result.results?.skipped ?? 0) + (result.errors?.length ?? 0), 'text-red-700'],
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
                      Chi tiết lỗi ({result.errors.length})
                    </div>
                    <ul className="max-h-56 space-y-2 overflow-auto text-sm text-red-700">
                      {result.errors.slice(0, 20).map((error, index) => <li key={index}>• {formatIssue(error)}</li>)}
                    </ul>
                  </div>
                )}

                {result.warnings && result.warnings.length > 0 && (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-white p-4 text-sm text-amber-800">
                    <p className="font-semibold">Cảnh báo ({result.warnings.length})</p>
                    <ul className="mt-2 space-y-1">
                      {result.warnings.slice(0, 10).map((warning, index) => <li key={index}>• {formatIssue(warning)}</li>)}
                    </ul>
                  </div>
                )}

                {result.preview && (
                  <details className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-700">Xem 3 sản phẩm đầu tiên</summary>
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
                <h2 className="font-bold">File hợp lệ cần có</h2>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">ZIP phải chứa đúng một file dữ liệu ở thư mục gốc:</p>
              <div className="mt-3 space-y-2">
                {['products.json hoặc products.csv', 'name, brand, price, category', 'baseCurrencyCode và image', 'description và countInStock', 'specs nếu có phải là object hợp lệ'].map((item) => (
                  <div key={item} className="flex items-start gap-2 text-sm text-slate-700">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-500">File ZIP được xuất trực tiếp từ chức năng Xuất sản phẩm sẽ tương thích tốt nhất.</div>
            </section>

            <section className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
              <div className="flex items-center gap-2 text-blue-950">
                <ShieldCheck className="h-5 w-5 text-blue-700" />
                <h2 className="font-bold">Quy trình an toàn</h2>
              </div>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-blue-900">
                <li>1. Kiểm tra cấu trúc ZIP</li>
                <li>2. Kiểm tra toàn bộ sản phẩm</li>
                <li>3. Xem trước kết quả</li>
                <li>4. Xác nhận mới ghi dữ liệu</li>
              </ul>
            </section>

            {guide?.requiredFields?.length > 0 && (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="font-bold text-slate-950">Trường bắt buộc từ máy chủ</h2>
                <p className="mt-2 text-xs leading-5 text-slate-500">Danh sách này được lấy trực tiếp từ API hướng dẫn nhập.</p>
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
              <div className="flex items-center gap-2 text-purple-700"><FileCheck2 className="h-5 w-5" /><h2 className="font-bold text-slate-950">Import bản dịch sản phẩm</h2></div>
              <p className="mt-1 text-sm text-slate-500">Luồng riêng dành cho file JSON bản dịch, không thay đổi dữ liệu sản phẩm chính.</p>
            </div>
            <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-purple-700 has-[:disabled]:opacity-60">
              <input type="file" accept=".json,application/json" onChange={handleTranslationFileUpload} className="hidden" disabled={isTranslationLoading} />
              {isTranslationLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              Chọn file JSON
            </label>
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={replaceManualTranslations} onChange={(event) => setReplaceManualTranslations(event.target.checked)} disabled={isTranslationLoading} className="h-4 w-4 accent-purple-600" />
            Cho phép ghi đè bản dịch thủ công
          </label>
          {translationResult && (
            <div className={`mt-4 rounded-xl border p-4 ${translationResult.success ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
              <p className="text-sm font-medium text-slate-800">{translationResult.message}</p>
              {translationResult.success && <p className="mt-1 text-xs text-slate-600">{translationResult.data?.importedCount ?? translationResult.data?.totalRecords ?? 0} bản ghi đã kiểm tra</p>}
              {translationResult.dryRun && translationImport && <Button type="button" onClick={confirmTranslationImport} disabled={isTranslationLoading} className="mt-3 bg-purple-600 text-white hover:bg-purple-700">{isTranslationLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Xác nhận import bản dịch</Button>}
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
