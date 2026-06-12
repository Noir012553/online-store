'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

import { useRouter } from "next/router";
import { Search, X } from "lucide-react";
import { productAPI, BackendProduct } from "../lib/api";
import { formatCurrency, getImageUrl } from "../lib/utils";
import { Input } from "./ui/input";
import { useTranslation } from "@/lib/i18n";
import { useLanguage } from "@/lib/context/LanguageContext";
import { useProductTranslation } from "@/hooks/useProductTranslation";

function SearchResultItem({
  product,
  isSelected,
  onSelect,
}: {
  product: BackendProduct;
  isSelected: boolean;
  onSelect: (product: BackendProduct) => void;
}) {
  const { locale } = useLanguage();
  const { t } = useTranslation();
  const { translation } = useProductTranslation(product._id);

  const displayName = useMemo(() => {
    return (locale !== 'vi' && translation?.name) ? translation.name : (product.name || '');
  }, [product.name, translation, locale]);

  const displayCategory = useMemo(() => {
    const categoryObj = product.category && typeof product.category === 'object' ? product.category : null;
    if (!categoryObj) return '';
    // Use translationKey if available, otherwise fallback to category name
    return categoryObj.translationKey ? t(categoryObj.translationKey, 'categories') : t(categoryObj.name || 'Uncategorized', 'categories');
  }, [product.category, t]);

  return (
    <button
      onClick={() => onSelect(product)}
      className={`w-full px-4 py-3 hover:bg-white transition-colors flex gap-3 items-start text-left ${
        isSelected ? "bg-gray-100" : ""
      }`}
    >
      {/* Product Image */}
      <div className="w-12 h-12 shrink-0 rounded-md bg-gray-100 overflow-hidden">
        <img
          src={product.image || "/placeholder.png"}
          alt={displayName}
          loading="lazy"
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).src = "/placeholder.png";
          }}
        />
      </div>

      {/* Product Info */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-gray-900 truncate">
          {displayName}
        </p>
        <div className="flex gap-2 mt-1 text-xs text-gray-500">
          {displayCategory && (
            <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-600 uppercase">
              {displayCategory}
            </span>
          )}
          {product.brand && (
            <span className="text-gray-600">
              {product.brand === 'Không thương hiệu' ? (locale === 'vi' ? 'Không thương hiệu' : 'No Brand') : t(product.brand, 'products')}
            </span>
          )}
        </div>
        <p className="text-sm font-semibold text-red-600 mt-1">
          {formatCurrency(product.price)}
        </p>
        {product.countInStock !== undefined && (
          <p className="text-xs text-gray-500 mt-0.5">
            {product.countInStock > 0
              ? `${product.countInStock} ${t('items_count')} ${t('in_stock').toLowerCase()}`
              : t('out_of_stock')}
          </p>
        )}
      </div>
    </button>
  );
}

export function SearchDropdown() {
  const router = useRouter();
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<BackendProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Fetch suggestions khi người dùng nhập
  const fetchSuggestions = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    try {
      setIsLoading(true);
      const response = await productAPI.getProducts(
        1,
        query,
        undefined,
        undefined,
        10 // Lấy tối đa 10 gợi ý
      );
      const products = response.products || [];
      setSuggestions(products.slice(0, 10)); // Giới hạn 10 kết quả
      setIsOpen(products.length > 0);
      setSelectedIndex(-1);
    } catch (error) {
      setSuggestions([]);
      setIsOpen(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Debounce search input
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);

    // Clear previous timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    // Set new timer for debounced search
    debounceTimer.current = setTimeout(() => {
      fetchSuggestions(query);
    }, 300);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || suggestions.length === 0) {
      if (e.key === "Enter" && searchQuery.trim()) {
        handleSearch();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0) {
          handleSelectProduct(suggestions[selectedIndex]);
        } else if (searchQuery.trim()) {
          handleSearch();
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        setSelectedIndex(-1);
        break;
      default:
        break;
    }
  };

  // Navigate to search results page
  const handleSearch = useCallback(() => {
    if (searchQuery.trim() && router.isReady) {
      router.push(`/products?search=${encodeURIComponent(searchQuery)}`);
      setSearchQuery("");
      setSuggestions([]);
      setIsOpen(false);
    }
  }, [searchQuery, router]);

  // Navigate to product detail page
  const handleSelectProduct = useCallback((product: BackendProduct) => {
    if (router.isReady) {
      router.push(`/product/${product._id}`);
      setSearchQuery("");
      setSuggestions([]);
      setIsOpen(false);
    }
  }, [router]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Clear search query
  const handleClear = () => {
    setSearchQuery("");
    setSuggestions([]);
    setIsOpen(false);
    searchInputRef.current?.focus();
  };

  return (
    <div className="relative w-52">
      {/* Search Input */}
      <div className="relative">
        <Input
          ref={searchInputRef}
          id="site-search"
          name="q"
          type="text"
          placeholder={t('search_placeholder')}
          value={searchQuery}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => searchQuery.trim() && setIsOpen(true)}
          autoComplete="off"
          aria-label={t('search_placeholder')}
          className="w-full pl-10 pr-10 text-[10px] placeholder:text-xs h-8"
        />
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />

        {/* Clear button */}
        {searchQuery && (
          <button
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label={t('clear_all')}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Dropdown Suggestions */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-96 overflow-y-auto"
        >
          {isLoading ? (
            <div className="p-4 text-center text-gray-500 text-sm">
              <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mb-2"></div>
              <p>{t('loading')}</p>
            </div>
          ) : suggestions.length === 0 ? (
            <div className="p-4 text-center text-gray-500 text-sm">
              {t('no_products_found')}
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {suggestions.map((product, index) => (
                <li key={product._id}>
                  <SearchResultItem
                    product={product}
                    isSelected={index === selectedIndex}
                    onSelect={handleSelectProduct}
                  />
                </li>
              ))}

              {/* View all results button */}
              {searchQuery.trim() && (
                <li className="border-t border-gray-100">
                  <button
                    onClick={handleSearch}
                    className="w-full px-4 py-3 text-center text-blue-600 font-medium text-sm hover:bg-white transition-colors"
                  >
                    {t('view_all')} ({suggestions.length} {t('items_count')})
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
