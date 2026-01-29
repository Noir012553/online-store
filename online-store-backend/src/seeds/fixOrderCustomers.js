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
  try {
    // Tìm tất cả orders không có customer
    const ordersWithoutCustomer = await Order.find({ customer: null, isDeleted: false })
      .populate('user', '_id username email name')
      .lean();

    if (ordersWithoutCustomer.length === 0) {
      return { fixed: 0, created: 0, failed: 0 };
    }

    let fixed = 0;
    let created = 0;
    let failed = 0;

    // Process mỗi order
    for (const order of ordersWithoutCustomer) {
      try {
        let customerId = null;

        // Nếu order có user data, tạo customer từ user
        if (order.user && order.user._id) {
          // Tìm xem đã có customer cho user này chưa
          let customer = await Customer.findOne({
            email: order.user.email
          });

          if (customer) {
            customerId = customer._id;
            fixed++;
          } else {
            // Tạo customer mới từ user data
            const newCustomer = await Customer.create({
              name: order.user.name || order.user.username || 'Unknown Customer',
              email: order.user.email,
              phone: `090${String(Math.random() * 10000000).padStart(7, '0')}`, // Generate fake phone
            });
            customerId = newCustomer._id;
            created++;
          }
        } else {
          // Nếu không có user, tạo customer generic
          const newCustomer = await Customer.create({
            name: `Customer ${order._id.toString().slice(-6)}`,
            email: `order-${order._id.toString().slice(-6)}@generated.com`,
            phone: `090${String(Math.random() * 10000000).padStart(7, '0')}`, // Generate fake phone
          });
          customerId = newCustomer._id;
          created++;
        }

        // Update order với customer ID
        if (customerId) {
          await Order.findByIdAndUpdate(order._id, {
            customer: customerId
          });
        }
      } catch (error) {
        failed++;
      }
    }

    return { fixed, created, failed };
  } catch (error) {
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
