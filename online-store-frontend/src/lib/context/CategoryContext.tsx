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
      setIsLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    const fetchCategories = async () => {
      setIsLoading(true);
      try {
        const response = await categoryAPI.getCategories(locale);
        if (requestId !== requestIdRef.current) return;

        const cats = response.categories || response;
        const finalCats = Array.isArray(cats) ? cats : [];

        setCategories(finalCats);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
      } finally {
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    };

    fetchCategories();
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
