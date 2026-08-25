const Product = require('../models/Product');

const TARGET_STOCK = 25;

const seedInventory = async () => {
  const result = await Product.updateMany(
    { isDeleted: false },
    { $set: { countInStock: TARGET_STOCK } }
  );

  console.log(`Inventory normalized: ${result.modifiedCount} products set to ${TARGET_STOCK} units`);

  return {
    matchedProducts: result.matchedCount,
    updatedProducts: result.modifiedCount,
    targetStock: TARGET_STOCK,
  };
};

module.exports = seedInventory;
