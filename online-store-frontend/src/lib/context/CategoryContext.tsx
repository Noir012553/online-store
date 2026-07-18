import { createContext, useContext, useState, useEffect } from "react";
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
  const { locale, isHydrated } = useLanguage();

  useEffect(() => {
    if (!isHydrated) {
      setIsLoading(false);
      return;
    }

    const fetchCategories = async () => {
      setIsLoading(true);
      try {
        const response = await categoryAPI.getCategories(locale);
        const cats = response.categories || response;
        const finalCats = Array.isArray(cats) ? cats : [];

        setCategories(finalCats);
      } catch (err) {
        // Silently continue on fetch error
      } finally {
        setIsLoading(false);
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
