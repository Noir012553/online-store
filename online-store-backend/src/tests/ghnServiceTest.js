/**
 * GHN Service Test File
 * Để test: node src/tests/ghnServiceTest.js
 * 
 * Cách sử dụng:
 * 1. Đảm bảo GHN_TOKEN, GHN_SHOP_ID đã được set trong .env
 * 2. Chạy: npm test hoặc node src/tests/ghnServiceTest.js
 */

require('dotenv').config();
const ghnService = require('../services/ghnService');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// Test utilities
let passedTests = 0;
let failedTests = 0;

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function testStart(testName) {
  log(`\n▶ ${testName}...`, 'cyan');
}

function testPass(message) {
  log(`  ✅ ${message}`, 'green');
  passedTests++;
}

function testFail(message, error) {
  log(`  ❌ ${message}`, 'red');
  if (error) {
    log(`     Error: ${error}`, 'red');
  }
  failedTests++;
}

async function runTests() {
  log('\n' + '='.repeat(60), 'blue');
  log('GHN SERVICE TEST SUITE', 'blue');
  log('='.repeat(60), 'blue');

  // Check environment variables
  log('\n📋 Environment Check:', 'cyan');
  if (!process.env.GHN_TOKEN) {
    log('⚠️  GHN_TOKEN not found in .env', 'yellow');
  } else {
    log(`✓ GHN_TOKEN: ${process.env.GHN_TOKEN.substring(0, 10)}...`, 'green');
  }

  if (!process.env.GHN_SHOP_ID) {
    log('⚠️  GHN_SHOP_ID not found in .env', 'yellow');
  } else {
    log(`✓ GHN_SHOP_ID: ${process.env.GHN_SHOP_ID}`, 'green');
  }

  // Test 1: Get Provinces
  testStart('Test 1: getProvinces()');
  try {
    const provinces = await ghnService.getProvinces();
    if (provinces && provinces.length > 0) {
      testPass(`Retrieved ${provinces.length} provinces`);
      testPass(`First province: ${provinces[0].province_name}`);
    } else {
      testFail('No provinces returned');
    }
  } catch (error) {
    testFail('Failed to get provinces', error.message);
  }

  // Test 2: Get Districts (Hà Nội = 1)
  testStart('Test 2: getDistricts(1) - Hà Nội');
  try {
    const districts = await ghnService.getDistricts(1);
    if (districts && districts.length > 0) {
      testPass(`Retrieved ${districts.length} districts`);
      testPass(`First district: ${districts[0].district_name}`);
    } else {
      testFail('No districts returned for Hà Nội');
    }
  } catch (error) {
    testFail('Failed to get districts', error.message);
  }

  // Test 3: Get Wards (Hà Đông, Hà Nội = 1542)
  testStart('Test 3: getWards(1542) - Hà Đông, Hà Nội');
  try {
    const wards = await ghnService.getWards(1542);
    if (wards && wards.length > 0) {
      testPass(`Retrieved ${wards.length} wards`);
      testPass(`First ward: ${wards[0].ward_name}`);
    } else {
      testFail('No wards returned for Hà Đông');
    }
  } catch (error) {
    testFail('Failed to get wards', error.message);
  }

  // Test 4: Get Available Services
  testStart('Test 4: getAvailableServices(1542, 1442) - Hà Đông to Q1 HCM');
  try {
    const services = await ghnService.getAvailableServices(1542, 1442);
    if (services && services.length > 0) {
      testPass(`Retrieved ${services.length} available services`);
      services.forEach((service, idx) => {
        testPass(`  Service ${idx + 1}: ${service.short_name} (ID: ${service.service_id}, Type: ${service.service_type_id})`);
      });
    } else {
      testFail('No available services found');
    }
  } catch (error) {
    testFail('Failed to get available services', error.message);
  }

  // Test 5: Calculate Shipping Fee
  testStart('Test 5: calculateShippingFee() - Hà Đông to Q1 HCM, 1kg');
  try {
    const result = await ghnService.calculateShippingFee({
      serviceId: 0, // Let GHN select
      toDistrictId: 1442, // Q1 HCM
      toWardCode: '20308', // Sample ward
      weight: 1000, // 1kg
      length: 15,
      width: 15,
      height: 15,
      insurance: 0
    });

    if (result.success && result.fee > 0) {
      testPass(`Calculated fee: ${result.fee.toLocaleString('vi-VN')} VND`);
      if (result.data) {
        testPass(`Service: ${result.data.service_name || 'N/A'}`);
      }
    } else {
      testFail('Failed to calculate fee', result.error);
    }
  } catch (error) {
    testFail('Exception in calculateShippingFee', error.message);
  }

  // Test 6: Validation - Missing required fields
  testStart('Test 6: Validation - calculateShippingFee() without required fields');
  try {
    const result = await ghnService.calculateShippingFee({
      weight: 1000
      // Missing: toDistrictId, toWardCode
    });

    if (!result.success && result.error) {
      testPass(`Correctly caught error: ${result.error}`);
    } else {
      testFail('Should have failed due to missing fields');
    }
  } catch (error) {
    testFail('Exception during validation test', error.message);
  }

  // Test 7: Validation - Invalid weight
  testStart('Test 7: Validation - calculateShippingFee() with invalid weight');
  try {
    const result = await ghnService.calculateShippingFee({
      toDistrictId: 1442,
      toWardCode: '20308',
      weight: -100 // Invalid
    });

    if (!result.success && result.error) {
      testPass(`Correctly caught error: ${result.error}`);
    } else {
      testFail('Should have failed due to invalid weight');
    }
  } catch (error) {
    testFail('Exception during validation test', error.message);
  }

  // Summary
  log('\n' + '='.repeat(60), 'blue');
  log(`\nTest Summary:`, 'blue');
  log(`  Passed: ${passedTests} ✅`, 'green');
  log(`  Failed: ${failedTests} ❌`, failedTests > 0 ? 'red' : 'green');
  log(`  Total: ${passedTests + failedTests}`, 'cyan');
  log('='.repeat(60) + '\n', 'blue');

  // Exit with appropriate code
  process.exit(failedTests > 0 ? 1 : 0);
}

// Run tests
runTests().catch((error) => {
  log(`\nUnexpected error: ${error.message}`, 'red');
  process.exit(1);
});
