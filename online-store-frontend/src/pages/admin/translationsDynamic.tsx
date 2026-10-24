import { useCallback, useEffect, useRef, useState } from "react";
import { withAdminLayout } from "../../components/admin/withAdminLayout";
import { Search, Globe, Save, ChevronDown, RotateCcw, Download, Upload } from "lucide-react";
import { getImageUrl } from "../../lib/utils";
import { getAuthToken } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { toast } from "sonner";
import { PermissionDenied } from "../../components/admin/PermissionDenied";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Pagination } from "../../components/admin/Pagination";
import { useAuth } from "../../lib/context/AuthContext";
import { useTranslation } from "@/lib/i18n";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, Locale } from "../../lib/i18n/types";
import type { ProductDescriptionImage, ProductPromotion } from "../../lib/data";

const INITIAL_TRANSLATION_LOCALE = SUPPORTED_LOCALES.find((code) => code !== DEFAULT_LOCALE) || DEFAULT_LOCALE;
const RETRANSLATION_LOCALES = SUPPORTED_LOCALES.filter((code) => code !== DEFAULT_LOCALE);
const RETRANSLATE_TIMEOUT_MS = 5 * 60_000;
// The Next.js rewrite proxy gives up on a request after ~30s and answers with a
// plain-text 5xx (no JSON body), which surfaced as "Không thể kiểm tra gói dịch."
// A dry run validates every translated field against the source (~1.2s per
// record), so a full 51-record file in one request took ~46s. Batches of 10 stay
// around 14s worst case, and a batch that still times out is halved and retried.
const ASSISTANT_BATCH_RECORDS_PER_CHUNK = 10;
const ASSISTANT_BATCH_MIN_RECORDS_PER_CHUNK = 2;
const ASSISTANT_BATCH_PRODUCTS_PER_EXPORT = 50;

const TRANSLATION_STATUS_CLASSES = {
  missing: 'bg-gray-100 text-gray-700',
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  needs_retranslate: 'bg-orange-100 text-orange-800',
  rejected: 'bg-red-100 text-red-800',
} as const;

const getLanguages = (t: (key: string, ns?: string) => string) =>
  SUPPORTED_LOCALES.filter((code) => code !== DEFAULT_LOCALE).map((code: Locale) => {
    const langKey = `language_${code}`;
    const langName = t(langKey, 'productsTranslations');
    // Fallback to key if translation not found (shouldn't happen)
    return {
      code,
      name: langName && langName !== langKey ? langName : code.toUpperCase(),
    };
  });

interface ProductTranslation {
  name?: string;
  description?: string;
  brand?: string;
  specs?: Record<string, string>;
  technicalDescription?: string;
  descriptionImages?: ProductDescriptionImage[];
  promotions?: ProductPromotion[];
}

interface TranslationStatus {
  status: 'missing' | 'pending' | 'approved' | 'needs_retranslate' | 'rejected';
  provider?: string;
  providerSource?: string;
  manualFields: string[];
  updatedAt: string | null;
  validationErrors: string[];
  canApprove?: boolean;
  requiresInconsistencyConfirmation?: boolean;
  canRetranslate?: boolean;
}

export function ProductsTranslationsAdminContent() {
  const { isAdmin } = useAuth();
  const { t, loadNamespace, locale } = useTranslation();

  useEffect(() => {
    loadNamespace('productsTranslations');
  }, [loadNamespace]);

  const [products, setProducts] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<Locale>(INITIAL_TRANSLATION_LOCALE);
  const [translationStatuses, setTranslationStatuses] = useState<Record<string, TranslationStatus>>({});
  const productsFetchRequestRef = useRef(0);
  const statusFetchRequestRef = useRef(0);
  const retranslateLockRef = useRef(false);
  const [statusFilter, setStatusFilter] = useState<'all' | TranslationStatus['status']>('all');
  const [retranslatingProductId, setRetranslatingProductId] = useState<string | null>(null);
  const [retranslatingLocale, setRetranslatingLocale] = useState<Locale | null>(null);
  const [retranslationProgress, setRetranslationProgress] = useState<{ current: number; total: number } | null>(null);
  const [productToRetranslate, setProductToRetranslate] = useState<any | null>(null);
  const [selectedRetranslationLocales, setSelectedRetranslationLocales] = useState<Locale[]>([INITIAL_TRANSLATION_LOCALE]);
  const [retranslationProductStatuses, setRetranslationProductStatuses] = useState<Partial<Record<Locale, TranslationStatus>>>({});
  const [retranslationStatusErrors, setRetranslationStatusErrors] = useState<Partial<Record<Locale, boolean>>>({});
  const [retranslationStatusesLoading, setRetranslationStatusesLoading] = useState(false);
  const [assistantBatchPreview, setAssistantBatchPreview] = useState<any | null>(null);
  const [assistantProductToApprove, setAssistantProductToApprove] = useState<any | null>(null);
  const [confirmInconsistentApproval, setConfirmInconsistentApproval] = useState(false);
  const [inconsistencyReviewNote, setInconsistencyReviewNote] = useState('');
  const [isAssistantBatchProcessing, setIsAssistantBatchProcessing] = useState(false);
  const [assistantBatchFeedback, setAssistantBatchFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const assistantBatchInputRef = useRef<HTMLInputElement>(null);
  const itemsPerPage = 10;

  // Fetch products with app locale language (left side follows global language)
  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++productsFetchRequestRef.current;
    const fetchProducts = async () => {
      if (!isAdmin) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const params = new URLSearchParams();
        params.append('pageNumber', currentPage.toString());
        params.append('pageSize', itemsPerPage.toString());
        if (searchQuery) params.append('keyword', searchQuery);
        params.append('lang', locale);

        const queryString = params.toString();
        const response = await fetch(`/api/products/admin/translations?${queryString}`, {
          headers: {
            'Authorization': `Bearer ${getAuthToken()}`,
          },
          credentials: 'include',
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`${t('load_failed', 'productsTranslations')} (${response.status})`);
        }

        const data = await response.json();
        if (requestId !== productsFetchRequestRef.current) return;
        setProducts(data.products || []);
        setTranslationStatuses({});
        setTotalPages(data.pages || 1);
      } catch (error) {
        if (controller.signal.aborted || requestId !== productsFetchRequestRef.current) return;
        toast.error(error instanceof Error ? error.message : t('load_failed', 'productsTranslations'));
      } finally {
        if (!controller.signal.aborted && requestId === productsFetchRequestRef.current) {
          setIsLoading(false);
        }
      }
    };

    const debounceTimer = setTimeout(fetchProducts, 300);

    return () => {
      clearTimeout(debounceTimer);
      controller.abort();
      if (productsFetchRequestRef.current === requestId) productsFetchRequestRef.current++;
    };
  }, [searchQuery, currentPage, locale, isAdmin, t]);

  const fetchStatuses = useCallback(async () => {
    const requestId = ++statusFetchRequestRef.current;
    if (!isAdmin || products.length === 0) {
      setTranslationStatuses({});
      return;
    }

    try {
      const productIds = products.map((product) => product._id).join(',');
      const response = await fetch(
        `/api/translations/admin/products/status?lang=${selectedLanguage}&productIds=${encodeURIComponent(productIds)}`,
        {
          headers: { Authorization: `Bearer ${getAuthToken()}` },
          credentials: 'include',
        }
      );
      if (!response.ok) {
        throw new Error(`${t('status_load_failed', 'productsTranslations')} (${response.status})`);
      }
      const data = await response.json();
      if (requestId !== statusFetchRequestRef.current) return;
      setTranslationStatuses(Object.fromEntries(
        (data.data || []).map((status: TranslationStatus & { productId: string }) => [status.productId, status])
      ));
    } catch (error) {
      if (requestId !== statusFetchRequestRef.current) return;
      toast.error(error instanceof Error ? error.message : t('status_load_failed', 'productsTranslations'));
    }
  }, [products, selectedLanguage, t, isAdmin]);
  const fetchStatusesRef = useRef(fetchStatuses);

  useEffect(() => {
    fetchStatusesRef.current = fetchStatuses;
  }, [fetchStatuses]);

  useEffect(() => {
    fetchStatuses();
    return () => {
      statusFetchRequestRef.current++;
    };
  }, [fetchStatuses]);

  useEffect(() => {
    if (!productToRetranslate) {
      setRetranslationProductStatuses({});
      setRetranslationStatusErrors({});
      setRetranslationStatusesLoading(false);
      return;
    }

    const controller = new AbortController();
    setRetranslationProductStatuses({});
    setRetranslationStatusErrors({});
    setRetranslationStatusesLoading(true);

    Promise.all(RETRANSLATION_LOCALES.map(async (lang) => {
      try {
        const response = await fetch(
          `/api/translations/admin/products/status?lang=${lang}&productIds=${encodeURIComponent(productToRetranslate._id)}`,
          {
            headers: { Authorization: `Bearer ${getAuthToken()}` },
            credentials: 'include',
            signal: controller.signal,
          }
        );
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.data?.[0]) throw new Error('Translation status unavailable');
        return [lang, data.data[0] as TranslationStatus] as const;
      } catch {
        return [lang, null] as const;
      }
    })).then((results) => {
      if (controller.signal.aborted) return;
      const statuses: Partial<Record<Locale, TranslationStatus>> = {};
      const errors: Partial<Record<Locale, boolean>> = {};
      results.forEach(([lang, status]) => {
        if (status) statuses[lang] = status;
        else errors[lang] = true;
      });
      setRetranslationProductStatuses(statuses);
      setRetranslationStatusErrors(errors);
    }).finally(() => {
      if (!controller.signal.aborted) setRetranslationStatusesLoading(false);
    });

    return () => controller.abort();
  }, [productToRetranslate]);

  const handleAssistantBatchExport = async () => {
    if (products.length === 0 || isAssistantBatchProcessing) return;
    setIsAssistantBatchProcessing(true);
    try {
      const params = new URLSearchParams({
        productIds: products.map((product) => product._id).join(','),
        languages: selectedLanguage,
      });
      const response = await fetch(`/api/translations/admin/products/assistant-batch/export?${params}`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || t('assistant_batch_export_failed', 'productsTranslations'));
      const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `assistant-translation-${selectedLanguage}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(t('assistant_batch_export_success', 'productsTranslations').replace('{count}', String(data.data.records.length)));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('assistant_batch_export_failed', 'productsTranslations'));
    } finally {
      setIsAssistantBatchProcessing(false);
    }
  };

  const handleAssistantBatchExportAll = async () => {
    if (isAssistantBatchProcessing) return;
    setIsAssistantBatchProcessing(true);
    try {
      setAssistantBatchFeedback({ type: 'info', message: t('assistant_batch_export_progress', 'productsTranslations') });
      const headers = { Authorization: `Bearer ${getAuthToken()}` };
      const firstPageResponse = await fetch('/api/products/admin/translations?pageNumber=1&pageSize=500', {
        headers,
        credentials: 'include',
      });
      const firstPageData = await firstPageResponse.json().catch(() => null);
      if (!firstPageResponse.ok) throw new Error(firstPageData?.message || t('assistant_batch_export_failed', 'productsTranslations'));
      const products = [...(firstPageData.products || [])];
      for (let page = 2; page <= (firstPageData.pages || 1); page++) {
        const pageResponse = await fetch(`/api/products/admin/translations?pageNumber=${page}&pageSize=500`, {
          headers,
          credentials: 'include',
        });
        const pageData = await pageResponse.json().catch(() => null);
        if (!pageResponse.ok) throw new Error(pageData?.message || t('assistant_batch_export_failed', 'productsTranslations'));
        products.push(...(pageData.products || []));
      }

      const records: unknown[] = [];
      const productIds = products.map((product) => product._id).filter(Boolean);
      const chunks = Math.ceil(productIds.length / ASSISTANT_BATCH_PRODUCTS_PER_EXPORT);
      for (let index = 0; index < chunks; index++) {
        setAssistantBatchFeedback({
          type: 'info',
          message: t('assistant_batch_export_progress_count', 'productsTranslations')
            .replace('{current}', String(index + 1))
            .replace('{total}', String(chunks)),
        });
        const params = new URLSearchParams({
          productIds: productIds.slice(index * ASSISTANT_BATCH_PRODUCTS_PER_EXPORT, (index + 1) * ASSISTANT_BATCH_PRODUCTS_PER_EXPORT).join(','),
          languages: RETRANSLATION_LOCALES.join(','),
        });
        const response = await fetch(`/api/translations/admin/products/assistant-batch/export?${params}`, {
          headers,
          credentials: 'include',
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.message || t('assistant_batch_export_failed', 'productsTranslations'));
        records.push(...(data.data?.records || []));
      }

      if (records.length === 0) {
        const message = t('assistant_batch_export_all_empty', 'productsTranslations');
        setAssistantBatchFeedback({ type: 'success', message });
        toast.info(message);
        return;
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const blob = new Blob([JSON.stringify({ workflow: 'assistant_batch', records }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `assistant-batch-all-products-${timestamp}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      const message = t('assistant_batch_export_all_success', 'productsTranslations')
        .replace('{products}', String(products.length))
        .replace('{records}', String(records.length));
      setAssistantBatchFeedback({ type: 'success', message });
      toast.success(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('assistant_batch_export_failed', 'productsTranslations');
      setAssistantBatchFeedback({ type: 'error', message });
      toast.error(message);
    } finally {
      setIsAssistantBatchProcessing(false);
    }
  };

  const handleAssistantBatchFile = async (file?: File) => {
    if (!file || isAssistantBatchProcessing) return;
    setIsAssistantBatchProcessing(true);
    setAssistantBatchFeedback({ type: 'info', message: t('assistant_batch_validating', 'productsTranslations') });
    try {
      const parsed = JSON.parse(await file.text());
      const records = parsed?.records;
      if (parsed?.workflow !== 'assistant_batch' || !Array.isArray(records) || records.length === 0) {
        throw new Error(t('assistant_batch_invalid_file', 'productsTranslations'));
      }
      const payloadRecords = records.map((record: any) => {
        if (!/^[a-f\d]{24}$/i.test(record?.productId || '')
          || !SUPPORTED_LOCALES.includes(record?.targetLang)
          || record.targetLang === DEFAULT_LOCALE
          || !/^[a-f\d]{64}$/i.test(record?.sourceHash || '')
          || !record?.translations || typeof record.translations !== 'object' || Array.isArray(record.translations)) {
          throw new Error(t('assistant_batch_invalid_file', 'productsTranslations'));
        }
        return {
          productId: record.productId,
          targetLang: record.targetLang,
          sourceHash: record.sourceHash,
          translations: record.translations,
        };
      });
      const chunks: Array<{ records: typeof payloadRecords; idempotencyKey: string; assistantBatch: true; dryRun: true; preview?: any; imported?: boolean }> = [];
      let aggregatePreview = { totalRecords: 0, validRecords: 0, wouldInsert: 0, wouldUpdate: 0, wouldSkip: 0, skippedManualFields: 0 };
      let chunkSize = ASSISTANT_BATCH_RECORDS_PER_CHUNK;
      for (let start = 0; start < payloadRecords.length;) {
        const recordsChunk = payloadRecords.slice(start, start + chunkSize);
        const chunkNumber = Math.floor(start / chunkSize) + 1;
        setAssistantBatchFeedback({
          type: 'info',
          message: t('assistant_batch_preview_progress', 'productsTranslations')
            .replace('{current}', String(chunkNumber))
            .replace('{total}', String(chunkNumber + Math.ceil((payloadRecords.length - start - chunkSize) / chunkSize))),
        });
        const payload = {
          records: recordsChunk,
          idempotencyKey: `assistant-batch-${Date.now()}-${start}-${Math.random().toString(36).slice(2)}`,
          assistantBatch: true as const,
          dryRun: true as const,
        };
        const response = await fetch('/api/translations/admin/products/import', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getAuthToken()}`,
          },
          body: JSON.stringify(payload),
          credentials: 'include',
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.data) {
          // A 5xx/504 with no JSON body comes from the Next.js -> backend
          // rewrite timing out, not from the file. Retry the same records as
          // smaller batches before reporting a failure.
          const isProxyFailure = !data && response.status >= 500;
          if (isProxyFailure && recordsChunk.length > ASSISTANT_BATCH_MIN_RECORDS_PER_CHUNK) {
            chunkSize = Math.max(ASSISTANT_BATCH_MIN_RECORDS_PER_CHUNK, Math.floor(recordsChunk.length / 2));
            continue;
          }
          const fallback = isProxyFailure
            ? `${t('assistant_batch_preview_failed', 'productsTranslations')} (HTTP ${response.status})`
            : t('assistant_batch_preview_failed', 'productsTranslations');
          throw new Error(data?.message || fallback);
        }
        chunks.push({ ...payload, preview: data.data });
        aggregatePreview = {
          totalRecords: aggregatePreview.totalRecords + (data.data?.totalRecords || 0),
          validRecords: aggregatePreview.validRecords + (data.data?.validRecords || 0),
          wouldInsert: aggregatePreview.wouldInsert + (data.data?.wouldInsert || 0),
          wouldUpdate: aggregatePreview.wouldUpdate + (data.data?.wouldUpdate || 0),
          wouldSkip: aggregatePreview.wouldSkip + (data.data?.wouldSkip || 0),
          skippedManualFields: aggregatePreview.skippedManualFields + (data.data?.skippedManualFields || 0),
        };
        start += recordsChunk.length;
      }
      const payload = {
        records: payloadRecords,
        chunks,
        idempotencyKey: `assistant-batch-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        assistantBatch: true,
        dryRun: true,
        preview: aggregatePreview,
      };
      setAssistantBatchPreview(payload);
      const successMessage = t('assistant_batch_preview', 'productsTranslations')
        .replace('{count}', String(aggregatePreview.totalRecords));
      setAssistantBatchFeedback({ type: 'success', message: successMessage });
      toast.success(successMessage);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('assistant_batch_invalid_file', 'productsTranslations');
      setAssistantBatchFeedback({ type: 'error', message });
      toast.error(message);
    } finally {
      setIsAssistantBatchProcessing(false);
      if (assistantBatchInputRef.current) assistantBatchInputRef.current.value = '';
    }
  };

  const importAssistantBatchChunks = async (onImported?: (count: number) => void) => {
    const chunks = assistantBatchPreview.chunks || [{
      records: assistantBatchPreview.records,
      idempotencyKey: assistantBatchPreview.idempotencyKey,
      imported: false,
    }];
    let importedCount = 0;
    for (const [index, chunk] of chunks.entries()) {
      if (chunk.imported) continue;
      setAssistantBatchFeedback({
        type: 'info',
        message: t('assistant_batch_import_progress', 'productsTranslations')
          .replace('{current}', String(index + 1))
          .replace('{total}', String(chunks.length)),
      });
      const response = await fetch('/api/translations/admin/products/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({
          records: chunk.records,
          idempotencyKey: chunk.idempotencyKey,
          assistantBatch: true,
          dryRun: false,
        }),
        credentials: 'include',
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || t('assistant_batch_import_failed', 'productsTranslations'));
      const chunkImportedCount = data.data?.importedCount || 0;
      importedCount += chunkImportedCount;
      onImported?.(chunkImportedCount);
      setAssistantBatchPreview((current: any) => current ? {
        ...current,
        chunks: (current.chunks || chunks).map((item: any, itemIndex: number) => (
          itemIndex === index ? { ...item, imported: true } : item
        )),
      } : current);
    }
    return importedCount;
  };

  const handleAssistantBatchImport = async () => {
    if (!assistantBatchPreview || isAssistantBatchProcessing) return;
    setIsAssistantBatchProcessing(true);
    try {
      const importedCount = await importAssistantBatchChunks();
      setAssistantBatchPreview(null);
      await fetchStatusesRef.current();
      const message = t('assistant_batch_import_success', 'productsTranslations').replace('{count}', String(importedCount));
      setAssistantBatchFeedback({ type: 'success', message });
      toast.success(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('assistant_batch_import_failed', 'productsTranslations');
      setAssistantBatchFeedback({ type: 'error', message });
      toast.error(message);
    } finally {
      setIsAssistantBatchProcessing(false);
    }
  };

  const handleAssistantBatchImportAndApprove = async (importFirst = true) => {
    if (!assistantBatchPreview || isAssistantBatchProcessing) return;
    setIsAssistantBatchProcessing(true);
    setAssistantBatchFeedback({
      type: 'info',
      message: t(importFirst ? 'assistant_batch_importing_and_approving' : 'assistant_batch_approving_existing', 'productsTranslations'),
    });
    let importSucceeded = false;
    let importedCount = 0;
    const records = assistantBatchPreview.records as Array<{ productId: string; targetLang: Locale }>;
    let approvedCount = 0;
    let alreadyApprovedCount = 0;
    let inconsistencyConfirmedCount = 0;
    let pendingReviewCount = 0;
    let failedApprovalCount = 0;
    let readinessRefreshFailed = false;

    try {
      if (importFirst) {
        await importAssistantBatchChunks((count) => {
          importedCount += count;
          importSucceeded = true;
        });
        setAssistantBatchPreview(null);
      }

      const approvalChunks = Array.from({ length: Math.ceil(records.length / ASSISTANT_BATCH_RECORDS_PER_CHUNK) }, (_, index) => (
        records.slice(index * ASSISTANT_BATCH_RECORDS_PER_CHUNK, (index + 1) * ASSISTANT_BATCH_RECORDS_PER_CHUNK)
      ));
      for (const [index, recordsChunk] of approvalChunks.entries()) {
        setAssistantBatchFeedback({
          type: 'info',
          message: t('assistant_batch_approval_progress', 'productsTranslations')
            .replace('{current}', String(index + 1))
            .replace('{total}', String(approvalChunks.length)),
        });
        try {
          const approvalResponse = await fetch('/api/translations/admin/products/assistant-approve-batch', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${getAuthToken()}`,
            },
            body: JSON.stringify({
              records: recordsChunk,
              confirmInconsistent: true,
              note: 'Admin explicitly accepted inconsistency during batch approval',
            }),
            credentials: 'include',
          });
          const approvalData = await approvalResponse.json().catch(() => null);
          if (!approvalResponse.ok || !approvalData?.data) {
            failedApprovalCount += recordsChunk.length;
            continue;
          }
          approvedCount += approvalData.data.approvedCount || 0;
          alreadyApprovedCount += approvalData.data.alreadyApprovedCount || 0;
          pendingReviewCount += approvalData.data.skippedCount || 0;
          readinessRefreshFailed = readinessRefreshFailed || approvalData.data.readinessRefreshFailed === true;
          inconsistencyConfirmedCount += (approvalData.data.results || []).filter((record: any) => (
            record.status === 'approved' && record.overriddenErrors?.includes('inconsistent')
          )).length;
        } catch {
          failedApprovalCount += recordsChunk.length;
        }
      }

      if (!importFirst) setAssistantBatchPreview(null);
      const resultMessage = t('assistant_batch_combined_result', 'productsTranslations')
        .replace('{approved}', String(approvedCount))
        .replace('{alreadyApproved}', String(alreadyApprovedCount))
        .replace('{total}', String(records.length))
        .replace('{overridden}', String(inconsistencyConfirmedCount))
        .replace('{pending}', String(pendingReviewCount))
        .replace('{failed}', String(failedApprovalCount));
      const feedbackType = failedApprovalCount > 0 || readinessRefreshFailed ? 'error' : pendingReviewCount > 0 ? 'info' : 'success';
      setAssistantBatchFeedback({ type: feedbackType, message: resultMessage });
      if (feedbackType === 'success') toast.success(resultMessage);
      else if (feedbackType === 'error') toast.error(resultMessage);
      else toast.info(resultMessage);
      try {
        await fetchStatusesRef.current();
      } catch {
        toast.error(t('status_load_failed', 'productsTranslations'));
      }
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : t(importFirst ? 'assistant_batch_import_failed' : 'assistant_batch_approval_failed', 'productsTranslations');
      const resultMessage = importSucceeded
        ? `${t('assistant_batch_import_success', 'productsTranslations').replace('{count}', String(importedCount))} ${message}`
        : message;
      setAssistantBatchFeedback({ type: 'error', message: resultMessage });
      toast.error(resultMessage);
    } finally {
      setIsAssistantBatchProcessing(false);
    }
  };

  const handleAssistantApprove = async () => {
    if (!assistantProductToApprove || isAssistantBatchProcessing) return;
    setIsAssistantBatchProcessing(true);
    try {
      const requiresConfirmation = translationStatuses[assistantProductToApprove._id]?.requiresInconsistencyConfirmation;
      const response = await fetch(`/api/translations/admin/products/${assistantProductToApprove._id}/assistant-approve?lang=${selectedLanguage}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify(requiresConfirmation ? {
          confirmInconsistent: confirmInconsistentApproval,
          note: inconsistencyReviewNote,
        } : {}),
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || t('assistant_batch_approval_failed', 'productsTranslations'));
      setAssistantProductToApprove(null);
      setConfirmInconsistentApproval(false);
      setInconsistencyReviewNote('');
      setTranslationStatuses((current) => ({
        ...current,
        [assistantProductToApprove._id]: {
          ...current[assistantProductToApprove._id],
          status: 'approved',
          validationErrors: [],
          canApprove: false,
          requiresInconsistencyConfirmation: false,
          updatedAt: data.data.approvedAt || current[assistantProductToApprove._id]?.updatedAt || null,
        },
      }));
      toast.success(t('assistant_batch_approved', 'productsTranslations'));
      void fetchStatusesRef.current();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('assistant_batch_approval_failed', 'productsTranslations'));
    } finally {
      setIsAssistantBatchProcessing(false);
    }
  };

  if (!isAdmin) {
    return <PermissionDenied feature="translations_dynamic" />;
  }

  const handleSaveTranslations = async (productId: string, translations: ProductTranslation) => {
    try {
      setIsSubmitting(true);
      const token = getAuthToken();

      const response = await fetch(`/api/translations/admin/products/${productId}?lang=${selectedLanguage}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(translations),
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || error.error || t('save_failed', 'productsTranslations'));
      }

      const data = await response.json();
      setTranslationStatuses((current) => ({
        ...current,
        [productId]: {
          status: data.data.qualityStatus,
          manualFields: data.data.manualFields || [],
          updatedAt: data.data.updatedAt || data.data.lastTranslatedAt || null,
          validationErrors: data.data.validationErrors || [],
        },
      }));
      await fetchStatusesRef.current();
      toast.success(t('save_success', 'productsTranslations'));
      setEditingProductId(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('save_failed', 'productsTranslations'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const visibleProducts = statusFilter === 'all'
    ? products
    : products.filter((product) => translationStatuses[product._id]?.status === statusFilter);

  const handleRetranslate = async () => {
    if (!productToRetranslate || retranslateLockRef.current) return;
    const product = productToRetranslate;
    const locales = RETRANSLATION_LOCALES.filter((lang) => selectedRetranslationLocales.includes(lang));
    if (locales.length === 0) return;
    retranslateLockRef.current = true;
    setProductToRetranslate(null);
    setRetranslatingProductId(product._id);
    setRetranslationProgress({ current: 0, total: locales.length });

    const results: Array<{
      lang: Locale;
      status?: TranslationStatus['status'];
      validationErrors?: string[];
      skipped?: boolean;
      error?: string;
    }> = [];

    try {
      for (const [index, lang] of locales.entries()) {
        setRetranslatingLocale(lang);
        setRetranslationProgress({ current: index + 1, total: locales.length });
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), RETRANSLATE_TIMEOUT_MS);
        try {
          const response = await fetch(`/api/translations/admin/products/${product._id}/retranslate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${getAuthToken()}`,
            },
            body: JSON.stringify({ lang, force: true }),
            credentials: 'include',
            signal: controller.signal,
          });
          const data = await response.json().catch(() => null);
          if (!response.ok) {
            results.push({
              lang,
              error: data?.message || `${t('retranslate_failed', 'productsTranslations')} (${response.status})`,
            });
            continue;
          }
          results.push({
            lang,
            status: data.data.status,
            validationErrors: data.data.validationErrors || [],
            skipped: data.data.skipped,
          });
        } catch (error) {
          results.push({
            lang,
            error: error instanceof Error && error.name === 'AbortError'
              ? t('retranslate_timeout', 'productsTranslations')
              : error instanceof Error ? error.message : t('retranslate_failed', 'productsTranslations'),
          });
        } finally {
          clearTimeout(timeoutId);
        }
      }

      await fetchStatusesRef.current();
      const languageNames = new Map(getLanguages(t).map(({ code, name }) => [code, name]));
      const needsReview = results.filter(({ status, validationErrors }) => (
        status !== undefined && (status !== 'approved' || (validationErrors || []).length > 0)
      ));
      const failed = results.filter(({ error }) => error);
      const details = [
        ...needsReview.map(({ lang, status, validationErrors }) => (
          `${languageNames.get(lang) || lang}: ${t(`status_${status}`, 'productsTranslations')}${validationErrors?.length ? ` (${validationErrors.join(', ')})` : ''}`
        )),
        ...failed.map(({ lang, error }) => `${languageNames.get(lang) || lang}: ${error}`),
      ];

      if (failed.length > 0) {
        toast.error(failed[0].error || t('retranslate_failed', 'productsTranslations'), details.length > 0 ? { description: details.join('; ') } : undefined);
      } else if (needsReview.length > 0) {
        toast.info(t('retranslate_success', 'productsTranslations'), { description: details.join('; ') });
      } else if (results.every(({ skipped }) => skipped)) {
        toast.info(t('retranslate_not_needed', 'productsTranslations'));
      } else {
        toast.success(t('retranslate_success', 'productsTranslations'));
      }
    } finally {
      retranslateLockRef.current = false;
      setRetranslatingProductId(null);
      setRetranslatingLocale(null);
      setRetranslationProgress(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
          <Globe className="w-8 h-8 text-blue-600" />
          {t('title', 'productsTranslations')}
        </h1>
        <p className="text-gray-600">{t('subtitle', 'productsTranslations')}</p>
      </div>

      {/* Search */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder={t('search_placeholder', 'productsTranslations')}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-10 transition-colors focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={selectedLanguage}
          onChange={(event) => {
            setSelectedLanguage(event.target.value as Locale);
            setTranslationStatuses({});
            setCurrentPage(1);
          }}
          disabled={isSubmitting || retranslatingProductId !== null}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 transition-colors hover:border-blue-400 focus:ring-2 focus:ring-blue-500"
          aria-label={t('translation_language_label', 'productsTranslations')}
        >
          {getLanguages(t).map((language) => (
            <option key={language.code} value={language.code}>{language.name}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value as 'all' | TranslationStatus['status']);
            setCurrentPage(1);
          }}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 transition-colors hover:border-blue-400 focus:ring-2 focus:ring-blue-500"
          aria-label={t('status_filter_label', 'productsTranslations')}
        >
          <option value="all">{t('status_all', 'productsTranslations')}</option>
          <option value="missing">{t('status_missing', 'productsTranslations')}</option>
          <option value="pending">{t('status_pending', 'productsTranslations')}</option>
          <option value="approved">{t('status_approved', 'productsTranslations')}</option>
          <option value="needs_retranslate">{t('status_needs_retranslate', 'productsTranslations')}</option>
          <option value="rejected">{t('status_rejected', 'productsTranslations')}</option>
        </select>
      </div>

      <section className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <p className="mr-auto text-sm text-indigo-900">{t('assistant_batch_help', 'productsTranslations')}</p>
          <p className="w-full text-xs text-indigo-800">{t('assistant_batch_export_all_help', 'productsTranslations')}</p>
          <Button variant="outline" onClick={handleAssistantBatchExport} disabled={products.length === 0 || isAssistantBatchProcessing}>
            <Download className="mr-2 h-4 w-4" />{t('assistant_batch_export', 'productsTranslations')}
          </Button>
          <Button variant="outline" onClick={handleAssistantBatchExportAll} disabled={isAssistantBatchProcessing}>
            <Download className="mr-2 h-4 w-4" />{t('assistant_batch_export_all', 'productsTranslations')}
          </Button>
          <input
            ref={assistantBatchInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => handleAssistantBatchFile(event.target.files?.[0])}
          />
          <Button variant="outline" onClick={() => assistantBatchInputRef.current?.click()} disabled={isAssistantBatchProcessing}>
            <Upload className="mr-2 h-4 w-4" />{t('assistant_batch_upload', 'productsTranslations')}
          </Button>
        </div>
        {assistantBatchFeedback && (
          <p
            role={assistantBatchFeedback.type === 'error' ? 'alert' : 'status'}
            aria-live={assistantBatchFeedback.type === 'error' ? 'assertive' : 'polite'}
            className={`rounded-md px-3 py-2 text-sm ${
              assistantBatchFeedback.type === 'error'
                ? 'bg-red-100 text-red-800'
                : assistantBatchFeedback.type === 'success'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-blue-100 text-blue-800'
            }`}
          >
            {assistantBatchFeedback.message}
          </p>
        )}
        {assistantBatchPreview && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-white p-3">
            <div className="mr-auto">
              <p className="text-sm text-amber-900">
                {t('assistant_batch_preview', 'productsTranslations')
                  .replace('{count}', String(assistantBatchPreview.preview?.totalRecords || 0))}
              </p>
              <p className="mt-1 text-xs text-gray-600">{t('assistant_batch_combined_help', 'productsTranslations')}</p>
            </div>
            <Button variant="outline" onClick={() => setAssistantBatchPreview(null)} disabled={isAssistantBatchProcessing}>
              {t('cancel_button', 'productsTranslations')}
            </Button>
            <Button variant="outline" onClick={handleAssistantBatchImport} disabled={isAssistantBatchProcessing || !assistantBatchPreview.preview?.validRecords}>
              {isAssistantBatchProcessing ? t('assistant_batch_importing', 'productsTranslations') : t('assistant_batch_import', 'productsTranslations')}
            </Button>
            <Button variant="outline" onClick={() => handleAssistantBatchImportAndApprove(false)} disabled={isAssistantBatchProcessing || !assistantBatchPreview.preview?.validRecords}>
              {isAssistantBatchProcessing ? t('assistant_batch_processing', 'productsTranslations') : t('assistant_batch_approve_existing', 'productsTranslations')}
            </Button>
            <Button onClick={() => handleAssistantBatchImportAndApprove()} disabled={isAssistantBatchProcessing || !assistantBatchPreview.preview?.validRecords}>
              {isAssistantBatchProcessing ? t('assistant_batch_processing', 'productsTranslations') : t('assistant_batch_import_and_approve', 'productsTranslations')}
            </Button>
          </div>
        )}
      </section>

      {/* Products List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="text-gray-500">{t('loading', 'productsTranslations')}</div>
          </div>
        ) : visibleProducts.length === 0 ? (
          <div className="flex justify-center py-12">
            <div className="text-gray-500">{t('no_products', 'productsTranslations')}</div>
          </div>
        ) : (
          visibleProducts.map((product) => (
            <ProductTranslationCard
              key={product._id}
              product={product}
              isEditing={editingProductId === product._id}
              selectedLanguage={selectedLanguage}
              onLanguageChange={(lang) => {
                setSelectedLanguage(lang as Locale);
                setTranslationStatuses({});
              }}
              onEdit={() => setEditingProductId(product._id)}
              onCancel={() => setEditingProductId(null)}
              onSave={(translations) => handleSaveTranslations(product._id, translations)}
              onApproveAssistant={() => {
                setConfirmInconsistentApproval(false);
                setInconsistencyReviewNote('');
                setAssistantProductToApprove(product);
              }}
              isSubmitting={isSubmitting}
              translationStatus={translationStatuses[product._id]}
              isRetranslating={retranslatingProductId === product._id}
              isRetranslationBusy={retranslatingProductId !== null}
              retranslatingLocale={retranslatingProductId === product._id ? retranslatingLocale : null}
              retranslationProgress={retranslatingProductId === product._id ? retranslationProgress : null}
              onRetranslate={() => {
                setSelectedRetranslationLocales([selectedLanguage]);
                setProductToRetranslate(product);
              }}
            />
          ))
        )}
      </div>

      <Dialog open={Boolean(assistantProductToApprove)} onOpenChange={(open) => {
        if (!open) {
          setAssistantProductToApprove(null);
          setConfirmInconsistentApproval(false);
          setInconsistencyReviewNote('');
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('assistant_batch_approve', 'productsTranslations')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            {t('assistant_batch_approve_confirm', 'productsTranslations').replace('{name}', assistantProductToApprove?.name || '')}
          </p>
          {translationStatuses[assistantProductToApprove?._id]?.requiresInconsistencyConfirmation && (
            <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              <p>{t('assistant_batch_inconsistency_warning', 'productsTranslations')}</p>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={confirmInconsistentApproval}
                  onChange={(event) => setConfirmInconsistentApproval(event.target.checked)}
                />
                <span>{t('assistant_batch_inconsistency_confirm', 'productsTranslations')}</span>
              </label>
              <Input
                value={inconsistencyReviewNote}
                onChange={(event) => setInconsistencyReviewNote(event.target.value)}
                placeholder={t('assistant_batch_inconsistency_note', 'productsTranslations')}
                aria-label={t('assistant_batch_inconsistency_note', 'productsTranslations')}
                maxLength={500}
              />
              {(!confirmInconsistentApproval || inconsistencyReviewNote.trim().length < 10) && (
                <p className="text-xs" role="status">
                  {t('assistant_batch_inconsistency_requirement', 'productsTranslations')}
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssistantProductToApprove(null)} disabled={isAssistantBatchProcessing}>
              {t('cancel_button', 'productsTranslations')}
            </Button>
            <Button
              onClick={handleAssistantApprove}
              disabled={isAssistantBatchProcessing || (
                Boolean(translationStatuses[assistantProductToApprove?._id]?.requiresInconsistencyConfirmation)
                && (!confirmInconsistentApproval || inconsistencyReviewNote.trim().length < 10)
              )}
            >
              {isAssistantBatchProcessing ? t('assistant_batch_approving', 'productsTranslations') : t('assistant_batch_approve', 'productsTranslations')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(productToRetranslate)} onOpenChange={(open) => !open && setProductToRetranslate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('retranslate_button', 'productsTranslations')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            {t('retranslate_confirm', 'productsTranslations').replace('{name}', productToRetranslate?.name || '')}
          </p>
          <section className="space-y-2" aria-label={t('retranslate_current_statuses', 'productsTranslations')}>
            <h3 className="text-sm font-medium text-gray-900">
              {t('retranslate_current_statuses', 'productsTranslations')}
            </h3>
            {retranslationStatusesLoading ? (
              <p className="text-sm text-gray-500">{t('loading', 'productsTranslations')}</p>
            ) : (
              <div className="grid max-h-40 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-4">
                {getLanguages(t).map(({ code, name }) => {
                  const status = retranslationProductStatuses[code]?.status || 'missing';
                  const statusClasses = {
                    missing: 'bg-gray-100 text-gray-700',
                    pending: 'bg-yellow-100 text-yellow-800',
                    approved: 'bg-green-100 text-green-800',
                    needs_retranslate: 'bg-orange-100 text-orange-800',
                    rejected: 'bg-red-100 text-red-800',
                  };
                  return (
                    <div key={code} className="rounded-md border bg-white p-2">
                      <p className="truncate text-xs text-gray-600" title={name}>{name}</p>
                      <span className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-medium ${statusClasses[status]}`}>
                        {retranslationStatusErrors[code]
                          ? t('retranslate_status_failed', 'productsTranslations')
                          : t(`status_${status}`, 'productsTranslations')}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-gray-900">
              {t('retranslate_language_selection', 'productsTranslations')}
            </legend>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSelectedRetranslationLocales((current) => (
                  current.length === RETRANSLATION_LOCALES.length ? [] : [...RETRANSLATION_LOCALES]
                ))}
              >
                {selectedRetranslationLocales.length === RETRANSLATION_LOCALES.length
                  ? t('retranslate_clear_languages', 'productsTranslations')
                  : t('retranslate_select_all_languages', 'productsTranslations')}
              </Button>
            </div>
            <div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto rounded-md border p-3">
              {getLanguages(t).map(({ code, name }) => (
                <label key={code} htmlFor={`retranslate-language-${code}`} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    id={`retranslate-language-${code}`}
                    checked={selectedRetranslationLocales.includes(code)}
                    onCheckedChange={(checked) => setSelectedRetranslationLocales((current) => (
                      checked === true
                        ? current.includes(code) ? current : [...current, code]
                        : current.filter((lang) => lang !== code)
                    ))}
                  />
                  <span>{name}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <p className="text-sm text-gray-600">
            {t('retranslate_selected_languages_confirm', 'productsTranslations').replace('{count}', String(selectedRetranslationLocales.length))}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProductToRetranslate(null)}>
              {t('cancel_button', 'productsTranslations')}
            </Button>
            <Button onClick={handleRetranslate} disabled={retranslatingProductId !== null || selectedRetranslationLocales.length === 0}>
              {t('retranslate_button', 'productsTranslations')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      )}
    </div>
  );
}

interface ProductTranslationCardProps {
  product: any;
  isEditing: boolean;
  selectedLanguage: string;
  onLanguageChange: (lang: string) => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (translations: ProductTranslation) => void;
  onApproveAssistant: () => void;
  isSubmitting: boolean;
  translationStatus?: TranslationStatus;
  isRetranslating: boolean;
  isRetranslationBusy: boolean;
  retranslatingLocale: Locale | null;
  retranslationProgress: { current: number; total: number } | null;
  onRetranslate: () => void;
}

function ProductTranslationCard({
  product,
  isEditing,
  selectedLanguage,
  onLanguageChange,
  onEdit,
  onCancel,
  onSave,
  onApproveAssistant,
  isSubmitting,
  translationStatus,
  isRetranslating,
  isRetranslationBusy,
  retranslatingLocale,
  retranslationProgress,
  onRetranslate,
}: ProductTranslationCardProps) {
  const { t } = useTranslation();
  const retranslatingLanguageName = getLanguages(t).find(({ code }) => code === retranslatingLocale)?.name || retranslatingLocale || '';
  const [translations, setTranslations] = useState<ProductTranslation>({});
  const [loadingTranslation, setLoadingTranslation] = useState(false);
  const [loadedTranslationLanguage, setLoadedTranslationLanguage] = useState<string | null>(null);
  const [translationSnapshot, setTranslationSnapshot] = useState<string | null>(null);
  const [translationLoadFailed, setTranslationLoadFailed] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      setTranslations({});
      setLoadingTranslation(false);
      setLoadedTranslationLanguage(null);
      setTranslationSnapshot(null);
      setTranslationLoadFailed(false);
      return;
    }

    const controller = new AbortController();
    const fetchTranslations = async () => {
      try {
        setLoadingTranslation(true);
        setLoadedTranslationLanguage(null);
        setTranslationLoadFailed(false);
        setTranslationSnapshot(null);
        setTranslations({});

        const response = await fetch(
          `/api/translations/admin/products/${product._id}?lang=${selectedLanguage}`,
          {
            headers: {
              'Authorization': `Bearer ${getAuthToken()}`,
            },
            credentials: 'include',
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          throw new Error(t('error_load_translation', 'productsTranslations').replace('{language}', selectedLanguage));
        }

        const data = await response.json();
        if (controller.signal.aborted) return;

        const translatedImages = Array.isArray(data.data?.descriptionImages) ? data.data.descriptionImages : [];
        const translatedPromotions = Array.isArray(data.data?.promotions) ? data.data.promotions : [];
        const initialTranslations = {
          name: data.data?.name || '',
          description: data.data?.description || '',
          brand: data.data?.brand || '',
          specs: data.data?.specs || {},
          technicalDescription: data.data?.technicalDescription || '',
          descriptionImages: (product.descriptionImages || []).map((image: ProductDescriptionImage, index: number) => ({
            ...image,
            alt: translatedImages[index]?.alt || '',
          })),
          promotions: (product.promotions || []).map((promotion: ProductPromotion, index: number) => ({
            ...promotion,
            title: translatedPromotions[index]?.title || '',
            giftProductName: translatedPromotions[index]?.giftProductName || '',
            scope: translatedPromotions[index]?.scope || '',
            discountText: translatedPromotions[index]?.discountText || '',
          })),
        };
        setTranslations(initialTranslations);
        setTranslationSnapshot(JSON.stringify(initialTranslations));
        setLoadedTranslationLanguage(selectedLanguage);
      } catch (error) {
        if (controller.signal.aborted) return;
        setTranslationLoadFailed(true);
        toast.error(error instanceof Error ? error.message : t('load_failed', 'productsTranslations'));
      } finally {
        if (!controller.signal.aborted) setLoadingTranslation(false);
      }
    };

    fetchTranslations();
    return () => controller.abort();
  }, [isEditing, selectedLanguage, product._id]);

  const handleFieldChange = (field: keyof ProductTranslation, value: any) => {
    setTranslations(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSpecChange = (key: string, value: string) => {
    const newSpecs = { ...(translations.specs || {}) };
    if (value.trim()) {
      newSpecs[key] = value.trim();
    } else {
      delete newSpecs[key];
    }
    handleFieldChange('specs', newSpecs);
  };

  const handleDescriptionImageAltChange = (index: number, alt: string) => {
    const descriptionImages = (product.descriptionImages || []).map((image: ProductDescriptionImage, imageIndex: number) => ({
      ...image,
      alt: imageIndex === index ? alt : translations.descriptionImages?.[imageIndex]?.alt || '',
    }));
    handleFieldChange('descriptionImages', descriptionImages);
  };

  const handlePromotionTextChange = (
    index: number,
    field: 'title' | 'giftProductName' | 'scope' | 'discountText',
    value: string,
  ) => {
    const promotions = (product.promotions || []).map((promotion: ProductPromotion, promotionIndex: number) => ({
      ...promotion,
      title: promotionIndex === index ? (field === 'title' ? value : translations.promotions?.[promotionIndex]?.title || '') : translations.promotions?.[promotionIndex]?.title || '',
      giftProductName: promotionIndex === index ? (field === 'giftProductName' ? value : translations.promotions?.[promotionIndex]?.giftProductName || '') : translations.promotions?.[promotionIndex]?.giftProductName || '',
      scope: promotionIndex === index ? (field === 'scope' ? value : translations.promotions?.[promotionIndex]?.scope || '') : translations.promotions?.[promotionIndex]?.scope || '',
      discountText: promotionIndex === index ? (field === 'discountText' ? value : translations.promotions?.[promotionIndex]?.discountText || '') : translations.promotions?.[promotionIndex]?.discountText || '',
    }));
    handleFieldChange('promotions', promotions);
  };

  return (
    <div className="border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-1 gap-4">
            {product.image && (
              <img
                src={getImageUrl(product.image)}
                alt={product.name}
                className="w-16 h-16 object-cover rounded-lg"
              />
            )}
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">{product.name}</h3>
              <p className="text-sm text-gray-600 mt-1">{product.brand}</p>
              <TranslationStatusBadge status={translationStatus} />
            </div>
          </div>

          {/* Language Selector & Actions */}
          <div className="flex min-w-48 flex-col gap-3 sm:items-end">
            {isEditing && (
              <LanguageSelector
                selectedLanguage={selectedLanguage}
                onLanguageChange={onLanguageChange}
                disabled={isRetranslationBusy || isSubmitting}
              />
            )}
            {!isEditing && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRetranslate}
                  disabled={isRetranslationBusy || selectedLanguage === DEFAULT_LOCALE || !translationStatus}
                  aria-busy={isRetranslating}
                  className="w-full"
                >
                  <RotateCcw className={`mr-2 h-4 w-4 ${isRetranslating ? 'animate-spin' : ''}`} />
                  {isRetranslating
                    ? t('retranslating_language_progress', 'productsTranslations')
                      .replace('{language}', retranslatingLanguageName)
                      .replace('{current}', String(retranslationProgress?.current || 0))
                      .replace('{total}', String(retranslationProgress?.total || 0))
                    : t('retranslate_button', 'productsTranslations')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onEdit}
                  className="w-full"
                >
                  {t('edit_button', 'productsTranslations')}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      {isEditing ? (
        <EditView
          product={product}
          selectedLanguage={selectedLanguage}
          translations={translations}
          onFieldChange={handleFieldChange}
          onSpecChange={handleSpecChange}
          onDescriptionImageAltChange={handleDescriptionImageAltChange}
          onPromotionTextChange={handlePromotionTextChange}
          onCancel={onCancel}
          onSave={() => onSave(translations)}
          onApproveAssistant={onApproveAssistant}
          canApproveAssistant={Boolean(translationStatus?.canApprove && translationSnapshot === JSON.stringify(translations))}
          hasUnsavedAssistantChanges={Boolean(translationStatus?.canApprove && translationSnapshot !== JSON.stringify(translations))}
          isSubmitting={isSubmitting}
          isLoadError={translationLoadFailed}
          isLoading={loadingTranslation || loadedTranslationLanguage !== selectedLanguage}
        />
      ) : (
        <ViewMode />
      )}
    </div>
  );
}

interface LanguageSelectorProps {
  selectedLanguage: string;
  onLanguageChange: (lang: string) => void;
  disabled: boolean;
}

function TranslationStatusBadge({ status }: { status?: TranslationStatus }) {
  const { t } = useTranslation();
  const statusName = status?.status || 'missing';
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span className={`rounded-full px-2 py-1 text-xs font-medium ${TRANSLATION_STATUS_CLASSES[statusName]}`}>
        {t(`status_${statusName}`, 'productsTranslations')}
      </span>
      {status?.updatedAt && (
        <span className="text-xs text-gray-500">
          {t('status_checked_at', 'productsTranslations').replace('{date}', new Date(status.updatedAt).toLocaleString())}
        </span>
      )}
      {(status?.validationErrors.length || 0) > 0 && (
        <span className="text-xs text-red-600" title={status?.validationErrors.join('\n')}>
          {t('status_errors', 'productsTranslations')}
        </span>
      )}
    </div>
  );
}

function LanguageSelector({ selectedLanguage, onLanguageChange, disabled }: LanguageSelectorProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const languages = getLanguages(t);
  const selectedLang = languages.find(l => l.code === selectedLanguage);

  return (
    <div className="relative w-full">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg flex items-center justify-between gap-2 hover:border-blue-400 bg-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={t('tier1_language_label', 'admin-translation')}
      >
        <span className="text-sm font-medium text-gray-900">{selectedLang?.name || selectedLanguage}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-10">
          {languages.map(lang => (
            <button
              key={lang.code}
              onClick={() => {
                onLanguageChange(lang.code);
                setIsOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                selectedLanguage === lang.code
                  ? 'bg-blue-100 text-blue-900 font-medium'
                  : 'hover:bg-gray-100 text-gray-900'
              }`}
              aria-current={selectedLanguage === lang.code ? 'true' : 'false'}
            >
              {lang.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface EditViewProps {
  product: any;
  selectedLanguage: string;
  translations: ProductTranslation;
  isLoading: boolean;
  isLoadError: boolean;
  onFieldChange: (field: keyof ProductTranslation, value: any) => void;
  onSpecChange: (key: string, value: string) => void;
  onDescriptionImageAltChange: (index: number, value: string) => void;
  onPromotionTextChange: (index: number, field: 'title' | 'giftProductName' | 'scope' | 'discountText', value: string) => void;
  onCancel: () => void;
  onSave: () => void;
  onApproveAssistant: () => void;
  canApproveAssistant: boolean;
  hasUnsavedAssistantChanges: boolean;
  isSubmitting: boolean;
}

function EditView({
  product,
  selectedLanguage,
  translations,
  isLoading,
  isLoadError,
  onFieldChange,
  onSpecChange,
  onDescriptionImageAltChange,
  onPromotionTextChange,
  onCancel,
  onSave,
  onApproveAssistant,
  canApproveAssistant,
  hasUnsavedAssistantChanges,
  isSubmitting,
}: EditViewProps) {
  const { t } = useTranslation();
  const languages = getLanguages(t);
  const selectedLang = languages.find(l => l.code === selectedLanguage);
  const defaultLang = languages.find(l => l.code === DEFAULT_LOCALE);
  const descriptionImagesWithAlt = (product?.descriptionImages || [])
    .map((image: ProductDescriptionImage, index: number) => ({ image, index }))
    .filter(({ image }: { image: ProductDescriptionImage; index: number }) => (
      image?.alt != null && String(image.alt).trim() !== '' && String(image.alt).trim() !== '0'
    ));

  if (isLoadError) {
    return (
      <div className="flex items-center justify-between gap-4 border-t border-gray-200 bg-red-50 p-5">
        <p className="text-sm text-red-700">{t('load_failed', 'productsTranslations')}</p>
        <Button variant="outline" onClick={onCancel}>{t('cancel_button', 'productsTranslations')}</Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-between gap-4 border-t border-gray-200 bg-blue-50 p-5">
        <p className="text-sm text-blue-700">
          {t('loading_translation', 'productsTranslations').replace('{language}', selectedLang?.name || selectedLanguage)}
        </p>
        <Button variant="outline" onClick={onCancel}>{t('cancel_button', 'productsTranslations')}</Button>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-200">
      {/* Simple Fields */}
      <TranslationField
        label={t('product_name', 'productsTranslations')}
        sourceValue={product?.name || ''}
        targetValue={translations?.name || ''}
        sourceLanguage={defaultLang?.name || DEFAULT_LOCALE.toUpperCase()}
        targetLanguage={selectedLang?.name || selectedLanguage}
        onChange={(value) => onFieldChange('name', value)}
        isRequired
      />

      <TranslationField
        label={t('product_description', 'productsTranslations')}
        sourceValue={product?.description || ''}
        targetValue={translations?.description || ''}
        sourceLanguage={defaultLang?.name || DEFAULT_LOCALE.toUpperCase()}
        targetLanguage={selectedLang?.name || selectedLanguage}
        onChange={(value) => onFieldChange('description', value)}
        isTextarea
      />

      <TranslationField
        label={t('technical_description', 'products')}
        sourceValue={product?.technicalDescription || ''}
        targetValue={translations?.technicalDescription || ''}
        sourceLanguage={defaultLang?.name || DEFAULT_LOCALE.toUpperCase()}
        targetLanguage={selectedLang?.name || selectedLanguage}
        onChange={(value) => onFieldChange('technicalDescription', value)}
        isTextarea
      />

      {descriptionImagesWithAlt.length > 0 && (
        <div className="space-y-4 p-5">
          <h4 className="font-semibold text-gray-900">{t('description_images', 'products')}</h4>
          {descriptionImagesWithAlt.map(({ image, index }: { image: ProductDescriptionImage; index: number }) => (
            <div key={`${image.url}-${index}`} className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-xs font-semibold text-gray-600">{defaultLang?.name || DEFAULT_LOCALE.toUpperCase()}</Label>
                <div className="mt-1 rounded bg-gray-100 p-3 text-sm text-gray-900">{image.alt || '-'}</div>
              </div>
              <div>
                <Label className="text-xs font-semibold text-gray-600">{selectedLang?.name || selectedLanguage}</Label>
                <Input
                  className="mt-1 text-sm"
                  value={translations.descriptionImages?.[index]?.alt || ''}
                  onChange={(event) => onDescriptionImageAltChange(index, event.target.value)}
                  placeholder={t('description_image_alt', 'products')}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {Array.isArray(product?.promotions) && product.promotions.length > 0 && (
        <div className="space-y-5 p-5">
          <h4 className="font-semibold text-gray-900">{t('promotions', 'products')}</h4>
          {product.promotions.map((promotion: ProductPromotion, index: number) => (
            <div key={`${promotion.type}-${promotion.title}-${index}`} className="space-y-3 rounded-lg border border-gray-200 p-4">
              <TranslationField
                label={t('promotion_title', 'products')}
                sourceValue={promotion.title || ''}
                targetValue={translations.promotions?.[index]?.title || ''}
                sourceLanguage={defaultLang?.name || DEFAULT_LOCALE.toUpperCase()}
                targetLanguage={selectedLang?.name || selectedLanguage}
                onChange={(value) => onPromotionTextChange(index, 'title', value)}
                isTextarea
              />
              {promotion.giftProductName && (
                <TranslationField
                  label={t('promotion_gift_name', 'products')}
                  sourceValue={promotion.giftProductName}
                  targetValue={translations.promotions?.[index]?.giftProductName || ''}
                  sourceLanguage={defaultLang?.name || DEFAULT_LOCALE.toUpperCase()}
                  targetLanguage={selectedLang?.name || selectedLanguage}
                  onChange={(value) => onPromotionTextChange(index, 'giftProductName', value)}
                />
              )}
              {promotion.scope && (
                <TranslationField
                  label={t('promotion_scope', 'products')}
                  sourceValue={promotion.scope}
                  targetValue={translations.promotions?.[index]?.scope || ''}
                  sourceLanguage={defaultLang?.name || DEFAULT_LOCALE.toUpperCase()}
                  targetLanguage={selectedLang?.name || selectedLanguage}
                  onChange={(value) => onPromotionTextChange(index, 'scope', value)}
                />
              )}
              {promotion.discountText && (
                <TranslationField
                  label={t('promotion_discount', 'products')}
                  sourceValue={promotion.discountText}
                  targetValue={translations.promotions?.[index]?.discountText || ''}
                  sourceLanguage={defaultLang?.name || DEFAULT_LOCALE.toUpperCase()}
                  targetLanguage={selectedLang?.name || selectedLanguage}
                  onChange={(value) => onPromotionTextChange(index, 'discountText', value)}
                  isTextarea
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Specs */}
      {product?.specs && Object.keys(product.specs).length > 0 && (
        <div className="p-5 space-y-4">
          <h4 className="font-semibold text-gray-900">{t('product_specs', 'productsTranslations')}</h4>
          {Object.entries(product.specs).map(([specKey, specValue]) => (
            <div key={specKey} className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-xs text-gray-600">{specKey}</Label>
                <div className="mt-1 p-2 bg-gray-100 rounded text-sm text-gray-900">{String(specValue) || '-'}</div>
              </div>
              <div>
                <Label className="text-xs text-gray-600">{selectedLang?.name}</Label>
                <Input
                  type="text"
                  value={translations?.specs?.[specKey] || ''}
                  onChange={(e) => onSpecChange(specKey, e.target.value)}
                  placeholder={t('translate_spec_placeholder', 'productsTranslations')}
                  className="mt-1 text-sm"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col justify-end gap-3 bg-gray-50 p-5 sm:flex-row">
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          {t('cancel_button', 'productsTranslations')}
        </Button>
        {hasUnsavedAssistantChanges && (
          <p className="self-center text-xs text-amber-700">{t('assistant_batch_save_before_approve', 'productsTranslations')}</p>
        )}
        {canApproveAssistant && (
          <Button variant="outline" onClick={onApproveAssistant} disabled={isSubmitting}>
            {t('assistant_batch_approve', 'productsTranslations')}
          </Button>
        )}
        <Button
          onClick={onSave}
          disabled={isSubmitting}
          className="bg-green-600 hover:bg-green-700"
        >
          <Save className="w-4 h-4 mr-2" />
          {isSubmitting ? t('saving_button', 'productsTranslations') : t('save_button', 'productsTranslations')}
        </Button>
      </div>
    </div>
  );
}

interface TranslationFieldProps {
  label: string;
  sourceValue: string;
  targetValue: string;
  sourceLanguage: string;
  targetLanguage: string;
  onChange: (value: string) => void;
  isRequired?: boolean;
  isTextarea?: boolean;
}

function TranslationField({
  label,
  sourceValue,
  targetValue,
  sourceLanguage,
  targetLanguage,
  onChange,
  isRequired,
  isTextarea,
}: TranslationFieldProps) {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const placeholderText = t('translation_placeholder', 'productsTranslations').replace('{source}', sourceLanguage).replace('{target}', targetLanguage);

  const handleAutoResize = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.max(textareaRef.current.scrollHeight, 208) + 'px';
    }
  };

  useEffect(() => {
    handleAutoResize();
  }, [targetValue]);

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <h4 className="font-semibold text-gray-900">{label}</h4>
        {isRequired && <span className="text-red-500">*</span>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Source Language Version */}
        <div>
          <Label className="text-xs font-semibold text-gray-600">{sourceLanguage}</Label>
          <div className={`mt-1 p-3 bg-gray-100 rounded text-sm text-gray-900 ${isTextarea ? 'whitespace-pre-wrap' : ''}`}>
            {sourceValue || <span className="text-gray-500 italic">-</span>}
          </div>
        </div>

        {/* Target Language Version */}
        <div>
          <Label className="text-xs font-semibold text-gray-600">{targetLanguage}</Label>
          {isTextarea ? (
            <textarea
              ref={textareaRef}
              value={targetValue}
              onChange={(e) => {
                onChange(e.target.value);
                handleAutoResize();
              }}
              onInput={handleAutoResize}
              placeholder={placeholderText}
              className="mt-1 min-h-52 w-full resize-none overflow-hidden rounded border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
              />
          ) : (
            <Input
              type="text"
              value={targetValue}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholderText}
              className="mt-1 text-sm"
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ViewMode() {
  const { t } = useTranslation();
  return (
    <div className="p-5 space-y-3 text-gray-600">
      <p className="text-sm">{t('no_translations_message', 'productsTranslations')}</p>
    </div>
  );
}

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

export default withAdminLayout(ProductsTranslationsAdminContent, {
  permission: 'manage:translations',
  featureName: 'translations_dynamic'
});
