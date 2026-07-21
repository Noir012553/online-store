import { useEffect, useState } from "react";
import { ChevronDown, X, PackageSearch } from "lucide-react";
import { productAPI } from "../lib/api";
import { ProductCard } from "./ProductCard";
import { Button } from "./ui/button";
import { calculateDiscount } from "../lib/utils";
import { Checkbox } from "./ui/checkbox";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { EmptyState } from "./EmptyState";
import { Slider } from "./ui/slider";

import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "./ui/accordion";
import { useTranslation, useLanguage } from "../lib/i18n";
import { useCurrencyConversion } from "../hooks/useCurrencyConversion";
import { UI_EMOJI } from "../lib/uiEmoji";

interface CategoryProductsListProps {
  categoryId: string;
  categoryName: string;
}

interface FilterState {
  brands: string[];
  priceRange: [number, number];
  discountRange: [number, number];
  ratingRange: [number, number];
  inStock?: boolean;
  featuredOnly?: boolean;
  hotDealOnly?: boolean;
}

interface PersistedCategoryFilters {
  filters: FilterState;
  page: number;
  sortBy: string;
}

const getDefaultFilters = (): FilterState => ({
  brands: [],
  priceRange: [0, 0],
  discountRange: [0, 0],
  ratingRange: [0, 5],
  inStock: undefined,
  featuredOnly: undefined,
  hotDealOnly: undefined,
});

const getFilterStorageKey = (categoryId: string) => `category-products-filters:${categoryId}`;

const normalizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
};

const normalizePriceRange = (value: unknown): [number, number] => {
  if (!Array.isArray(value) || value.length !== 2) return [0, 0];
  const min = Number(value[0]);
  const max = Number(value[1]);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 0];
  return [min, max];
};


const normalizeRatingRange = (value: unknown): [number, number] => {
  if (!Array.isArray(value) || value.length !== 2) return [0, 5];
  const min = Number(value[0]);
  const max = Number(value[1]);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 5];
  return [Math.max(0, Math.min(5, min)), Math.max(0, Math.min(5, max))];
};

const normalizePersistedFilters = (value: unknown): PersistedCategoryFilters | null => {
  if (!value || typeof value !== 'object') return null;

  const raw = value as Partial<PersistedCategoryFilters> & { filters?: unknown };
  const page = Number(raw.page);
  const sortBy = typeof raw.sortBy === 'string' ? raw.sortBy : 'featured';
  const normalizedPage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const filtersSource = raw.filters && typeof raw.filters === 'object' ? raw.filters : raw;
  const inStock = (filtersSource as any).inStock;
  const featuredOnly = (filtersSource as any).featuredOnly;
  const hotDealOnly = (filtersSource as any).hotDealOnly;

  return {
    filters: {
      brands: normalizeStringArray((filtersSource as any).brands),
      priceRange: normalizePriceRange((filtersSource as any).priceRange),
      discountRange: normalizePriceRange((filtersSource as any).discountRange),
      ratingRange: normalizeRatingRange((filtersSource as any).ratingRange),
      inStock: inStock === true || inStock === false ? inStock : undefined,
      featuredOnly: featuredOnly === true ? true : undefined,
      hotDealOnly: hotDealOnly === true ? true : undefined,
    },
    page: normalizedPage,
    sortBy,
  };
};

const allowedSortOptions = new Set(['featured', 'name', 'price-asc', 'price-desc', 'rating']);

interface BackendProduct {
  _id: string;
  id?: string;
  name: string;
  brand: string;
  category?: { _id: string; id?: string; name?: string } | string;
  price: number;
  baseCurrencyCode: string;
  originalPrice?: number;
  image?: string;
  images?: string[];
  rating?: number;
  numReviews?: number;
  countInStock?: number;
  specs?: Record<string, string | number>;
  description?: string;
  features?: string[];
  featured?: boolean;
  deal?: { discount: number; endTime?: string | Date };
}

const getProductDiscountPercent = (product: BackendProduct): number => {
  if (typeof product.originalPrice === 'number' && product.originalPrice > 0) {
    return Math.max(0, calculateDiscount(product.originalPrice, product.price));
  }

  return Math.max(0, product.deal?.discount ?? 0);
};

export function CategoryProductsList({ categoryId, categoryName }: CategoryProductsListProps) {
  const { t } = useTranslation();
  const { locale } = useLanguage();
  const { formatConvertedPrice, targetCurrency } = useCurrencyConversion();
  const [products, setProducts] = useState<BackendProduct[]>([]);
  const [allProducts, setAllProducts] = useState<BackendProduct[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>(getDefaultFilters());
  const [sortBy, setSortBy] = useState('featured');
  const [priceStats, setPriceStats] = useState({ minPrice: 0, maxPrice: 0 });
  const [discountStats, setDiscountStats] = useState({ minDiscount: 0, maxDiscount: 0 });
  const [brands, setBrands] = useState<string[]>([]);
  const [hasRestoredFilters, setHasRestoredFilters] = useState(false);

  // Restore filters from localStorage so F5 keeps the selected state
  useEffect(() => {
    if (!categoryId || typeof window === 'undefined') return;

    setHasRestoredFilters(false);

    try {
      const storedValue = localStorage.getItem(getFilterStorageKey(categoryId));
      if (storedValue) {
        const parsed = normalizePersistedFilters(JSON.parse(storedValue));
        if (parsed) {
          setFilters(parsed.filters);
          setPage(parsed.page);
          setSortBy(allowedSortOptions.has(parsed.sortBy) ? parsed.sortBy : 'featured');
          setHasRestoredFilters(true);
          return;
        }
      }
    } catch (err) {
      // Ignore invalid saved state and fall back to defaults
    }

    setFilters(getDefaultFilters());
    setPage(1);
    setSortBy('featured');
    setHasRestoredFilters(true);
  }, [categoryId]);

  useEffect(() => {
    if (!categoryId || typeof window === 'undefined' || !hasRestoredFilters) return;

    const payload: PersistedCategoryFilters = {
      filters,
      page,
      sortBy,
    };

    localStorage.setItem(getFilterStorageKey(categoryId), JSON.stringify(payload));
  }, [categoryId, filters, hasRestoredFilters, page, sortBy]);

  // Initial fetch to get all products for stats
  useEffect(() => {
    const fetchInitialProducts = async () => {
      try {
        setIsLoading(true);
        // Use categoryId (Database ID) instead of name
        const response = await productAPI.getProducts(1, undefined, categoryId, undefined, 100, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, locale);
        const fetchedProducts = response.products || [];
        setAllProducts(fetchedProducts);
      } catch (err) {
        // Silently continue on fetch error
      } finally {
        setIsLoading(false);
      }
    };

    if (categoryId && categoryId.length > 10 && hasRestoredFilters) { // Ensure it's a valid ID, not a name
      fetchInitialProducts();
    }
  }, [categoryId, hasRestoredFilters, locale]);

  // Extract stats and brands from products
  useEffect(() => {
    if (allProducts.length === 0) return;

    let minPrice = Infinity;
    let maxPrice = 0;
    let minDiscount = Infinity;
    let maxDiscount = 0;
    const uniqueBrands = new Set<string>();

    allProducts.forEach((p: any) => {
      const price = p.price;
      const discount = getProductDiscountPercent(p);

      if (price < minPrice) minPrice = price;
      if (price > maxPrice) maxPrice = price;
      if (discount < minDiscount) minDiscount = discount;
      if (discount > maxDiscount) maxDiscount = discount;

      if (p.brand) {
        uniqueBrands.add(p.brand);
      }
    });

    setPriceStats({
      minPrice: minPrice === Infinity ? 0 : minPrice,
      maxPrice: maxPrice === 0 ? 0 : maxPrice,
    });

    setDiscountStats({
      minDiscount: minDiscount === Infinity ? 0 : minDiscount,
      maxDiscount: maxDiscount === 0 ? 0 : maxDiscount,
    });

    setBrands(Array.from(uniqueBrands).sort());
  }, [allProducts]);

  // Fetch and filter products based on active filters
  useEffect(() => {
    if (!hasRestoredFilters) return;

    const fetchFilteredProducts = async () => {
      try {
        setIsLoading(true);

        // Build filter parameters for API
        const brandFilter = filters.brands.length > 0 ? filters.brands[0] : undefined;
        const [minPrice, maxPrice] = filters.priceRange;
        const minPriceParam = minPrice > 0 ? minPrice : undefined;
        const maxPriceParam = maxPrice > 0 ? maxPrice : undefined;

        const [minDiscount, maxDiscount] = filters.discountRange;
        const minDiscountParam = minDiscount > 0 ? minDiscount : undefined;
        const maxDiscountParam = maxDiscount > 0 ? maxDiscount : undefined;

        const [minRating, maxRating] = filters.ratingRange;
        const minRatingParam = minRating > 0 ? minRating : undefined;
        const maxRatingParam = maxRating < 5 ? maxRating : undefined;

        // Fetch products from API with brand, price, discount, rating, hot deal, and stock filters
        const response = await productAPI.getProducts(
          page,
          undefined,
          categoryId,
          brandFilter,
          12,
          minPriceParam,
          maxPriceParam,
          filters.inStock,
          minDiscountParam,
          maxDiscountParam,
          filters.featuredOnly,
          filters.hotDealOnly,
          minRatingParam,
          maxRatingParam,
          locale
        );

        let fetchedProducts = response.products || [];

        // Handle discount filter client-side if needed
        if (minDiscountParam !== undefined || maxDiscountParam !== undefined) {
          fetchedProducts = fetchedProducts.filter((p: BackendProduct) => {
            const discount = getProductDiscountPercent(p);
            const meetsMin = minDiscountParam === undefined || discount >= minDiscountParam;
            const meetsMax = maxDiscountParam === undefined || discount <= maxDiscountParam;
            return meetsMin && meetsMax;
          });
        }

        setProducts(fetchedProducts);
        setTotalPages(response.pages || 1);
      } catch (err) {
        setProducts([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchFilteredProducts();
  }, [categoryId, page, filters, hasRestoredFilters, locale]);

  let sortedProducts = [...products];
  switch (sortBy) {
    case 'price-asc':
      sortedProducts.sort((a, b) => a.price - b.price);
      break;
    case 'price-desc':
      sortedProducts.sort((a, b) => b.price - a.price);
      break;
    case 'rating':
      sortedProducts.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
      break;
    case 'name':
      sortedProducts.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      break;
    default:
      sortedProducts.sort((a, b) => ((b.featured ?? false) ? 1 : 0) - ((a.featured ?? false) ? 1 : 0));
  }

  const hasActiveFilters = filters.brands.length > 0 ||
    (filters.priceRange[0] > 0 || filters.priceRange[1] > 0) ||
    (filters.discountRange[0] > 0 || filters.discountRange[1] > 0) ||
    (filters.ratingRange[0] > 0 || filters.ratingRange[1] < 5) ||
    filters.inStock !== undefined ||
    filters.featuredOnly !== undefined ||
    filters.hotDealOnly !== undefined;

  const [minPrice, maxPrice] = filters.priceRange;
  const sliderMin = priceStats.minPrice || 0;
  const sliderMax = priceStats.maxPrice || 100000000;
  const priceCurrencyCode = allProducts[0]?.baseCurrencyCode || targetCurrency;

  const toggleBrand = (brand: string) => {
    setFilters((prev) => ({
      ...prev,
      brands: prev.brands.includes(brand)
        ? prev.brands.filter((b) => b !== brand)
        : [...prev.brands, brand],
    }));
    setPage(1);
  };


  const toggleStockFilter = (stockStatus: boolean | undefined) => {
    setFilters((prev) => ({
      ...prev,
      inStock: prev.inStock === stockStatus ? undefined : stockStatus,
    }));
    setPage(1);
  };

  const setPriceRange = (priceRange: [number, number]) => {
    setFilters((prev) => ({ ...prev, priceRange }));
    setPage(1);
  };


  const setDiscountRange = (discountRange: [number, number]) => {
    setFilters((prev) => ({ ...prev, discountRange }));
    setPage(1);
  };

  const setRatingRange = (ratingRange: [number, number]) => {
    setFilters((prev) => ({ ...prev, ratingRange }));
    setPage(1);
  };

  const toggleFeaturedFilter = () => {
    setFilters((prev) => ({
      ...prev,
      featuredOnly: prev.featuredOnly === true ? undefined : true,
    }));
    setPage(1);
  };

  const toggleHotDealFilter = () => {
    setFilters((prev) => ({
      ...prev,
      hotDealOnly: prev.hotDealOnly === true ? undefined : true,
    }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters({ brands: [], priceRange: [0, 0], discountRange: [0, 0], ratingRange: [0, 5], inStock: undefined, featuredOnly: undefined, hotDealOnly: undefined });
    setPage(1);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Left sidebar: Filters */}
      <aside className="w-full lg:w-64 shrink-0">
        <div className="bg-white border rounded-lg overflow-hidden">
          {/* Filter header with clear button */}
          <div className="px-4 py-3 border-b bg-white flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">{t('filter_title', 'products')}</h3>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 h-auto px-2 py-1"
              >
                {t('filter_clear_all', 'products')}
              </Button>
            )}
          </div>

          <Accordion type="multiple" defaultValue={["price", "highlights", "rating", "specs", "brands"]} className="w-full">
            {/* Price Range Filter */}
            {sliderMax > sliderMin && (
              <AccordionItem value="price">
                <AccordionTrigger className="px-4 text-sm font-semibold">
                  {t('filter_price_range', 'products')}
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <div className="space-y-4">
                    <Slider
                      min={sliderMin}
                      max={sliderMax}
                      step={100000}
                      value={[minPrice || sliderMin, maxPrice || sliderMax]}
                      onValueChange={setPriceRange}
                      className="mt-2"
                    />
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-medium text-gray-700">
                        <span>{t('filter_min_price', 'products')}</span>
                        <span>{t('filter_max_price', 'products')}</span>
                      </div>
                      <div className="flex justify-between text-sm text-gray-900 font-semibold">
                        <span className="text-red-600">{formatConvertedPrice(minPrice || sliderMin, priceCurrencyCode)}</span>
                        <span className="text-red-600">{formatConvertedPrice(maxPrice || sliderMax, priceCurrencyCode)}</span>
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}

            {/* Product Discount Filter */}
            {discountStats.maxDiscount > discountStats.minDiscount && (
              <AccordionItem value="discount">
                <AccordionTrigger className="px-4 text-sm font-semibold">
                  {t('filter_discount_range', 'products')}
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <div className="space-y-4">
                    <Slider
                      min={discountStats.minDiscount}
                      max={discountStats.maxDiscount}
                      step={1}
                      value={[filters.discountRange[0] || discountStats.minDiscount, filters.discountRange[1] || discountStats.maxDiscount]}
                      onValueChange={(value) => setDiscountRange(value as [number, number])}
                      className="mt-2"
                    />
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-medium text-gray-700">
                        <span>{t('filter_min_discount')}</span>
                        <span>{t('filter_max_discount')}</span>
                      </div>
                      <div className="flex justify-between text-sm text-gray-900 font-semibold">
                        <span className="text-red-600">{(filters.discountRange[0] || discountStats.minDiscount)}%</span>
                        <span className="text-red-600">{(filters.discountRange[1] || discountStats.maxDiscount)}%</span>
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}

            {/* Highlight Filters */}
            <AccordionItem value="highlights">
              <AccordionTrigger className="px-4 text-sm font-semibold">
                {t('filter_highlights_title', 'products')}
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="space-y-2 ml-0.5">
                  <div className="flex items-center gap-2 group hover:bg-white px-2 py-1 rounded transition-colors cursor-pointer">
                    <Checkbox
                      id="highlight-featured"
                      checked={filters.featuredOnly === true}
                      onCheckedChange={toggleFeaturedFilter}
                    />
                    <Label
                      htmlFor="highlight-featured"
                      className="text-sm cursor-pointer font-normal flex-1 truncate"
                    >
                      {t('badge_featured', 'products')}
                    </Label>
                  </div>
                  <div className="flex items-center gap-2 group hover:bg-white px-2 py-1 rounded transition-colors cursor-pointer">
                    <Checkbox
                      id="highlight-hot-deal"
                      checked={filters.hotDealOnly === true}
                      onCheckedChange={toggleHotDealFilter}
                    />
                    <Label
                      htmlFor="highlight-hot-deal"
                      className="text-sm cursor-pointer font-normal flex-1 truncate text-red-600 hover:text-red-700"
                    >
                      {t('badge_hot_deal', 'products')}
                    </Label>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Rating Range Filter */}
            <AccordionItem value="rating">
              <AccordionTrigger className="px-4 text-sm font-semibold">
                {t('filter_rating_range', 'products')}
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="space-y-4">
                  <Slider
                    min={0}
                    max={5}
                    step={0.1}
                    value={filters.ratingRange}
                    onValueChange={(value) => setRatingRange(value as [number, number])}
                    className="mt-2"
                  />
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-medium text-gray-700">
                      <span>{t('filter_min_rating', 'products')}</span>
                      <span>{t('filter_max_rating', 'products')}</span>
                    </div>
                    <div className="flex justify-between text-sm text-gray-900 font-semibold">
                      <span className="text-red-600">{filters.ratingRange[0].toFixed(1)}</span>
                      <span className="text-red-600">{filters.ratingRange[1].toFixed(1)}</span>
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>


            {/* Brand Filter */}
            {Array.isArray(brands) && brands.length > 0 && (
              <AccordionItem value="brands">
                <AccordionTrigger className="px-4 text-sm font-semibold">
                  {t('filter_brands_title', 'products')}
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <div className="space-y-2 ml-0.5">
                    {brands.map((brand) => (
                      <div
                        key={brand}
                        className="flex items-center gap-2 group hover:bg-white px-2 py-1 rounded transition-colors cursor-pointer"
                      >
                        <Checkbox
                          id={`brand-${brand}`}
                          checked={filters.brands.includes(brand)}
                          onCheckedChange={() => toggleBrand(brand)}
                        />
                        <Label
                          htmlFor={`brand-${brand}`}
                          className="text-sm cursor-pointer font-normal flex-1 truncate"
                        >
                          {brand}
                        </Label>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}

            {/* Stock Status Filter */}
            <AccordionItem value="stock">
              <AccordionTrigger className="px-4 text-sm font-semibold">
                {t('filter_status_title', 'products')}
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="space-y-2 ml-0.5">
                  <div className="flex items-center gap-2 group hover:bg-white px-2 py-1 rounded transition-colors cursor-pointer">
                    <Checkbox
                      id="stock-in"
                      checked={filters.inStock === true}
                      onCheckedChange={() => toggleStockFilter(true)}
                    />
                    <Label
                      htmlFor="stock-in"
                      className="text-sm cursor-pointer font-normal flex-1"
                    >
                      {t('filter_in_stock', 'products')}
                    </Label>
                  </div>
                  <div className="flex items-center gap-2 group hover:bg-white px-2 py-1 rounded transition-colors cursor-pointer">
                    <Checkbox
                      id="stock-out"
                      checked={filters.inStock === false}
                      onCheckedChange={() => toggleStockFilter(false)}
                    />
                    <Label
                      htmlFor="stock-out"
                      className="text-sm cursor-pointer font-normal flex-1"
                    >
                      {t('filter_out_of_stock', 'products')}
                    </Label>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </aside>

      {/* Right content: Products */}
      <div className="flex-1 min-w-0">
        {/* Top bar: Sort and info */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-600">
            {isLoading ? t('filter_loading_wait', 'products') : `${sortedProducts.length} ${t('filter_items_count', 'products')}`}
          </p>
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="border-input flex h-9 w-full rounded-md border bg-input-background px-3 py-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50 w-40">
            <option value="featured">{t('badge_featured', 'products')}</option>
            <option value="name">{t('filter_popular', 'products')}</option>
            <option value="price-asc">{t('sort_price_low_to_high', 'products')}</option>
            <option value="price-desc">{t('sort_price_high_to_low', 'products')}</option>
            <option value="rating">{t('filter_stat_rating', 'products')}</option>
          </select>
        </div>

        {/* Active filters badges */}
        {hasActiveFilters && (
          <div className="flex flex-wrap gap-2 mb-4">
            {filters.brands.map((brand) => (
              <Badge
                key={brand}
                variant="secondary"
                className="gap-1 cursor-pointer hover:bg-red-100"
                onClick={() => toggleBrand(brand)}
              >
                {brand}
                <X className="w-3 h-3" />
              </Badge>
            ))}
            {(filters.discountRange[0] > 0 || filters.discountRange[1] > 0) && (
              <Badge
                variant="secondary"
                className="gap-1 cursor-pointer hover:bg-red-100"
                onClick={() => setDiscountRange([0, 0])}
              >
                {t('filter_discount_range', 'products')}: {filters.discountRange[0]}% - {filters.discountRange[1]}%
                <X className="w-3 h-3" />
              </Badge>
            )}
            {(filters.ratingRange[0] > 0 || filters.ratingRange[1] < 5) && (
              <Badge
                variant="secondary"
                className="gap-1 cursor-pointer hover:bg-red-100"
                onClick={() => setRatingRange([0, 5])}
              >
                {t('filter_rating_range', 'products')}: {filters.ratingRange[0].toFixed(1)} - {filters.ratingRange[1].toFixed(1)}
                <X className="w-3 h-3" />
              </Badge>
            )}
            {filters.featuredOnly && (
              <Badge
                variant="secondary"
                className="gap-1 cursor-pointer hover:bg-red-100"
                onClick={toggleFeaturedFilter}
              >
                {t('badge_featured', 'products')}
                <X className="w-3 h-3" />
              </Badge>
            )}
            {filters.hotDealOnly && (
              <Badge
                variant="secondary"
                className="gap-1 cursor-pointer hover:bg-red-100"
                onClick={toggleHotDealFilter}
              >
                {t('badge_hot_deal', 'products')}
                <X className="w-3 h-3" />
              </Badge>
            )}
            {(minPrice > 0 || maxPrice > 0) && (
              <Badge
                variant="secondary"
                className="gap-1 cursor-pointer hover:bg-red-100"
                onClick={() => setPriceRange([0, 0])}
              >
                {minPrice.toLocaleString(locale)}₫ - {maxPrice.toLocaleString(locale)}₫
                <X className="w-3 h-3" />
              </Badge>
            )}
            {filters.inStock !== undefined && (
              <Badge
                variant="secondary"
                className="gap-1 cursor-pointer hover:bg-red-100"
                onClick={() => toggleStockFilter(undefined)}
              >
                {filters.inStock ? t('filter_in_stock') : t('filter_out_of_stock')}
                <X className="w-3 h-3" />
              </Badge>
            )}
          </div>
        )}

        {/* Products grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-video bg-gray-200 rounded-lg mb-4"></div>
                <div className="h-4 bg-gray-200 rounded mb-2"></div>
                <div className="h-4 bg-gray-200 rounded"></div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {sortedProducts.length > 0 ? (
                sortedProducts.map((product) => (
                  <ProductCard key={product._id} laptop={product} />
                ))
              ) : (
                <div className="col-span-full">
                  <EmptyState
                    icon={PackageSearch}
                    title={t('filter_no_products_found')}
                    description={t('filter_try_other_keywords')}
                  />
                </div>
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-1 mt-8">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="px-3"
                >
                  {UI_EMOJI.arrowLeft} {t('filter_prev', 'products')}
                </Button>

                {(() => {
                  const pages = [];
                  const maxVisible = 5;
                  let start = Math.max(1, page - Math.floor(maxVisible / 2));
                  let end = Math.min(totalPages, start + maxVisible - 1);

                  if (end - start + 1 < maxVisible) {
                    start = Math.max(1, end - maxVisible + 1);
                  }

                  if (start > 1) {
                    pages.push(
                      <Button
                        key={1}
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(1)}
                        className="px-2"
                      >
                        1
                      </Button>
                    );
                    if (start > 2) {
                      pages.push(
                        <span key="dots-start" className="px-2 text-gray-400">
                          {t('ellipsis', 'pagination')}
                        </span>
                      );
                    }
                  }

                  for (let i = start; i <= end; i++) {
                    pages.push(
                      <Button
                        key={i}
                        variant={page === i ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setPage(i)}
                        className={`px-3 ${page === i ? 'bg-red-600 hover:bg-red-700 text-white' : ''}`}
                      >
                        {i}
                      </Button>
                    );
                  }

                  if (end < totalPages) {
                    if (end < totalPages - 1) {
                      pages.push(
                        <span key="dots-end" className="px-2 text-gray-400">
                          {t('ellipsis', 'pagination')}
                        </span>
                      );
                    }
                    pages.push(
                      <Button
                        key={totalPages}
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(totalPages)}
                        className="px-2"
                      >
                        {totalPages}
                      </Button>
                    );
                  }

                  return pages;
                })()}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="px-3"
                >
                  {t('filter_next', 'products')} {UI_EMOJI.arrowRight}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
