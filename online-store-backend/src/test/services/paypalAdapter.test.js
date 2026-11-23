const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
const PayPalAdapter = require('../../adapters/payment/PayPalAdapter');

const config = {
  clientId: 'sandbox-client-id',
  clientSecret: 'sandbox-client-secret',
  webhookId: 'webhook-id',
  returnUrl: 'https://store.example/return',
  cancelUrl: 'https://store.example/cancel',
  webhookUrl: 'https://api.example/api/payments/webhook/paypal',
};

describe('PayPalAdapter', () => {
  it('authenticates with OAuth and creates a Checkout order with stable request ID', async () => {
    const http = sinon.stub().resolves({
      data: { id: 'PAYPAL-ORDER', links: [{ rel: 'approve', href: 'https://paypal.example/approve' }] },
    });
    http.post = sinon.stub().resolves({ data: { access_token: 'access-token', expires_in: 3600 } });
    const adapter = new PayPalAdapter(config, http);
    const result = await adapter.createOrder({
      orderId: 'local-order', amount: 12.34, currency: 'EUR', requestId: 'create-payment-123',
    });

    expect(result.success).to.equal(true);
    expect(result.data.orderId).to.equal('PAYPAL-ORDER');
    expect(http.post.firstCall.args[0]).to.equal(`${PayPalAdapter.SANDBOX_API}/v1/oauth2/token`);
    expect(http.post.firstCall.args[1]).to.equal('grant_type=client_credentials');
    expect(http.post.firstCall.args[2].headers.Authorization).to.equal(`Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`);
    expect(http.firstCall.args[0].url).to.equal(`${PayPalAdapter.SANDBOX_API}/v2/checkout/orders`);
    expect(http.firstCall.args[0].headers['PayPal-Request-Id']).to.equal('create-payment-123');
    expect(http.firstCall.args[0].data.purchase_units[0].amount).to.deep.equal({ currency_code: 'EUR', value: '12.34' });
    expect(http.firstCall.args[0].data.application_context.return_url).to.equal(config.returnUrl);
  });

  it('captures the named order with idempotency key', async () => {
    const http = sinon.stub().resolves({ data: { status: 'COMPLETED' } });
    http.post = sinon.stub().resolves({ data: { access_token: 'access-token', expires_in: 3600 } });
    const adapter = new PayPalAdapter(config, http);

    const result = await adapter.captureOrder('PAYPAL-ORDER', 'capture-payment-123');

    expect(result.status).to.equal('COMPLETED');
    expect(http.firstCall.args[0].url).to.equal(`${PayPalAdapter.SANDBOX_API}/v2/checkout/orders/PAYPAL-ORDER/capture`);
    expect(http.firstCall.args[0].headers['PayPal-Request-Id']).to.equal('capture-payment-123');
  });

  it('verifies the full webhook event with every required transmission header', async () => {
    const http = sinon.stub().resolves({ data: { verification_status: 'SUCCESS' } });
    http.post = sinon.stub().resolves({ data: { access_token: 'access-token', expires_in: 3600 } });
    const adapter = new PayPalAdapter(config, http);
    const event = { id: 'event-123', event_type: 'CHECKOUT.ORDER.APPROVED' };
    const headers = {
      'paypal-auth-algo': 'SHA256withRSA',
      'paypal-cert-url': 'https://api-m.paypal.com/cert',
      'paypal-transmission-id': 'transmission-id',
      'paypal-transmission-sig': 'signature',
      'paypal-transmission-time': '2025-01-01T00:00:00Z',
    };

    expect(await adapter.verifyWebhook(headers, event)).to.equal(true);
    expect(http.firstCall.args[0].url).to.equal(`${PayPalAdapter.SANDBOX_API}/v1/notifications/verify-webhook-signature`);
    expect(http.firstCall.args[0].data).to.deep.equal({
      auth_algo: headers['paypal-auth-algo'],
      cert_url: headers['paypal-cert-url'],
      transmission_id: headers['paypal-transmission-id'],
      transmission_sig: headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'],
      webhook_id: config.webhookId,
      webhook_event: event,
    });
  });

  it('rejects webhooks missing required transmission headers without provider calls', async () => {
    const http = sinon.stub();
    const adapter = new PayPalAdapter(config, http);
    expect(await adapter.verifyWebhook({}, {})).to.equal(false);
    expect(http.called).to.equal(false);
  });
});
