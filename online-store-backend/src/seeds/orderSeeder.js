/**
 * Database Seeder - Khởi tạo dữ liệu đơn hàng
 * Tạo 40 đơn hàng mẫu, ĐỘNG liên kết với khách hàng thực tế từ database
 * Không sử dụng hardcoded data - tất cả được generate từ customers có sẵn
 */

const Order = require('../models/Order');

/**
 * Seed dữ liệu đơn hàng
 * IMPORTANT: Customers MUST be seeded first
 * 
 * @param {Array} products - Danh sách sản phẩm
 * @param {Array} users - Danh sách users
 * @param {Array} customers - Danh sách khách hàng (BẮTBUỘC - phải được seed trước)
 */
const seedOrders = async (products, users, customers) => {
  // ========== VALIDATE INPUTS ==========
  if (!customers || !Array.isArray(customers)) {
    throw new Error('❌ Customers must be an array');
  }

  if (customers.length === 0) {
    throw new Error('❌ No customers provided. Orders cannot be created without customers!');
  }

  // Validate all customers have valid IDs
  const validCustomers = customers.filter(c => c._id && c.name && c.email);

  if (validCustomers.length === 0) {
    throw new Error('❌ No valid customers found. All customers must have _id, name, and email');
  }

  // Validate products
  if (!products || products.length === 0) {
    throw new Error('❌ No products provided');
  }

  // ========== CLEAR EXISTING ORDERS ==========
  const deletedCount = await Order.deleteMany({});

  // ========== GENERATE ORDERS DYNAMICALLY ==========
  const orders = [];
  const paymentMethods = ['Credit Card', 'PayPal', 'Bank Transfer', 'Cash on Delivery'];
  const cities = ['Hà Nội', 'TP HCM', 'Đà Nẵng', 'Hải Phòng', 'Cần Thơ'];
  const streets = ['Nguyễn Huệ', 'Lê Lợi', 'Trần Hưng Đạo', 'Lý Tự Trọng', 'Đông Khới'];

  // Generate 40 orders
  for (let i = 0; i < 40; i++) {
    // Dynamically select customer (round-robin)
    const customerIndex = i % validCustomers.length;
    const customer = validCustomers[customerIndex];

    if (!customer._id) {
      throw new Error(`❌ Order ${i}: Customer has no _id`);
    }

    // Dynamically select product
    const productIndex = i % products.length;
    const product = products[productIndex];
    const qty = Math.floor(Math.random() * 3) + 1;

    // Calculate prices dynamically
    const basePrice = product.price || 1000000;
    const taxPrice = Math.floor(basePrice * 0.1);
    const shippingPrice = 50000;
    const totalPrice = basePrice * qty + taxPrice + shippingPrice;

    // Randomly assign status (40% delivered, 30% paid, 30% pending)
    const randomStatus = Math.random();
    let isPaid, isDelivered, paidAt, deliveredAt;

    if (randomStatus < 0.4) {
      isPaid = true;
      isDelivered = true;
      paidAt = new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000);
      deliveredAt = new Date(paidAt.getTime() + Math.random() * 7 * 24 * 60 * 60 * 1000);
    } else if (randomStatus < 0.7) {
      isPaid = true;
      isDelivered = false;
      paidAt = new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000);
      deliveredAt = null;
    } else {
      isPaid = false;
      isDelivered = false;
      paidAt = null;
      deliveredAt = null;
    }

    // Create order object
    const order = {
      customer: customer._id,
      user: users && users[0] ? users[0]._id : null,
      orderItems: [
        {
          name: product.name,
          qty: qty,
          image: product.image,
          price: basePrice,
          product: product._id,
        }
      ],
      shippingAddress: {
        address: `${100 + i} Đường ${streets[i % streets.length]}`,
        city: cities[i % cities.length],
        postalCode: String(100000 + i * 100),
        country: 'Vietnam',
      },
      paymentMethod: paymentMethods[i % paymentMethods.length],
      taxPrice,
      shippingPrice,
      totalPrice,
      isPaid,
      paidAt,
      isDelivered,
      deliveredAt,
      createdAt: new Date(Date.now() - Math.random() * 60 * 24 * 60 * 60 * 1000),
    };

    orders.push(order);
  }

  // ========== CREATE ORDERS IN DATABASE ==========
  const createdOrders = await Order.create(orders);

  // ========== VERIFY LINKAGE ==========
  let successCount = 0;
  const sampleOrders = createdOrders.slice(0, 10);

  for (const order of sampleOrders) {
    const linkedCustomer = validCustomers.find(c => c._id.toString() === order.customer.toString());

    if (linkedCustomer && linkedCustomer.name) {
      successCount++;
    }
  }

  if (successCount === 0) {
    throw new Error('❌ CRITICAL: No orders have customer linkage!');
  }

  return createdOrders;
};

module.exports = seedOrders;
