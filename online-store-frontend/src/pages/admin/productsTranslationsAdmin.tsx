import { useState, useEffect } from "react";
import { Search, Globe, X, Check, AlertCircle, Save } from "lucide-react";
import { getImageUrl } from "../../lib/utils";
import { productAPI, getAuthToken } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import { Label } from "../../components/ui/label";
import { toast } from "sonner";
import AdminLayout from "../../components/admin/_AdminLayout";
import { Pagination } from "../../components/admin/Pagination";
import { useAuth } from "../../lib/context/AuthContext";
import { useTranslation } from "@/lib/i18n";
import { useLanguage } from "@/lib/i18n";

export function ProductsTranslationsAdminContent() {
  const { user } = useAuth();
  const { t, loadNamespace } = useTranslation();

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
  const itemsPerPage = 10;

  // Fetch products with features
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setIsLoading(true);
        const params = new URLSearchParams();
        params.append('page', currentPage.toString());
        params.append('limit', itemsPerPage.toString());
        if (searchQuery) params.append('search', searchQuery);
        params.append('hasFeatures', 'true');

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
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };

    const debounceTimer = setTimeout(() => {
      fetchProducts();
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [searchQuery, currentPage]);

  const handleSaveTranslations = async (productId: string, translations: any) => {
    try {
      setIsSubmitting(true);
      const token = getAuthToken();

      const response = await fetch(`/api/products/${productId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          featuresTranslations: translations,
        }),
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || t('save_failed', 'productsTranslations'));
      }

      toast.success(t('save_success', 'productsTranslations'));
        setEditingProductId(null);

      // Refresh product list
      setProducts(prev =>
        prev.map(p => p._id === productId ? { ...p, featuresTranslations: translations } : p)
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('save_failed', 'productsTranslations'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTranslationProgress = (product: any) => {
    if (!product.features || product.features.length === 0) return 0;
    const translated = Object.keys(product.featuresTranslations || {}).length;
    return Math.round((translated / product.features.length) * 100);
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
      <div className="flex gap-3">
        <div className="flex-1 relative">
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
      </div>

      {/* Products List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="text-gray-500">{t('loading', 'productsTranslations')}</div>
          </div>
        ) : products.length === 0 ? (
          <div className="flex justify-center py-12">
            <div className="text-gray-500">{t('no_products', 'productsTranslations')}</div>
          </div>
        ) : (
          products.map((product) => (
            <ProductTranslationCard
              key={product._id}
              product={product}
              isEditing={editingProductId === product._id}
              onEdit={() => setEditingProductId(product._id)}
              onCancel={() => setEditingProductId(null)}
              onSave={(translations) => handleSaveTranslations(product._id, translations)}
              isSubmitting={isSubmitting}
              progress={getTranslationProgress(product)}
            />
          ))
        )}
      </div>

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
  onEdit: () => void;
  onCancel: () => void;
  onSave: (translations: any) => void;
  isSubmitting: boolean;
  progress: number;
}

function ProductTranslationCard({
  product,
  isEditing,
  onEdit,
  onCancel,
  onSave,
  isSubmitting,
  progress,
}: ProductTranslationCardProps) {
  const { t } = useTranslation();
  const [translations, setTranslations] = useState(product.featuresTranslations || {});

  useEffect(() => {
    setTranslations(product.featuresTranslations || {});
  }, [product]);

  if (!product.features || product.features.length === 0) {
    return null;
  }

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
              <p className="text-sm text-gray-600 mt-1">
                {product.features.length} {t('features_count', 'productsTranslations')}
              </p>
            </div>
          </div>

          {/* Progress & Actions */}
          <div className="flex flex-col items-end gap-3">
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-2xl font-bold text-blue-600">{progress}%</p>
                <p className="text-xs text-gray-600">{t('translated_percent', 'productsTranslations')}</p>
              </div>
              <div className="w-24 h-20">
                <ProgressRing progress={progress} />
              </div>
            </div>
            {!isEditing && (
              <Button
                variant="outline"
                size="sm"
                onClick={onEdit}
                className="w-full"
              >
                {t('edit_button', 'productsTranslations')}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Features List */}
      <div className="p-5 space-y-3">
        {product.features.map((feature: string, index: number) => {
          const translation = isEditing ? translations[feature]?.en || '' : (product.featuresTranslations?.[feature]?.en || '');
          const hasTranslation = !!translation;

          return (
            <div
              key={index}
              className={`border rounded-lg p-4 transition-colors ${
                isEditing ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-white'
              }`}
            >
              <div className="space-y-3">
                {/* Feature info */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {`Feature ${index + 1} (Tiếng Việt)`}
                    </p>
                    <p className="text-sm font-medium text-gray-900 mt-1">{feature}</p>
                  </div>
                  {!isEditing && (
                    <div
                      className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                        hasTranslation
                          ? 'bg-green-100 text-green-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}
                    >
                      {hasTranslation ? (
                        <>
                          <Check className="w-3 h-3" />
                          {t('translated_badge', 'productsTranslations')}
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-3 h-3" />
                          {t('not_translated_badge', 'productsTranslations')}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Translation input (only in edit mode) */}
                {isEditing && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <Label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      {t('english_translation_label', 'productsTranslations')}
                    </Label>
                    <Input
                      type="text"
                      value={translation}
                      onChange={(e) => {
                        const newTranslations = { ...translations };
                        if (e.target.value.trim()) {
                          newTranslations[feature] = { en: e.target.value.trim() };
                        } else {
                          delete newTranslations[feature];
                        }
                        setTranslations(newTranslations);
                      }}
                      placeholder={t('english_translation_placeholder', 'productsTranslations')}
                      className="mt-2 transition-colors focus:ring-2 focus:ring-green-500"
                    />
                    {translation && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const newTranslations = { ...translations };
                          delete newTranslations[feature];
                          setTranslations(newTranslations);
                        }}
                        className="mt-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <X className="w-3 h-3 mr-1" />
                        {t('clear_translation_button', 'productsTranslations')}
                      </Button>
                    )}
                  </div>
                )}

                {/* Display mode (readonly) */}
                {!isEditing && translation && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      {t('english_translation_label', 'productsTranslations')}
                    </p>
                    <p className="text-sm text-gray-900 mt-1">{translation}</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      {isEditing && (
        <div className="border-t border-gray-200 bg-gray-50 p-5 flex gap-3 justify-end">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            {t('cancel_button', 'productsTranslations')}
          </Button>
          <Button
            onClick={() => onSave(translations)}
            disabled={isSubmitting}
            className="bg-green-600 hover:bg-green-700"
          >
            <Save className="w-4 h-4 mr-2" />
            {isSubmitting ? t('saving_button', 'productsTranslations') : t('save_button', 'productsTranslations')}
          </Button>
        </div>
      )}
    </div>
  );
}

// Circular progress component
function ProgressRing({ progress }: { progress: number }) {
  const radius = 35;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <svg width="80" height="80" viewBox="0 0 80 80">
      {/* Background circle */}
      <circle
        cx="40"
        cy="40"
        r={radius}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth="4"
      />
      {/* Progress circle */}
      <circle
        cx="40"
        cy="40"
        r={radius}
        fill="none"
        stroke="#3b82f6"
        strokeWidth="4"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.3s ease' }}
      />
    </svg>
  );
}

function ProductsTranslationsAdminPage() {
  return (
    <AdminLayout>
      <ProductsTranslationsAdminContent />
    </AdminLayout>
  );
}

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

export default ProductsTranslationsAdminPage;
