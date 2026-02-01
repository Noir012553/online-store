import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { categoryAPI } from "../../lib/api";
import { findCategoryBySlug } from "../../lib/categoryUtils";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { CategoryProductsList } from "../../components/CategoryProductsList";

interface Category {
  _id: string;
  name: string;
}

export default function CategoryProductsPage() {
  const router = useRouter();
  const { categorySlug } = router.query;
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setIsLoading(true);
        const response = await categoryAPI.getCategories();
        const cats = response.categories || response;
        const categoriesList = Array.isArray(cats) ? cats : [];
        setCategories(categoriesList);

        // Find category by slug
        if (categorySlug && typeof categorySlug === 'string') {
          const found = findCategoryBySlug(categoriesList, categorySlug);
          if (found) {
            setSelectedCategory(found);
            setNotFound(false);
          } else {
            setNotFound(true);
          }
        }
      } catch (err) {
        setNotFound(true);
      } finally {
        setIsLoading(false);
      }
    };

    if (categorySlug) {
      fetchCategories();
    }
  }, [categorySlug]);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (notFound || !selectedCategory) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Breadcrumbs
            links={[
              { label: "Sản phẩm", href: "/products" },
              { label: "Không tìm thấy" },
            ]}
          />
        </div>
        <div className="text-center py-12">
          <h1 className="text-3xl font-bold mb-4">Danh mục không tìm thấy</h1>
          <p className="text-gray-600 mb-6">Danh mục bạn tìm không tồn tại.</p>
          <a 
            href="/products" 
            className="inline-block bg-red-600 text-white px-6 py-2 rounded hover:bg-red-700"
          >
            Quay lại tất cả sản phẩm
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Breadcrumbs
          links={[
            { label: "Sản phẩm", href: "/products" },
            { label: selectedCategory.name },
          ]}
        />
        <h1 className="text-3xl font-bold">{selectedCategory.name}</h1>
      </div>

      <CategoryProductsList 
        categoryId={selectedCategory._id} 
        categoryName={selectedCategory.name}
      />
    </div>
  );
}
