import React, { createContext, useContext, useState, useEffect } from "react";
import { categoryAPI } from "../api";

interface Category {
  _id: string;
  name: string;
  description?: string;
  translationKey?: string;
  icon?: string;
  image?: string;
  key?: string;
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

  useEffect(() => {
    const fetchCategories = async () => {
      setIsLoading(true);
      try {
        const response = await categoryAPI.getCategories();
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
  }, []);

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
