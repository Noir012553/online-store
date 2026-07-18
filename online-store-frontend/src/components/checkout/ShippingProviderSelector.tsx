import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { shippingAPI } from '../../lib/api';
import { useTranslation } from '../../lib/i18n';
import { useCurrencyConversion } from '../../hooks/useCurrencyConversion';

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
  currencyCode: string;
}

interface ShippingProviderSelectorProps {
  to_districtId: number;
  to_wardCode: string;
  to_provinceName: string;
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
  weight = 1000,
  onSelectProvider,
  onSelectService,
  selectedProvider,
  selectedService,
}: ShippingProviderSelectorProps) {
  const { t } = useTranslation();
  const { formatConvertedPrice } = useCurrencyConversion();
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
          toast.error(t('no_providers_found'));
        }
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error(t('shipping_provider_api_error'), err);
        }
        toast.error(t('error_load_providers'));
      } finally {
        setIsLoadingProviders(false);
      }
    };

    loadProviders();
    // Only load providers once on component mount
  }, [t]);

  useEffect(() => {
    const districtId = Number(to_districtId);
    const normalizedWardCode = to_wardCode.trim();
    const normalizedWeight = Number(weight);

    if (
      !activeProvider ||
      !Number.isInteger(districtId) ||
      districtId <= 0 ||
      !normalizedWardCode ||
      !Number.isFinite(normalizedWeight) ||
      normalizedWeight <= 0
    ) {
      setServices([]);
      return;
    }

    const loadServices = async () => {
      try {
        setIsLoadingServices(true);
        setServices([]);

        const response = await shippingAPI.calculateShipping(
          { districtId, wardCode: normalizedWardCode },
          normalizedWeight
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
            toast.warning(t('service_not_available').replace('{{provider}}', activeProvider.toUpperCase()));
          }
        } else {
          toast.warning(t('no_services_available'));
        }
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error(t('shipping_services_api_error'), err);
        }
        toast.error(t('error_calculate_shipping'));
      } finally {
        setIsLoadingServices(false);
      }
    };

    loadServices();
  }, [activeProvider, to_districtId, to_wardCode, weight, t]);

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
          <h3 className="text-lg font-semibold text-gray-900">{t('select_shipping_provider')}</h3>
          <p className="text-sm text-gray-600 mt-1">{t('select_shipping_provider_desc')}</p>
        </div>

        {isLoadingProviders ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            <span>{t('shipping_provider_loading')}</span>
          </div>
        ) : providers.length === 0 ? (
          <div className="py-8 text-center text-gray-500">
            {t('no_providers_found')}
          </div>
        ) : (
          <div className="space-y-3">
            {providers.map((provider) => (
              <div
                key={provider.code}
                onClick={() => handleProviderChange(provider.code)}
                className="flex items-center gap-3 rounded-lg border border-gray-200 p-4 hover:border-blue-400 hover:bg-blue-50 transition cursor-pointer"
              >
                {provider.code === 'ghn' ? (
                  <img
                    src="/assets/ghnIcon.jpeg"
                    alt={provider.name || provider.code}
                    className="h-8 w-8 object-contain"
                  />
                ) : provider.logo ? (
                  <img
                    src={provider.logo}
                    alt={provider.name || provider.code}
                    className="h-8 w-8 object-contain"
                  />
                ) : null}
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">
                    {t(`shipping_${provider.code}`) || provider.name || provider.code}
                  </p>
                  {provider.description && (
                    <p className="text-sm text-gray-600">
                      {t(`shipping_${provider.code}_desc`) || provider.description}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {activeProvider && (
        <div className="border border-gray-200 rounded-lg bg-white shadow-sm p-6">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-900">{t('select_shipping_service')}</h3>
            <p className="text-sm text-gray-600 mt-1">
              {t('choose_service_from').replace('{{provider}}', providers.find((p) => p.code === activeProvider)?.name || activeProvider)}
            </p>
          </div>

          {isLoadingServices ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              <span>{t('calculating_shipping_fee')}</span>
            </div>
          ) : services.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
              {t('no_services_available')}
            </div>
          ) : (
            <div className="space-y-3">
              {services.map((service, idx) => (
                <div
                  key={idx}
                  onClick={() => onSelectService?.(service)}
                  className="rounded-lg border border-gray-200 p-4 hover:border-green-400 hover:bg-green-50 transition cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">
                        {service.serviceName}
                      </p>
                      <p className="text-sm text-gray-600">
                        {t('estimated_delivery').replace('{{days}}', service.estimatedDays)}
                      </p>
                    </div>
                    <div className="ml-4 text-right shrink-0">
                      <p className="text-lg font-bold text-green-600">
                        {formatConvertedPrice(service.fee, service.currencyCode)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
