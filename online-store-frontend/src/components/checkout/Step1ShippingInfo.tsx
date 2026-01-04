import React from 'react';
import { useCheckout } from '../../context/CheckoutContext';
import { useAddressSelector } from '../../hooks/useAddressSelector';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { toast } from 'sonner';

export function Step1ShippingInfo() {
  const { formData, setFormData, goNext, error, setError } = useCheckout();
  const [showDemoInfo, setShowDemoInfo] = React.useState(true);
  const [isFillingDemo, setIsFillingDemo] = React.useState(false);
  const [pendingDemoFill, setPendingDemoFill] = React.useState(false);

  // Refs để track state mới nhất và tránh stale closure
  const stateRef = React.useRef({
    isLoadingDistricts: false,
    isLoadingWards: false,
    districts: [] as any[],
    wards: [] as any[],
  });

  // ⚡ Use custom hook với client-side caching tối ưu
  const {
    provinces,
    districts,
    wards,
    isLoadingProvinces,
    isLoadingDistricts,
    isLoadingWards,
    handleProvinceChange: onProvinceChange,
    handleDistrictChange: onDistrictChange,
  } = useAddressSelector();


  // Update refs whenever state changes
  React.useEffect(() => {
    stateRef.current = {
      isLoadingDistricts,
      isLoadingWards,
      districts,
      wards,
    };
  }, [isLoadingDistricts, isLoadingWards, districts, wards]);


  // Fill form khi districts & wards đã load xong
  React.useEffect(() => {
    if (!pendingDemoFill || isLoadingDistricts || isLoadingWards) return;

    // Use first ward code from list (API returns simple codes like '1', '4', etc., not '1A0101')
    const demoWardCode = wards.length > 0 ? String(wards[0].code) : '';

    // Tất cả data đã load, fill form ngay
    setFormData({
      name: 'Nguyễn Văn A',
      phone: '0988888888',
      email: 'test@example.com',
      province: '1',
      district: '1',
      ward: demoWardCode,
      address: '48 Bùi Thị Xuân',
      note: 'Test order',
    });

    setPendingDemoFill(false);
    setIsFillingDemo(false);
    toast.success('Đã điền thông tin demo!');
  }, [pendingDemoFill, isLoadingDistricts, isLoadingWards, setFormData, wards]);

  const handleProvinceChange = async (provinceCode: string) => {
    setFormData({ province: provinceCode, district: '', ward: '' });
    setError(null);
    await onProvinceChange(provinceCode);
  };

  const handleDistrictChange = async (districtCode: string) => {
    setFormData({ district: districtCode, ward: '' });
    setError(null);
    await onDistrictChange(districtCode);
  };

  // Helper: Chờ state condition update xong (với delay để đợi setState batch hoàn thành)
  const waitForStateCondition = React.useCallback(
    (condition: () => boolean, timeoutMs = 5000) => {
      return new Promise<void>((resolve) => {
        // Delay nhỏ để setState batch hoàn thành
        setTimeout(() => {
          const checkInterval = setInterval(() => {
            if (condition()) {
              clearInterval(checkInterval);
              resolve();
            }
          }, 20);

          setTimeout(() => {
            clearInterval(checkInterval);
            resolve();
          }, timeoutMs);
        }, 10);
      });
    },
    []
  );

  const fillDemoData = async () => {
    setIsFillingDemo(true);

    // Bước 1: Load districts cho tỉnh 1 (Hà Nội)
    await onProvinceChange('1');

    // Bước 2: Chờ cho đến khi districts load xong
    await waitForStateCondition(
      () => !stateRef.current.isLoadingDistricts && stateRef.current.districts.length > 0,
      3000
    );

    // Bước 3: Load wards cho quận 1
    await onDistrictChange('1');

    // Bước 4: Chờ cho đến khi wards load xong
    await waitForStateCondition(
      () => !stateRef.current.isLoadingWards && stateRef.current.wards.length > 0,
      3000
    );

    // Bước 5: Đánh dấu để useEffect fill form
    setPendingDemoFill(true);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`Đã copy ${label}`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (goNext()) {
      toast.success('Thông tin giao hàng đã được lưu');
    } else {
      toast.error(error || 'Vui lòng điền đầy đủ thông tin');
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Thông tin giao hàng</h2>

      {/* Demo Info Section */}
      <div className="mb-6 border border-blue-200 rounded-lg bg-blue-50 p-4">
        <button
          type="button"
          onClick={() => setShowDemoInfo(!showDemoInfo)}
          className="w-full flex items-center justify-between text-left font-semibold text-blue-900 hover:text-blue-700 transition"
        >
          <span className="flex items-center gap-2">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" />
            </svg>
            🧪 Thông tin Giao Hàng Demo để Test
          </span>
          <svg
            className={`w-5 h-5 transition-transform ${showDemoInfo ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </button>

        {showDemoInfo && (
          <div className="mt-4">
            {/* Shipping Demo */}
            <div>
              <h4 className="font-semibold text-blue-900 mb-3">📦 Thông tin giao hàng demo:</h4>
              <div className="bg-white rounded p-3 space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">
                    <strong>Người nhận:</strong> Nguyễn Văn A
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard('Nguyễn Văn A', 'tên người nhận')}
                    className="text-blue-600 hover:text-blue-700 text-xs font-medium"
                  >
                    📋 Copy
                  </button>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">
                    <strong>SĐT:</strong> 0988888888
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard('0988888888', 'số điện thoại')}
                    className="text-blue-600 hover:text-blue-700 text-xs font-medium"
                  >
                    📋 Copy
                  </button>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">
                    <strong>Địa chỉ:</strong> 48 Bùi Thị Xuân, Hà Nội
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard('48 Bùi Thị Xuân', 'địa chỉ')}
                    className="text-blue-600 hover:text-blue-700 text-xs font-medium"
                  >
                    📋 Copy
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={fillDemoData}
                className="mt-3 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded transition"
              >
                ✨ Tự động điền thông tin demo
              </button>
            </div>

            <p className="text-xs text-blue-700 mt-4 italic">
              ℹ️ Thông tin demo thanh toán sẽ hiển thị khi bạn chọn phương thức thanh toán ở bước 4
            </p>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <Label htmlFor="name" className="text-base font-medium mb-2 block">
              Họ và tên <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ name: e.target.value })}
              placeholder="Nhập họ và tên"
              required
              className="h-11"
            />
          </div>

          <div>
            <Label htmlFor="phone" className="text-base font-medium mb-2 block">
              Số điện thoại <span className="text-red-500">*</span>
            </Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ phone: e.target.value })}
              placeholder="Nhập số điện thoại"
              required
              className="h-11"
            />
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="email" className="text-base font-medium mb-2 block">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ email: e.target.value })}
              placeholder="Nhập email"
              className="h-11"
            />
          </div>

          <div>
            <Label htmlFor="province" className="text-base font-medium mb-2 block">
              Tỉnh/Thành phố <span className="text-red-500">*</span>
            </Label>
            <Select
              value={formData.province}
              onValueChange={handleProvinceChange}
              disabled={isLoadingProvinces}
            >
              <SelectTrigger className="h-11">
                <SelectValue placeholder={isLoadingProvinces ? 'Đang tải...' : 'Chọn tỉnh/thành phố'} />
              </SelectTrigger>
              <SelectContent>
                {provinces.map((province) => (
                  <SelectItem key={province.code} value={String(province.code)}>
                    {province.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="district" className="text-base font-medium mb-2 block">
              Quận/Huyện <span className="text-red-500">*</span>
            </Label>
            <Select
              value={formData.district}
              onValueChange={handleDistrictChange}
              disabled={!formData.province || isLoadingDistricts}
            >
              <SelectTrigger className="h-11">
                <SelectValue placeholder={isLoadingDistricts ? 'Đang tải...' : 'Chọn quận/huyện'} />
              </SelectTrigger>
              <SelectContent>
                {districts.map((district) => (
                  <SelectItem key={district.code} value={String(district.code)}>
                    {district.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="ward" className="text-base font-medium mb-2 block">
              Phường/Xã
            </Label>
            <Select
              value={formData.ward}
              onValueChange={(ward) => {
                setFormData({ ward });
                setError(null);
              }}
              disabled={!formData.district || isLoadingWards}
            >
              <SelectTrigger className="h-11">
                <SelectValue placeholder={isLoadingWards ? 'Đang tải...' : 'Chọn phường/xã'} />
              </SelectTrigger>
              <SelectContent>
                {wards.map((ward) => (
                  <SelectItem key={ward.code} value={String(ward.code)}>
                    {ward.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="address" className="text-base font-medium mb-2 block">
              Địa chỉ cụ thể <span className="text-red-500">*</span>
            </Label>
            <Input
              id="address"
              value={formData.address}
              onChange={(e) => {
                setFormData({ address: e.target.value });
                setError(null);
              }}
              placeholder="Số nhà, tên đường..."
              required
              className="h-11"
            />
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="note" className="text-base font-medium mb-2 block">
              Ghi chú (tùy chọn)
            </Label>
            <Textarea
              id="note"
              value={formData.note}
              onChange={(e) => setFormData({ note: e.target.value })}
              placeholder="Ghi chú thêm về đơn hàng..."
              rows={3}
              className="resize-none"
            />
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 text-sm font-medium">{error}</p>
          </div>
        )}

        <div className="flex justify-end">
          <Button
            type="submit"
            className="bg-red-600 hover:bg-red-700 text-white font-semibold px-8 py-3 h-11"
          >
            Tiếp tục
          </Button>
        </div>
      </form>
    </div>
  );
}
