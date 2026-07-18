import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { MapPin, Package, DollarSign, Plus, X, Truck, AlertCircle } from 'lucide-react';
import { apiCall, orderAPI, productAPI } from '../../../lib/api';
import { useAuth } from '../../../lib/context/AuthContext';
import { useTranslation, useLanguage } from '../../../lib/i18n';
import { useCurrency } from '../../../hooks/useCurrency';
import { useCurrencyConversion } from '../../../hooks/useCurrencyConversion';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { toast } from 'sonner';

interface OrderItem {
  product: string;
  name: string;
  image: string;
  qty: number;
  price: number;
}

interface OrderFormProps {
  mode: 'create' | 'edit';
  orderId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function OrderForm({ mode, orderId, onSuccess, onCancel }: OrderFormProps) {
  const router = useRouter();
  const { t, loadNamespace } = useTranslation();
  const { locale } = useLanguage();
  const { formatConvertedPrice } = useCurrencyConversion();
  const { currency } = useCurrency();

  useEffect(() => {
    loadNamespace('admin');
  }, [loadNamespace]);

  const [isLoading, setIsLoading] = useState(mode === 'edit' && !!orderId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);

  const [form, setForm] = useState({
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    customerAddress: '',
    paymentMethod: 'cod',
    shippingFee: 0,
  });

  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedProductQty, setSelectedProductQty] = useState<number | string>(1);

  // Fetch products for selection
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setIsLoadingProducts(true);
        const response = await productAPI.getProducts(
          1, '', '', '', 100, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, locale
        );
        const productsList = response.products || [];
        setProducts(Array.isArray(productsList) ? productsList : []);
      } catch (error) {
        toast.error(t('error_load_products', 'admin'));
        setProducts([]);
      } finally {
        setIsLoadingProducts(false);
      }
    };

    fetchProducts();
  }, [locale, t]);

  // Fetch order data for edit mode
  useEffect(() => {
    if (mode === 'edit' && orderId) {
      const fetchOrder = async () => {
        try {
          setIsLoading(true);
          const response = await orderAPI.getOrderById?.(orderId, locale);
          // Note: orderAPI might not have getOrderById, so we'll handle this gracefully
          // For now, we'll just show an error
          toast.error(t('feature_not_available', 'common'));
          onCancel?.();
        } catch (error) {
          toast.error(t('error_load_data', 'common'));
          onCancel?.();
        } finally {
          setIsLoading(false);
        }
      };

      fetchOrder();
    }
  }, [mode, orderId, locale, t, onCancel]);

  const handleAddProductToOrder = useCallback(() => {
    const qty = typeof selectedProductQty === 'string' ? parseInt(selectedProductQty, 10) : selectedProductQty;

    if (!selectedProductId || qty < 1 || isNaN(qty)) {
      toast.error(t('error_select_product_qty', 'admin'));
      return;
    }

    const product = products.find((p) => p._id === selectedProductId);
    if (!product) {
      toast.error(t('error_product_not_found', 'admin'));
      return;
    }

    if (product.countInStock < qty) {
      toast.error(`${t('error_insufficient_stock', 'admin')}. ${t('in_stock', 'admin')}: ${product.countInStock}`);
      return;
    }

    const existingIndex = orderItems.findIndex((item) => item.product === selectedProductId);
    if (existingIndex >= 0) {
      const newQty = orderItems[existingIndex].qty + qty;
      if (product.countInStock < newQty) {
        toast.error(`${t('error_insufficient_stock', 'admin')}. ${t('in_stock', 'admin')}: ${product.countInStock}`);
        return;
      }
      const newItems = [...orderItems];
      newItems[existingIndex].qty = newQty;
      setOrderItems(newItems);
    } else {
      setOrderItems([
        ...orderItems,
        {
          product: selectedProductId,
          name: product.name,
          image: product.image,
          qty: qty,
          price: product.price,
        },
      ]);
    }

    setSelectedProductId('');
    setSelectedProductQty(1);
    toast.success(t('toast_product_added', 'admin'));
  }, [selectedProductId, selectedProductQty, orderItems, products, t]);

  const handleRemoveProductFromOrder = useCallback((productId: string) => {
    setOrderItems(orderItems.filter((item) => item.product !== productId));
  }, [orderItems]);

  const calculateTotals = useCallback(() => {
    const itemsPrice = orderItems.reduce((sum, item) => sum + item.price * item.qty, 0);
    const shippingFee = parseFloat(form.shippingFee.toString()) || 0;
    const totalPrice = itemsPrice + shippingFee;
    return { itemsPrice, shippingFee, totalPrice };
  }, [orderItems, form.shippingFee]);

  const handleSubmit = async () => {
    if (!form.customerName || !form.customerPhone) {
      toast.error(t('error_validate_name_phone', 'admin'));
      return;
    }

    const phoneRegex = /^[0-9]{10,11}$/;
    if (!phoneRegex.test(form.customerPhone)) {
      toast.error(t('invalid_phone', 'admin'));
      return;
    }

    if (form.customerEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(form.customerEmail)) {
        toast.error(t('invalid_email', 'admin'));
        return;
      }
    }

    if (orderItems.length === 0) {
      toast.error(t('error_cart_empty', 'admin'));
      return;
    }

    try {
      setIsSubmitting(true);

      await apiCall(`/orders?lang=${locale}`, {
        method: 'POST',
        body: JSON.stringify({
          cartItems: orderItems.map((item) => ({
            productId: item.product,
            quantity: item.qty,
          })),
          shippingFee: form.shippingFee,
          couponCode: null,
          customerName: form.customerName,
          customerEmail: form.customerEmail || undefined,
          customerPhone: form.customerPhone,
          shippingAddress: form.customerAddress
            ? {
                name: form.customerName,
                phone: form.customerPhone,
                address: form.customerAddress,
              }
            : undefined,
          paymentMethod: form.paymentMethod,
          currencyCode: currency.code,
        }),
      });

      toast.success(t('toast_order_created', 'admin'));
      onSuccess?.();
    } catch (error: any) {
      toast.error(error.message || t('error_create_order', 'admin'));
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

  if (mode === 'edit') {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="w-12 h-12 text-yellow-600 mx-auto mb-4" />
        <p className="text-gray-600 mb-4">{t('feature_not_available', 'common')}</p>
        <Button onClick={onCancel}>{t('back', 'common')}</Button>
      </div>
    );
  }

  const totals = calculateTotals();

  return (
    <div className="max-w-2xl mx-auto py-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-2">{t('create_order_title', 'admin')}</h1>
        <p className="text-gray-600">{t('create_order_description', 'admin')}</p>
      </div>

      <div className="bg-white rounded-lg border space-y-6 p-6">
        {/* Customer Info Section */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-blue-600" />
            {t('customer_info', 'admin')}
          </h2>
          <div className="space-y-3">
            <div>
              <Label htmlFor="customer-name" className="text-xs font-medium text-gray-600">
                {t('customer_name', 'admin')} *
              </Label>
              <Input
                id="customer-name"
                value={form.customerName}
                onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                placeholder={t('name_label', 'admin')}
                className="mt-1"
                autoComplete="name"
              />
            </div>
            <div>
              <Label htmlFor="customer-phone" className="text-xs font-medium text-gray-600">
                {t('customer_phone', 'admin')} *
              </Label>
              <Input
                id="customer-phone"
                value={form.customerPhone}
                onChange={(e) => setForm({ ...form, customerPhone: e.target.value })}
                placeholder={t('phone_placeholder', 'admin')}
                className="mt-1"
                autoComplete="tel"
              />
            </div>
            <div>
              <Label htmlFor="customer-email" className="text-xs font-medium text-gray-600">
                {t('customer_email', 'admin')}
              </Label>
              <Input
                id="customer-email"
                type="email"
                value={form.customerEmail}
                onChange={(e) => setForm({ ...form, customerEmail: e.target.value })}
                placeholder={t('email_label', 'admin')}
                className="mt-1"
                autoComplete="email"
              />
            </div>
            <div>
              <Label htmlFor="customer-address" className="text-xs font-medium text-gray-600">
                {t('customer_address', 'admin')}
              </Label>
              <Input
                id="customer-address"
                value={form.customerAddress}
                onChange={(e) => setForm({ ...form, customerAddress: e.target.value })}
                placeholder={t('shipping_address', 'admin')}
                className="mt-1"
                autoComplete="street-address"
              />
            </div>
          </div>
        </div>

        {/* Products Section */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Package className="w-4 h-4 text-blue-600" />
            {t('add_product', 'admin')}
          </h2>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="product-select" className="text-xs font-medium text-gray-600">
                  {t('product', 'admin')}
                </Label>
                <select
                  id="product-select"
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                  disabled={isLoadingProducts}
                >
                  <option value="">
                    {isLoadingProducts ? t('loading', 'common') : t('product_list', 'admin')}
                  </option>
                  {products.map((product) => (
                    <option key={product._id} value={product._id}>
                      {product.name} - {formatConvertedPrice(product.price)} ({t('in_stock', 'admin')}: {product.countInStock})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="product-qty" className="text-xs font-medium text-gray-600">
                  {t('quantity_label', 'admin')}
                </Label>
                <Input
                  id="product-qty"
                  type="number"
                  min="1"
                  value={selectedProductQty || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '') {
                      setSelectedProductQty('');
                    } else {
                      const num = parseInt(val, 10);
                      if (!isNaN(num) && num >= 1) {
                        setSelectedProductQty(num);
                      }
                    }
                  }}
                  className="mt-1"
                  autoComplete="off"
                  onBlur={(e) => {
                    const val = e.target.value === '' ? 1 : parseInt(e.target.value, 10);
                    setSelectedProductQty(isNaN(val) || val < 1 ? 1 : val);
                  }}
                />
              </div>
            </div>
            <Button
              onClick={handleAddProductToOrder}
              disabled={!selectedProductId || isLoadingProducts}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t('add_product', 'admin')}
            </Button>
          </div>

          {orderItems.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-gray-700">
                      {t('product', 'admin')}
                    </th>
                    <th className="px-4 py-2 text-center font-semibold text-gray-700">
                      {t('quantity_label', 'admin')}
                    </th>
                    <th className="px-4 py-2 text-right font-semibold text-gray-700">
                      {t('admin_price', 'admin')}
                    </th>
                    <th className="px-4 py-2 text-right font-semibold text-gray-700">
                      {t('total', 'admin')}
                    </th>
                    <th className="px-4 py-2 text-center font-semibold text-gray-700">
                      {t('admin_actions', 'admin')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {orderItems.map((item) => {
                    const product = products.find((p) => p._id === item.product);
                    return (
                      <tr key={item.product}>
                        <td className="px-4 py-2">{product?.name || t('product_fallback', 'admin')}</td>
                        <td className="px-4 py-2 text-center">{item.qty}</td>
                        <td className="px-4 py-2 text-right">
                          {formatConvertedPrice(item.price)}
                        </td>
                        <td className="px-4 py-2 text-right font-medium text-red-600">
                          {formatConvertedPrice(item.price * item.qty)}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveProductFromOrder(item.product)}
                          >
                            <X className="w-4 h-4 text-red-600" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Shipping & Payment Section */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Truck className="w-4 h-4 text-blue-600" />
            {`${t('shipping_fee', 'admin')} & ${t('payment_info', 'admin')}`}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="shipping-fee" className="text-xs font-medium text-gray-600">
                {t('shipping_fee', 'admin')}
              </Label>
              <Input
                id="shipping-fee"
                type="number"
                min="0"
                step="1000"
                value={form.shippingFee || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '') {
                    setForm({ ...form, shippingFee: 0 });
                  } else {
                    const num = parseFloat(val);
                    if (!isNaN(num) && num >= 0) {
                      setForm({ ...form, shippingFee: num });
                    }
                  }
                }}
                onBlur={(e) => {
                  const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                  setForm({
                    ...form,
                    shippingFee: isNaN(val) || val < 0 ? 0 : val,
                  });
                }}
                placeholder={t('admin_shipping_fee_placeholder', 'admin')}
                className="mt-1"
                autoComplete="off"
              />
            </div>
            <div>
              <Label htmlFor="payment-method" className="text-xs font-medium text-gray-600">
                {t('admin_payment_method', 'admin')}
              </Label>
              <select
                id="payment-method"
                value={form.paymentMethod}
                onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="cod">{t('payment_method_cod', 'admin')}</option>
                <option value="vnpay">{t('payment_method_vnpay', 'admin')}</option>
                <option value="bank_transfer">{t('payment_method_bank_transfer', 'admin')}</option>
                <option value="card">{t('payment_method_card', 'admin')}</option>
              </select>
            </div>
          </div>
        </div>

        {/* Order Summary */}
        {orderItems.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-blue-600" />
              {t('order_info', 'admin')}
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">{t('subtotal', 'admin')}</span>
                <span className="font-medium">
                  {formatConvertedPrice(totals.itemsPrice)}
                </span>
              </div>
              {totals.shippingFee > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('shipping_fee', 'admin')}</span>
                  <span className="font-medium">
                    {formatConvertedPrice(totals.shippingFee)}
                  </span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-blue-200">
                <span className="text-gray-700 font-semibold">{t('total', 'admin')}</span>
                <span className="font-bold text-red-600 text-lg">
                  {formatConvertedPrice(totals.totalPrice)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-6 border-t">
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || orderItems.length === 0}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white"
          >
            {isSubmitting ? t('loading', 'common') : t('create_order_button', 'admin')}
          </Button>
          <Button
            variant="outline"
            onClick={onCancel}
            className="flex-1"
          >
            {t('cancel', 'common')}
          </Button>
        </div>
      </div>
    </div>
  );
}
