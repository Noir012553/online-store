/**
 * Step 2: Shipping Options - Checkout Flow
 * 
 * Quy trình:
 * 1. Khách hàng nhập địa chỉ (Tỉnh -> Quận -> Phường)
 * 2. Hệ thống gửi thông tin tới GHN API (không validate)
 * 3. GHN trả về danh sách nhà vận chuyển và dịch vụ
 * 4. Khách hàng chọn nhà vận chuyển + dịch vụ
 * 5. Lưu lựa chọn vào context
 */

import React, { useState, useEffect } from 'react';
import { useCheckout } from '../../context/CheckoutContext';
import { useCart } from '../../lib/context/CartContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from 'sonner';
import { ShippingProviderSelector, ShippingServiceOption } from './ShippingProviderSelector';
import { shippingAPI } from '../../lib/api';

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

export function Step2ShippingOptions() {
  const { formData, setFormData, setCurrentStepDirect, error, setError, goBack } = useCheckout();
  const { items } = useCart();

  // Calculate total weight from cart items (assume 500g per item as default)
  const cartWeight = items.reduce((total, item) => {
    // If product has weight spec, use it; otherwise default to 500g
    const itemWeight = (item.laptop as any).weight || 500;
    return total + itemWeight * item.quantity;
  }, 0);

  // Ensure minimum weight (at least 100g for API)
  const weight = Math.max(cartWeight, 100);

  const [provinces, setProvinces] = useState<Province[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [selectedProvinceId, setSelectedProvinceId] = useState<number | null>(null);
  const [selectedDistrictId, setSelectedDistrictId] = useState<number | null>(null);
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

  // Load provinces on mount
  useEffect(() => {
    const loadProvinces = async () => {
      try {
        setIsLoadingLocation(true);
        const response = await shippingAPI.getProvinces();
        setProvinces(response.provinces || []);
      } catch (err) {
        toast.error('Không thể tải danh sách tỉnh/thành');
      } finally {
        setIsLoadingLocation(false);
      }
    };

    loadProvinces();
  }, []);

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
        toast.error('Không thể tải danh sách quận/huyện');
      } finally {
        setIsLoadingLocation(false);
      }
    };

    loadDistricts();
  }, [selectedProvinceId]);

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
        toast.error('Không thể tải danh sách phường/xã');
      } finally {
        setIsLoadingLocation(false);
      }
    };

    loadWards();
  }, [selectedDistrictId]);

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

    // Validate address
    if (!localShippingAddress.address) {
      setError('Vui lòng nhập địa chỉ chi tiết');
      return;
    }

    if (!localShippingAddress.districtId || !localShippingAddress.wardCode) {
      setError('Vui lòng chọn đầy đủ tỉnh/thành, quận/huyện, phường/xã');
      return;
    }

    // Validate shipping service selection
    if (!selectedService) {
      setError('Vui lòng chọn nhà vận chuyển và dịch vụ vận chuyển');
      return;
    }

    // All validations passed, save to context and move to next step
    setFormData({
      shippingAddress: localShippingAddress,
      selectedShipping: selectedService,
    });

    setError(null);
    // Move to next step directly since we've already validated locally
    setCurrentStepDirect(3);
    toast.success('Thông tin vận chuyển đã được lưu');
  };

  return (
    <div className="space-y-6 py-8">
      {/* Step 1: Địa chỉ giao hàng */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">1. Địa chỉ giao hàng</h2>

        <form className="space-y-6">
          {/* Họ tên, SĐT, Địa chỉ chi tiết */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="address-name" className="text-base font-medium mb-2 block">
                Họ và tên <span className="text-red-500">*</span>
              </Label>
              <Input
                id="address-name"
                value={localShippingAddress.name}
                onChange={(e) => {
                  setLocalShippingAddress({ ...localShippingAddress, name: e.target.value });
                  setError(null);
                }}
                placeholder="Nhập họ và tên"
                required
                className="h-11"
              />
            </div>

            <div>
              <Label htmlFor="address-phone" className="text-base font-medium mb-2 block">
                Số điện thoại <span className="text-red-500">*</span>
              </Label>
              <Input
                id="address-phone"
                type="tel"
                value={localShippingAddress.phone}
                onChange={(e) => {
                  setLocalShippingAddress({ ...localShippingAddress, phone: e.target.value });
                  setError(null);
                }}
                placeholder="Nhập số điện thoại"
                required
                className="h-11"
              />
            </div>

            <div className="md:col-span-2">
              <Label htmlFor="address-full" className="text-base font-medium mb-2 block">
                Địa chỉ chi tiết <span className="text-red-500">*</span>
              </Label>
              <Input
                id="address-full"
                value={localShippingAddress.address}
                onChange={(e) => {
                  setLocalShippingAddress({ ...localShippingAddress, address: e.target.value });
                  setError(null);
                }}
                placeholder="Nhập địa chỉ (số nhà, tên đường, ...)"
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
                Tỉnh/Thành phố <span className="text-red-500">*</span>
              </Label>
              <select
                id="province"
                value={selectedProvinceId || ''}
                onChange={(e) => handleProvinceChange(Number(e.target.value))}
                disabled={isLoadingLocation || provinces.length === 0}
                className="w-full h-11 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                required
              >
                <option value="">-- Chọn tỉnh/thành --</option>
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
                Quận/Huyện <span className="text-red-500">*</span>
              </Label>
              <select
                id="district"
                value={selectedDistrictId || ''}
                onChange={(e) => handleDistrictChange(Number(e.target.value))}
                disabled={isLoadingLocation || !selectedProvinceId || districts.length === 0}
                className="w-full h-11 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                required
              >
                <option value="">-- Chọn quận/huyện --</option>
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
                Phường/Xã <span className="text-red-500">*</span>
              </Label>
              <select
                id="ward"
                value={localShippingAddress.wardCode || ''}
                onChange={(e) => handleWardChange(e.target.value)}
                disabled={isLoadingLocation || !selectedDistrictId || wards.length === 0}
                className="w-full h-11 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                required
              >
                <option value="">-- Chọn phường/xã --</option>
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

      {/* Step 2: Nhà vận chuyển & Dịch vụ */}
      {selectedDistrictId && localShippingAddress.wardCode && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            2. Chọn nhà vận chuyển &amp; dịch vụ
          </h2>

          <ShippingProviderSelector
            to_districtId={selectedDistrictId}
            to_wardCode={localShippingAddress.wardCode}
            to_provinceName={localShippingAddress.provinceName || ''}
            from_districtId={1458} // Default warehouse
            weight={weight} // Calculated from cart items
            selectedService={selectedService || undefined}
            onSelectService={(service) => {
              setSelectedService(service);
              setError(null);
            }}
          />
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 text-sm font-medium">{error}</p>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex justify-between pt-4">
        <Button type="button" onClick={goBack} variant="outline" className="px-8 py-3 h-11">
          Quay lại
        </Button>
        <Button
          type="submit"
          onClick={handleSubmit}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3 h-11 disabled:opacity-50"
        >
          Tiếp tục
        </Button>
      </div>
    </div>
  );
}
