import { useState, useEffect } from "react";
import { useLanguage } from "../../lib/i18n";
import { PackageSearch, Grid3x3, FolderOpen, TrendingUp } from "lucide-react";
import { useRouter } from "next/router";
import { productAPI } from "../../lib/api";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { ProductCard } from "../../components/ProductCard";
import { EmptyState } from "../../components/EmptyState";
import { BannerSlot } from "../../components/BannerSlot";
import { useCategories } from "../../lib/context/CategoryContext";
import { useCategoryTranslation } from "../../hooks/useCategoryTranslation";

export const getServerSideProps = async () => {
  return {
    props: {},
  };
};

export default function AllProductsPage() {
  const router = useRouter();
  const { search } = router.query;
  const { categories, isLoading: categoriesLoading } = useCategories();
  const { loadNamespace, t, locale } = useLanguage();
  const [totalProducts, setTotalProducts] = useState(0);
  const [isSearchLoading, setIsSearchLoading] = useState(true);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [categoryTranslations, setCategoryTranslations] = useState<Record<string, any>>({});

  useEffect(() => {
    loadNamespace('products');
  }, [loadNamespace]);

  // Fetch translations for all categories
  useEffect(() => {
    const fetchTranslations = async () => {
      if (!Array.isArray(categories) || categories.length === 0 || locale === 'vi') {
        setCategoryTranslations({});
        return;
      }

      const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '');
      const translations: Record<string, any> = {};

      for (const category of categories) {
        try {
          const response = await fetch(
            `${apiBase}/api/categories/${category._id}/translations?lang=${locale}`
          );
          if (response.ok) {
            const json = await response.json();
            translations[category._id] = json.data;
          }
        } catch (err) {
          // Silently fail, will show Vietnamese name
        }
      }

      setCategoryTranslations(translations);
    };

    fetchTranslations();
  }, [categories, locale]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsSearchLoading(true);

        // If search query exists, fetch search results
        if (search && typeof search === 'string' && search.trim()) {
          try {
            const response = await productAPI.getProducts(1, search, undefined, undefined, 100);
            setSearchResults(response.products || []);
            setIsSearchLoading(false);
            return;
          } catch (err) {
            setSearchResults([]);
          }
        } else {
          setSearchResults([]);
        }

        // Categories are now fetched from context, not here
        setIsSearchLoading(false);

        // Fetch total products in background (non-blocking)
        try {
          const productsResponse = await productAPI.getProducts(1, undefined, undefined, undefined, 1);
          const total = productsResponse?.pages || productsResponse?.total || 0;
          setTotalProducts(total);
        } catch (err) {
          setTotalProducts(0);
        }
      } catch (err) {
        setIsSearchLoading(false);
      }
    };

    fetchData();
  }, [search]);

  const getCategorySlug = (categoryName: string | { vi?: string; en?: string }) => {
    if (typeof categoryName === 'object' && categoryName !== null) {
      categoryName = (categoryName as any).vi || (categoryName as any).en || '';
    }
    if (typeof categoryName !== 'string') return '';
    return categoryName.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
  };

  const isSearching = search && typeof search === 'string' && search.trim();

  return (
    <div className="min-h-screen bg-white">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <Breadcrumbs
            links={[
              { label: t('breadcrumb_label') },
              ...(isSearching ? [{ label: `${t('search_breadcrumb')} - ${search}` }] : []),
            ]}
          />
        </div>

        {/* Products Top Banner */}
        <div className="mb-8">
          <BannerSlot slot="products_top" variant="strip" limit={1} />
        </div>

        {isSearchLoading ? (
          <div className="animate-pulse space-y-8">
            <div className="h-80 bg-gray-200 rounded-lg"></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
              ))}
            </div>
          </div>
        ) : isSearching ? (
          <>
            {/* Search Results */}
            <div className="mb-6 sm:mb-8">
              <h1 className="text-2xl sm:text-3xl font-bold mb-1 sm:mb-2">{t('search_results_title')}</h1>
              <p className="text-xs sm:text-sm text-gray-600">
                {`${t('search_results_count')} - ${searchResults.length} ${t('results_for')} "${search}"`}
              </p>
            </div>

            {searchResults.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                {searchResults.map((product) => (
                  <ProductCard key={product._id} laptop={product} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={PackageSearch}
                title={t('search_no_results_title')}
                description={`${t('search_no_results_desc')} "${search}"`}
              />
            )}
          </>
        ) : (
          <>
            {/* Hero Banner */}
            <div className="hero-banner rounded-lg bg-linear-to-r from-red-600 to-red-800 text-white px-4 sm:px-8 py-8 sm:py-16 mb-8 sm:mb-12">
              <div className="max-w-2xl">
                <h1 className="text-2xl sm:text-4xl lg:text-5xl font-bold mb-2 sm:mb-4">{t('hero_title')}</h1>
                <p className="text-xs sm:text-lg text-red-100 mb-1 sm:mb-2">{t('hero_subtitle')}</p>
                <p className="text-xs sm:text-base text-red-100">{t('hero_description')}</p>
              </div>
            </div>

            {/* Statistics Section */}
            <div className="statistics-section grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 mb-8 sm:mb-12">
              <div className="stats-card bg-linear-to-br from-blue-50 to-blue-100 rounded-lg p-4 sm:p-6 border border-blue-200">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-gray-600 text-xs sm:text-sm font-medium">{t('stats_total_products')}</p>
                    <p className="text-xl sm:text-3xl font-bold text-blue-600 mt-1 sm:mt-2">{totalProducts}</p>
                  </div>
                  <Grid3x3 className="w-8 h-8 sm:w-12 sm:h-12 text-blue-300" />
                </div>
              </div>

              <div className="stats-card bg-linear-to-br from-purple-50 to-purple-100 rounded-lg p-4 sm:p-6 border border-purple-200">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-gray-600 text-xs sm:text-sm font-medium">{t('stats_categories')}</p>
                    <p className="text-xl sm:text-3xl font-bold text-purple-600 mt-1 sm:mt-2">{Array.isArray(categories) ? categories.length : 0}</p>
                  </div>
                  <FolderOpen className="w-8 h-8 sm:w-12 sm:h-12 text-purple-300" />
                </div>
              </div>

              <div className="stats-card bg-linear-to-br from-orange-50 to-orange-100 rounded-lg p-4 sm:p-6 border border-orange-200">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-gray-600 text-xs sm:text-sm font-medium">{t('stats_rating', 'products')}</p>
                    <p className="text-xl sm:text-3xl font-bold text-orange-600 mt-1 sm:mt-2">{t('stats_rating_value', 'products')}</p>
                  </div>
                  <TrendingUp className="w-8 h-8 sm:w-12 sm:h-12 text-orange-300" />
                </div>
              </div>
            </div>

            {/* Categories Section */}
            {!Array.isArray(categories) || categories.length === 0 ? (
              <div className="text-center py-8 sm:py-16">
                <PackageSearch className="w-12 h-12 sm:w-16 sm:h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 text-base sm:text-lg">{t('no_categories')}</p>
              </div>
            ) : (
              <div className="categories-section">
                <h2 className="text-2xl sm:text-3xl font-bold mb-4 sm:mb-8">{t('categories_section_title')}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                  {categories.map((category) => {
                    const translation = locale !== 'vi' ? categoryTranslations[category._id] : null;
                    const displayName = translation?.name || category.name;
                    return (
                      <a
                        key={category._id}
                        href={`/products/${getCategorySlug(category.name)}`}
                        className="category-card group bg-white border border-gray-200 rounded-lg hover:border-red-600 hover:shadow-xl transition-all duration-300 overflow-hidden"
                      >
                        <div className="p-4 sm:p-6 flex flex-col h-full">
                          <div className="flex-1">
                            <h3 className="font-bold text-base sm:text-lg text-gray-900 group-hover:text-red-600 transition-colors">
                              {displayName}
                            </h3>
                            <p className="text-xs sm:text-sm text-gray-500 mt-1 sm:mt-2">
                              {translation?.description || t('category_card_desc')}
                            </p>
                          </div>
                          <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-100">
                            <span className="inline-block text-red-600 font-medium text-xs sm:text-sm group-hover:translate-x-1 transition-transform">
                              {t('category_discover_more')}
                            </span>
                          </div>
                        </div>
                      </a>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
