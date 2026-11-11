import { useEffect, useState } from 'react';
import type { BackendProduct } from '../lib/api';

const RECENTLY_VIEWED_STORAGE_KEY = 'laptopstore_recently_viewed_products';
const MAX_RECENTLY_VIEWED_PRODUCTS = 4;

export function useRecentlyViewedProducts(product: BackendProduct | null) {
  const [recentlyViewedProducts, setRecentlyViewedProducts] = useState<BackendProduct[]>([]);

  useEffect(() => {
    if (!product?._id || typeof window === 'undefined') return;

    try {
      const storedProducts = JSON.parse(
        window.localStorage.getItem(RECENTLY_VIEWED_STORAGE_KEY) || '[]'
      );
      const previousProducts = Array.isArray(storedProducts)
        ? storedProducts.filter((storedProduct) => storedProduct?._id && storedProduct._id !== product._id)
        : [];
      const updatedProducts = [product, ...previousProducts].slice(0, MAX_RECENTLY_VIEWED_PRODUCTS + 1);

      window.localStorage.setItem(
        RECENTLY_VIEWED_STORAGE_KEY,
        JSON.stringify(updatedProducts)
      );
      setRecentlyViewedProducts(updatedProducts.slice(1, MAX_RECENTLY_VIEWED_PRODUCTS + 1));
    } catch {
      setRecentlyViewedProducts([]);
    }
  }, [product]);

  return recentlyViewedProducts;
}
