const parseProductId = value => {
  if (!/^[a-f\d]{24}$/i.test(value)) {
    throw new Error('--product-id must be a 24-character MongoDB product ID');
  }
  return value.toLowerCase();
};

module.exports = { parseProductId };
