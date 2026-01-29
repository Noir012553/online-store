/**
 * Enhanced Database Seeder - Khởi tạo dữ liệu đơn hàng
 * Tạo ~300 đơn hàng mẫu phân phối across 12 months
 * Dữ liệu ĐỘNG liên kết với khách hàng và sản phẩm thực tế từ database
 */

const Order = require('../models/Order');

/**
 * Generate random date within a specific month/year
 * @param {Number} monthsAgo - Số tháng trước từ hôm nay
 * @returns {Date}
 */
const getRandomDateInMonth = (monthsAgo) => {
  const now = new Date();
  const targetDate = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  
  // Get last day of the month
  const lastDay = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0).getDate();
  const randomDay = Math.floor(Math.random() * lastDay) + 1;
  const randomHour = Math.floor(Math.random() * 24);
  const randomMinute = Math.floor(Math.random() * 60);
  
  return new Date(targetDate.getFullYear(), targetDate.getMonth(), randomDay, randomHour, randomMinute);
};

/**
 * Seed dữ liệu đơn hàng mở rộng
 * Tạo ~300 đơn hàng với data spanning 12 months
 * 
 * @param {Array} products - Danh sách sản phẩm
 * @param {Array} users - Danh sách users
 * @param {Array} customers - Danh sách khách hàng (BẮTBUỘC)
 */
const seedOrdersEnhanced = async (products, users, customers) => {
  // ========== VALIDATE INPUTS ==========
  if (!customers || !Array.isArray(customers)) {
    throw new Error('❌ Customers must be an array');
  }

  if (customers.length === 0) {
    throw new Error('❌ No customers provided. Orders cannot be created without customers!');
  }

  const validCustomers = customers.filter(c => c._id && c.name && c.email);

  if (validCustomers.length === 0) {
    throw new Error('❌ No valid customers found. All customers must have _id, name, and email');
  }

  if (!products || products.length === 0) {
    throw new Error('❌ No products provided');
  }

  // ========== CLEAR EXISTING ORDERS ==========
  const deletedCount = await Order.deleteMany({});
  console.log(`🗑️  Deleted ${deletedCount.deletedCount} existing orders`);

  // ========== GENERATE ORDERS DYNAMICALLY ==========
  const orders = [];

  // Create ~600 orders: 25 orders per month × 24 months (2 years)
  const ordersPerMonth = 25;
  const monthsRange = 24; // Go back 24 months for year-based charts

  for (let month = 0; month < monthsRange; month++) {
    for (let orderInMonth = 0; orderInMonth < ordersPerMonth; orderInMonth++) {
      const orderIndex = month * ordersPerMonth + orderInMonth;
      
      // Dynamically select customer (round-robin through valid customers)
      const customerIndex = orderIndex % validCustomers.length;
      const customer = validCustomers[customerIndex];

      if (!customer._id) {
        throw new Error(`❌ Order ${orderIndex}: Customer has no _id`);
      }

      // Dynamically select product (vary products)
      const productIndex = orderIndex % products.length;
      const product = products[productIndex];
      const qty = Math.floor(Math.random() * 4) + 1; // 1-4 items per order

      // Calculate prices dynamically
      const basePrice = product.price || 1000000;
      const taxPrice = Math.floor(basePrice * qty * 0.1);
      const totalPrice = basePrice * qty + taxPrice;

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
        taxPrice,
        totalPrice,
        createdAt: getRandomDateInMonth(month),
      };

      orders.push(order);
    }
  }

  console.log(`📦 Generated ${orders.length} orders spanning ${monthsRange} months`);

  // ========== CREATE ORDERS IN DATABASE ==========
  const createdOrders = await Order.create(orders);
  console.log(`✅ Successfully created ${createdOrders.length} orders`);

  // ========== VERIFY LINKAGE & DATA DISTRIBUTION ==========
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

  // Log data distribution by month
  console.log('\n📊 Order Distribution by Month:');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const now = new Date();
  
  for (let i = monthsRange - 1; i >= 0; i--) {
    const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthName = monthNames[targetDate.getMonth()];
    const year = targetDate.getFullYear();
    
    const monthOrders = createdOrders.filter(o => 
      o.createdAt.getMonth() === targetDate.getMonth() &&
      o.createdAt.getFullYear() === targetDate.getFullYear()
    );
    
    console.log(`  ${monthName} ${year}: ${monthOrders.length} orders`);
  }

  return createdOrders;
};

module.exports = seedOrdersEnhanced;
