import { useState, useEffect, useRef } from "react";
import { useEffect, useRef, useState } from "react";
import { withAdminLayout } from "../../components/admin/withAdminLayout";
import { Search, Globe, Save, ChevronDown, RotateCcw } from "lucide-react";
import { getImageUrl } from "../../lib/utils";
import { getAuthToken } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { toast } from "sonner";
import { PermissionDenied } from "../../components/admin/PermissionDenied";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Pagination } from "../../components/admin/Pagination";
import { useAuth } from "../../lib/context/AuthContext";
import { useTranslation } from "@/lib/i18n";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, Locale } from "../../lib/i18n/types";

const INITIAL_TRANSLATION_LOCALE = SUPPORTED_LOCALES.find((code) => code !== DEFAULT_LOCALE) || DEFAULT_LOCALE;

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
  features?: string[];
  specs?: Record<string, string>;
}

interface TranslationStatus {
  status: 'missing' | 'pending' | 'approved' | 'needs_retranslate' | 'rejected';
  manualFields: string[];
  updatedAt: string | null;
  validationErrors: string[];
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
  const [statusFilter, setStatusFilter] = useState<'all' | TranslationStatus['status']>('all');
  const [retranslatingProductId, setRetranslatingProductId] = useState<string | null>(null);
  const [productToRetranslate, setProductToRetranslate] = useState<any | null>(null);
  const itemsPerPage = 10;

  // Fetch products with app locale language (left side follows global language)
  useEffect(() => {
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
        const response = await fetch(`/api/products?${queryString}`, {
          headers: {
            'Authorization': `Bearer ${getAuthToken()}`,
          },
          credentials: 'include',
        });

        if (!response.ok) throw new Error('Failed to fetch products');

        const data = await response.json();
        setProducts(data.products || []);
        setTotalPages(data.pages || 1);
      } catch (error) {
        toast.error(t('load_failed', 'productsTranslations'));
      } finally {
        setIsLoading(false);
      }
    };

    const debounceTimer = setTimeout(() => {
      fetchProducts();
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [searchQuery, currentPage, locale, isAdmin]);

  useEffect(() => {
    const fetchStatuses = async () => {
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
        if (!response.ok) throw new Error('Failed to fetch translation statuses');
        const data = await response.json();
        setTranslationStatuses(Object.fromEntries(
          (data.data || []).map((status: TranslationStatus & { productId: string }) => [status.productId, status])
        ));
      } catch {
        toast.error(t('status_load_failed', 'productsTranslations'));
      }
    };

    fetchStatuses();
  }, [products, selectedLanguage, t, isAdmin]);

  if (!isAdmin) {
    return <PermissionDenied feature="Products Translations" />;
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
    if (!productToRetranslate) return;
    const product = productToRetranslate;
    setProductToRetranslate(null);

    try {
      setRetranslatingProductId(product._id);
      const response = await fetch(`/api/translations/admin/products/${product._id}/retranslate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({ lang: selectedLanguage }),
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || t('retranslate_failed', 'productsTranslations'));

      setTranslationStatuses((current) => ({
        ...current,
        [product._id]: {
          status: data.data.status,
          manualFields: data.data.skippedManualFields || [],
          updatedAt: data.data.updatedAt || null,
          validationErrors: data.data.validationErrors || [],
        },
      }));
      toast.success(t('retranslate_success', 'productsTranslations'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('retranslate_failed', 'productsTranslations'));
    } finally {
      setRetranslatingProductId(null);
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
        <p className="text-gray-600">{t('subtitle')}</p>
      </div>

      {/* Search */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder={t('search_placeholder')}
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
            setCurrentPage(1);
          }}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 transition-colors hover:border-blue-400 focus:ring-2 focus:ring-blue-500"
          aria-label={t('translation_language_label', 'productsTranslations')}
        >
          {getLanguages(t).map((language) => (
            <option key={language.code} value={language.code}>{language.name}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as 'all' | TranslationStatus['status'])}
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
              onLanguageChange={(lang) => setSelectedLanguage(lang as Locale)}
              onEdit={() => setEditingProductId(product._id)}
              onCancel={() => setEditingProductId(null)}
              onSave={(translations) => handleSaveTranslations(product._id, translations)}
              isSubmitting={isSubmitting}
              translationStatus={translationStatuses[product._id]}
              isRetranslating={retranslatingProductId === product._id}
              onRetranslate={() => setProductToRetranslate(product)}
            />
          ))
        )}
      </div>

      <Dialog open={Boolean(productToRetranslate)} onOpenChange={(open) => !open && setProductToRetranslate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('retranslate_button', 'productsTranslations')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            {translationStatuses[productToRetranslate?._id]?.status === 'approved'
              ? t('retranslate_approved_confirm', 'productsTranslations')
              : t('retranslate_confirm', 'productsTranslations').replace('{name}', productToRetranslate?.name || '')}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProductToRetranslate(null)}>
              {t('cancel_button', 'productsTranslations')}
            </Button>
            <Button onClick={handleRetranslate}>
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
  isSubmitting: boolean;
  translationStatus?: TranslationStatus;
  isRetranslating: boolean;
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
  isSubmitting,
  translationStatus,
  isRetranslating,
  onRetranslate,
}: ProductTranslationCardProps) {
  const { t } = useTranslation();
  const [translations, setTranslations] = useState<ProductTranslation>({});
  const [loadingTranslation, setLoadingTranslation] = useState(false);

  // Load translations for selected language when editing
  useEffect(() => {
    if (!isEditing) {
      setTranslations({});
      return;
    }

    const fetchTranslations = async () => {
      try {
        setLoadingTranslation(true);

        const response = await fetch(
          `/api/products/${product._id}/translations?lang=${selectedLanguage}`,
          {
            headers: {
              'Authorization': `Bearer ${getAuthToken()}`,
            },
            credentials: 'include',
          }
        );

        if (!response.ok) {
          toast.error(t('error_load_translation', 'productsTranslations').replace('{language}', selectedLanguage));
          return;
        }

        const data = await response.json();

        setTranslations({
          name: data.data?.name || '',
          description: data.data?.description || '',
          brand: data.data?.brand || '',
          features: Array.isArray(data.data?.features) ? data.data.features : [],
          specs: data.data?.specs || {},
        });
      } catch (error) {
        toast.error(t('load_failed', 'productsTranslations'));
      } finally {
        setLoadingTranslation(false);
      }
    };

    fetchTranslations();
  }, [isEditing, selectedLanguage, product._id]);

  const handleFieldChange = (field: keyof ProductTranslation, value: any) => {
    setTranslations(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleFeatureChange = (index: number, value: string) => {
    const newFeatures = [...(translations.features || [])];
    newFeatures[index] = value;
    handleFieldChange('features', newFeatures);
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

  return (
    <div className="border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-4 flex-1">
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
          <div className="flex flex-col items-end gap-3 min-w-48">
            {isEditing && (
              <LanguageSelector
                selectedLanguage={selectedLanguage}
                onLanguageChange={onLanguageChange}
              />
            )}
            {!isEditing && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRetranslate}
                  disabled={isRetranslating || selectedLanguage === DEFAULT_LOCALE}
                  className="w-full"
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  {isRetranslating ? t('retranslating', 'productsTranslations') : t('retranslate_button', 'productsTranslations')}
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
          isLoading={loadingTranslation}
          onFieldChange={handleFieldChange}
          onFeatureChange={handleFeatureChange}
          onSpecChange={handleSpecChange}
          onCancel={onCancel}
          onSave={() => onSave(translations)}
          isSubmitting={isSubmitting}
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
}

function TranslationStatusBadge({ status }: { status?: TranslationStatus }) {
  const { t } = useTranslation();
  const statusName = status?.status || 'missing';
  const statusClasses = {
    missing: 'bg-gray-100 text-gray-700',
    pending: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-green-100 text-green-800',
    needs_retranslate: 'bg-orange-100 text-orange-800',
    rejected: 'bg-red-100 text-red-800',
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusClasses[statusName]}`}>
        {t(`status_${statusName}`, 'productsTranslations')}
      </span>
      {(status?.manualFields.length || 0) > 0 && (
        <span className="text-xs text-gray-500">{t('manual_translation', 'productsTranslations')}</span>
      )}
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

function LanguageSelector({ selectedLanguage, onLanguageChange }: LanguageSelectorProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const languages = getLanguages(t);
  const selectedLang = languages.find(l => l.code === selectedLanguage);

  return (
    <div className="relative w-full">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg flex items-center justify-between gap-2 hover:border-blue-400 bg-white transition-colors"
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
  onFieldChange: (field: keyof ProductTranslation, value: any) => void;
  onFeatureChange: (index: number, value: string) => void;
  onSpecChange: (key: string, value: string) => void;
  onCancel: () => void;
  onSave: () => void;
  isSubmitting: boolean;
}

function EditView({
  product,
  selectedLanguage,
  translations,
  isLoading,
  onFieldChange,
  onFeatureChange,
  onSpecChange,
  onCancel,
  onSave,
  isSubmitting,
}: EditViewProps) {
  const { t } = useTranslation();
  const languages = getLanguages(t);
  const selectedLang = languages.find(l => l.code === selectedLanguage);
  const defaultLang = languages.find(l => l.code === DEFAULT_LOCALE);

  return (
    <div className="divide-y divide-gray-200">
      {isLoading && (
        <div className="p-6 text-center bg-blue-50 border-b border-blue-200">
          <p className="text-blue-600">{t('loading_translation', 'productsTranslations').replace('{language}', selectedLang?.name || selectedLanguage)}</p>
        </div>
      )}

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
        label={t('product_brand', 'productsTranslations')}
        sourceValue={product?.brand || ''}
        targetValue={translations?.brand || ''}
        sourceLanguage={defaultLang?.name || DEFAULT_LOCALE.toUpperCase()}
        targetLanguage={selectedLang?.name || selectedLanguage}
        onChange={(value) => onFieldChange('brand', value)}
      />

      <div className="p-5 space-y-4">
        <h4 className="font-semibold text-gray-900">{t('product_category', 'productsTranslations')}</h4>
        <div>
          <Label className="text-xs font-semibold text-gray-600">{defaultLang?.name || DEFAULT_LOCALE.toUpperCase()}</Label>
          <div className="mt-1 p-3 bg-gray-100 rounded text-sm text-gray-900">{product.category?.name}</div>
        </div>
      </div>

      {/* Features */}
      {product?.features && product.features.length > 0 && (
        <div className="p-5 space-y-4">
          <h4 className="font-semibold text-gray-900">{t('product_features', 'productsTranslations')}</h4>
          {product.features.map((feature: string, index: number) => (
            <div key={index} className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-gray-600">{t('feature_label_template', 'productsTranslations').replace('{number}', String(index + 1))}</Label>
                <div className="mt-1 p-2 bg-gray-100 rounded text-sm text-gray-900">{feature || '-'}</div>
              </div>
              <div>
                <Label className="text-xs text-gray-600">{selectedLang?.name}</Label>
                <Input
                  type="text"
                  value={translations?.features?.[index] || ''}
                  onChange={(e) => onFeatureChange(index, e.target.value)}
                  placeholder={t('translate_feature_placeholder', 'productsTranslations')}
                  className="mt-1 text-sm"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Specs */}
      {product?.specs && Object.keys(product.specs).length > 0 && (
        <div className="p-5 space-y-4">
          <h4 className="font-semibold text-gray-900">{t('product_specs', 'productsTranslations')}</h4>
          {Object.entries(product.specs).map(([specKey, specValue]) => (
            <div key={specKey} className="grid grid-cols-2 gap-4">
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
      <div className="p-5 flex gap-3 justify-end bg-gray-50">
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          {t('cancel_button', 'productsTranslations')}
        </Button>
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
              className="mt-1 min-h-[208px] w-full resize-none overflow-hidden rounded border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
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
  featureName: 'Dịch sản phẩm'
});
