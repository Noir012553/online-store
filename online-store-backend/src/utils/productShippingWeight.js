const DEFAULT_ITEM_WEIGHT_GRAMS = 500;

const getProductWeightInGrams = (product) => {
  const value = product?.specs?.weight;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : DEFAULT_ITEM_WEIGHT_GRAMS;
  if (typeof value !== 'string') return DEFAULT_ITEM_WEIGHT_GRAMS;

  const match = value.trim().match(/^(\d+(?:[.,]\d+)?)\s*(kg|g)?$/i);
  if (!match) return DEFAULT_ITEM_WEIGHT_GRAMS;

  const amount = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0) return DEFAULT_ITEM_WEIGHT_GRAMS;

  return match[2]?.toLowerCase() === 'kg' ? amount * 1000 : amount;
};

module.exports = { getProductWeightInGrams };
