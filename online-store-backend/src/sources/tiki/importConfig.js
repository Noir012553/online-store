const TIKI_IMPORT_CONFIG = {
  source: 'TIKI',
  currency: 'VND',
  stockPolicy: {
    mode: 'staging',
    simulatedStockQty: 50,
    unknownStatus: 'reject',
  },
  descriptionPolicy: {
    allowedSchemes: ['https'],
  },
  validation: {
    strictOriginalPrice: true,
    requireHttpsImage: true,
  },
};

module.exports = TIKI_IMPORT_CONFIG;
