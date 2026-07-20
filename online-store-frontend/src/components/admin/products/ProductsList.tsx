import { useCallback, useEffect, useState } from "react";
import { Search, Plus, Pencil, Trash2, RotateCcw, AlertCircle } from "lucide-react";
import { getTranslatedValue, getCategoryName } from "../../../lib/data";
import { productAPI, categoryAPI } from "../../../lib/api";
import { useCurrencyConversion } from "@/hooks/useCurrencyConversion";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Badge } from "../../ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "../../ui/dialog";
import { toast } from "sonner";
import { Pagination } from "../Pagination";
import { joinAdminRoom, leaveAdminRoom, onProductCreated, onProductUpdated, onProductDeleted, onProductRestored, offEvent } from "../../../lib/socket";
import { useAuth } from "../../../lib/context/AuthContext";
import { useTranslation } from "@/lib/i18n";
import { useLanguage } from '@/lib/i18n';
import { useRouter } from 'next/router';
import { getAuthToken } from "../../../lib/api";

interface ProductsListProps {
  discountMode?: boolean;
}

export function ProductsList({ discountMode = false }: ProductsListProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { t, loadNamespace } = useTranslation();
  const { locale } = useLanguage();
  const { formatConvertedPrice } = useCurrencyConversion();

  useEffect(() => {
    loadNamespace('admin');
  }, [loadNamespace]);

  const [products, setProducts] = useState<any[]>([]);
  const [deletedProducts, setDeletedProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterBrand, setFilterBrand] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [deletedCurrentPage, setDeletedCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [deletedTotalPages, setDeletedTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [viewDeletedTab, setViewDeletedTab] = useState(false);
  const [deleteConfirmProduct, setDeleteConfirmProduct] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const itemsPerPage = 10;

  // Fetch categories on mount
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await categoryAPI.getCategories(locale);
        const categoriesList = response.categories || response;
        setCategories(Array.isArray(categoriesList) ? categoriesList : []);
      } catch (error) {
        // Failed to fetch categories
      }
    };
    fetchCategories();
  }, [locale]);

  const fetchProducts = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await productAPI.getProducts(
        currentPage,
        searchQuery || undefined,
        filterCategory !== 'all' ? filterCategory : undefined,
        undefined,
        itemsPerPage,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        locale
      );
      const fetchedProducts = response.products || [];
      setProducts(fetchedProducts);
      setTotalPages(response.pages || 1);
    } catch (error) {
      toast.error(t('error_load_data', 'common'));
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, searchQuery, filterCategory, itemsPerPage, locale, t]);

  const fetchDeletedProducts = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await productAPI.getDeletedProducts(deletedCurrentPage, itemsPerPage, locale);
      const fetchedProducts = response.products || [];
      setDeletedProducts(fetchedProducts);
      setDeletedTotalPages(response.pages || 1);
    } catch (error) {
      toast.error(t('error_load_data', 'common'));
    } finally {
      setIsLoading(false);
    }
  }, [deletedCurrentPage, itemsPerPage, locale, t]);

  useEffect(() => {
    if (viewDeletedTab) {
      fetchDeletedProducts();
    } else {
      fetchProducts();
    }
  }, [currentPage, deletedCurrentPage, viewDeletedTab, searchQuery, filterCategory, filterBrand, locale, fetchProducts, fetchDeletedProducts]);

  // Socket.io real-time updates
  useEffect(() => {
    if (user) {
      joinAdminRoom({
        userId: user.id || user.email,
        role: user.role,
      });
    } else {
      joinAdminRoom();
    }

    const handleProductCreated = () => {
      fetchProducts();
      toast.success(t('admin_toast_product_created', 'admin'));
    };

    const handleProductUpdated = () => {
      fetchProducts();
      toast.info(t('admin_toast_product_updated', 'admin'));
    };

    const handleProductDeleted = () => {
      if (viewDeletedTab) {
        fetchDeletedProducts();
      } else {
        fetchProducts();
      }
      toast.info(t('admin_toast_product_deleted', 'admin'));
    };

    const handleProductRestored = () => {
      fetchProducts();
      toast.success(t('admin_toast_product_restored', 'admin'));
    };

    onProductCreated(handleProductCreated);
    onProductUpdated(handleProductUpdated);
    onProductDeleted(handleProductDeleted);
    onProductRestored(handleProductRestored);

    return () => {
      leaveAdminRoom();
      offEvent('product-created');
      offEvent('product-updated');
      offEvent('product-deleted');
      offEvent('product-restored');
    };
  }, [user, viewDeletedTab, locale, fetchProducts, fetchDeletedProducts, t]);

  const productBrands = Array.from(new Set((viewDeletedTab ? deletedProducts : products).map((p) => p.brand).filter((b) => Boolean(b) && typeof b === 'string')));
  const brandNames = Array.from(new Set(productBrands));

  const currentPageVar = viewDeletedTab ? deletedCurrentPage : currentPage;
  const currentTotalPages = viewDeletedTab ? deletedTotalPages : totalPages;
  const displayedProducts = viewDeletedTab ? deletedProducts : products;

  const handleDelete = async (id: string) => {
    try {
      await productAPI.deleteProduct(id);
      if (viewDeletedTab) {
        setDeletedCurrentPage(1);
        await fetchDeletedProducts();
      } else {
        setCurrentPage(1);
        await fetchProducts();
      }
      toast.success(t('admin_toast_delete_success', 'admin'));
    } catch (error) {
      toast.error(t('error_delete_data', 'admin'));
    }
  };

  const handleRestoreProduct = async (id: string) => {
    try {
      setIsSubmitting(true);
      await productAPI.restoreProduct(id);
      toast.success(t('admin_toast_product_restored', 'admin'));
      setDeletedCurrentPage(1);
      setCurrentPage(1);
      await fetchDeletedProducts();
      await fetchProducts();
    } catch (error) {
      toast.error(t('error_save_data', 'admin'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleHardDeleteProduct = async (id: string) => {
    try {
      setIsSubmitting(true);
      const token = getAuthToken();

      const response = await fetch(`/api/products/${id}/hard?lang=${locale}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || t('delete_failed', 'common').replace('{status}', String(response.status)));
      }

      await fetchDeletedProducts();
      toast.success(t('admin_toast_delete_success', 'admin'));
      setDeleteConfirmProduct(null);
    } catch (error) {
      toast.error(t('error_delete_data', 'admin'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <p>{t('loading', 'common')}</p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1>{discountMode ? t('admin_product_discounts_management', 'admin') : t('permission_manage_products', 'admin')}</h1>
          {discountMode && <p className="text-sm text-gray-500 mt-1">{t('admin_product_discounts_management_desc', 'admin')}</p>}
        </div>
        <div className="flex items-center gap-3">
          {!viewDeletedTab && <span className="text-sm text-gray-600 font-medium">{t('page_indicator', 'common').replace('{page}', String(currentPage)).replace('{items}', String(itemsPerPage))}</span>}
          {!viewDeletedTab && (
            <Button onClick={() => router.push('/admin/products/create')} className="bg-red-600 hover:bg-red-700">
              <Plus className="w-4 h-4 mr-2" />
              {t('add_product', 'admin')}
            </Button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg border mb-6">
        <div className="overflow-x-auto border-b">
          <div className="flex min-w-max gap-0">
            <button
              onClick={() => {
                setViewDeletedTab(false);
                setCurrentPage(1);
                setSearchQuery("");
              }}
              className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${
                !viewDeletedTab
                  ? "border-red-600 text-red-600"
                  : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              {t('active_products', 'admin')}
            </button>
            <button
              onClick={() => {
                setViewDeletedTab(true);
                setDeletedCurrentPage(1);
                setSearchQuery("");
              }}
              className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors ${
                viewDeletedTab
                  ? "border-red-600 text-red-600"
                  : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              {t('deleted_products', 'admin')}
            </button>
          </div>
        </div>

        <div className="p-6 border-b">
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
            <div className="w-full sm:flex-1 sm:min-w-64">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  id="product-search"
                  name="product-search"
                  placeholder={t('search_placeholder', 'common')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  autoComplete="off"
                />
              </div>
            </div>
            {!viewDeletedTab && (
              <>
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder={t('admin_category', 'admin')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('view_all', 'admin')}</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat._id} value={cat._id}>
                        {getCategoryName(cat)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterBrand} onValueChange={setFilterBrand}>
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder={t('brands_title', 'common')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('view_all', 'common')}</SelectItem>
                    {brandNames.map((brand) => (
                      <SelectItem key={brand} value={brand}>
                        {brand}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-white">
              <tr>
                <th className="px-6 py-3 text-left text-xs uppercase">{t('admin_product_name', 'admin')}</th>
                <th className="hidden px-6 py-3 text-left text-xs uppercase sm:table-cell">{t('admin_brand', 'admin')}</th>
                <th className="hidden px-6 py-3 text-left text-xs uppercase md:table-cell">{t('admin_category', 'admin')}</th>
                <th className="px-6 py-3 text-left text-xs uppercase">{t('admin_price', 'admin')}</th>
                {!viewDeletedTab && (
                  <>
                    <th className="hidden px-6 py-3 text-left text-xs uppercase lg:table-cell">{t('admin_stock_status', 'admin')}</th>
                    <th className="hidden px-6 py-3 text-left text-xs uppercase lg:table-cell">{t('rating', 'common')}</th>
                  </>
                )}
                <th className="px-6 py-3 text-right text-xs uppercase">{t('admin_actions', 'admin')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {displayedProducts.map((product) => (
                <tr key={product._id}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {product.image && (
                        <img
                          src={product.image}
                          alt={getTranslatedValue(product.name, locale)}
                          loading="lazy"
                          className="w-12 h-12 object-cover rounded"
                        />
                      )}
                      <div>
                        <p className="font-medium">{getTranslatedValue(product.name, locale)}</p>
                        {product.featured && (
                          <Badge className="mt-1 bg-red-600">{t('badge_featured', 'admin')}</Badge>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-6 py-4 sm:table-cell">{product.brand || t('not_updated', 'admin')}</td>
                  <td className="hidden px-6 py-4 md:table-cell">
                    {product.category ? getCategoryName(product.category) : (product.categoryName || product.category || t('not_updated', 'common'))}
                  </td>
                  <td className="px-6 py-4 font-medium">
                    <div>
                      {formatConvertedPrice(product.price, product.baseCurrencyCode)}
                    </div>
                    {product.originalPrice && product.originalPrice > 0 && product.price && product.originalPrice > product.price && (
                      <div className="mt-1 flex items-center gap-2 text-xs">
                        <span className="line-through text-gray-500">{formatConvertedPrice(product.originalPrice, product.baseCurrencyCode)}</span>
                        <Badge className="bg-red-600 text-white">
                          -{Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)}%
                        </Badge>
                      </div>
                    )}
                  </td>
                  {!viewDeletedTab && (
                    <>
                      <td className="hidden px-6 py-4 lg:table-cell">
                        {product.countInStock === null || product.countInStock === undefined ? (
                          <Badge variant="secondary">{t('not_updated', 'common')}</Badge>
                        ) : (
                          <Badge variant={product.countInStock > 0 ? "default" : "destructive"}>
                            {t('in_stock', 'common')}: {product.countInStock}
                          </Badge>
                        )}
                      </td>
                      <td className="hidden px-6 py-4 lg:table-cell">
                        <div className="flex items-center gap-1 whitespace-nowrap">
                          <span className="font-medium">{(product.rating || 0).toFixed(1)}</span>
                          <span>⭐</span>
                          {product.numReviews > 0 && (
                            <span className="text-sm text-gray-500">({product.numReviews})</span>
                          )}
                        </div>
                      </td>
                    </>
                  )}
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      {viewDeletedTab ? (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRestoreProduct(product._id)}
                            disabled={isSubmitting}
                            title={t('restore', 'common')}
                          >
                            <RotateCcw className="w-4 h-4 text-green-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteConfirmProduct(product)}
                            title={t('hard_delete', 'common')}
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push(`/admin/products/${product._id}/edit`)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(product._id)}
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {currentTotalPages > 1 && (
          <Pagination
            currentPage={currentPageVar}
            totalPages={currentTotalPages}
            onPageChange={viewDeletedTab ? setDeletedCurrentPage : setCurrentPage}
          />
        )}
      </div>

      <Dialog open={!!deleteConfirmProduct} onOpenChange={() => setDeleteConfirmProduct(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md animate-in fade-in zoom-in-95 duration-200">
          <DialogHeader className="space-y-3">
            <div className="flex items-center gap-3">
              <div className={`shrink-0 flex items-center justify-center h-10 w-10 rounded-full ${viewDeletedTab ? 'bg-red-100' : 'bg-orange-100'}`}>
                <AlertCircle className={`h-6 w-6 ${viewDeletedTab ? 'text-red-600' : 'text-orange-600'}`} />
              </div>
              <DialogTitle className="text-lg font-semibold">
                {viewDeletedTab ? t('admin_hard_delete_title', 'admin') : t('admin_delete_title', 'admin')}
              </DialogTitle>
            </div>
            <DialogDescription>
              {viewDeletedTab ? t('admin_hard_delete_desc', 'admin') : t('admin_delete_desc', 'admin')}
            </DialogDescription>
          </DialogHeader>
          <div className="bg-white rounded-lg p-4 my-2">
            <p className="text-sm text-gray-600 leading-relaxed">
              {viewDeletedTab ? (
                <>{t('admin_hard_delete_confirm', 'admin')} <span className="font-semibold text-gray-900">{deleteConfirmProduct?.name || ""}</span>? <span className="text-red-600 font-medium">{t('admin_hard_delete_warning', 'admin')}</span> {t('admin_hard_delete_final_note', 'admin')}</>
              ) : (
                <>{t('admin_delete_confirm', 'admin')} <span className="font-semibold text-gray-900">{deleteConfirmProduct?.name || ""}</span>? {t('admin_delete_later_note', 'admin')}</>
              )}
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-2 flex flex-row-reverse">
            <Button
              onClick={() => {
                if (deleteConfirmProduct) {
                  if (viewDeletedTab) {
                    handleHardDeleteProduct(deleteConfirmProduct._id);
                  } else {
                    handleDelete(deleteConfirmProduct._id);
                  }
                  setDeleteConfirmProduct(null);
                }
              }}
              disabled={isSubmitting}
              className="bg-red-600 hover:bg-red-700 text-white flex-1"
            >
              {isSubmitting ? t('deleting', 'admin') : viewDeletedTab ? t('admin_hard_delete_btn', 'admin') : t('admin_delete_order', 'admin')}
            </Button>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmProduct(null)}
              className="flex-1"
            >
              {t('cancel', 'admin')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
