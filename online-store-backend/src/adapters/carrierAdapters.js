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
  async calculateShipping({ from, to, weight, value, provider }) {
    try {
      if (!from?.districtId || !to?.districtId || !to?.wardCode || !weight) {
        return {
          success: false,
          error: 'Missing required parameters: from.districtId, to.districtId, to.wardCode, weight',
        };
      }

      const serviceTypes = ghnService.getServiceTypes();

      const feePromises = serviceTypes.services.map((service) =>
        this._callGhnFeeEstimate({
          from_district_id: from.districtId,
          to_district_id: to.districtId,
          to_ward_code: to.wardCode,
          weight,
          service_id: service.id,
          insurance_value: value || 0,
        })
      );

      const feeResults = await Promise.all(feePromises);

      const services = [];

      for (let i = 0; i < serviceTypes.services.length; i++) {
        const service = serviceTypes.services[i];
        const feeResult = feeResults[i];

        if (feeResult.success) {
          services.push({
            provider: provider.code,
            providerName: provider.name,
            serviceType: service.code,
            serviceName: service.name,
            estimatedDays: service.estimatedDays,
            fee: feeResult.data?.total || 0,
            baseFee: feeResult.data?.service_fee || 0,
            otherFee: feeResult.data?.insurance_fee || 0,
          });
        }
      }

      if (services.length === 0) {
        return {
          success: false,
          error: 'Không có dịch vụ nào khả dụng từ GHN. Vui lòng kiểm tra cấu hình GHN provider.',
        };
      }

      // Log consolidated result at adapter level (only once for all services)
      console.log('✅ [calculateShippingFee] Tính phí thành công:');
      services.forEach((service) => {
        console.log(`   ${service.serviceName}: Phí dịch vụ ${service.baseFee} + Phí bảo hiểm ${service.otherFee} = Tổng ${service.fee} VNĐ`);
      });

      return {
        success: true,
        data: {
          provider: provider.code,
          providerName: provider.name,
          services: services.sort((a, b) => a.fee - b.fee),
        },
      };
    } catch (error) {
      console.error('[GHNAdapter.calculateShipping] Error:', error.message);
      console.error('[GHNAdapter.calculateShipping] Stack:', error.stack);
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
      console.error('_callGhnFeeEstimate error:', error.message);
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
      console.error('GHNAdapter.validateAddress error:', error.message);
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
      console.error('GHNAdapter.getServices error:', error.message);
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
      console.error('GHNAdapter.createShipment error:', error.message);
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
      console.error('GHNAdapter.getPrintToken error:', error.message);
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
