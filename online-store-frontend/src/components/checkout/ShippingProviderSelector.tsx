import React, { useState, useEffect } from 'react';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Label } from '../ui/label';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { shippingAPI } from '../../lib/api';

export interface ShippingProvider {
  id: string;
  code: string;
  name: string;
  logo?: string;
  description?: string;
  serviceTypes?: Array<{
    code: string;
    name: string;
    estimatedDays: string;
  }>;
}

export interface ShippingServiceOption {
  provider: string;
  providerName: string;
  serviceType: string;
  serviceName: string;
  estimatedDays: string;
  fee: number;
}

interface ShippingProviderSelectorProps {
  to_districtId: number;
  to_wardCode: string;
  to_provinceName: string;
  from_districtId?: number;
  weight?: number;
  onSelectProvider?: (provider: ShippingProvider) => void;
  onSelectService?: (service: ShippingServiceOption) => void;
  selectedProvider?: string;
  selectedService?: ShippingServiceOption;
}

export function ShippingProviderSelector({
  to_districtId,
  to_wardCode,
  to_provinceName,
  from_districtId = 1458,
  weight = 1000,
  onSelectProvider,
  onSelectService,
  selectedProvider,
  selectedService,
}: ShippingProviderSelectorProps) {
  const [providers, setProviders] = useState<ShippingProvider[]>([]);
  const [services, setServices] = useState<ShippingServiceOption[]>([]);
  const [isLoadingProviders, setIsLoadingProviders] = useState(false);
  const [isLoadingServices, setIsLoadingServices] = useState(false);
  const [activeProvider, setActiveProvider] = useState<string>(selectedProvider || '');

  useEffect(() => {
    const loadProviders = async () => {
      try {
        setIsLoadingProviders(true);
        const response = await shippingAPI.getProviders();
        if (response.providers && response.providers.length > 0) {
          setProviders(response.providers);
          // Only set default provider on initial load (when activeProvider is empty)
          setActiveProvider((current) => {
            if (!current && response.providers[0]) {
              return response.providers[0].code;
            }
            return current;
          });
        } else {
          toast.error('Không có nhà vận chuyển nào khả dụng');
        }
      } catch (err) {
        console.error('Failed to load providers:', err);
        toast.error('Lỗi khi tải danh sách nhà vận chuyển');
      } finally {
        setIsLoadingProviders(false);
      }
    };

    loadProviders();
    // Only load providers once on component mount
  }, []);

  useEffect(() => {
    if (!activeProvider || !to_districtId) {
      setServices([]);
      return;
    }

    const loadServices = async () => {
      try {
        setIsLoadingServices(true);
        setServices([]);

        const response = await shippingAPI.calculateShipping(
          { districtId: from_districtId },
          { districtId: to_districtId, wardCode: to_wardCode },
          weight
        );

        if (response.options && response.options.length > 0) {
          const providerServices = response.options.filter(
            (opt: ShippingServiceOption) => opt.provider === activeProvider
          );

          if (providerServices.length > 0) {
            setServices(providerServices);
            if (!selectedService && providerServices[0]) {
              onSelectService?.(providerServices[0]);
            }
          } else {
            toast.warning(`Không có dịch vụ nào khả dụng từ ${activeProvider.toUpperCase()}`);
          }
        } else {
          toast.warning('Không thể tính phí vận chuyển cho địa chỉ này');
        }
      } catch (err) {
        console.error('Failed to load services:', err);
        toast.error('Lỗi khi tính phí vận chuyển');
      } finally {
        setIsLoadingServices(false);
      }
    };

    loadServices();
    // Only recalculate when district or ward changes, not when weight/from changes
  }, [activeProvider, to_districtId, to_wardCode]);

  const handleProviderChange = (providerCode: string) => {
    setActiveProvider(providerCode);
    const selected = providers.find((p) => p.code === providerCode);
    if (selected) {
      onSelectProvider?.(selected);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border border-gray-200 rounded-lg bg-white shadow-sm p-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Chọn nhà vận chuyển</h3>
          <p className="text-sm text-gray-600 mt-1">Chọn đơn vị vận chuyển phù hợp với nhu cầu của bạn</p>
        </div>

        {isLoadingProviders ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            <span>Đang tải danh sách nhà vận chuyển...</span>
          </div>
        ) : providers.length === 0 ? (
          <div className="py-8 text-center text-gray-500">
            Không có nhà vận chuyển nào khả dụng
          </div>
        ) : (
          <RadioGroup value={activeProvider} onValueChange={handleProviderChange}>
            <div className="space-y-3">
              {providers.map((provider) => (
                <div
                  key={provider.code}
                  className="flex items-center space-x-4 rounded-lg border border-gray-200 p-4 hover:border-blue-400 hover:bg-blue-50 transition cursor-pointer"
                >
                  <RadioGroupItem value={provider.code} id={`provider-${provider.code}`} />
                  <Label
                    htmlFor={`provider-${provider.code}`}
                    className="flex-1 cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      {provider.code === 'ghn' ? (
                        <img
                          src="/assets/ghnIcon.jpeg"
                          alt={provider.name}
                          className="h-8 w-8 object-contain"
                        />
                      ) : provider.logo ? (
                        <img
                          src={provider.logo}
                          alt={provider.name}
                          className="h-8 w-8 object-contain"
                        />
                      ) : null}
                      <div>
                        <p className="font-semibold text-gray-900">{provider.name}</p>
                        {provider.description && (
                          <p className="text-sm text-gray-600">{provider.description}</p>
                        )}
                      </div>
                    </div>
                  </Label>
                </div>
              ))}
            </div>
          </RadioGroup>
        )}
      </div>

      {activeProvider && (
        <div className="border border-gray-200 rounded-lg bg-white shadow-sm p-6">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Chọn dịch vụ vận chuyển</h3>
            <p className="text-sm text-gray-600 mt-1">
              Dịch vụ của {providers.find((p) => p.code === activeProvider)?.name || activeProvider}
            </p>
          </div>

          {isLoadingServices ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              <span>Đang tính phí vận chuyển...</span>
            </div>
          ) : services.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
              Không có dịch vụ nào khả dụng cho địa chỉ này
            </div>
          ) : (
            <RadioGroup
              value={selectedService ? JSON.stringify(selectedService) : ''}
              onValueChange={(value) => {
                const selected = JSON.parse(value);
                onSelectService?.(selected);
              }}
            >
              <div className="space-y-3">
                {services.map((service, idx) => (
                  <div
                    key={idx}
                    className="flex items-center space-x-4 rounded-lg border border-gray-200 p-4 hover:border-green-400 hover:bg-green-50 transition cursor-pointer"
                  >
                    <RadioGroupItem value={JSON.stringify(service)} id={`service-${idx}`} />
                    <Label htmlFor={`service-${idx}`} className="flex-1 cursor-pointer flex items-center justify-between">
                      <div className="flex-1">
                        <p className="font-semibold text-gray-900">{service.serviceName}</p>
                        <p className="text-sm text-gray-600">
                          Dự kiến: {service.estimatedDays}
                        </p>
                      </div>
                      <div className="ml-4 text-right shrink-0">
                        <p className="text-lg font-bold text-green-600">
                          {service.fee.toLocaleString('vi-VN')} đ
                        </p>
                      </div>
                    </Label>
                  </div>
                ))}
              </div>
            </RadioGroup>
          )}
        </div>
      )}
    </div>
  );
}
