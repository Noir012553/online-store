const fs = require('fs/promises');
const path = require('path');

const parseArg = (args, name, fallback = null) => {
  const prefix = `--${name}=`;
  const value = args.find(arg => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
};

const getSellerName = (seller) => (
  typeof seller === 'string' ? seller.trim() : String(seller?.name || '').trim()
);

const normalizeSeller = (seller) => getSellerName(seller).toLocaleLowerCase();

const hasTargetSeller = (item, seller) => (
  normalizeSeller(item.current_seller) === normalizeSeller(seller)
);

const filterSellerProducts = (input, seller = null) => {
  const items = Array.isArray(input) ? input : input?.products;
  if (!Array.isArray(items)) throw new Error('TIKI_INPUT_MUST_BE_ARRAY');

  const targetSeller = seller ? normalizeSeller(seller) : null;
  const filteredItems = [];
  let sourceVariantCount = 0;
  let filteredVariantCount = 0;

  items.forEach((item) => {
    const variants = Array.isArray(item.configurable_products)
      ? item.configurable_products
      : [];
    sourceVariantCount += variants.length;

    if (!targetSeller) {
      filteredVariantCount += variants.length;
      filteredItems.push(item);
      return;
    }

    const filteredVariants = variants.filter((variant) => {
      const variantSeller = normalizeSeller(variant.current_seller || variant.seller);
      const keepVariant = variantSeller
        ? variantSeller === targetSeller
        : hasTargetSeller(item, seller);
      if (keepVariant) filteredVariantCount += 1;
      return keepVariant;
    });

    const keepItem = hasTargetSeller(item, seller) || filteredVariants.length > 0;
    if (!keepItem) return;

    filteredItems.push(variants.length > 0
      ? { ...item, configurable_products: filteredVariants }
      : item);
  });

  return {
    items: filteredItems,
    report: {
      seller,
      source_item_count: items.length,
      filtered_item_count: filteredItems.length,
      source_variant_count: sourceVariantCount,
      filtered_variant_count: filteredVariantCount,
    },
  };
};

async function main() {
  const args = process.argv.slice(2);
  const inputPath = parseArg(args, 'input');
  const outputPath = parseArg(args, 'output');
  const seller = parseArg(args, 'seller');

  if (!inputPath) {
    throw new Error('TIKI_INPUT_REQUIRED: use --input=path/to/raw.json');
  }
  if (!outputPath) {
    throw new Error('TIKI_OUTPUT_REQUIRED: use --output=path/to/filtered.json');
  }

  const inputText = (await fs.readFile(path.resolve(inputPath), 'utf8'))
    .replace(/^\uFEFF/, '')
    .trim();
  const input = JSON.parse(inputText);
  const result = filterSellerProducts(input, seller);
  const resolvedOutputPath = path.resolve(outputPath);

  await fs.mkdir(path.dirname(resolvedOutputPath), { recursive: true });
  await fs.writeFile(resolvedOutputPath, JSON.stringify(result.items, null, 2));

  console.log(JSON.stringify({
    success: true,
    outputPath,
    report: result.report,
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  filterSellerProducts,
  getSellerName,
};
