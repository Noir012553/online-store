/**
 * Migration Script - Memperbaiki Orders yang không có customer data
 * Script ini:
 * 1. Tìm tất cả orders mà không có customer reference
 * 2. Cập nhật orders để link đến customers
 * 3. Hoặc tạo customers mới nếu cần
 */

const mongoose = require('mongoose');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const User = require('../models/User');

/**
 * Fix orders missing customer data
 * Tìm tất cả orders không có customer, và cố gắng tìm/tạo customer data
 */
const fixOrdersWithoutCustomers = async () => {
  console.time('⏱️ fixOrdersWithoutCustomers - Total Time');

  try {
    const startTime = Date.now();

    // 1️⃣ BULK FETCH: Find all orders without customer
    console.log('🔍 [Step 1/5] Fetching orders without customer...');
    const ordersWithoutCustomer = await Order.find({ customer: null, isDeleted: false })
      .populate('user', '_id username email name')
      .lean();

    if (ordersWithoutCustomer.length === 0) {
      console.log('✅ No orders need fixing');
      return { fixed: 0, created: 0, failed: 0 };
    }

    console.log(`📊 Found ${ordersWithoutCustomer.length} orders without customer`);

    // 2️⃣ EXTRACT EMAILS: Get all unique emails that need customer lookup
    console.log('🔄 [Step 2/5] Extracting email list...');
    const emailsWithOrders = new Map();
    const genericOrders = [];

    ordersWithoutCustomer.forEach(order => {
      if (order.user && order.user.email) {
        if (!emailsWithOrders.has(order.user.email)) {
          emailsWithOrders.set(order.user.email, {
            userData: order.user,
            orders: [],
          });
        }
        emailsWithOrders.get(order.user.email).orders.push(order);
      } else {
        genericOrders.push(order);
      }
    });

    console.log(`📧 ${emailsWithOrders.size} unique emails to look up`);
    console.log(`🔧 ${genericOrders.length} orders without user data (need generic customer)`);

    // 3️⃣ BULK LOOKUP: Find ALL existing customers in ONE query using $in operator
    console.time('  ⏱️ Bulk customer lookup');
    const emails = Array.from(emailsWithOrders.keys());
    const existingCustomers = await Customer.find({
      email: { $in: emails },
      isDeleted: false,
    }).lean();

    const customerByEmail = new Map();
    existingCustomers.forEach(c => {
      customerByEmail.set(c.email, c._id);
    });

    console.timeEnd('  ⏱️ Bulk customer lookup');
    console.log(`✅ Found ${existingCustomers.length}/${emails.length} existing customers`);

    // 4️⃣ BULK CREATE: Identify missing customers and create them ALL at once
    console.time('  ⏱️ Bulk create missing customers');
    const toCreate = [];

    for (const [email, { userData }] of emailsWithOrders) {
      if (!customerByEmail.has(email)) {
        // Fallback: Use name/username or generate from email
        // No hardcoded English fallback - seeder internal data only
        const customerName = userData.name || userData.username || `Customer-${email.split('@')[0]}`;
        toCreate.push({
          name: customerName,
          email: email,
          phone: `090${String(Math.random() * 10000000).padStart(7, '0')}`,
        });
      }
    }

    if (toCreate.length > 0) {
      const newCustomers = await Customer.insertMany(toCreate, { ordered: false });
      newCustomers.forEach(c => {
        customerByEmail.set(c.email, c._id);
      });
      console.log(`✅ Created ${newCustomers.length} new customers`);
    }
    console.timeEnd('  ⏱️ Bulk create missing customers');

    // 5️⃣ BULK CREATE GENERIC: Create generic customers for orders without user
    console.time('  ⏱️ Bulk create generic customers');
    const genericsToCreate = genericOrders.map(order => ({
      name: `Customer ${order._id.toString().slice(-6)}`,
      email: `order-${order._id.toString().slice(-6)}@generated.com`,
      phone: `090${String(Math.random() * 10000000).padStart(7, '0')}`,
    }));

    const genericCustomerMap = new Map();
    if (genericsToCreate.length > 0) {
      const genericCustomers = await Customer.insertMany(genericsToCreate, { ordered: false });
      genericCustomers.forEach((c, idx) => {
        genericCustomerMap.set(genericOrders[idx]._id.toString(), c._id);
      });
      console.log(`✅ Created ${genericCustomers.length} generic customers`);
    }
    console.timeEnd('  ⏱️ Bulk create generic customers');

    // 6️⃣ BULK UPDATE: Use bulkWrite to update ALL orders in ONE operation
    console.time('  ⏱️ Bulk update orders');
    const bulkOps = [];

    // Update orders with email-based customers
    for (const [email, { orders }] of emailsWithOrders) {
      const customerId = customerByEmail.get(email);
      if (customerId) {
        orders.forEach(order => {
          bulkOps.push({
            updateOne: {
              filter: { _id: order._id },
              update: { $set: { customer: customerId } },
            },
          });
        });
      }
    }

    // Update orders with generic customers
    genericOrders.forEach(order => {
      const customerId = genericCustomerMap.get(order._id.toString());
      if (customerId) {
        bulkOps.push({
          updateOne: {
            filter: { _id: order._id },
            update: { $set: { customer: customerId } },
          },
        });
      }
    });

    let updateCount = 0;
    if (bulkOps.length > 0) {
      const result = await Order.bulkWrite(bulkOps);
      updateCount = result.modifiedCount;
      console.log(`✅ Updated ${updateCount} orders`);
    }
    console.timeEnd('  ⏱️ Bulk update orders');

    const elapsed = Date.now() - startTime;
    console.timeEnd('⏱️ fixOrdersWithoutCustomers - Total Time');
    console.log(`\n📈 PERFORMANCE SUMMARY:`);
    console.log(`   • Orders processed: ${ordersWithoutCustomer.length}`);
    console.log(`   • Customers created: ${toCreate.length}`);
    console.log(`   • Generic customers: ${genericsToCreate.length}`);
    console.log(`   • Orders updated: ${updateCount}`);
    console.log(`   • Total time: ${(elapsed / 1000).toFixed(2)}s`);

    return {
      fixed: updateCount - toCreate.length - genericsToCreate.length,
      created: toCreate.length + genericsToCreate.length,
      failed: 0,
    };
  } catch (error) {
    console.error('❌ Error in fixOrdersWithoutCustomers:', error.message);
    throw error;
  }
};

/**
 * Verify order customer population
 * Kiểm tra xem orders có được populate customer data đúng không
 */
const verifyOrderCustomers = async () => {
  try {
    const orders = await Order.find({ isDeleted: false })
      .populate('customer', 'name email phone')
      .limit(5)
      .lean();

    if (orders.length === 0) {
      return;
    }

    let withCustomer = 0;
    let withoutCustomer = 0;

    for (const order of orders) {
      const hasCustomer = order.customer && order.customer.name;
      if (hasCustomer) {
        withCustomer++;
      } else {
        withoutCustomer++;
      }
    }
  } catch (error) {
    throw error;
  }
};

module.exports = {
  fixOrdersWithoutCustomers,
  verifyOrderCustomers
};
