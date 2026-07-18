import { useEffect, useState } from 'react';
import { brandAPI } from '../lib/api';
import { useLanguage } from '../lib/context/LanguageContext';

export interface Brand {
  _id: string;
  name: string;
  logo?: string;
  description?: string;
}

export function useBrands() {
  const { locale, isHydrated } = useLanguage();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isHydrated) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const fetchBrands = async () => {
      try {
        setIsLoading(true);
        const response = await brandAPI.getBrands(locale);
        if (!isMounted) return;
        setBrands(response.brands || []);
        setError(null);
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'api_error_fetch_brands');
          setBrands([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchBrands();

    return () => {
      isMounted = false;
    };
  }, [locale, isHydrated]);

  return { brands, isLoading, error };
}
