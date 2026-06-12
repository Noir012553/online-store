import { useState, useEffect } from "react";
import { Search, Plus, Pencil, Trash2, Upload, RotateCcw, AlertCircle, CheckCircle2, Package, DollarSign } from "lucide-react";
import { formatCurrency, getImageUrl } from "../../lib/utils";
import { productAPI, categoryAPI, getAuthToken } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "../../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Checkbox } from "../../components/ui/checkbox";
import { toast } from "sonner";
import AdminLayout from "../../components/admin/_AdminLayout";
import { Pagination } from "../../components/admin/Pagination";
import { joinAdminRoom, leaveAdminRoom, onProductCreated, onProductUpdated, onProductDeleted, onProductRestored, offEvent } from "../../lib/socket";
import { useAuth } from "../../lib/context/AuthContext";
import { useTranslation } from "@/lib/i18n";
import { useLanguage } from '@/lib/i18n';

// Image upload API for products
const uploadProductImage = async (file: File) => {
  const formData = new FormData();
  formData.append('image', file);

  const token = getAuthToken();
  const response = await fetch('/api/products/upload', {
    method: 'POST',
    body: formData,
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'error_upload_failed');
  }

  return response.json();
};

export function ProductsAdminContent({ discountMode = false }: { discountMode?: boolean } = {}) {
  const { user } = useAuth();
  const { t, loadNamespace } = useTranslation();

  useEffect(() => {
    loadNamespace('admin');
  }, [loadNamespace]);

  const isDiscountMode = discountMode;
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
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [viewDeletedTab, setViewDeletedTab] = useState(false);
  const [deleteConfirmProduct, setDeleteConfirmProduct] = useState<any>(null);
  const [categoryChoice, setCategoryChoice] = useState<"existing" | "new" | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const itemsPerPage = 10;

  // Fetch categories on mount
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await categoryAPI.getCategories();
        const categoriesList = response.categories || response;
        setCategories(Array.isArray(categoriesList) ? categoriesList : []);
      } catch (error) {
        // Failed to fetch categories - will show empty list
      }
    };
    fetchCategories();
  }, []);

  useEffect(() => {
    if (viewDeletedTab) {
      fetchDeletedProducts();
    } else {
      fetchProducts();
    }
  }, [currentPage, deletedCurrentPage, viewDeletedTab, searchQuery, filterCategory, filterBrand]);

  // Socket.io real-time updates for admin
  useEffect(() => {
    // Join admin room with user info for tracking
    if (user) {
      joinAdminRoom({
        userId: user.id || user.email,
        role: user.role,
      });
    } else {
      joinAdminRoom(); // Fallback nếu user chưa load
    }

    // Listen for new product created events
    const handleProductCreated = (data: any) => {
      // Auto-refresh products when new product is created
      fetchProducts();
      toast.success(t('admin_toast_product_created', 'admin'));
    };

    // Listen for product updated events
    const handleProductUpdated = (data: any) => {
      // Auto-refresh products when product is updated
      fetchProducts();
      toast.info(t('admin_toast_product_updated', 'admin'));
    };

    // Listen for product deleted events
    const handleProductDeleted = (data: any) => {
      // Auto-refresh products when product is deleted
      if (viewDeletedTab) {
        fetchDeletedProducts();
      } else {
        fetchProducts();
      }
      toast.info(t('admin_toast_product_deleted', 'admin'));
    };

    // Listen for product restored events
    const handleProductRestored = (data: any) => {
      // Auto-refresh products when product is restored
      fetchProducts();
      toast.success(t('admin_toast_product_restored', 'admin'));
    };

    onProductCreated(handleProductCreated);
    onProductUpdated(handleProductUpdated);
    onProductDeleted(handleProductDeleted);
    onProductRestored(handleProductRestored);

    // Cleanup on unmount or user change
    return () => {
      leaveAdminRoom();
      offEvent('product-created');
      offEvent('product-updated');
      offEvent('product-deleted');
      offEvent('product-restored');
    };
  }, [user, viewDeletedTab]);

  const fetchProducts = async () => {
    try {
      setIsLoading(true);
      const response = await productAPI.getProducts(
        currentPage,
        String(itemsPerPage),
        searchQuery || undefined,
        filterCategory !== 'all' ? filterCategory : undefined
      );
      const fetchedProducts = response.products || [];
      setProducts(fetchedProducts);
      setTotalPages(response.pages || 1);
    } catch (error) {
      toast.error(t('error_load_data', 'admin'));
      console.error('Failed to fetch products:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchDeletedProducts = async () => {
    try {
      setIsLoading(true);
      const response = await productAPI.getDeletedProducts(deletedCurrentPage, itemsPerPage);
      const fetchedProducts = response.products || [];
      setDeletedProducts(fetchedProducts);
      setDeletedTotalPages(response.pages || 1);
    } catch (error) {
      toast.error(t('error_load_data', 'admin'));
      console.error('Failed to fetch deleted products:', error);
    } finally {
      setIsLoading(false);
    }
  };


  // Get brands from current product list
  const brands = Array.from(new Set((viewDeletedTab ? deletedProducts : products).map((p) => p.brand).filter((b) => Boolean(b) && typeof b === 'string')));

  const currentPageVar = viewDeletedTab ? deletedCurrentPage : currentPage;
  const currentTotalPages = viewDeletedTab ? deletedTotalPages : totalPages;
  const displayedProducts = viewDeletedTab ? deletedProducts : products;

  const handleEdit = (product: any) => {
    let countInStock = 0;
    if (product.countInStock !== null && product.countInStock !== undefined) {
      const parsed = parseInt(String(product.countInStock), 10);
      countInStock = isNaN(parsed) ? 0 : parsed;
    }

    setEditingProduct({
      ...product,
      name: typeof product.name === 'string' ? product.name : '',
      countInStock,
      originalPrice: product.originalPrice ?? '',
    });
    setCategoryChoice(null);
    setNewCategoryName("");
    setImageFile(null);
    setImagePreview("");
    setIsDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingProduct({
      name: "",
      brand: "",
      category: null, // Will be set via Select dropdown or new category name
      price: 0,
      originalPrice: '',
      image: "",
      rating: 0,
      numReviews: 0,
      countInStock: 0,
      description: "",
      featured: false,
    });
    setImageFile(null);
    setImagePreview("");
    setCategoryChoice(null);
    setNewCategoryName("");
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      if (!editingProduct.name || !editingProduct.brand || !editingProduct.price) {
        toast.error(t('error_fill_required', 'admin'));
        return;
      }

      // Validate category choice
      if (!editingProduct._id && !categoryChoice) {
        toast.error(t('error_fill_required', 'admin'));
        return;
      }

      // If choosing existing category, validate selection
      if (categoryChoice === "existing" && !editingProduct.category) {
        toast.error(t('error_select_category', 'admin'));
        return;
      }

      // If choosing new category, validate name
      if (categoryChoice === "new" && !newCategoryName.trim()) {
        toast.error(t('error_enter_new_category', 'admin'));
        return;
      }

      // Validate countInStock is a valid number
      let validCountInStock = 0;
      if (editingProduct.countInStock !== null && editingProduct.countInStock !== undefined) {
        const parsed = parseInt(String(editingProduct.countInStock), 10);
        validCountInStock = isNaN(parsed) ? 0 : Math.max(0, parsed);
      }

      const originalPriceRaw = editingProduct.originalPrice === null || editingProduct.originalPrice === undefined
        ? ''
        : String(editingProduct.originalPrice).trim();
      let validOriginalPrice: number | undefined;
      if (originalPriceRaw) {
        const parsedOriginalPrice = parseFloat(originalPriceRaw);
        if (isNaN(parsedOriginalPrice) || parsedOriginalPrice <= 0 || parsedOriginalPrice <= Number(editingProduct.price || 0)) {
          toast.error(t('admin_original_price_invalid', 'admin'));
          return;
        }
        validOriginalPrice = parsedOriginalPrice;
      }

      setIsSubmitting(true);

      if (editingProduct._id) {
        // Update existing product
        const formData = new FormData();
        formData.append("name", editingProduct.name);
        formData.append("brand", editingProduct.brand);
        const catId = editingProduct.categoryId || (editingProduct.category?._id || editingProduct.category);
        if (catId) {
          formData.append("category", catId);
        }
        formData.append("price", editingProduct.price);
        formData.append("description", editingProduct.description);
        formData.append("countInStock", String(validCountInStock));
        formData.append("originalPrice", validOriginalPrice !== undefined ? String(validOriginalPrice) : '');

        // Add featuresTranslations if present
        if (editingProduct.featuresTranslations && Object.keys(editingProduct.featuresTranslations).length > 0) {
          formData.append("featuresTranslations", JSON.stringify(editingProduct.featuresTranslations));
        }

        // Thêm ảnh mới nếu có
        if (imageFile) {
          formData.append("image", imageFile);
        }

        await productAPI.updateProduct(editingProduct._id, formData);
        toast.success(t('admin_toast_product_updated', 'admin'));
      } else {
        // Create new product - requires image file
        if (!imageFile) {
          toast.error(t('invalid_image_error', 'admin'));
          return;
        }

        const formData = new FormData();
        formData.append("name", editingProduct.name);
        formData.append("brand", editingProduct.brand);

        // Handle category based on choice
        if (categoryChoice === "existing" && editingProduct.category) {
          formData.append("category", editingProduct.category._id);
        } else if (categoryChoice === "new" && newCategoryName.trim()) {
          // Send category name - backend will create new category if needed
          formData.append("categoryName", newCategoryName.trim());
        }

        formData.append("price", editingProduct.price);
        formData.append("description", editingProduct.description);
        formData.append("countInStock", String(validCountInStock));
        formData.append("originalPrice", validOriginalPrice !== undefined ? String(validOriginalPrice) : '');
        formData.append("featured", editingProduct.featured ? "true" : "false");
        // Append actual File object, not path string
        formData.append("image", imageFile);

        const response = await productAPI.createProduct(formData);
        toast.success(t('admin_toast_product_created', 'admin'));
      }
      setIsDialogOpen(false);
      setEditingProduct(null);
      setImageFile(null);
      setImagePreview("");
      setCategoryChoice(null);
      setNewCategoryName("");
      setCurrentPage(1);
      await fetchProducts();
    } catch (error) {
      toast.error(t('error_save_data', 'admin'));
    } finally {
      setIsSubmitting(false);
    }
  };

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

      const response = await fetch(`/api/products/${id}/hard`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || t('delete_failed', 'admin').replace('{status}', String(response.status)));
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
        <p>{t('loading')}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1>{isDiscountMode ? t('admin_product_discounts_management', 'admin') : t('permission_manage_products', 'admin')}</h1>
          {isDiscountMode && <p className="text-sm text-gray-500 mt-1">{t('admin_product_discounts_management_desc', 'admin')}</p>}
        </div>
        <div className="flex items-center gap-3">
          {!viewDeletedTab && <span className="text-sm text-gray-600 font-medium">{t('page_indicator', 'admin').replace('{page}', String(currentPage)).replace('{items}', String(itemsPerPage))}</span>}
          {!viewDeletedTab && (
            <Button onClick={handleCreate} className="bg-red-600 hover:bg-red-700">
              <Plus className="w-4 h-4 mr-2" />
              {t('add_product')}
            </Button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg border mb-6">
        <div className="border-b">
          <div className="flex gap-0">
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
              {t('active_products')}
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
              {t('deleted_products')}
            </button>
          </div>
        </div>

        <div className="p-6 border-b">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-64">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  id="product-search"
                  name="product-search"
                  placeholder={t('search_placeholder', 'admin')}
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
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder={t('admin_category', 'admin')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('view_all', 'admin')}</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat._id} value={cat._id}>
                      {cat.translationKey ? t(`products:${cat.translationKey}`) : cat.name}
                    </SelectItem>
                  ))}
                  </SelectContent>
                </Select>
                <Select value={filterBrand} onValueChange={setFilterBrand}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder={t('brands_title', 'admin')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('view_all', 'admin')}</SelectItem>
                    {brands.map((brand) => (
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
                <th className="px-6 py-3 text-left text-xs uppercase">{t('admin_brand', 'admin')}</th>
                <th className="px-6 py-3 text-left text-xs uppercase">{t('admin_category', 'admin')}</th>
                <th className="px-6 py-3 text-left text-xs uppercase">{t('admin_price', 'admin')}</th>
                {!viewDeletedTab && (
                  <>
                    <th className="px-6 py-3 text-left text-xs uppercase">{t('admin_stock_status', 'admin')}</th>
                    <th className="px-6 py-3 text-left text-xs uppercase">{t('rating', 'admin')}</th>
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
                          alt={product.name}
                          loading="lazy"
                          className="w-12 h-12 object-cover rounded"
                        />
                      )}
                      <div>
                        <p className="font-medium">{product.name}</p>
                        {product.featured && (
                          <Badge className="mt-1 bg-red-600">{t('badge_featured', 'admin')}</Badge>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">{product.brand || t('not_updated', 'admin')}</td>
                  <td className="px-6 py-4">
                    {product.category?.name || product.categoryName || product.category || t('not_updated', 'admin')}
                  </td>
                  <td className="px-6 py-4 font-medium">
                    <div>{formatCurrency(product.price)}</div>
                    {product.originalPrice && product.originalPrice > product.price && (
                      <div className="mt-1 flex items-center gap-2 text-xs">
                        <span className="line-through text-gray-500">{formatCurrency(product.originalPrice)}</span>
                        <Badge className="bg-red-600 text-white">
                          -{Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)}%
                        </Badge>
                      </div>
                    )}
                  </td>
                  {!viewDeletedTab && (
                    <>
                      <td className="px-6 py-4">
                        {product.countInStock === null || product.countInStock === undefined ? (
                          <Badge variant="secondary">{t('not_updated', 'admin')}</Badge>
                        ) : (
                          <Badge variant={product.countInStock > 0 ? "default" : "destructive"}>
                            {t('in_stock', 'admin')}: {product.countInStock}
                          </Badge>
                        )}
                      </td>
                      <td className="px-6 py-4">
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
                            title={t('restore', 'admin')}
                          >
                            <RotateCcw className="w-4 h-4 text-green-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteConfirmProduct(product)}
                            title={t('hard_delete', 'admin')}
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(product)}
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
        <DialogContent className="sm:max-w-100 animate-in fade-in zoom-in-95 duration-200">
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
              {t('cancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        setIsDialogOpen(open);
        if (!open) {
          setImageFile(null);
          setImagePreview("");
          setCategoryChoice(null);
          setNewCategoryName("");
          setEditingProduct(null);
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200 bg-gradient-to-b from-white to-slate-50">
          <DialogHeader className="space-y-3 border-b border-slate-200 pb-4">
            <div className="flex items-center gap-3">
              <div className="shrink-0 flex items-center justify-center h-10 w-10 rounded-full bg-blue-100">
                <Package className="h-6 w-6 text-blue-600" />
              </div>
              <DialogTitle className="text-xl font-semibold">
                {editingProduct?._id ? t('admin_edit_product_title', 'admin') : t('admin_add_product_title', 'admin')}
              </DialogTitle>
            </div>
            <DialogDescription>
              {editingProduct?._id ? t('admin_edit_product_desc', 'admin') : t('admin_add_product_desc', 'admin')}
            </DialogDescription>
          </DialogHeader>
          {editingProduct && (
            <div className="space-y-6 py-4 lg:py-5">
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Package className="w-4 h-4 text-blue-600" />
                  {t('basic_info', 'admin')}
                </h3>
                <div className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="product-name" className="text-sm font-medium">{t('admin_product_name', 'admin')} <span className="text-red-500">*</span></Label>
                      <Input
                        id="product-name"
                        name="product-name"
                        value={editingProduct.name}
                        onChange={(e) =>
                          setEditingProduct({ ...editingProduct, name: e.target.value })
                        }
                        placeholder={t('admin_product_name_placeholder', 'admin')}
                        className="transition-colors focus:ring-2 focus:ring-blue-500"
                        autoComplete="off"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="product-brand" className="text-sm font-medium">{t('admin_brand', 'admin')}</Label>
                      <Input
                        id="product-brand"
                        name="product-brand"
                        value={editingProduct.brand || ""}
                        onChange={(e) =>
                          setEditingProduct({ ...editingProduct, brand: e.target.value })
                        }
                        placeholder={t('admin_brand_placeholder', 'admin')}
                        className="transition-colors focus:ring-2 focus:ring-blue-500"
                        autoComplete="off"
                      />
                    </div>
                  </div>

                  {!editingProduct._id && (
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">{t('admin_category', 'admin')} <span className="text-red-500">*</span></Label>
                      <div className="flex gap-3">
                        <Button
                          type="button"
                          variant={categoryChoice === "existing" ? "default" : "outline"}
                          onClick={() => {
                            setCategoryChoice("existing");
                            setNewCategoryName("");
                          }}
                          className="flex-1"
                        >
                          ✓ {t('existing_category', 'admin')}
                        </Button>
                        <Button
                          type="button"
                          variant={categoryChoice === "new" ? "default" : "outline"}
                          onClick={() => {
                            setCategoryChoice("new");
                            setEditingProduct({ ...editingProduct, category: null });
                          }}
                          className="flex-1"
                        >
                          + {t('new_category', 'admin')}
                        </Button>
                      </div>

                      {categoryChoice === "existing" && (
                        <Select
                          value={editingProduct.category?._id || ""}
                          onValueChange={(selectedId) => {
                            const selectedCategory = categories.find((cat) => cat._id === selectedId);
                            setEditingProduct({ ...editingProduct, category: selectedCategory });
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder={t('select_category_placeholder', 'admin')} />
                          </SelectTrigger>
                          <SelectContent>
                            {categories.map((category) => (
                              <SelectItem key={category._id} value={category._id}>
                                {category.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}

                      {categoryChoice === "new" && (
                        <Input
                          id="new-category-name"
                          name="new-category-name"
                          value={newCategoryName}
                          onChange={(e) => setNewCategoryName(e.target.value)}
                          placeholder={t('new_category_name_placeholder', 'admin')}
                          className="transition-colors focus:ring-2 focus:ring-blue-500"
                          autoComplete="off"
                        />
                      )}
                    </div>
                  )}

                  {editingProduct._id && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">{t('admin_category', 'admin')}</Label>
                      <Input
                        value={editingProduct.category?.name || editingProduct.categoryName || editingProduct.category || ""}
                        disabled
                        className="bg-gray-100 text-gray-600"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-blue-600" />
                  {t('price_stock_info', 'admin')}
                </h3>
                <div className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="product-price" className="text-sm font-medium">{t('admin_price', 'admin')} {t('admin_price_currency', 'admin')} <span className="text-red-500">*</span></Label>
                      <Input
                        id="product-price"
                        name="product-price"
                        type="number"
                        value={editingProduct.price || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '') {
                            setEditingProduct({ ...editingProduct, price: 0 });
                          } else {
                            const num = parseFloat(val);
                            if (!isNaN(num) && num > 0) {
                              setEditingProduct({ ...editingProduct, price: num });
                            }
                          }
                        }}
                        placeholder={t('admin_price_placeholder', 'admin')}
                        className="transition-colors focus:ring-2 focus:ring-blue-500"
                        autoComplete="off"
                        onBlur={(e) => {
                          const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                          setEditingProduct({
                            ...editingProduct,
                            price: isNaN(val) || val <= 0 ? 0 : val,
                          });
                        }}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="product-original-price" className="text-sm font-medium">{t('admin_original_price_label', 'admin')}</Label>
                      <Input
                        id="product-original-price"
                        name="product-original-price"
                        type="number"
                        value={editingProduct.originalPrice || ''}
                        onChange={(e) => setEditingProduct({ ...editingProduct, originalPrice: e.target.value })}
                        placeholder={t('admin_original_price_placeholder', 'admin')}
                        className="transition-colors focus:ring-2 focus:ring-blue-500"
                        autoComplete="off"
                      />
                      <p className="text-xs text-gray-500">{t('admin_original_price_help', 'admin')}</p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="product-stock" className="text-sm font-medium">{t('stock_quantity', 'admin')}</Label>
                        <Badge variant={(editingProduct.countInStock ?? 0) > 0 ? "default" : "destructive"} className="text-[11px] uppercase tracking-wide">
                          {(editingProduct.countInStock ?? 0) > 0 ? t('in_stock', 'admin') : t('out_of_stock', 'admin')}
                        </Badge>
                      </div>
                      <Input
                        id="product-stock"
                        name="product-stock"
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        value={editingProduct.countInStock ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '') {
                            setEditingProduct({ ...editingProduct, countInStock: 0 });
                          } else {
                            const num = parseInt(val, 10);
                            if (!isNaN(num) && num >= 0) {
                              setEditingProduct({ ...editingProduct, countInStock: num });
                            }
                          }
                        }}
                        placeholder={t('admin_count_in_stock_placeholder', 'admin')}
                        className="transition-colors focus:ring-2 focus:ring-blue-500"
                        autoComplete="off"
                        onBlur={(e) => {
                          const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                          setEditingProduct({
                            ...editingProduct,
                            countInStock: isNaN(val) || val < 0 ? 0 : val,
                          });
                        }}
                      />
                      <p className="text-xs text-gray-500">{t('stock_quantity_help', 'admin')}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-700">{t('description', 'admin')}</h3>
                <div className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="product-description" className="text-sm font-medium">{t('description', 'admin')}</Label>
                    <Textarea
                      id="product-description"
                      name="product-description"
                      value={editingProduct.description || ""}
                      onChange={(e) =>
                        setEditingProduct({ ...editingProduct, description: e.target.value })
                      }
                      rows={3}
                      placeholder={t('description_placeholder', 'admin')}
                      className="transition-colors focus:ring-2 focus:ring-blue-500"
                      autoComplete="off"
                    />
                  </div>

                  <div className="flex items-center gap-3 p-3 border-l-4 border-blue-600 bg-blue-50 rounded">
                    <Checkbox
                      id="featured"
                      checked={editingProduct.featured || false}
                      onCheckedChange={(checked) =>
                        setEditingProduct({ ...editingProduct, featured: checked })
                      }
                    />
                    <Label htmlFor="featured" className="cursor-pointer font-medium text-sm">
                      {t('admin_mark_featured', 'admin')}
                    </Label>
                  </div>
                </div>
              </div>


              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Upload className="w-4 h-4 text-blue-600" />
                  {t('image', 'admin')} {!editingProduct._id && <span className="text-red-500">*</span>}
                </h3>
                <div className="rounded-xl border-2 border-dashed border-blue-200 bg-white p-5 transition-colors hover:border-blue-500">
                  {imagePreview ? (
                    <div className="space-y-3">
                      <div className="flex justify-center">
                        <img
                          src={imagePreview}
                          alt={t('image_preview_alt', 'admin')}
                          className="w-32 h-32 object-cover rounded-lg shadow-sm"
                        />
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setImageFile(null);
                          setImagePreview("");
                        }}
                        className="w-full"
                        disabled={isUploadingImage}
                      >
                        {t('change_image', 'admin')}
                      </Button>
                    </div>
                  ) : (
                    <>
                      {editingProduct._id && editingProduct.image && (
                        <div className="mb-4 pb-4 border-b border-blue-200">
                          <p className="text-xs text-gray-600 mb-2">{t('current_image', 'admin')}</p>
                          <img
                            src={editingProduct.image}
                            alt={t('current_image_alt', 'admin')}
                            className="w-20 h-20 object-cover rounded-lg"
                          />
                        </div>
                      )}
                      <label className="cursor-pointer block">
                        <div className="flex flex-col items-center justify-center py-8">
                          <div className="flex items-center justify-center h-12 w-12 rounded-full bg-blue-200 mb-3">
                            <Upload className="w-6 h-6 text-blue-600" />
                          </div>
                          <p className="text-sm font-medium text-gray-700">{t('upload_image', 'admin')}</p>
                          <p className="text-xs text-gray-500 mt-1">{t('image_formats_note', 'admin')}</p>
                        </div>
                        <input
                          id="product-image-upload"
                          name="product-image-upload"
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;

                            if (file.size > 5 * 1024 * 1024) {
                              toast.error(t('max_file_size_error', 'admin'));
                              return;
                            }

                            if (!file.type.startsWith('image/')) {
                              toast.error(t('invalid_image_error', 'admin'));
                              return;
                            }

                            setImageFile(file);
                            const reader = new FileReader();
                            reader.onload = (event) => {
                              setImagePreview(event.target?.result as string);
                            };
                            reader.readAsDataURL(file);
                          }}
                          className="hidden"
                          disabled={isUploadingImage}
                        />
                      </label>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 flex flex-row-reverse pt-6 border-t border-slate-200">
            <Button
              onClick={handleSave}
              disabled={isSubmitting || isUploadingImage}
              className="bg-blue-600 hover:bg-blue-700 text-white flex-1 flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              {isSubmitting ? t('processing', 'admin') : (editingProduct?._id ? t('update_btn', 'admin') : t('create_product_btn', 'admin'))}
            </Button>

            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              disabled={isSubmitting}
              className="flex-1"
            >
              {t('cancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

export default function ProductsAdmin() {
  return (
    <AdminLayout>
      <ProductsAdminContent />
    </AdminLayout>
  );
}
