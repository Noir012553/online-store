import { useState, useEffect } from "react";
import { PackageSearch, Grid3x3, FolderOpen, TrendingUp } from "lucide-react";
import { useRouter } from "next/router";
import { productAPI, categoryAPI } from "../../lib/api";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { ProductCard } from "../../components/ProductCard";
import { EmptyState } from "../../components/EmptyState";

interface Category {
  _id: string;
  name: string;
}

export default function AllProductsPage() {
  const router = useRouter();
  const { search } = router.query;
  const [categories, setCategories] = useState<Category[]>([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [searchResults, setSearchResults] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);

        // If search query exists, fetch search results
        if (search && typeof search === 'string' && search.trim()) {
          try {
            const response = await productAPI.getProducts(1, search, undefined, undefined, 100);
            setSearchResults(response.products || []);
            setIsLoading(false);
            return;
          } catch (err) {
            setSearchResults([]);
          }
        } else {
          setSearchResults([]);
        }

        // Fetch categories (shown when not searching)
        const response = await categoryAPI.getCategories();
        const cats = response.categories || response;
        const categoriesList = Array.isArray(cats) ? cats : [];
        setCategories(categoriesList);
        setIsLoading(false);

        // Fetch total products in background (non-blocking)
        try {
          const productsResponse = await productAPI.getProducts(1, undefined, undefined, undefined, 1);
          const total = productsResponse?.pages || productsResponse?.total || 0;
          setTotalProducts(total);
        } catch (err) {
          setTotalProducts(0);
        }
      } catch (err) {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [search]);

  const getCategorySlug = (categoryName: string) => {
    return categoryName.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
  };

  const isSearching = search && typeof search === 'string' && search.trim();

  return (
    <div className="min-h-screen bg-white">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <Breadcrumbs
            links={[
              { label: "Sản phẩm" },
              ...(isSearching ? [{ label: `Tìm kiếm: "${search}"` }] : []),
            ]}
          />
        </div>

        {isLoading ? (
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
            <div className="mb-8">
              <h1 className="text-3xl font-bold mb-2">Kết quả tìm kiếm</h1>
              <p className="text-gray-600">Tìm thấy {searchResults.length} sản phẩm cho "{search}"</p>
            </div>

            {searchResults.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {searchResults.map((product) => (
                  <ProductCard key={product._id} laptop={product} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={PackageSearch}
                title="Không tìm thấy sản phẩm"
                description={`Không có sản phẩm nào khớp với "${search}". Hãy thử từ khóa khác.`}
              />
            )}
          </>
        ) : (
          <>
            {/* Hero Banner */}
            <div className="hero-banner rounded-lg bg-linear-to-r from-red-600 to-red-800 text-white px-8 py-16 mb-12">
              <div className="max-w-2xl">
                <h1 className="text-4xl md:text-5xl font-bold mb-4">Kho sản phẩm công nghệ</h1>
                <p className="text-lg text-red-100 mb-2">Khám phá bộ sưu tập đầy đủ các sản phẩm công nghệ chất lượng cao</p>
                <p className="text-red-100">Từ laptop, linh kiện đến các phụ kiện công nghệ đa dạng</p>
              </div>
            </div>

            {/* Statistics Section */}
            <div className="statistics-section grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
              <div className="stats-card bg-linear-to-br from-blue-50 to-blue-100 rounded-lg p-6 border border-blue-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm font-medium">Tổng sản phẩm</p>
                    <p className="text-3xl font-bold text-blue-600 mt-2">{totalProducts}</p>
                  </div>
                  <Grid3x3 className="w-12 h-12 text-blue-300" />
                </div>
              </div>

              <div className="stats-card bg-linear-to-br from-purple-50 to-purple-100 rounded-lg p-6 border border-purple-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm font-medium">Danh mục</p>
                    <p className="text-3xl font-bold text-purple-600 mt-2">{categories.length}</p>
                  </div>
                  <FolderOpen className="w-12 h-12 text-purple-300" />
                </div>
              </div>

              <div className="stats-card bg-linear-to-br from-orange-50 to-orange-100 rounded-lg p-6 border border-orange-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm font-medium">Được yêu thích</p>
                    <p className="text-3xl font-bold text-orange-600 mt-2">4.8★</p>
                  </div>
                  <TrendingUp className="w-12 h-12 text-orange-300" />
                </div>
              </div>
            </div>

            {/* Categories Section */}
            {categories.length === 0 ? (
              <div className="text-center py-16">
                <PackageSearch className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 text-lg">Không có danh mục sản phẩm</p>
              </div>
            ) : (
              <div className="categories-section">
                <h2 className="text-3xl font-bold mb-8">Khám phá các danh mục</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {categories.map((category) => (
                    <a
                      key={category._id}
                      href={`/products/${getCategorySlug(category.name)}`}
                      className="category-card group bg-white border border-gray-200 rounded-lg hover:border-red-600 hover:shadow-xl transition-all duration-300 overflow-hidden"
                    >
                      <div className="p-6 flex flex-col h-full">
                        <div className="flex-1">
                          <h3 className="font-bold text-lg text-gray-900 group-hover:text-red-600 transition-colors">
                            {category.name}
                          </h3>
                          <p className="text-sm text-gray-500 mt-2">
                            Xem tất cả sản phẩm
                          </p>
                        </div>
                        <div className="mt-4 pt-4 border-t border-gray-100">
                          <span className="inline-block text-red-600 font-medium text-sm group-hover:translate-x-1 transition-transform">
                            Khám phá →
                          </span>
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
