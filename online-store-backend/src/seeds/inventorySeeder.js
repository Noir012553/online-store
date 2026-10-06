const Product = require('../models/Product');

const TARGET_STOCK = 25;

const seedInventory = async () => {
  const result = await Product.updateMany(
    {
      isDeleted: false,
      $and: [
        { $or: [{ sourceProductId: { $exists: false } }, { sourceProductId: null }, { sourceProductId: '' }] },
        { $or: [{ sourceUrl: { $exists: false } }, { sourceUrl: null }, { sourceUrl: '' }] },
      ],
    },
    { $set: { countInStock: TARGET_STOCK } }
  );

  console.log(`Inventory normalized: ${result.modifiedCount} non-scraped products set to ${TARGET_STOCK} units`);

  return {
    matchedProducts: result.matchedCount,
    updatedProducts: result.modifiedCount,
    targetStock: TARGET_STOCK,
  };
};

module.exports = seedInventory;
