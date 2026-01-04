/**
 * VNPay Service - Tích hợp API VNPay
 * Xử lý thanh toán qua cổng VNPay
 */

const axios = require('axios');
const crypto = require('crypto');

const VNPAY_TMN_CODE = process.env.VNPAY_TMN_CODE || '';
const VNPAY_HASH_SECRET = process.env.VNPAY_HASH_SECRET || '';
const VNPAY_API_URL = process.env.VNPAY_API_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
const VNPAY_REFUND_API = 'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction';

/**
 * Build VNPay payment URL
 * Dùng để redirect khách hàng tới VNPay để thanh toán
 */
const buildPaymentUrl = (params) => {
  const {
    orderId,
    amount, // Số tiền theo VND
    orderInfo = 'Laptop Store Order',
    returnUrl = 'http://localhost:3000/order-confirmation',
    ipAddr = '127.0.0.1',
    clientIp = '127.0.0.1',
    customerName,
    customerEmail,
    customerPhone,
    address,
    city,
    ward
  } = params;

  // Use clientIp if ipAddr not provided
  const finalIpAddr = ipAddr !== '127.0.0.1' ? ipAddr : clientIp;

  // Tạo request params
  const vnp_Params = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: VNPAY_TMN_CODE,
    vnp_Merchant: 'LaptopStore',
    vnp_OrderInfo: orderInfo,
    vnp_OrderType: 'other',
    vnp_Amount: Math.round(amount * 100), // VNPay yêu cầu amount * 100
    vnp_Locale: 'vn',
    vnp_ReturnUrl: returnUrl,
    vnp_IpAddr: finalIpAddr,
    vnp_TxnRef: orderId,
    vnp_CreateDate: formatDate(new Date())
  };

  // Thêm thông tin khách hàng (optional fields)
  if (customerName) {
    // VNPay requires Vietnamese without accents
    vnp_Params.vnp_Bill_LastName = removeVietnameseAccents(customerName);
  }
  if (customerEmail) {
    // Email không cần loại bỏ dấu
  }
  if (address) {
    vnp_Params.vnp_Bill_Address = removeVietnameseAccents(address);
  }
  if (city) {
    vnp_Params.vnp_Bill_City = removeVietnameseAccents(city);
  }

  // Sort params
  const sortedParams = sortParams(vnp_Params);

  // Build hash string
  let hashString = '';
  for (let key in sortedParams) {
    hashString += `${key}=${sortedParams[key]}&`;
  }
  hashString = hashString.slice(0, -1); // Remove last &

  // Calculate checksum
  const hmac = crypto.createHmac('sha512', VNPAY_HASH_SECRET);
  const signature = hmac.update(Buffer.from(hashString, 'utf-8')).digest('hex');

  // Build final URL
  let paymentUrl = VNPAY_API_URL + '?';
  for (let key in sortedParams) {
    paymentUrl += `${key}=${encodeURIComponent(sortedParams[key])}&`;
  }
  paymentUrl += `vnp_SecureHash=${signature}`;

  return paymentUrl;
};

/**
 * Verify VNPay response (IPN/Return URL)
 * Dùng để kiểm tra xem thanh toán có hợp lệ không
 */
const verifyResponse = (responseData) => {
  const { vnp_SecureHash, ...params } = responseData;

  // Sort params
  const sortedParams = sortParams(params);

  // Build hash string
  let hashString = '';
  for (let key in sortedParams) {
    hashString += `${key}=${sortedParams[key]}&`;
  }
  hashString = hashString.slice(0, -1);

  // Calculate checksum
  const hmac = crypto.createHmac('sha512', VNPAY_HASH_SECRET);
  const signature = hmac.update(Buffer.from(hashString, 'utf-8')).digest('hex');

  // Compare signatures
  if (signature === vnp_SecureHash) {
    // Check payment status
    const transactionStatus = params.vnp_ResponseCode;
    return {
      valid: true,
      success: transactionStatus === '00',
      orderId: params.vnp_TxnRef,
      amount: parseInt(params.vnp_Amount) / 100, // Convert back to VND
      transactionNo: params.vnp_TransactionNo,
      status: transactionStatus
    };
  }

  return {
    valid: false,
    success: false
  };
};

/**
 * Query transaction status from VNPay
 */
const queryTransaction = async (orderId, transactionDate) => {
  try {
    const vnp_Params = {
      vnp_TmnCode: VNPAY_TMN_CODE,
      vnp_TxnRef: orderId,
      vnp_CreateDate: transactionDate
    };

    const sortedParams = sortParams(vnp_Params);
    let hashString = '';
    for (let key in sortedParams) {
      hashString += `${key}=${sortedParams[key]}&`;
    }
    hashString = hashString.slice(0, -1);

    const hmac = crypto.createHmac('sha512', VNPAY_HASH_SECRET);
    const signature = hmac.update(Buffer.from(hashString, 'utf-8')).digest('hex');

    const response = await axios.get(VNPAY_REFUND_API, {
      params: {
        ...sortedParams,
        vnp_SecureHash: signature
      }
    });

    return response.data;
  } catch (error) {
    console.error('VNPay queryTransaction error:', error.message);
    return null;
  }
};

/**
 * Refund transaction
 */
const refundTransaction = async (params) => {
  try {
    const {
      orderId,
      amount,
      transactionDate,
      refundId = new Date().getTime()
    } = params;

    const vnp_Params = {
      vnp_RequestId: refundId,
      vnp_TmnCode: VNPAY_TMN_CODE,
      vnp_TxnRef: orderId,
      vnp_Amount: Math.round(amount * 100),
      vnp_CreateDate: transactionDate
    };

    const sortedParams = sortParams(vnp_Params);
    let hashString = '';
    for (let key in sortedParams) {
      hashString += `${key}=${sortedParams[key]}&`;
    }
    hashString = hashString.slice(0, -1);

    const hmac = crypto.createHmac('sha512', VNPAY_HASH_SECRET);
    const signature = hmac.update(Buffer.from(hashString, 'utf-8')).digest('hex');

    const response = await axios.post(VNPAY_REFUND_API, {
      ...sortedParams,
      vnp_SecureHash: signature
    });

    return response.data;
  } catch (error) {
    console.error('VNPay refundTransaction error:', error.message);
    return null;
  }
};

/**
 * Helper functions
 */
function formatDate(date) {
  const yyyy = date.getFullYear().toString();
  const MM = ('0' + (date.getMonth() + 1)).slice(-2);
  const dd = ('0' + date.getDate()).slice(-2);
  const HH = ('0' + date.getHours()).slice(-2);
  const mm = ('0' + date.getMinutes()).slice(-2);
  const ss = ('0' + date.getSeconds()).slice(-2);

  return yyyy + MM + dd + HH + mm + ss;
}

function removeVietnameseAccents(str) {
  if (!str) return '';

  const vietnameseMap = {
    'À': 'A', 'Á': 'A', 'Ả': 'A', 'Ã': 'A', 'Ạ': 'A',
    'Ă': 'A', 'Ằ': 'A', 'Ắ': 'A', 'Ẳ': 'A', 'Ẵ': 'A', 'Ặ': 'A',
    'Â': 'A', 'Ầ': 'A', 'Ấ': 'A', 'Ẩ': 'A', 'Ẫ': 'A', 'Ậ': 'A',
    'à': 'a', 'á': 'a', 'ả': 'a', 'ã': 'a', 'ạ': 'a',
    'ă': 'a', 'ằ': 'a', 'ắ': 'a', 'ẳ': 'a', 'ẵ': 'a', 'ặ': 'a',
    'â': 'a', 'ầ': 'a', 'ấ': 'a', 'ẩ': 'a', 'ẫ': 'a', 'ậ': 'a',
    'È': 'E', 'É': 'E', 'Ẻ': 'E', 'Ẽ': 'E', 'Ẹ': 'E',
    'Ê': 'E', 'Ề': 'E', 'Ế': 'E', 'Ể': 'E', 'Ễ': 'E', 'Ệ': 'E',
    'è': 'e', 'é': 'e', 'ẻ': 'e', 'ẽ': 'e', 'ẹ': 'e',
    'ê': 'e', 'ề': 'e', 'ế': 'e', 'ể': 'e', 'ễ': 'e', 'ệ': 'e',
    'Ì': 'I', 'Í': 'I', 'Ỉ': 'I', 'Ĩ': 'I', 'Ị': 'I',
    'ì': 'i', 'í': 'i', 'ỉ': 'i', 'ĩ': 'i', 'ị': 'i',
    'Ò': 'O', 'Ó': 'O', 'Ỏ': 'O', 'Õ': 'O', 'Ọ': 'O',
    'Ô': 'O', 'Ồ': 'O', 'Ố': 'O', 'Ổ': 'O', 'Ỗ': 'O', 'Ộ': 'O',
    'Ơ': 'O', 'Ờ': 'O', 'Ớ': 'O', 'Ở': 'O', 'Ỡ': 'O', 'Ợ': 'O',
    'ò': 'o', 'ó': 'o', 'ỏ': 'o', 'õ': 'o', 'ọ': 'o',
    'ô': 'o', 'ồ': 'o', 'ố': 'o', 'ổ': 'o', 'ỗ': 'o', 'ộ': 'o',
    'ơ': 'o', 'ờ': 'o', 'ớ': 'o', 'ở': 'o', 'ỡ': 'o', 'ợ': 'o',
    'Ù': 'U', 'Ú': 'U', 'Ủ': 'U', 'Ũ': 'U', 'Ụ': 'U',
    'Ư': 'U', 'Ừ': 'U', 'Ứ': 'U', 'Ử': 'U', 'Ữ': 'U', 'Ự': 'U',
    'ù': 'u', 'ú': 'u', 'ủ': 'u', 'ũ': 'u', 'ụ': 'u',
    'ư': 'u', 'ừ': 'u', 'ứ': 'u', 'ử': 'u', 'ữ': 'u', 'ự': 'u',
    'Ỳ': 'Y', 'Ý': 'Y', 'Ỷ': 'Y', 'Ỹ': 'Y', 'Ỵ': 'Y',
    'ỳ': 'y', 'ý': 'y', 'ỷ': 'y', 'ỹ': 'y', 'ỵ': 'y',
    'Đ': 'D', 'đ': 'd'
  };

  return str.split('').map(char => vietnameseMap[char] || char).join('');
}

function sortParams(params) {
  const keys = Object.keys(params).sort();
  const sorted = {};
  for (let key of keys) {
    sorted[key] = params[key];
  }
  return sorted;
}

module.exports = {
  buildPaymentUrl,
  verifyResponse,
  queryTransaction,
  refundTransaction
};
