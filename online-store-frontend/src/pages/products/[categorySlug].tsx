import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { findCategoryBySlug } from "../../lib/categoryUtils";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { BannerSlot } from "../../components/BannerSlot";
import { CategoryProductsList } from "../../components/CategoryProductsList";
import { useCategories } from "../../lib/context/CategoryContext";
import { useLanguage } from "../../lib/i18n";
import { useCategoryTranslation } from "../../hooks/useCategoryTranslation";

interface Category {
  _id: string;
  name: string;
}

export default function CategoryProductsPage() {
  const router = useRouter();
  const { categorySlug } = router.query;
  const { categories, isLoading: categoriesLoading } = useCategories();
  const { t, locale, loadNamespace } = useLanguage();
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const { translation } = useCategoryTranslation(selectedCategory?._id || '');

  useEffect(() => {
    setIsReady(router.isReady);
  }, [router.isReady]);

  useEffect(() => {
    loadNamespace('products');
  }, [loadNamespace]);

  useEffect(() => {
    // Find category by slug from context
    if (categorySlug && typeof categorySlug === 'string' && categories.length > 0) {
      const found = findCategoryBySlug(categories, categorySlug);
      if (found) {
        setSelectedCategory(found);
        setNotFound(false);
      } else {
        setNotFound(true);
      }
    } else if (categorySlug && typeof categorySlug === 'string' && !categoriesLoading && categories.length === 0) {
      setNotFound(true);
    }
  }, [categorySlug, categories, categoriesLoading]);

  if (!isReady || categoriesLoading) {
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
              { label: t('products_breadcrumb'), href: "/products" },
              { label: t('category_not_found_title') },
            ]}
          />
        </div>
        <div className="text-center py-12">
          <h1 className="text-3xl font-bold mb-4">{t('category_not_found_title')}</h1>
          <p className="text-gray-600 mb-6">{t('category_not_found_desc')}</p>
          <a
            href="/products"
            className="inline-block bg-red-600 text-white px-6 py-2 rounded hover:bg-red-700"
          >
            {t('back_to_products')}
          </a>
        </div>
      </div>
    );
  }

  const translatedCategoryName = locale !== 'vi' && translation?.name ? translation.name : selectedCategory.name;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Breadcrumbs
          links={[
            { label: t('products_breadcrumb'), href: "/products" },
            { label: translatedCategoryName },
          ]}
        />
        <h1 className="text-3xl font-bold">{translatedCategoryName}</h1>
      </div>

      {/* Category Top Banner */}
      <div className="mb-8">
        <BannerSlot slot="category_top" variant="strip" limit={1} />
      </div>

      <CategoryProductsList
        categoryId={selectedCategory._id}
        categoryName={selectedCategory.name}
      />
    </div>
  );
}

export function getStaticProps() {
  return {
    props: {},
    revalidate: 60,
  };
}

export function getStaticPaths() {
  return {
    paths: [],
    fallback: 'blocking',
  };
}
