import { useState, useEffect } from "react";
import { ChevronDown, X, PackageSearch } from "lucide-react";
import { productAPI } from "../lib/api";
import { ProductCard } from "./ProductCard";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { EmptyState } from "./EmptyState";
import { Slider } from "./ui/slider";
import { SpecRangeFilter } from "./SpecRangeFilter";
import { getSpecsForCategory, getSpecLabel } from "../lib/specConfig";
import { formatSpecForFilter, deduplicateSpecFilters, parseSpec } from "../lib/specParser";
import { getSpecFilterType, getSpecUnit, calculateSpecRangeStats, getSpecSliderStep, isValueInRange } from "../lib/specFilter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "./ui/accordion";

interface CategoryProductsListProps {
  categoryId: string;
  categoryName: string;
}

interface FilterState {
  brands: string[];
  priceRange: [number, number];
  specs: Record<string, string[]>;
  specRanges: Record<string, [number, number]>;
  inStock?: boolean;
}

interface SpecFilter {
  field: string;
  values: string[];
  label: string;
  type: 'range' | 'checkbox';
  rangeStats?: {
    minValue: number;
    maxValue: number;
    unit: string;
    step: number;
  };
}

export function CategoryProductsList({ categoryId, categoryName }: CategoryProductsListProps) {
  const [products, setProducts] = useState<any[]>([]);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({ brands: [], priceRange: [0, 0], specs: {}, specRanges: {} });
  const [sortBy, setSortBy] = useState('featured');
  const [priceStats, setPriceStats] = useState({ minPrice: 0, maxPrice: 0 });
  const [brands, setBrands] = useState<string[]>([]);
  const [specFilters, setSpecFilters] = useState<SpecFilter[]>([]);

  // Initial fetch to get price stats, brands, and spec values
  useEffect(() => {
    const fetchInitialProducts = async () => {
      try {
        setIsLoading(true);
        const response = await productAPI.getProducts(1, undefined, categoryId, undefined, 100);
        const fetchedProducts = response.products || [];
        setAllProducts(fetchedProducts);

        // Calculate min and max price
        let minPrice = Infinity;
        let maxPrice = 0;
        const uniqueBrands = new Set<string>();
        const specValuesMap: Record<string, Set<string>> = {};

        // Get relevant specs for this category
        const categorySpecs = getSpecsForCategory(categoryName);

        fetchedProducts.forEach((p: any) => {
          const price = p.price || 0;
          if (price < minPrice) minPrice = price;
          if (price > maxPrice) maxPrice = price;

          // Extract unique brands
          if (p.brand) {
            uniqueBrands.add(p.brand);
          }

          // Extract unique spec values for each spec field
          const specs = p.specs || {};
          categorySpecs.forEach((specField) => {
            const value = specs[specField];
            if (value && value.toString().trim()) {
              if (!specValuesMap[specField]) {
                specValuesMap[specField] = new Set<string>();
              }
              specValuesMap[specField].add(value.toString());
            }
          });
        });

        setPriceStats({
          minPrice: minPrice === Infinity ? 0 : minPrice,
          maxPrice: maxPrice === 0 ? 0 : maxPrice,
        });

        // Set brands from actual products
        setBrands(Array.from(uniqueBrands).sort());

        // Create spec filters from extracted values with deduplication
        const specFiltersList: SpecFilter[] = [];
        Object.entries(specValuesMap).forEach(([field, values]) => {
          if (values.size > 0) {
            // Deduplicate and normalize spec values
            const dedupedValues = deduplicateSpecFilters(Array.from(values), field);

            // Sort by numeric value if possible, otherwise by display text
            const sortedValues = dedupedValues.sort((a, b) => {
              const aParsed = parseSpec(a.value, field);
              const bParsed = parseSpec(b.value, field);

              // If both have numeric values, sort numerically
              if (!Number.isNaN(aParsed.value) && !Number.isNaN(bParsed.value)) {
                return aParsed.value - bParsed.value;
              }

              // Otherwise sort alphabetically by display text
              return a.displayText.localeCompare(b.displayText, 'vi-VN');
            });

            const filterType = getSpecFilterType(field);
            const specFilter: SpecFilter = {
              field,
              values: sortedValues.map((item) => item.value),
              label: getSpecLabel(field),
              type: filterType,
            };

            // Add range stats for numeric specs
            if (filterType === 'range') {
              const rangeStats = calculateSpecRangeStats(sortedValues.map((item) => item.value), field);
              specFilter.rangeStats = {
                minValue: rangeStats.minValue,
                maxValue: rangeStats.maxValue,
                unit: rangeStats.unit,
                step: getSpecSliderStep(field),
              };
            }

            specFiltersList.push(specFilter);
          }
        });
        setSpecFilters(specFiltersList);
      } catch (err) {
        // Silently continue on fetch error
      } finally {
        setIsLoading(false);
      }
    };

    if (categoryId) {
      fetchInitialProducts();
    }
  }, [categoryId, categoryName]);

  // Fetch and filter products based on active filters
  useEffect(() => {
    const fetchFilteredProducts = async () => {
      try {
        setIsLoading(true);

        // Build filter parameters for API
        const brandFilter = filters.brands.length > 0 ? filters.brands[0] : undefined;
        const [minPrice, maxPrice] = filters.priceRange;
        const minPriceParam = minPrice > 0 ? minPrice : undefined;
        const maxPriceParam = maxPrice > 0 ? maxPrice : undefined;

        // Fetch products from API with brand, price, and stock filters
        const response = await productAPI.getProducts(
          page,
          undefined,
          categoryId,
          brandFilter,
          12,
          minPriceParam,
          maxPriceParam,
          filters.inStock
        );

        let fetchedProducts = response.products || [];

        // Apply spec filters client-side (since API doesn't support them yet)
        // Handle checkbox-based filters (categorical specs)
        Object.entries(filters.specs).forEach(([specField, specValues]) => {
          if (specValues.length > 0) {
            fetchedProducts = fetchedProducts.filter((p: any) => {
              const productSpecValue = p.specs?.[specField]?.toString();
              return productSpecValue && specValues.includes(productSpecValue);
            });
          }
        });

        // Handle range-based filters (numeric specs)
        Object.entries(filters.specRanges).forEach(([specField, [minRange, maxRange]]) => {
          if (minRange > 0 || maxRange > 0) {
            fetchedProducts = fetchedProducts.filter((p: any) => {
              const productSpecValue = p.specs?.[specField]?.toString();
              return productSpecValue && isValueInRange(productSpecValue, specField, minRange, maxRange);
            });
          }
        });

        setProducts(fetchedProducts);
        setTotalPages(response.pages || 1);
      } catch (err) {
        setProducts([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchFilteredProducts();
  }, [categoryId, page, filters]);

  let sortedProducts = [...products];
  switch (sortBy) {
    case 'price-asc':
      sortedProducts.sort((a, b) => a.price - b.price);
      break;
    case 'price-desc':
      sortedProducts.sort((a, b) => b.price - a.price);
      break;
    case 'rating':
      sortedProducts.sort((a, b) => b.rating - a.rating);
      break;
    case 'name':
      sortedProducts.sort((a, b) => a.name.localeCompare(b.name));
      break;
    default:
      sortedProducts.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
  }

  const hasActiveFilters = filters.brands.length > 0 ||
    (filters.priceRange[0] > 0 || filters.priceRange[1] > 0) ||
    Object.values(filters.specs).some(values => values.length > 0) ||
    Object.values(filters.specRanges).some(([min, max]) => min > 0 || max > 0) ||
    filters.inStock !== undefined;

  const [minPrice, maxPrice] = filters.priceRange;
  const sliderMin = priceStats.minPrice || 0;
  const sliderMax = priceStats.maxPrice || 100000000;

  const toggleBrand = (brand: string) => {
    setFilters((prev) => ({
      ...prev,
      brands: prev.brands.includes(brand)
        ? prev.brands.filter((b) => b !== brand)
        : [...prev.brands, brand],
    }));
    setPage(1);
  };

  const toggleSpec = (specField: string, specValue: string) => {
    setFilters((prev) => {
      const currentValues = prev.specs[specField] || [];
      return {
        ...prev,
        specs: {
          ...prev.specs,
          [specField]: currentValues.includes(specValue)
            ? currentValues.filter((v) => v !== specValue)
            : [...currentValues, specValue],
        },
      };
    });
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

  const setSpecRange = (specField: string, minValue: number, maxValue: number) => {
    setFilters((prev) => ({
      ...prev,
      specRanges: {
        ...prev.specRanges,
        [specField]: [minValue, maxValue],
      },
    }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters({ brands: [], priceRange: [0, 0], specs: {}, specRanges: {}, inStock: undefined });
    setPage(1);
  };

  // Get active spec filter badges
  const getActiveSpecFilters = () => {
    const active: Array<{ field: string; value: string; label: string }> = [];
    Object.entries(filters.specs).forEach(([field, values]) => {
      values.forEach(value => {
        const specFilter = specFilters.find(sf => sf.field === field);
        active.push({
          field,
          value,
          label: specFilter?.label || field,
        });
      });
    });
    return active;
  };

  const getActiveRangeFilters = () => {
    const active: Array<{ field: string; min: number; max: number; label: string; unit: string }> = [];
    Object.entries(filters.specRanges).forEach(([field, [min, max]]) => {
      if (min > 0 || max > 0) {
        const specFilter = specFilters.find(sf => sf.field === field);
        active.push({
          field,
          min,
          max,
          label: specFilter?.label || field,
          unit: specFilter?.rangeStats?.unit || '',
        });
      }
    });
    return active;
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Left sidebar: Filters */}
      <aside className="w-full lg:w-64 shrink-0">
        <div className="bg-white border rounded-lg overflow-hidden">
          {/* Filter header with clear button */}
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Bộ lọc</h3>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 h-auto px-2 py-1"
              >
                Xóa tất cả
              </Button>
            )}
          </div>

          <Accordion type="multiple" defaultValue={["price", "specs", "brands"]} className="w-full">
            {/* Price Range Filter */}
            {sliderMax > sliderMin && (
              <AccordionItem value="price">
                <AccordionTrigger className="px-4 text-sm font-semibold">
                  Khoảng giá
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
                        <span>Tối thiểu</span>
                        <span>Tối đa</span>
                      </div>
                      <div className="flex justify-between text-sm text-gray-900 font-semibold">
                        <span className="text-red-600">{(minPrice || sliderMin).toLocaleString('vi-VN')}₫</span>
                        <span className="text-red-600">{(maxPrice || sliderMax).toLocaleString('vi-VN')}₫</span>
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}

            {/* Spec Filters */}
            {specFilters.length > 0 && (
              <AccordionItem value="specs">
                <AccordionTrigger className="px-4 text-sm font-semibold">
                  Thông số
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <div className="space-y-5">
                    {specFilters.map((specFilter) => (
                      <div key={specFilter.field}>
                        {/* Range-based filter (numeric specs) */}
                        {specFilter.type === 'range' && specFilter.rangeStats && (
                          <SpecRangeFilter
                            label={specFilter.label}
                            specField={specFilter.field}
                            minValue={specFilter.rangeStats.minValue}
                            maxValue={specFilter.rangeStats.maxValue}
                            step={specFilter.rangeStats.step}
                            unit={specFilter.rangeStats.unit}
                            currentMin={filters.specRanges[specFilter.field]?.[0] || specFilter.rangeStats.minValue}
                            currentMax={filters.specRanges[specFilter.field]?.[1] || specFilter.rangeStats.maxValue}
                            onRangeChange={(min, max) => setSpecRange(specFilter.field, min, max)}
                          />
                        )}

                        {/* Checkbox-based filter (categorical specs) */}
                        {specFilter.type === 'checkbox' && (
                          <>
                            <h4 className="text-xs font-semibold text-gray-800 mb-3 uppercase tracking-wide">
                              {specFilter.label}
                            </h4>
                            <div className="space-y-2 ml-0.5">
                              {specFilter.values.map((value) => {
                                const displayText = formatSpecForFilter(value, specFilter.field, false);
                                const isChecked = (filters.specs[specFilter.field] || []).includes(value);
                                return (
                                  <div
                                    key={`${specFilter.field}-${value}`}
                                    className="flex items-center gap-2 group hover:bg-gray-50 px-2 py-1 rounded transition-colors"
                                  >
                                    <Checkbox
                                      id={`spec-${specFilter.field}-${value}`}
                                      checked={isChecked}
                                      onCheckedChange={() => toggleSpec(specFilter.field, value)}
                                      className="mt-0.5"
                                    />
                                    <Label
                                      htmlFor={`spec-${specFilter.field}-${value}`}
                                      className="text-sm cursor-pointer font-normal flex-1 truncate"
                                      title={displayText}
                                    >
                                      {displayText}
                                    </Label>
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}

            {/* Brand Filter */}
            {brands.length > 0 && (
              <AccordionItem value="brands">
                <AccordionTrigger className="px-4 text-sm font-semibold">
                  Hãng
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <div className="space-y-2 ml-0.5">
                    {brands.map((brand) => (
                      <div
                        key={brand}
                        className="flex items-center gap-2 group hover:bg-gray-50 px-2 py-1 rounded transition-colors cursor-pointer"
                      >
                        <Checkbox
                          id={`brand-${brand}`}
                          checked={filters.brands.includes(brand)}
                          onCheckedChange={() => toggleBrand(brand)}
                          className="mt-0.5"
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
                Trạng thái
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="space-y-2 ml-0.5">
                  <div className="flex items-center gap-2 group hover:bg-gray-50 px-2 py-1 rounded transition-colors cursor-pointer">
                    <Checkbox
                      id="stock-in"
                      checked={filters.inStock === true}
                      onCheckedChange={() => toggleStockFilter(true)}
                      className="mt-0.5"
                    />
                    <Label
                      htmlFor="stock-in"
                      className="text-sm cursor-pointer font-normal flex-1"
                    >
                      Còn hàng
                    </Label>
                  </div>
                  <div className="flex items-center gap-2 group hover:bg-gray-50 px-2 py-1 rounded transition-colors cursor-pointer">
                    <Checkbox
                      id="stock-out"
                      checked={filters.inStock === false}
                      onCheckedChange={() => toggleStockFilter(false)}
                      className="mt-0.5"
                    />
                    <Label
                      htmlFor="stock-out"
                      className="text-sm cursor-pointer font-normal flex-1"
                    >
                      Hết hàng
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
            {isLoading ? 'Đang tải...' : `${sortedProducts.length} sản phẩm`}
          </p>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Sắp xếp" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="featured">Nổi bật</SelectItem>
              <SelectItem value="name">Tên A-Z</SelectItem>
              <SelectItem value="price-asc">Giá tăng</SelectItem>
              <SelectItem value="price-desc">Giá giảm</SelectItem>
              <SelectItem value="rating">Đánh giá</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Active filters badges */}
        {hasActiveFilters && (
          <div className="flex flex-wrap gap-2 mb-4">
            {getActiveSpecFilters().map((filter) => {
              const displayValue = formatSpecForFilter(filter.value, filter.field, true);
              return (
                <Badge
                  key={`${filter.field}-${filter.value}`}
                  variant="secondary"
                  className="gap-1 cursor-pointer hover:bg-red-100"
                  onClick={() => toggleSpec(filter.field, filter.value)}
                >
                  {filter.label}: {displayValue}
                  <X className="w-3 h-3" />
                </Badge>
              );
            })}
            {getActiveRangeFilters().map((filter) => (
              <Badge
                key={`range-${filter.field}`}
                variant="secondary"
                className="gap-1 cursor-pointer hover:bg-red-100"
                onClick={() => setSpecRange(filter.field, 0, 0)}
              >
                {filter.label}: {filter.min}{filter.unit} - {filter.max}{filter.unit}
                <X className="w-3 h-3" />
              </Badge>
            ))}
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
            {(minPrice > 0 || maxPrice > 0) && (
              <Badge
                variant="secondary"
                className="gap-1 cursor-pointer hover:bg-red-100"
                onClick={() => setPriceRange([0, 0])}
              >
                {minPrice.toLocaleString('vi-VN')}₫ - {maxPrice.toLocaleString('vi-VN')}₫
                <X className="w-3 h-3" />
              </Badge>
            )}
            {filters.inStock !== undefined && (
              <Badge
                variant="secondary"
                className="gap-1 cursor-pointer hover:bg-red-100"
                onClick={() => toggleStockFilter(undefined)}
              >
                {filters.inStock ? 'Còn hàng' : 'Hết hàng'}
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
                    title="Không tìm thấy sản phẩm"
                    description="Vui lòng kiểm tra lại bộ lọc."
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
                  ← Trước
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
                          ...
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
                          ...
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
                  Sau →
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
