const http = require('http');

const baseUrl = new URL(process.env.BASE_URL || 'http://localhost:5000');

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: baseUrl.hostname,
      port: baseUrl.port || (baseUrl.protocol === 'https:' ? 443 : 80),
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    }, (response) => {
      let data = '';
      response.on('data', chunk => {
        data += chunk;
      });
      response.on('end', () => {
        try {
          resolve({ status: response.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: response.statusCode, data });
        }
      });
    });

    request.on('error', reject);

    if (body) {
      request.write(JSON.stringify(body));
    }

    request.end();
  });
}

async function test() {
  try {
    const response = await makeRequest('GET', '/api/payments/gateways');

    if (response.status !== 200 || !response.data.success) {
      throw new Error(
        `Payment gateway endpoint failed: ${response.status} ${JSON.stringify(response.data)}`
      );
    }

    const gateways = response.data.data?.gateways;
    if (!Array.isArray(gateways)) {
      throw new Error('Payment gateway response is missing the gateways array');
    }
  } catch (error) {
    console.error(`[test-simple] ${error.message}`);
    process.exitCode = 1;
  }
}

test();
