/**
 * Currency Service - Gọi API quản lý tiền tệ từ frontend
 */

export interface Currency {
  _id: string;
  code: string;
  name: string;
  symbol: string;
  position: 'before' | 'after';
  decimalPlaces: number;
  isActive: boolean;
  isDefault: boolean;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ExchangeRate {
  _id: string;
  fromCode: string;
  toCode: string;
  rate: number;
  formattedRate?: string;
  source: 'manual' | 'api' | 'import';
  isActive: boolean;
  rateUpdatedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ConvertResult {
  amount: number;
  fromCode: string;
  toCode: string;
  rate: number;
  formattedRate?: string;
  convertedAmount: number;
}

class CurrencyService {
  private baseUrl = '/api';

  /**
   * Lấy danh sách tất cả mệnh giá
   */
  async fetchCurrencies(isActive?: boolean): Promise<Currency[]> {
    try {
      let url = `${this.baseUrl}/currencies`;
      const params = new URLSearchParams();
      if (isActive !== undefined) {
        params.append('isActive', String(isActive));
      }
      const queryString = params.toString();
      if (queryString) {
        url += `?${queryString}`;
      }

      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.data || [];
    } catch (error) {
      console.error('[CurrencyService] Error fetching currencies:', error);
      throw error;
    }
  }

  /**
   * Lấy mệnh giá theo ID
   */
  async fetchCurrencyById(id: string): Promise<Currency> {
    try {
      const response = await fetch(`${this.baseUrl}/currencies/${id}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[CurrencyService] Error fetching currency:', error);
      }
      throw error;
    }
  }

  /**
   * Tạo mệnh giá mới
   */
  async createCurrency(currencyData: Omit<Currency, '_id' | 'createdAt' | 'updatedAt'>): Promise<Currency> {
    try {
      const response = await fetch(`${this.baseUrl}/currencies`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(currencyData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      console.error('[CurrencyService] Error creating currency:', error);
      throw error;
    }
  }

  /**
   * Cập nhật mệnh giá
   */
  async updateCurrency(id: string, updates: Partial<Currency>): Promise<Currency> {
    try {
      const response = await fetch(`${this.baseUrl}/currencies/${id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      console.error('[CurrencyService] Error updating currency:', error);
      throw error;
    }
  }

  /**
   * Xóa mệnh giá
   */
  async deleteCurrency(id: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/currencies/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }
    } catch (error) {
      console.error('[CurrencyService] Error deleting currency:', error);
      throw error;
    }
  }

  /**
   * Lấy danh sách tất cả tỷ giá
   */
  async fetchExchangeRates(isActive?: boolean): Promise<ExchangeRate[]> {
    try {
      let url = `${this.baseUrl}/exchange-rates`;
      const params = new URLSearchParams();
      if (isActive !== undefined) {
        params.append('isActive', String(isActive));
      }
      const queryString = params.toString();
      if (queryString) {
        url += `?${queryString}`;
      }

      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.data || [];
    } catch (error) {
      console.error('[CurrencyService] Error fetching exchange rates:', error);
      throw error;
    }
  }

  /**
   * Lấy tỷ giá theo ID
   */
  async fetchExchangeRateById(id: string): Promise<ExchangeRate> {
    try {
      const response = await fetch(`${this.baseUrl}/exchange-rates/${id}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      console.error('[CurrencyService] Error fetching exchange rate:', error);
      throw error;
    }
  }

  /**
   * Lấy tỷ giá giữa hai mệnh giá
   */
  async fetchExchangeRatePair(fromCode: string, toCode: string): Promise<ExchangeRate> {
    try {
      const response = await fetch(
        `${this.baseUrl}/exchange-rates/pair/${fromCode}/${toCode}`,
        {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      console.error('[CurrencyService] Error fetching exchange rate pair:', error);
      throw error;
    }
  }

  /**
   * Tạo tỷ giá mới
   */
  async createExchangeRate(
    rateData: Omit<ExchangeRate, '_id' | 'createdAt' | 'updatedAt' | 'rateUpdatedAt'>
  ): Promise<ExchangeRate> {
    try {
      const response = await fetch(`${this.baseUrl}/exchange-rates`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(rateData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      console.error('[CurrencyService] Error creating exchange rate:', error);
      throw error;
    }
  }

  /**
   * Cập nhật tỷ giá
   */
  async updateExchangeRate(id: string, updates: Partial<ExchangeRate>): Promise<ExchangeRate> {
    try {
      const response = await fetch(`${this.baseUrl}/exchange-rates/${id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      console.error('[CurrencyService] Error updating exchange rate:', error);
      throw error;
    }
  }

  /**
   * Xóa tỷ giá
   */
  async deleteExchangeRate(id: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/exchange-rates/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }
    } catch (error) {
      console.error('[CurrencyService] Error deleting exchange rate:', error);
      throw error;
    }
  }

  /**
   * Quy đổi tiền từ một mệnh giá sang mệnh giá khác
   */
  async convertCurrency(amount: number, fromCode: string, toCode: string): Promise<ConvertResult> {
    try {
      const response = await fetch(`${this.baseUrl}/exchange-rates/convert`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount, fromCode, toCode }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      console.error('[CurrencyService] Error converting currency:', error);
      throw error;
    }
  }
}

export default new CurrencyService();
