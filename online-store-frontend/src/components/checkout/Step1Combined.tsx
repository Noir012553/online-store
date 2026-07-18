/**
 * Step 1: Combined Address & Shipping Options
 * Combines customer info + address + shipping provider selection into one step
 */

import { useState, useEffect } from 'react';
import { useCheckout } from '../../context/CheckoutContext';
import { useCart } from '../../lib/context/CartContext';
import { useLanguage } from '../../lib/context/LanguageContext';
import { useTranslation } from '../../lib/i18n';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from 'sonner';
import { ShippingProviderSelector, ShippingServiceOption } from './ShippingProviderSelector';
import { shippingAPI, couponAPI } from '../../lib/api';
import { User, MapPin, Phone, Mail, TicketPercent, CheckCircle2, Trash2 } from 'lucide-react';
import { useCurrencyConversion } from '../../hooks/useCurrencyConversion';

interface Province {
  ProvinceID: number;
  ProvinceName: string;
}

interface District {
  DistrictID: number;
  DistrictName: string;
}

interface Ward {
  WardCode: string;
  WardName: string;
}

function getWeightInGrams(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;

  const match = value.trim().match(/^(\d+(?:[.,]\d+)?)\s*(kg|g)?$/i);
  if (!match) return 0;

  const amount = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(amount)) return 0;

  return match[2]?.toLowerCase() === 'kg' ? amount * 1000 : amount;
}

export function Step1Combined() {
  const { t } = useTranslation();
  const { convertCurrency, formatConvertedPrice, targetCurrency } = useCurrencyConversion();
  const {
    formData,
    setFormData,
    setCurrentStepDirect,
    error,
    setError,
    goBack,
    couponCode,
    appliedCoupon,
    isCouponApplying,
    couponError,
    setCouponCode,
    setAppliedCoupon,
    setIsCouponApplying,
    setCouponError,
    clearCoupon,
  } = useCheckout();
  const { items } = useCart();

  // Calculate total weight from cart items (assume 500g per item as default)
  const cartWeight = items.reduce((total, item) => {
    const itemWeight = getWeightInGrams(item.laptop.specs?.weight) || 500;
    return total + itemWeight * item.quantity;
  }, 0);

  const itemsTotal = items.reduce<number | null>((sum, item) => {
    if (sum === null) return null;

    const convertedPrice = convertCurrency(item.unitPrice * item.quantity, item.currencyCode, targetCurrency);
    return convertedPrice === null ? null : sum + convertedPrice;
  }, 0);

  // Ensure minimum weight (at least 100g for API)
  const weight = Math.max(cartWeight, 100);

  const [provinces, setProvinces] = useState<Province[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [selectedProvinceId, setSelectedProvinceId] = useState<number | null>(null);
  const [selectedDistrictId, setSelectedDistrictId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'address' | 'shipping'>('info');
  const [localShippingAddress, setLocalShippingAddress] = useState(
    formData.shippingAddress || {
      name: formData.name || '',
      phone: formData.phone || '',
      address: '',
      provinceId: undefined,
      provinceName: '',
      districtId: undefined,
      districtName: '',
      wardCode: '',
      wardName: '',
    }
  );
  const [selectedService, setSelectedService] = useState<ShippingServiceOption | null>(
    formData.selectedShipping || null
  );

  const productIds = items.map((item) => item.laptop.id || item.laptop._id).filter(Boolean) as string[];

  const handleApplyCoupon = async () => {
    const code = couponCode.trim();

    if (!code) {
      setCouponError(t('coupon_empty_error'));
      return;
    }

    if (itemsTotal === null) return;

    try {
      setIsCouponApplying(true);
      setCouponError(null);
      const response = await couponAPI.calculateDiscount(code, itemsTotal, targetCurrency, productIds);

      // Normalize response - ensure we get the fields we expect
      const appliedCoupon = {
        code: response.coupon || response.code || code.toUpperCase(),
        discountType: response.discountType,
        discountValue: response.discountValue,
        couponCurrencyCode: response.couponCurrencyCode,
        currencyCode: response.currencyCode,
        minimumOrderAmount: response.minimumOrderAmount,
        originalAmount: response.originalAmount,
        discount: response.discount,
        finalAmount: response.finalAmount,
      };

      setAppliedCoupon(appliedCoupon);
      setCouponCode(appliedCoupon.code);
      toast.success(t('coupon_apply_success'));
    } catch (error: any) {
      setAppliedCoupon(null);
      const message = error?.message || t('coupon_apply_error');
      setCouponError(message);
      toast.error(message);
    } finally {
      setIsCouponApplying(false);
    }
  };

  const handleRemoveCoupon = () => {
    clearCoupon();
    toast.success(t('coupon_remove_success'));
  };

  // Load provinces on mount
  useEffect(() => {
    const loadProvinces = async () => {
      try {
        setIsLoadingLocation(true);
        const response = await shippingAPI.getProvinces();
        setProvinces(response.provinces || []);
      } catch (err) {
        toast.error(t('error_load_provinces'));
      } finally {
        setIsLoadingLocation(false);
      }
    };

    loadProvinces();
  }, [t]);

  // Load districts when province changes
  useEffect(() => {
    if (!selectedProvinceId) {
      setDistricts([]);
      return;
    }

    const loadDistricts = async () => {
      try {
        setIsLoadingLocation(true);
        const response = await shippingAPI.getDistricts(selectedProvinceId);
        setDistricts(response.districts || []);
      } catch (err) {
        toast.error(t('error_load_districts'));
      } finally {
        setIsLoadingLocation(false);
      }
    };

    loadDistricts();
  }, [selectedProvinceId, t]);

  // Load wards when district changes
  useEffect(() => {
    if (!selectedDistrictId) {
      setWards([]);
      return;
    }

    const loadWards = async () => {
      try {
        setIsLoadingLocation(true);
        const response = await shippingAPI.getWards(selectedDistrictId);
        setWards(response.wards || []);
      } catch (err) {
        toast.error(t('error_load_wards'));
      } finally {
        setIsLoadingLocation(false);
      }
    };

    loadWards();
  }, [selectedDistrictId, t]);

  const handleProvinceChange = (provinceId: number) => {
    const province = provinces.find((p) => p.ProvinceID === provinceId);
    setSelectedProvinceId(provinceId);
    setSelectedDistrictId(null);
    setLocalShippingAddress((prev) => ({
      ...prev,
      provinceId,
      provinceName: province?.ProvinceName || '',
      districtId: undefined,
      districtName: '',
      wardCode: '',
      wardName: '',
    }));
  };

  const handleDistrictChange = (districtId: number) => {
    const district = districts.find((d) => d.DistrictID === districtId);
    setSelectedDistrictId(districtId);
    setLocalShippingAddress((prev) => ({
      ...prev,
      districtId,
      districtName: district?.DistrictName || '',
      wardCode: '',
      wardName: '',
    }));
  };

  const handleWardChange = (wardCode: string) => {
    const ward = wards.find((w) => w.WardCode === wardCode);
    setLocalShippingAddress((prev) => ({
      ...prev,
      wardCode,
      wardName: ward?.WardName || '',
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate customer info
    if (!formData.name || !formData.phone) {
      setError(t('validation_name_phone_required'));
      return;
    }

    // Validate address
    if (!localShippingAddress.address) {
      setError(t('validation_address_required'));
      return;
    }

    if (!localShippingAddress.districtId || !localShippingAddress.wardCode) {
      setError(t('validation_location_required'));
      return;
    }

    // Validate shipping service selection
    if (!selectedService) {
      setError(t('validation_shipping_service_required'));
      return;
    }

    // All validations passed, save to context and move to next step
    setFormData({
      shippingAddress: {
        ...localShippingAddress,
        phone: formData.phone, // Ensure phone is up-to-date
      },
      selectedShipping: selectedService,
    });

    setError(null);
    setCurrentStepDirect(2);
    toast.success(t('shipping_info_saved_success'));
  };

  return (
    <div className="space-y-6 py-8">
      {/* Step 1.1: Customer Info */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-8">
        <div className="flex items-center gap-3 mb-6">
          <User className="w-6 h-6 text-blue-600" />
          <h2 className="text-2xl font-bold text-gray-900">{t('customer_info_title')}</h2>
        </div>

        <form className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="name" className="text-base font-medium mb-2 block">
                {t('full_name_label')} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={(e) => {
                  setFormData({ name: e.target.value });
                  setError(null);
                }}
                autoComplete="name"
                placeholder={t('full_name_placeholder')}
                required
                className="h-11"
              />
            </div>

            <div>
              <Label htmlFor="phone" className="text-base font-medium mb-2 block">
                {t('phone_label')} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => {
                  setFormData({ phone: e.target.value });
                  setError(null);
                }}
                autoComplete="tel"
                placeholder={t('phone_placeholder')}
                required
                className="h-11"
              />
            </div>

            <div className="md:col-span-2">
              <Label htmlFor="email" className="text-base font-medium mb-2 block">
                {t('email_label')}
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={(e) => {
                  setFormData({ email: e.target.value });
                  setError(null);
                }}
                autoComplete="email"
                placeholder={t('email_placeholder')}
                className="h-11"
              />
            </div>
          </div>
        </form>
      </div>

      {/* Step 1.2: Shipping Address */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-8">
        <div className="flex items-center gap-3 mb-6">
          <MapPin className="w-6 h-6 text-green-600" />
          <h2 className="text-2xl font-bold text-gray-900">{t('shipping_address_title')}</h2>
        </div>

        <form className="space-y-6">
          {/* Địa chỉ chi tiết */}
          <div className="grid grid-cols-1 gap-6">
            <div>
              <Label htmlFor="address-full" className="text-base font-medium mb-2 block">
                {t('address_details_label')} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="address-full"
                name="address"
                value={localShippingAddress.address}
                onChange={(e) => {
                  setLocalShippingAddress({ ...localShippingAddress, address: e.target.value });
                  setError(null);
                }}
                autoComplete="street-address"
                placeholder={t('address_details_placeholder')}
                required
                className="h-11"
              />
            </div>
          </div>

          {/* Tỉnh/Thành, Quận/Huyện, Phường/Xã */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Province */}
            <div>
              <Label htmlFor="province" className="text-base font-medium mb-2 block">
                {t('province_label')} <span className="text-red-500">*</span>
              </Label>
              <select
                id="province"
                name="province"
                value={selectedProvinceId || ''}
                onChange={(e) => handleProvinceChange(Number(e.target.value))}
                disabled={isLoadingLocation || provinces.length === 0}
                autoComplete="address-level1"
                className="w-full h-11 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                required
              >
                <option value="">{t('province_placeholder')}</option>
                {provinces.map((province) => (
                  <option key={province.ProvinceID} value={province.ProvinceID}>
                    {province.ProvinceName}
                  </option>
                ))}
              </select>
            </div>

            {/* District */}
            <div>
              <Label htmlFor="district" className="text-base font-medium mb-2 block">
                {t('district_label')} <span className="text-red-500">*</span>
              </Label>
              <select
                id="district"
                name="district"
                value={selectedDistrictId || ''}
                onChange={(e) => handleDistrictChange(Number(e.target.value))}
                disabled={isLoadingLocation || !selectedProvinceId || districts.length === 0}
                autoComplete="address-level2"
                className="w-full h-11 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                required
              >
                <option value="">{t('district_placeholder')}</option>
                {districts.map((district) => (
                  <option key={district.DistrictID} value={district.DistrictID}>
                    {district.DistrictName}
                  </option>
                ))}
              </select>
            </div>

            {/* Ward */}
            <div>
              <Label htmlFor="ward" className="text-base font-medium mb-2 block">
                {t('ward_label')} <span className="text-red-500">*</span>
              </Label>
              <select
                id="ward"
                name="ward"
                value={localShippingAddress.wardCode || ''}
                onChange={(e) => handleWardChange(e.target.value)}
                disabled={isLoadingLocation || !selectedDistrictId || wards.length === 0}
                autoComplete="address-level3"
                className="w-full h-11 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                required
              >
                <option value="">{t('ward_placeholder')}</option>
                {wards.map((ward) => (
                  <option key={ward.WardCode} value={ward.WardCode}>
                    {ward.WardName}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </form>
      </div>

      {/* Step 1.3: Nhà vận chuyển & Dịch vụ */}
      {selectedDistrictId && localShippingAddress.wardCode && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">{t('shipping_service_title')}</h2>

          <ShippingProviderSelector
            to_districtId={selectedDistrictId}
            to_wardCode={localShippingAddress.wardCode}
            to_provinceName={localShippingAddress.provinceName || ''}
            weight={weight} // Calculated from cart items
            selectedService={selectedService || undefined}
            onSelectService={(service) => {
              setSelectedService(service);
              setError(null);
            }}
          />
        </div>
      )}

      {/* Coupon Code */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-8">
        <div className="flex items-center gap-3 mb-6">
          <TicketPercent className="w-6 h-6 text-red-600" />
          <h2 className="text-2xl font-bold text-gray-900">{t('coupon_label')}</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-end">
          <div>
            <Label htmlFor="coupon-code-step1" className="text-base font-medium mb-2 block">
              {t('coupon_label')}
            </Label>
            <Input
              id="coupon-code-step1"
              value={couponCode}
              onChange={(e) => {
                setCouponCode(e.target.value.toUpperCase());
                setCouponError(null);
                setAppliedCoupon(null);
              }}
              placeholder={t('coupon_placeholder')}
              className="h-11 uppercase"
            />
          </div>

          <div className="flex gap-3">
            <Button
              type="button"
              onClick={handleApplyCoupon}
              disabled={isCouponApplying}
              className="h-11 px-6 bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
            >
              {isCouponApplying ? t('coupon_applying') : t('coupon_apply_button')}
            </Button>
            {appliedCoupon && (
              <Button type="button" variant="outline" onClick={handleRemoveCoupon} className="h-11 gap-2">
                <Trash2 className="w-4 h-4" />
                {t('coupon_remove_button')}
              </Button>
            )}
          </div>
        </div>

        {couponError && <p className="mt-3 text-sm text-red-600">{couponError}</p>}

        {appliedCoupon && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <div>
                <p className="font-semibold text-green-800">
                  {t('coupon_saved_label').replace('{code}', appliedCoupon.code)}
                </p>
                <p className="text-sm text-green-700">
                  {t('coupon_savings_label').replace('{amount}', formatConvertedPrice(appliedCoupon.discount, appliedCoupon.currencyCode))}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 text-sm font-medium">{error}</p>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex justify-between pt-4">
        <Button type="button" onClick={goBack} variant="outline" className="px-8 py-3 h-11">
          {t('back_button')}
        </Button>
        <Button
          type="submit"
          onClick={handleSubmit}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3 h-11 disabled:opacity-50"
        >
          {t('continue_button')}
        </Button>
      </div>
    </div>
  );
}
