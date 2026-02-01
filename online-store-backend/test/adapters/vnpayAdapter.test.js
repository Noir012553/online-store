/**
 * Unit Tests for VNPAYAdapter
 * Test: signature creation, verification, payment URL generation, IPN handling
 */

const { expect } = require('chai');
const VnpayAdapter = require('../../src/adapters/payment/VnpayAdapter');

describe('VNPAYAdapter', () => {
  let adapter;
  const mockConfig = {
    partnerId: '2QVCB7H0',
    partnerKey: 'SKLK7H1KJHK7H3H7',
    endpoint: 'https://sandbox.vnpayment.vn/paygate',
    returnUrl: 'http://localhost:3000/checkout/return',
    callbackUrl: 'http://localhost:5000/api/payments/webhook/vnpay',
  };

  beforeEach(() => {
    adapter = new VnpayAdapter(mockConfig);
  });

  describe('Constructor', () => {
    it('should create VnpayAdapter with valid config', () => {
      expect(adapter).to.be.instanceOf(VnpayAdapter);
      expect(adapter.gatewayName).to.equal('VNPAY');
    });

    it('should throw error when instantiated with new', () => {
      const BasePaymentGateway = require('../../src/adapters/payment/BasePaymentGateway');
      expect(() => new BasePaymentGateway()).to.throw();
    });
  });

  describe('validateConfig', () => {
    it('should validate config successfully', () => {
      expect(() => adapter.validateConfig()).to.not.throw();
    });

    it('should throw error when required field is missing', () => {
      const invalidAdapter = new VnpayAdapter({
        partnerId: '2QVCB7H0',
        // Missing partnerKey
      });
      expect(() => invalidAdapter.validateConfig()).to.throw();
    });
  });

  describe('normalizeAmount', () => {
    it('should multiply amount by 100', () => {
      const result = adapter.normalizeAmount(1000);
      expect(result).to.equal(100000);
    });

    it('should handle decimal amounts', () => {
      const result = adapter.normalizeAmount(1000.5);
      expect(result).to.equal(100050);
    });

    it('should handle VND currency', () => {
      const result = adapter.normalizeAmount(5000, 'VND');
      expect(result).to.equal(500000);
    });
  });

  describe('createSignature', () => {
    it('should create HMAC-SHA512 signature', () => {
      const data = 'vnp_Amount=1000&vnp_Command=pay';
      const signature = adapter.createSignature(data, mockConfig.partnerKey, 'sha512');
      expect(signature).to.be.a('string');
      expect(signature.length).to.equal(128); // SHA512 hex = 128 chars
    });

    it('should create HMAC-SHA256 signature', () => {
      const data = 'test_data';
      const signature = adapter.createSignature(data, 'secret_key', 'sha256');
      expect(signature).to.be.a('string');
      expect(signature.length).to.equal(64); // SHA256 hex = 64 chars
    });
  });

  describe('sortObject', () => {
    it('should sort object keys alphabetically', () => {
      const obj = {
        z: 1,
        a: 2,
        m: 3,
      };
      const sorted = adapter.sortObject(obj);
      expect(Object.keys(sorted)).to.deep.equal(['a', 'm', 'z']);
    });

    it('should handle empty object', () => {
      const sorted = adapter.sortObject({});
      expect(sorted).to.deep.equal({});
    });
  });

  describe('formatDate', () => {
    it('should format date as YYYYMMDDHHMMSS', () => {
      const date = new Date('2024-01-15T10:30:45');
      const formatted = adapter.formatDate(date);
      expect(formatted).to.equal('20240115103045');
    });

    it('should pad single digit values', () => {
      const date = new Date('2024-01-05T09:05:03');
      const formatted = adapter.formatDate(date);
      expect(formatted).to.equal('20240105090503');
    });
  });

  describe('parseVnpayDate', () => {
    it('should parse YYYYMMDDHHMMSS date format', () => {
      const parsed = adapter.parseVnpayDate('20240115103045');
      expect(parsed.getFullYear()).to.equal(2024);
      expect(parsed.getMonth()).to.equal(0); // 0 = January
      expect(parsed.getDate()).to.equal(15);
      expect(parsed.getHours()).to.equal(10);
      expect(parsed.getMinutes()).to.equal(30);
      expect(parsed.getSeconds()).to.equal(45);
    });

    it('should return null for invalid date string', () => {
      const parsed = adapter.parseVnpayDate('invalid');
      expect(parsed).to.be.null;
    });

    it('should return null for empty string', () => {
      const parsed = adapter.parseVnpayDate('');
      expect(parsed).to.be.null;
    });
  });

  describe('extractOrderIdFromTxnRef', () => {
    it('should extract orderId from transaction ref', () => {
      const orderId = adapter.extractOrderIdFromTxnRef('ORDER-123-1704067200');
      expect(orderId).to.equal('ORDER');
    });

    it('should handle simple orderId', () => {
      const orderId = adapter.extractOrderIdFromTxnRef('12345-1704067200');
      expect(orderId).to.equal('12345');
    });

    it('should return null for null input', () => {
      const orderId = adapter.extractOrderIdFromTxnRef(null);
      expect(orderId).to.be.null;
    });
  });

  describe('createPaymentUrl', () => {
    it('should create valid payment URL with required fields', async () => {
      const paymentData = {
        orderId: 'ORDER-123',
        amount: 1000000,
        description: 'Payment for order',
        customer: {
          name: 'Nguyen Van A',
          email: 'customer@example.com',
          phone: '0912345678',
        },
        clientIp: '127.0.0.1',
      };

      const result = await adapter.createPaymentUrl(paymentData);

      console.log('\n🧪 DEBUG: createPaymentUrl result:');
      console.log('   Success:', result.success);
      if (result.success) {
        console.log('   TxnRef:', result.data.transactionRef);
        console.log('   Endpoint:', mockConfig.endpoint);
        console.log('   URL includes vnp_SecureHash:', result.data.redirectUrl.includes('vnp_SecureHash'));
        console.log('   URL includes vnp_Email:', result.data.redirectUrl.includes('vnp_Email')); // Should be FALSE
        console.log('   URL includes vnp_PhoneNumber:', result.data.redirectUrl.includes('vnp_PhoneNumber')); // Should be FALSE
      }

      expect(result.success).to.be.true;
      expect(result.data).to.have.property('redirectUrl');
      expect(result.data).to.have.property('transactionRef');
      expect(result.data.redirectUrl).to.include(mockConfig.endpoint);
      expect(result.data.redirectUrl).to.include('vnp_SecureHash');

      // ✅ CRITICAL: Email and Phone should NOT be in URL
      expect(result.data.redirectUrl).to.not.include('vnp_Email');
      expect(result.data.redirectUrl).to.not.include('vnp_PhoneNumber');
    });

    it('should return error for missing clientIp', async () => {
      const paymentData = {
        orderId: 'ORDER-123',
        amount: 1000000,
        description: 'Payment',
      };

      const result = await adapter.createPaymentUrl(paymentData);

      expect(result.success).to.be.false;
      expect(result.error).to.include('clientIp');
    });

    it('should return error for missing orderId', async () => {
      const paymentData = {
        amount: 1000000,
        description: 'Payment',
        clientIp: '127.0.0.1',
      };

      const result = await adapter.createPaymentUrl(paymentData);

      expect(result.success).to.be.false;
      expect(result.error).to.include('orderId');
    });

    it('should return error for missing amount', async () => {
      const paymentData = {
        orderId: 'ORDER-123',
        description: 'Payment',
        clientIp: '127.0.0.1',
      };

      const result = await adapter.createPaymentUrl(paymentData);

      expect(result.success).to.be.false;
      expect(result.error).to.include('amount');
    });

    it('should return error for missing description', async () => {
      const paymentData = {
        orderId: 'ORDER-123',
        amount: 1000000,
        clientIp: '127.0.0.1',
      };

      const result = await adapter.createPaymentUrl(paymentData);

      expect(result.success).to.be.false;
      expect(result.error).to.include('description');
    });
  });

  describe('verifyChecksum', () => {
    it('should verify valid signature', async () => {
      const webhookData = {
        vnp_Amount: '100000',
        vnp_Command: 'pay',
        vnp_TmnCode: mockConfig.partnerId,
        vnp_ResponseCode: '00',
        vnp_TransactionNo: '123456789',
        vnp_TxnRef: 'ORDER-123-1704067200',
      };

      // Create valid signature
      const sortedData = adapter.sortObject(webhookData);
      const signatureData = adapter.formatDataForSignature(sortedData, 'query');
      const validSignature = adapter.createSignature(signatureData, mockConfig.partnerKey, 'sha512');

      const result = await adapter.verifyChecksum(
        { ...webhookData, vnp_SecureHash: validSignature },
        validSignature
      );

      expect(result.valid).to.be.true;
    });

    it('should reject invalid signature', async () => {
      const webhookData = {
        vnp_Amount: '100000',
        vnp_SecureHash: 'INVALID_SIGNATURE_12345678',
      };

      const result = await adapter.verifyChecksum(webhookData, 'INVALID_SIGNATURE_12345678');

      expect(result.valid).to.be.false;
      expect(result.error).to.include('Invalid signature');
    });
  });

  describe('handleIPN', () => {
    it('should handle successful payment IPN', async () => {
      const ipnData = {
        vnp_Amount: '100000',
        vnp_BankCode: 'NCB',
        vnp_BankTranNo: '123456789',
        vnp_CardType: 'ATM',
        vnp_OrderInfo: 'Order-123',
        vnp_PayDate: '20240115103045',
        vnp_ResponseCode: '00', // Success
        vnp_TmnCode: mockConfig.partnerId,
        vnp_TransactionNo: '123456789',
        vnp_TxnRef: 'ORDER-123-1704067200',
      };

      // Mock verifyChecksum to return success
      adapter.verifyChecksum = async () => ({ valid: true });

      const result = await adapter.handleIPN(ipnData);

      expect(result.success).to.be.true;
      expect(result.transaction.status).to.equal('success');
      expect(result.transaction.amount).to.equal(1000); // 100000 / 100
      expect(result.transaction.orderId).to.equal('ORDER');
    });

    it('should handle failed payment IPN', async () => {
      const ipnData = {
        vnp_Amount: '100000',
        vnp_ResponseCode: '09', // Failed
        vnp_TxnRef: 'ORDER-456-1704067200',
      };

      // Mock verifyChecksum
      adapter.verifyChecksum = async () => ({ valid: true });

      const result = await adapter.handleIPN(ipnData);

      expect(result.success).to.be.true;
      expect(result.transaction.status).to.equal('failed');
    });

    it('should reject IPN with invalid signature', async () => {
      const ipnData = {
        vnp_SecureHash: 'INVALID',
      };

      // Mock verifyChecksum to return invalid
      adapter.verifyChecksum = async () => ({ valid: false, error: 'Invalid signature' });

      const result = await adapter.handleIPN(ipnData);

      expect(result.success).to.be.false;
      expect(result.error).to.include('Invalid signature');
    });
  });

  describe('queryTransaction', () => {
    it('should return error (not implemented)', async () => {
      const result = await adapter.queryTransaction('123456');

      expect(result.success).to.be.false;
      expect(result.error).to.include('does not support direct transaction query');
    });
  });

  describe('refund', () => {
    it('should return error (not implemented)', async () => {
      const result = await adapter.refund({
        transactionId: '123456',
        amount: 1000000,
      });

      expect(result.success).to.be.false;
      expect(result.error).to.include('not yet implemented');
    });

    it('should return error for missing transactionId', async () => {
      const result = await adapter.refund({
        amount: 1000000,
      });

      expect(result.success).to.be.false;
      expect(result.error).to.include('Missing required fields');
    });
  });
});
