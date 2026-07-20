import { useEffect, useState } from 'react';
import { Upload, Package, DollarSign, CheckCircle2, AlertCircle } from "lucide-react";
import { getTranslatedValue, getCategoryName } from "../../../lib/data";
import { productAPI, categoryAPI } from "../../../lib/api";
import { DEFAULT_LOCALE } from "../../../lib/i18n/types";
import { useProductTranslation } from "../../../hooks/useProductTranslation";
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
import { Label } from "../../ui/label";
import { Textarea } from "../../ui/textarea";
import { Checkbox } from "../../ui/checkbox";
import { toast } from "sonner";
import { useTranslation } from "@/lib/i18n";
import { useLanguage } from '@/lib/i18n';
import { useCloudinaryUpload } from "@/hooks/useCloudinaryUpload";
import { useCurrencyContext } from "@/lib/context/CurrencyContext";

interface ProductFormProps {
  mode: 'create' | 'edit';
  productId?: string | string[];
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function ProductForm({ mode, productId, onSuccess, onCancel }: ProductFormProps) {
  const { t, loadNamespace } = useTranslation();
  const { locale } = useLanguage();
  const { activeCurrencies } = useCurrencyContext();
  const { uploadToCloudinary, validateUploadedImage, uploadProgress } = useCloudinaryUpload();

  useEffect(() => {
    loadNamespace('admin');
  }, [loadNamespace]);

  const [categories, setCategories] = useState<any[]>([]);
  const [product, setProduct] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(mode === 'edit');
  const baseCurrencyCode = product?.baseCurrencyCode || '';
  const baseCurrencyLabel = baseCurrencyCode ? `(${baseCurrencyCode})` : '';
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [categoryChoice, setCategoryChoice] = useState<"existing" | "new" | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");

  // Fetch translation for product being edited
  const { translation: productTranslation } = useProductTranslation(
    mode === 'edit' && productId ? String(productId) : ''
  );

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

  // Fetch product for edit mode
  useEffect(() => {
    if (mode === 'edit' && productId) {
      const fetchProduct = async () => {
        try {
          setIsLoading(true);
          const response = await productAPI.getProductById(String(productId), locale);
          const fetchedProduct = response.product || response;
          
          let countInStock = 0;
          if (fetchedProduct.countInStock !== null && fetchedProduct.countInStock !== undefined) {
            const parsed = parseInt(String(fetchedProduct.countInStock), 10);
            countInStock = isNaN(parsed) ? 0 : parsed;
          }

          setProduct({
            ...fetchedProduct,
            name: getTranslatedValue(fetchedProduct.name, locale),
            countInStock,
            originalPrice: fetchedProduct.originalPrice ?? '',
          });
        } catch (error) {
          toast.error(t('error_load_data', 'common'));
          onCancel?.();
        } finally {
          setIsLoading(false);
        }
      };
      fetchProduct();
    } else {
      // Create mode
      setProduct({
        name: "",
        brand: "",
        category: null,
        price: 0,
        originalPrice: '',
        baseCurrencyCode: '',
        image: "",
        rating: 0,
        numReviews: 0,
        countInStock: 0,
        description: "",
        featured: false,
      });
    }
  }, [mode, productId, locale, t, onCancel]);

  // Update editing product name when translation is fetched
  useEffect(() => {
    if (mode === 'edit' && product && productTranslation?.name && locale !== DEFAULT_LOCALE) {
      setProduct((prev: any) => prev ? {
        ...prev,
        name: productTranslation.name
      } : null);
    }
  }, [productTranslation, locale, mode]);

  const handleSave = async () => {
    try {
      if (!product.name || !product.brand || !product.baseCurrencyCode) {
        toast.error(t('error_fill_required', 'admin'));
        return;
      }

      // Validate price
      const numPrice = parseFloat(String(product.price));
      if (isNaN(numPrice) || numPrice <= 0) {
        toast.error(t('admin_price_invalid', 'admin') || 'Giá sản phẩm phải > 0');
        return;
      }

      // Validate category choice for create
      if (!product._id && !categoryChoice) {
        toast.error(t('error_fill_required', 'common'));
        return;
      }

      if (categoryChoice === "existing" && !product.category) {
        toast.error(t('error_select_category', 'admin'));
        return;
      }

      if (categoryChoice === "new" && !newCategoryName.trim()) {
        toast.error(t('error_enter_new_category', 'admin'));
        return;
      }

      // Validate countInStock
      let validCountInStock = 0;
      if (product.countInStock !== null && product.countInStock !== undefined) {
        const parsed = parseInt(String(product.countInStock), 10);
        validCountInStock = isNaN(parsed) ? 0 : Math.max(0, parsed);
      }

      const originalPriceRaw = product.originalPrice === null || product.originalPrice === undefined
        ? ''
        : String(product.originalPrice).trim();
      let validOriginalPrice: number | undefined;
      if (originalPriceRaw) {
        const parsedOriginalPrice = parseFloat(originalPriceRaw);
        if (isNaN(parsedOriginalPrice) || parsedOriginalPrice <= 0 || parsedOriginalPrice <= Number(product.price)) {
          toast.error(t('admin_original_price_invalid', 'admin'));
          return;
        }
        validOriginalPrice = parsedOriginalPrice;
      }

      setIsSubmitting(true);

      let imageUrl: string | null = null;
      let imagePublicId: string | null = null;

      if (imageFile) {
        const uploadResult = await uploadToCloudinary(imageFile, 'admins');
        if (!uploadResult) {
          setIsSubmitting(false);
          return;
        }

        const isValid = await validateUploadedImage(uploadResult);
        if (!isValid) {
          setIsSubmitting(false);
          return;
        }

        imageUrl = uploadResult.secure_url;
        imagePublicId = uploadResult.public_id;
      }

      if (product._id) {
        // Update existing product
        const formData = new FormData();
        formData.append("name", product.name);
        formData.append("brand", product.brand);
        const catId = product.categoryId || (product.category?._id || product.category);
        if (catId) {
          formData.append("category", catId);
        }
        formData.append("price", product.price);
        formData.append("baseCurrencyCode", product.baseCurrencyCode);
        formData.append("description", product.description);
        formData.append("countInStock", String(validCountInStock));
        formData.append("originalPrice", validOriginalPrice !== undefined ? String(validOriginalPrice) : '');

        if (product.featuresTranslations && Object.keys(product.featuresTranslations).length > 0) {
          formData.append("featuresTranslations", JSON.stringify(product.featuresTranslations));
        }

        if (imageUrl) {
          formData.append("image", imageUrl);
          formData.append("imagePublicId", imagePublicId || '');
        }

        await productAPI.updateProduct(product._id, formData);
        toast.success(t('admin_toast_product_updated', 'admin'));
      } else {
        // Create new product
        if (!imageUrl) {
          toast.error(t('invalid_image_error', 'common'));
          return;
        }

        const formData = new FormData();
        formData.append("name", product.name);
        formData.append("brand", product.brand);

        if (categoryChoice === "existing" && product.category) {
          formData.append("category", product.category._id);
        } else if (categoryChoice === "new" && newCategoryName.trim()) {
          formData.append("categoryName", newCategoryName.trim());
        }

        formData.append("price", product.price);
        formData.append("baseCurrencyCode", product.baseCurrencyCode);
        formData.append("description", product.description);
        formData.append("countInStock", String(validCountInStock));
        formData.append("originalPrice", validOriginalPrice !== undefined ? String(validOriginalPrice) : '');
        formData.append("featured", product.featured ? "true" : "false");
        formData.append("image", imageUrl);
        formData.append("imagePublicId", imagePublicId || '');

        await productAPI.createProduct(formData);
        toast.success(t('admin_toast_product_created', 'admin'));
      }
      
      onSuccess?.();
    } catch (error) {
      toast.error(t('error_save_data', 'admin'));
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

  if (!product) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <div className="shrink-0 flex items-center justify-center h-10 w-10 rounded-full bg-blue-100">
            <Package className="h-6 w-6 text-blue-600" />
          </div>
          <h1 className="text-xl font-semibold">
            {mode === 'edit' ? t('admin_edit_product_title', 'admin') : t('admin_add_product_title', 'admin')}
          </h1>
        </div>
        <p className="text-sm text-gray-600">
          {mode === 'edit' ? t('admin_edit_product_desc', 'admin') : t('admin_add_product_desc', 'admin')}
        </p>
      </div>

      {/* Basic Info Section */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Package className="w-4 h-4 text-blue-600" />
          {t('basic_info', 'admin')}
        </h3>
        <div className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="product-name" className="text-sm font-medium">
                {t('admin_product_name', 'admin')} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="product-name"
                name="product-name"
                value={product.name}
                onChange={(e) => setProduct({ ...product, name: e.target.value })}
                placeholder={t('admin_product_name_placeholder', 'admin')}
                className="transition-colors focus:ring-2 focus:ring-blue-500"
                autoComplete="off"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-brand" className="text-sm font-medium">
                {t('admin_brand', 'admin')}
              </Label>
              <Input
                id="product-brand"
                name="product-brand"
                value={product.brand || ""}
                onChange={(e) => setProduct({ ...product, brand: e.target.value })}
                placeholder={t('admin_brand_placeholder', 'admin')}
                className="transition-colors focus:ring-2 focus:ring-blue-500"
                autoComplete="off"
              />
            </div>
          </div>

          {!product._id && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">
                {t('admin_category', 'admin')} <span className="text-red-500">*</span>
              </Label>
              <div className="flex flex-col gap-3 sm:flex-row">
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
                    setProduct({ ...product, category: null });
                  }}
                  className="flex-1"
                >
                  + {t('new_category', 'admin')}
                </Button>
              </div>

              {categoryChoice === "existing" && (
                <Select
                  value={product.category?._id || ""}
                  onValueChange={(selectedId) => {
                    const selectedCategory = categories.find((cat) => cat._id === selectedId);
                    setProduct({ ...product, category: selectedCategory });
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t('select_category_placeholder', 'admin')} />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category._id} value={category._id}>
                        {getCategoryName(category)}
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

          {product._id && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t('admin_category', 'admin')}</Label>
              <Input
                value={product.category?.name || product.categoryName || product.category || ""}
                disabled
                className="bg-gray-100 text-gray-600"
              />
            </div>
          )}
        </div>
      </div>

      {/* Price & Stock Section */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-blue-600" />
          {t('price_stock_info', 'admin')}
        </h3>
        <div className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="product-price" className="text-sm font-medium">
                {t('admin_price', 'admin')} {baseCurrencyLabel} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="product-price"
                name="product-price"
                type="number"
                value={product.price}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '') {
                    setProduct({ ...product, price: '' });
                    return;
                  }

                  const num = parseFloat(val);
                  if (!isNaN(num) && num > 0) {
                    setProduct({ ...product, price: num });
                  }
                }}
                placeholder={t('admin_price_placeholder', 'admin')}
                className="transition-colors focus:ring-2 focus:ring-blue-500"
                autoComplete="off"
                onBlur={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val) && val > 0) {
                    setProduct({ ...product, price: val });
                  }
                }}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-base-currency" className="text-sm font-medium">
                Currency gốc <span className="text-red-500">*</span>
              </Label>
              <Select
                value={product.baseCurrencyCode || undefined}
                onValueChange={(baseCurrencyCode) => setProduct({ ...product, baseCurrencyCode })}
              >
                <SelectTrigger id="product-base-currency" className="w-full">
                  <SelectValue placeholder="Chọn currency" />
                </SelectTrigger>
                <SelectContent>
                  {activeCurrencies.map((currency) => (
                    <SelectItem key={currency.code} value={currency.code}>
                      {currency.code} ({currency.symbol})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-original-price" className="text-sm font-medium">
                {t('admin_original_price_label', 'admin').replace(/\s*\(VND\)/, '')} {baseCurrencyLabel}
              </Label>
              <Input
                id="product-original-price"
                name="product-original-price"
                type="number"
                value={product.originalPrice || ''}
                onChange={(e) => setProduct({ ...product, originalPrice: e.target.value })}
                placeholder={t('admin_original_price_placeholder', 'admin')}
                className="transition-colors focus:ring-2 focus:ring-blue-500"
                autoComplete="off"
              />
              <p className="text-xs text-gray-500">{t('admin_original_price_help', 'admin')}</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="product-stock" className="text-sm font-medium">
                  {t('stock_quantity', 'admin')}
                </Label>
                <Badge variant={(product.countInStock ?? 0) > 0 ? "default" : "destructive"} className="text-[11px] uppercase tracking-wide">
                  {(product.countInStock ?? 0) > 0 ? t('in_stock', 'admin') : t('out_of_stock', 'admin')}
                </Badge>
              </div>
              <Input
                id="product-stock"
                name="product-stock"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={product.countInStock ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '') {
                    setProduct({ ...product, countInStock: 0 });
                  } else {
                    const num = parseInt(val, 10);
                    if (!isNaN(num) && num >= 0) {
                      setProduct({ ...product, countInStock: num });
                    }
                  }
                }}
                placeholder={t('admin_count_in_stock_placeholder', 'admin')}
                className="transition-colors focus:ring-2 focus:ring-blue-500"
                autoComplete="off"
                onBlur={(e) => {
                  const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                  setProduct({
                    ...product,
                    countInStock: isNaN(val) || val < 0 ? 0 : val,
                  });
                }}
              />
              <p className="text-xs text-gray-500">{t('stock_quantity_help', 'admin')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Description Section */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-700">{t('description', 'admin')}</h3>
        <div className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm space-y-4">
          <div className="space-y-2">
            <Label htmlFor="product-description" className="text-sm font-medium">
              {t('description', 'admin')}
            </Label>
            <Textarea
              id="product-description"
              name="product-description"
              value={product.description || ""}
              onChange={(e) => setProduct({ ...product, description: e.target.value })}
              rows={3}
              placeholder={t('description_placeholder', 'admin')}
              className="transition-colors focus:ring-2 focus:ring-blue-500"
              autoComplete="off"
            />
          </div>

          <div className="flex items-center gap-3 p-3 border-l-4 border-blue-600 bg-blue-50 rounded">
            <Checkbox
              id="featured"
              checked={product.featured || false}
              onCheckedChange={(checked) => setProduct({ ...product, featured: checked })}
            />
            <Label htmlFor="featured" className="cursor-pointer font-medium text-sm">
              {t('admin_mark_featured', 'admin')}
            </Label>
          </div>
        </div>
      </div>

      {/* Image Section */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Upload className="w-4 h-4 text-blue-600" />
          {t('image', 'admin')} {!product._id && <span className="text-red-500">*</span>}
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
              {uploadProgress > 0 && uploadProgress < 100 && (
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setImageFile(null);
                  setImagePreview("");
                }}
                className="w-full"
                disabled={isSubmitting}
              >
                {t('change_image', 'admin')}
              </Button>
            </div>
          ) : (
            <>
              {product._id && product.image && (
                <div className="mb-4 pb-4 border-b border-blue-200">
                  <p className="text-xs text-gray-600 mb-2">{t('current_image', 'admin')}</p>
                  <img
                    src={product.image}
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
                  disabled={isSubmitting}
                />
              </label>
            </>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-2 pt-6 sm:flex-row-reverse border-t border-slate-200">
        <Button
          onClick={handleSave}
          disabled={isSubmitting}
          className="bg-blue-600 hover:bg-blue-700 text-white flex-1 flex items-center justify-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4" />
          {isSubmitting ? t('processing', 'admin') : (product._id ? t('update_btn', 'admin') : t('create_product_btn', 'admin'))}
        </Button>

        <Button
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
          className="flex-1"
        >
          {t('cancel', 'admin')}
        </Button>
      </div>
    </div>
  );
}
