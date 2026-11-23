const axios = require('axios');

const SANDBOX_API = 'https://api-m.sandbox.paypal.com';
const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'SEK'];
const PAYPAL_LOCALES = {
  en: 'en_US',
  vi: 'en_US',
  pt: 'pt_BR',
  fr: 'fr_FR',
  de: 'de_DE',
  it: 'it_IT',
  es: 'es_ES',
  nl: 'nl_NL',
  sv: 'sv_SE',
};

class PayPalAdapter {
  constructor(config, http = axios) {
    this.config = config || {};
    this.http = http;
    this.accessToken = null;
    this.accessTokenExpiresAt = 0;
    this.supportedCurrencies = SUPPORTED_CURRENCIES;
  }

  validateConfig() {
    const required = ['clientId', 'clientSecret', 'webhookId', 'returnUrl', 'cancelUrl', 'webhookUrl'];
    if (required.some(key => !this.config[key])) throw new Error('PAYPAL_CONFIG_UNAVAILABLE');
    for (const key of ['returnUrl', 'cancelUrl', 'webhookUrl']) {
      let url;
      try { url = new URL(this.config[key]); } catch { throw new Error('PAYPAL_CONFIG_UNAVAILABLE'); }
      if (url.protocol !== 'https:') throw new Error('PAYPAL_CONFIG_UNAVAILABLE');
    }
  }

  supportsCurrency(currency) {
    return SUPPORTED_CURRENCIES.includes(String(currency || '').toUpperCase());
  }

  async getAccessToken() {
    this.validateConfig();
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt - 30000) return this.accessToken;
    const basic = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');
    const response = await this.http.post(`${SANDBOX_API}/v1/oauth2/token`, 'grant_type=client_credentials', {
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 15000,
    });
    if (!response.data?.access_token) throw new Error('PAYPAL_PROVIDER_ERROR');
    this.accessToken = response.data.access_token;
    this.accessTokenExpiresAt = Date.now() + Math.max(0, Number(response.data.expires_in) || 0) * 1000;
    return this.accessToken;
  }

  async request(method, path, data, requestId) {
    const token = await this.getAccessToken();
    const response = await this.http({
      method,
      url: `${SANDBOX_API}${path}`,
      data,
      timeout: 20000,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(requestId ? { 'PayPal-Request-Id': requestId } : {}),
      },
    });
    return response.data;
  }

  async createOrder({ orderId, amount, currency, description, lang, requestId }) {
    try {
      this.validateConfig();
      if (!this.supportsCurrency(currency) || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
        return { success: false, error: 'PAYMENT_GATEWAY_CURRENCY_UNSUPPORTED' };
      }
      const returnUrl = new URL(this.config.returnUrl);
      returnUrl.searchParams.set('method', 'paypal');
      returnUrl.searchParams.set('orderId', String(orderId));
      const cancelUrl = new URL(this.config.cancelUrl);
      cancelUrl.searchParams.set('method', 'paypal');
      cancelUrl.searchParams.set('orderId', String(orderId));
      cancelUrl.searchParams.set('status', 'cancelled');
      const data = await this.request('post', '/v2/checkout/orders', {
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: String(orderId),
          custom_id: String(orderId),
          description: String(description || `Order ${orderId}`).slice(0, 127),
          amount: { currency_code: currency, value: Number(amount).toFixed(2) },
        }],
        payment_source: {
          paypal: {
            experience_context: {
              payment_method_preference: 'IMMEDIATE_PAYMENT_REQUIRED',
              landing_page: 'LOGIN',
              shipping_preference: 'NO_SHIPPING',
              user_action: 'PAY_NOW',
              locale: PAYPAL_LOCALES[lang] || PAYPAL_LOCALES.en,
              return_url: returnUrl.toString(),
              cancel_url: cancelUrl.toString(),
            },
          },
        },
      }, requestId);
      const approvalUrl = data.links?.find(link => ['payer-action', 'approve'].includes(link.rel))?.href;
      if (!data.id || !approvalUrl) return { success: false, error: 'PAYMENT_PROVIDER_ERROR' };
      return { success: true, data: { order: data, orderId: data.id, approvalUrl } };
    } catch {
      return { success: false, error: 'PAYMENT_PROVIDER_ERROR' };
    }
  }

  async captureOrder(orderId, requestId) {
    return this.request('post', `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {}, requestId);
  }

  async getOrder(orderId) {
    return this.request('get', `/v2/checkout/orders/${encodeURIComponent(orderId)}`);
  }

  async verifyWebhook(headers, event) {
    this.validateConfig();
    const transmission = {
      auth_algo: headers['paypal-auth-algo'],
      cert_url: headers['paypal-cert-url'],
      transmission_id: headers['paypal-transmission-id'],
      transmission_sig: headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'],
    };
    if (Object.values(transmission).some(value => typeof value !== 'string' || !value.trim())) return false;
    try {
      const result = await this.request('post', '/v1/notifications/verify-webhook-signature', {
        ...transmission,
        webhook_id: this.config.webhookId,
        webhook_event: event,
      });
      return result.verification_status === 'SUCCESS';
    } catch {
      return false;
    }
  }
}

PayPalAdapter.SANDBOX_API = SANDBOX_API;
PayPalAdapter.SUPPORTED_CURRENCIES = SUPPORTED_CURRENCIES;
module.exports = PayPalAdapter;
