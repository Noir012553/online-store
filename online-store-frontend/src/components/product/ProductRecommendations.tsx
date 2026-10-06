import type { BackendProduct } from '../../lib/api';
import { ProductCard } from '../ProductCard';

interface ProductRecommendationsProps {
  relatedProducts: BackendProduct[];
  recentlyViewedProducts: BackendProduct[];
  relatedTitle: string;
  recentlyViewedTitle: string;
}

export function ProductRecommendations({
  relatedProducts,
  recentlyViewedProducts,
  relatedTitle,
  recentlyViewedTitle,
}: ProductRecommendationsProps) {
  return (
    <>
      {relatedProducts.length > 0 && (
        <section>
          <h2 className="mb-4 sm:mb-6 text-lg sm:text-xl">{relatedTitle}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {relatedProducts.map((product) => (
              <ProductCard key={product._id} laptop={product} />
            ))}
          </div>
        </section>
      )}

      {recentlyViewedProducts.length > 0 && (
        <section className="mt-8 sm:mt-12">
          <h2 className="mb-4 sm:mb-6 text-lg sm:text-xl">{recentlyViewedTitle}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {recentlyViewedProducts.map((product) => (
              <ProductCard key={product._id} laptop={product} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
