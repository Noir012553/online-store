import { createContext, useContext, useState, useEffect, useRef } from "react";
import { categoryAPI } from "../api";
import { useLanguage } from "../i18n";

interface Category {
  _id: string;
  name: string;
  description?: string;
  translationKey?: string;
  icon?: string;
  image?: string;
  key?: string;
  slug?: string;
}

interface CategoryContextType {
  categories: Category[];
  isLoading: boolean;
}

const CategoryContext = createContext<CategoryContextType | undefined>(undefined);

export const CategoryProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const requestIdRef = useRef(0);
  const { locale, isHydrated } = useLanguage();

  useEffect(() => {
    if (!isHydrated) {
      setIsLoading(true);
      return;
    }

    const requestId = ++requestIdRef.current;
    const controller = new AbortController();
    const retryDelayMs = 1000;

    const fetchCategories = async () => {
      setIsLoading(true);

      try {
        let response;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            response = await categoryAPI.getCategories(locale, { signal: controller.signal }, true);
            break;
          } catch (error) {
            const status = typeof error === 'object' && error !== null && 'status' in error
              ? Number(error.status)
              : undefined;
            const isRetryable = status === undefined || status >= 500;
            if (controller.signal.aborted || attempt === 1 || !isRetryable) throw error;

            await new Promise<void>((resolve, reject) => {
              const timeoutId = window.setTimeout(resolve, retryDelayMs);
              controller.signal.addEventListener('abort', () => {
                window.clearTimeout(timeoutId);
                reject(controller.signal.reason);
              }, { once: true });
            });
          }
        }

        if (requestId !== requestIdRef.current || !response) return;

        const cats = response.categories || response;
        const finalCats = Array.isArray(cats) ? cats : [];
        setCategories(finalCats);
      } catch (error) {
        if (requestId !== requestIdRef.current || controller.signal.aborted) return;
        setCategories([]);
      } finally {
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    };

    void fetchCategories();
    return () => controller.abort();
  }, [locale, isHydrated]);

  return (
    <CategoryContext.Provider value={{ categories, isLoading }}>
      {children}
    </CategoryContext.Provider>
  );
};

export const useCategories = () => {
  const context = useContext(CategoryContext);
  if (!context) {
    return { categories: [], isLoading: false };
  }
  return context;
};
