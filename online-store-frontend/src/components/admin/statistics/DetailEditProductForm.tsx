import { useTranslation } from '../../../lib/i18n';
import { Label } from '../../ui/label';
import { Input } from '../../ui/input';
import { Textarea } from '../../ui/textarea';
import { Switch } from '../../ui/switch';

interface ProductFormState {
  type: 'product';
  name: string;
  brand: string;
  price: string;
  originalPrice: string;
  countInStock: string;
  description: string;
  featured: boolean;
}

interface DetailEditProductFormProps {
  form: ProductFormState;
  onFormChange: (form: ProductFormState) => void;
  onImageChange: (file: File | null) => void;
}

export function DetailEditProductForm({
  form,
  onFormChange,
  onImageChange,
}: DetailEditProductFormProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4 text-sm text-gray-700">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="product-name">{t('product_name_label')}</Label>
          <Input
            id="product-name"
            className="mt-1"
            value={form.name}
            onChange={(event) =>
              onFormChange({ ...form, name: event.target.value })
            }
          />
        </div>
        <div>
          <Label htmlFor="product-brand">{t('product_brand_label')}</Label>
          <Input
            id="product-brand"
            className="mt-1"
            value={form.brand}
            onChange={(event) =>
              onFormChange({ ...form, brand: event.target.value })
            }
          />
        </div>
        <div>
          <Label htmlFor="product-price">{t('product_price_label')}</Label>
          <Input
            id="product-price"
            type="number"
            className="mt-1"
            value={form.price}
            onChange={(event) =>
              onFormChange({ ...form, price: event.target.value })
            }
          />
        </div>
        <div>
          <Label htmlFor="product-original-price">
            {t('product_original_price_label')}
          </Label>
          <Input
            id="product-original-price"
            type="number"
            className="mt-1"
            value={form.originalPrice}
            onChange={(event) =>
              onFormChange({ ...form, originalPrice: event.target.value })
            }
          />
        </div>
        <div>
          <Label htmlFor="product-stock">{t('product_stock_label')}</Label>
          <Input
            id="product-stock"
            type="number"
            className="mt-1"
            value={form.countInStock}
            onChange={(event) =>
              onFormChange({ ...form, countInStock: event.target.value })
            }
          />
        </div>
        <div className="flex items-center justify-between rounded-xl border border-gray-100 px-4 py-3">
          <div>
            <Label htmlFor="product-featured">
              {t('product_featured_label')}
            </Label>
            <p className="text-xs text-gray-500">{t('product_featured_help')}</p>
          </div>
          <Switch
            id="product-featured"
            checked={form.featured}
            onCheckedChange={(checked) =>
              onFormChange({ ...form, featured: checked })
            }
          />
        </div>
      </div>
      <div>
        <Label htmlFor="product-description">
          {t('product_description_label')}
        </Label>
        <Textarea
          id="product-description"
          className="mt-1 min-h-28"
          value={form.description}
          onChange={(event) =>
            onFormChange({ ...form, description: event.target.value })
          }
        />
      </div>
      <div>
        <Label htmlFor="product-image">{t('product_image_label')}</Label>
        <Input
          id="product-image"
          type="file"
          accept="image/*"
          className="mt-1"
          onChange={(event) => onImageChange(event.target.files?.[0] || null)}
        />
        <p className="mt-2 text-xs text-gray-500">{t('product_image_help')}</p>
      </div>
    </div>
  );
}
