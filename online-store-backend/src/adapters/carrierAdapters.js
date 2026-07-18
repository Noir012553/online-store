const ghnService = require('../services/ghnService');

class BaseCarrierAdapter {
  constructor(provider) {
    this.provider = provider;
  }

  async calculateShipping(params) {
    throw new Error('calculateShipping() must be implemented');
  }

  async validateAddress(params) {
    throw new Error('validateAddress() must be implemented');
  }

  async getServices(params) {
    throw new Error('getServices() must be implemented');
  }

  async createShipment(params) {
    throw new Error('createShipment() must be implemented');
  }

  async trackShipment(trackingCode) {
    throw new Error('trackShipment() must be implemented');
  }
}

class GHNAdapter extends BaseCarrierAdapter {
  async calculateShipping({ from, to, weight, value, provider, lang }) {
    const { getDefaultLanguage } = require('../config/languageInventory');
    const shippingLang = lang || getDefaultLanguage().code;
    try {
      if (!from?.districtId || !to?.districtId || !to?.wardCode || !weight) {
        return {
          success: false,
          error: 'Missing required parameters: from.districtId, to.districtId, to.wardCode, weight',
        };
      }

      // GHN only operates in VND; fall back gracefully if DB record is missing the field
      const providerCurrencyCode = provider.currencyCode || 'VND';

      const availableServices = await ghnService.getAvailableServices({
        from_district_id: from.districtId,
        to_district_id: to.districtId,
        lang: shippingLang,
      });

      if (availableServices.length === 0) {
        return {
          success: false,
          error: getMessage(shippingLang.toUpperCase(), 'shipment.noServiceAvailable'),
        };
      }

      const feeResults = await Promise.all(
        availableServices.map((service) =>
          this._callGhnFeeEstimate({
            from_district_id: from.districtId,
            to_district_id: to.districtId,
            to_ward_code: to.wardCode,
            weight,
            service_id: service.service_id,
            insurance_value: value || 0,
          })
        )
      );

      const services = [];

      for (let i = 0; i < availableServices.length; i++) {
        const service = availableServices[i];
        const feeResult = feeResults[i];

        if (feeResult.success) {
          const serviceName = service.short_name || service.service_code || String(service.service_id);

          services.push({
            provider: provider.code,
            providerName: provider.name,
            serviceType: serviceName,
            serviceName,
            estimatedDays: service.estimated_delivery_time || '',
            fee: feeResult.data?.total || 0,
            baseFee: feeResult.data?.service_fee || 0,
            otherFee: feeResult.data?.insurance_fee || 0,
          });
        }
      }

      if (services.length === 0) {
        return {
          success: false,
          error: getMessage(shippingLang.toUpperCase(), 'shipment.noServiceAvailable'),
        };
      }

      return {
        success: true,
        data: {
          provider: provider.code,
          providerName: provider.name,
          currencyCode: providerCurrencyCode,
          services: services.sort((a, b) => a.fee - b.fee),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async _callGhnFeeEstimate(params) {
    try {
      const result = await ghnService.calculateShippingFee(params);
      return result;
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async validateAddress({ provinceId, districtId, wardId }) {
    try {
      const result = await ghnService.validateProvincDistrictWard({
        provinceId,
        districtId,
        wardId,
      });

      if (result.valid) {
        return {
          success: true,
          data: result,
        };
      }

      return {
        success: false,
        error: result.error,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async getServices() {
    try {
      const services = ghnService.getServiceTypes();
      return {
        success: true,
        data: services,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async createShipment(params) {
    try {
      const result = await ghnService.createShipment(params);

      if (result.success) {
        // Ensure order_code_norm has a value (fallback to order_code if not provided by GHN)
        const orderCodeNorm = result.data.order_code_norm || result.data.order_code;

        return {
          success: true,
          data: {
            provider: this.provider.code,
            providerName: this.provider.name,
            orderCode: result.data.order_code,
            orderCodeNorm: orderCodeNorm,
            expectedDeliveryTime: result.data.expected_delivery_time,
            totalFee: result.data.total_fee,
            ...result.data,
          },
        };
      }

      return {
        success: false,
        error: result.error,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async getPrintToken(orderCodes) {
    try {
      const result = await ghnService.getPrintToken(orderCodes);

      if (result.success) {
        return {
          success: true,
          data: {
            provider: this.provider.code,
            token: result.data.token,
          },
        };
      }

      return {
        success: false,
        error: result.error,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async trackShipment(trackingCode) {
    throw new Error('GHN trackShipment not yet implemented');
  }
}

module.exports = {
  BaseCarrierAdapter,
  GHNAdapter,
};
