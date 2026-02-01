import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { Star, ShoppingCart, Minus, Plus, Truck, Shield, CreditCard, LogIn } from "lucide-react";
import { productAPI, reviewAPI, BACKEND_URL } from "../../lib/api";
import { formatCurrency, formatDate } from "../../lib/utils";
import { useCart } from "../../lib/context/CartContext";
import { useAuth } from "../../lib/context/AuthContext";
import { Laptop } from "../../lib/data";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { ProductCard } from "../../components/ProductCard";
import { ImageWithFallback } from "../../components/figma/ImageWithFallback";
import { EmojiSvg } from "../../components/EmojiSvg";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { filterSpecsByCategory, getSpecLabel, getSpecsLayout, getSpecsForCategory } from "../../lib/specConfig";
import { toast } from "sonner";

interface Review {
  _id?: string;
  name?: string;
  rating: number;
  comment: string;
  user?: {
    username?: string;
    name?: string;
  };
  createdAt?: string;
}

export default function ProductDetail() {
  const router = useRouter();
  const { id } = router.query;
  const { addToCart } = useCart();
  const { user } = useAuth();
  const [laptop, setLaptop] = useState<any>(null);
  const [relatedLaptops, setRelatedLaptops] = useState<any[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [selectedImage, setSelectedImage] = useState(0);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: '', avatar: null as File | null });
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Fetch product detail from backend
  useEffect(() => {
    if (!id) return;

    const fetchProduct = async () => {
      try {
        setIsLoading(true);
        const product = await productAPI.getProductById(id as string);
        setLaptop(product);

        // Fetch related products (same category)
        const categoryId = product.category?._id || product.category;
        if (categoryId) {
          const allProducts = await productAPI.getProducts(1);
          const related = allProducts.products
            .filter((p: any) => {
              const pCategoryId = p.category?._id || p.category;
              return pCategoryId === categoryId && p._id !== product._id;
            })
            .slice(0, 4);
          setRelatedLaptops(related);
        }

        // Fetch product reviews
        try {
          const reviewsResponse = await reviewAPI.getProductReviews(id as string);
          const reviewsList = reviewsResponse.reviews || reviewsResponse;
          setReviews(Array.isArray(reviewsList) ? reviewsList : []);
        } catch (reviewErr) {
          setReviews([]);
        }

        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load product");
        setLaptop(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProduct();
  }, [id]);

  const handleSubmitReview = async () => {
    if (!user) {
      toast.error('Vui lòng đăng nhập để viết đánh giá');
      router.push('/login');
      return;
    }

    if (!reviewForm.comment.trim()) {
      toast.error('Vui lòng nhập bình luận');
      return;
    }

    try {
      setIsSubmittingReview(true);
      await reviewAPI.createReview(id as string, reviewForm.rating, reviewForm.comment, reviewForm.avatar || undefined);
      toast.success('Cảm ơn bạn đã đánh giá!');
      setReviewForm({ rating: 5, comment: '', avatar: null });
      setShowReviewForm(false);

      // Refresh reviews
      const reviewsResponse = await reviewAPI.getProductReviews(id as string);
      const reviewsList = reviewsResponse.reviews || reviewsResponse;
      setReviews(Array.isArray(reviewsList) ? reviewsList : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể gửi đánh giá');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="animate-pulse space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="aspect-video bg-gray-200 rounded-lg"></div>
            <div className="space-y-4">
              <div className="h-8 bg-gray-200 rounded w-3/4"></div>
              <div className="h-6 bg-gray-200 rounded w-1/2"></div>
              <div className="h-12 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !laptop) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <h2>Không tìm thấy sản phẩm</h2>
        {error && <p className="text-red-600 mt-2">{error}</p>}
        <Link href="/products">
          <Button className="mt-4 bg-red-600 hover:bg-red-700">Quay lại danh sách</Button>
        </Link>
      </div>
    );
  }

  // Convert backend image URLs
  const images = (laptop.images || [laptop.image]).map((img: string) =>
    img.startsWith('http') ? img : `${BACKEND_URL}${img}`
  );
  const mainImage = images[selectedImage] || images[0];

  // Convert backend product to frontend Laptop format for cart
  const convertedLaptop: Laptop = {
    id: laptop._id,
    name: laptop.name,
    brand: laptop.brand,
    category: laptop.category?._id || laptop.category?.id || laptop.category || 'unknown',
    price: laptop.price,
    originalPrice: laptop.originalPrice,
    image: images[0],
    images,
    rating: laptop.rating || 0,
    reviews: laptop.numReviews || 0,
    inStock: (laptop.countInStock || 0) > 0,
    specs: laptop.specs || {},
    description: laptop.description,
    features: laptop.features || [],
    featured: laptop.featured || false,
    deal: laptop.deal,
  };

  const handleAddToCart = () => {
    addToCart(convertedLaptop, quantity);
    toast.success(`Đã thêm ${quantity} ${convertedLaptop.name} vào giỏ hàng`);
  };

  const handleBuyNow = () => {
    addToCart(convertedLaptop, quantity);
    router.push("/cart");
  };

  const discount = laptop.originalPrice
    ? Math.round(((laptop.originalPrice - laptop.price) / laptop.originalPrice) * 100)
    : 0;

  return (
    <div className="container mx-auto px-4 py-8 animate-in fade-in duration-300">
      <Breadcrumbs
        links={[
          { label: "Sản phẩm", href: "/products" },
          { label: laptop.name },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
        <div>
          <div className="relative aspect-video mb-4 bg-gray-100 rounded-lg overflow-hidden group">
            <ImageWithFallback
              src={mainImage}
              alt={laptop.name}
              className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-110"
            />
            {discount > 0 && (
              <Badge className="absolute top-4 right-4 bg-red-600 text-white text-lg px-4 py-2 animate-in zoom-in duration-300">
                -{discount}%
              </Badge>
            )}
            {laptop.deal && (
              <Badge className="absolute top-4 left-4 bg-black text-white text-lg px-4 py-2 animate-in zoom-in duration-300 flex items-center gap-1">
                <EmojiSvg emoji="🔥" className="w-5 h-5" />
                Deal Sốc
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {images.map((image: string, index: number) => (
              <button
                key={index}
                onClick={() => setSelectedImage(index)}
                className={`aspect-video border-2 rounded overflow-hidden transition-all duration-300 hover:shadow-lg ${
                  selectedImage === index ? "border-red-600 scale-105" : "border-gray-200"
                }`}
              >
                <ImageWithFallback
                  src={image}
                  alt={`${laptop.name} ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>

        <div>
          <h1 className="mb-4">{laptop.name}</h1>
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={`w-5 h-5 ${
                    i < Math.floor(laptop.rating || 0)
                      ? "fill-yellow-400 text-yellow-400"
                      : "text-gray-300"
                  }`}
                />
              ))}
              <span>{(laptop.rating || 0).toFixed(1)}</span>
            </div>
            <span className="text-gray-500">({laptop.numReviews || 0} đánh giá)</span>
            <Badge variant={(laptop.countInStock || 0) > 0 ? "default" : "destructive"}>
              {(laptop.countInStock || 0) > 0 ? "Còn hàng" : "Hết hàng"}
            </Badge>
          </div>

          <div className="flex items-center gap-4 mb-6">
            <span className="text-3xl text-red-600">{formatCurrency(laptop.price)}</span>
            {laptop.originalPrice && (
              <span className="text-xl text-gray-400 line-through">
                {formatCurrency(laptop.originalPrice)}
              </span>
            )}
          </div>

          <div className="bg-gray-50 p-4 rounded-lg mb-6">
            <h3 className="mb-3">Thông số nổi bật:</h3>
            <div className="space-y-2 text-gray-700">
              {(() => {
                const categoryName = typeof laptop.category === 'string' ? laptop.category : laptop.category?.name || 'laptop';
                const specFields = getSpecsForCategory(categoryName);
                const specsToShow = specFields.slice(0, 5); // Show top 5 specs
                const specs = laptop.specs || {};

                // Get specs that exist in the data
                const displaySpecs = specsToShow.filter(field => specs[field]);

                // If no specs found, show all available specs (up to 5)
                if (displaySpecs.length === 0) {
                  const allSpecs = Object.entries(specs).slice(0, 5);
                  if (allSpecs.length === 0) {
                    return <p className="text-gray-500 italic">Không có thông số kỹ thuật</p>;
                  }
                  return (
                    <>
                      {allSpecs.map(([field, value]: [string, any]) => (
                        <div key={field} className="flex justify-between gap-4">
                          <span className="font-medium">• {getSpecLabel(field)}:</span>
                          <span className="text-right">{value || 'N/A'}</span>
                        </div>
                      ))}
                    </>
                  );
                }

                return (
                  <>
                    {displaySpecs.map((field) => (
                      <div key={field} className="flex justify-between gap-4">
                        <span className="font-medium">• {getSpecLabel(field)}:</span>
                        <span className="text-right">{specs[field] || 'N/A'}</span>
                      </div>
                    ))}
                  </>
                );
              })()}
            </div>
          </div>

          <div className="flex items-center gap-4 mb-6">
            <span>Số lượng:</span>
            <div className="flex items-center border rounded">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="p-2 hover:bg-gray-100"
              >
                <Minus className="w-4 h-4" />
              </button>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-16 text-center border-x"
              />
              <button
                onClick={() => setQuantity(quantity + 1)}
                className="p-2 hover:bg-gray-100"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex gap-4 mb-6">
            <Button
              onClick={handleAddToCart}
              disabled={(laptop.countInStock || 0) <= 0}
              variant="outline"
              className="flex-1"
            >
              <ShoppingCart className="w-5 h-5 mr-2" />
              Thêm vào giỏ
            </Button>
            <Button
              onClick={handleBuyNow}
              disabled={(laptop.countInStock || 0) <= 0}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white"
            >
              Mua ngay
            </Button>
          </div>

          <div className="space-y-3 border-t pt-6">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-red-600" />
              <span>Bảo hành chính hãng 12-24 tháng</span>
            </div>
            <div className="flex items-center gap-3">
              <CreditCard className="w-5 h-5 text-red-600" />
              <span>Hỗ trợ trả góp 0% lãi suất</span>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="specs" className="mb-12">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="specs">Thông số kỹ thuật</TabsTrigger>
          <TabsTrigger value="description">Mô tả sản phẩm</TabsTrigger>
          <TabsTrigger value="reviews">Đánh giá ({laptop.numReviews || 0})</TabsTrigger>
        </TabsList>
        <TabsContent value="specs" className="bg-white p-6 border rounded-lg">
          {(() => {
            const categoryName = typeof laptop.category === 'string' ? laptop.category : laptop.category?.name || 'gaming';
            const filteredSpecs = filterSpecsByCategory(laptop.specs || {}, categoryName);
            const specKeys = Object.keys(filteredSpecs);

            if (specKeys.length === 0) {
              return <p className="text-gray-500">Không có thông số kỹ thuật cho sản phẩm này.</p>;
            }

            const layout = getSpecsLayout(categoryName);
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  {layout.leftColumn.map((field) => (
                    filteredSpecs[field] && (
                      <div key={field} className="flex border-b pb-2">
                        <span className="w-32 font-medium text-gray-700">{getSpecLabel(field as any)}:</span>
                        <span className="text-gray-900">{filteredSpecs[field]}</span>
                      </div>
                    )
                  ))}
                </div>
                <div className="space-y-3">
                  {layout.rightColumn.map((field) => (
                    filteredSpecs[field] && (
                      <div key={field} className="flex border-b pb-2">
                        <span className="w-32 font-medium text-gray-700">{getSpecLabel(field as any)}:</span>
                        <span className="text-gray-900">{filteredSpecs[field]}</span>
                      </div>
                    )
                  ))}
                </div>
              </div>
            );
          })()}
        </TabsContent>
        <TabsContent value="description" className="bg-white p-6 border rounded-lg">
          <p className="mb-4">{laptop.description}</p>
          {laptop.features && laptop.features.length > 0 && (
            <>
              <h3 className="mb-3">Tính năng nổi bật:</h3>
              <ul className="space-y-2">
                {laptop.features.map((feature: string, index: number) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className="text-red-600 mt-1">✓</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </TabsContent>
        <TabsContent value="reviews" className="bg-white p-6 border rounded-lg">
          <div className="space-y-6">
            {!showReviewForm && (
              user ? (
                <Button onClick={() => setShowReviewForm(true)} className="bg-red-600 hover:bg-red-700">
                  Viết đánh giá
                </Button>
              ) : (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <LogIn className="w-5 h-5 text-blue-600" />
                    <p className="text-sm text-blue-800">Vui lòng đăng nhập để viết đánh giá sản phẩm</p>
                  </div>
                  <Link href="/login">
                    <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                      Đăng nhập
                    </Button>
                  </Link>
                </div>
              )
            )}

            {showReviewForm && (
              <div className="border p-6 rounded-lg bg-gray-50 space-y-4 mb-6">
                <h3 className="font-bold">Viết đánh giá của bạn</h3>

                <div>
                  <label className="block text-sm mb-2">Đánh giá</label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => setReviewForm({ ...reviewForm, rating: star })}
                        className="p-1"
                      >
                        <Star
                          className={`w-6 h-6 ${
                            star <= reviewForm.rating
                              ? "fill-yellow-400 text-yellow-400"
                              : "text-gray-300"
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm mb-2">Bình luận</label>
                  <textarea
                    value={reviewForm.comment}
                    onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })}
                    placeholder="Chia sẻ trải nghiệm của bạn..."
                    className="w-full border rounded-lg p-3 min-h-24"
                  />
                </div>

                <div>
                  <label className="block text-sm mb-2">Ảnh đại diện (tùy chọn)</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setReviewForm({ ...reviewForm, avatar: e.target.files?.[0] || null })}
                    className="w-full border rounded-lg p-2"
                  />
                  {reviewForm.avatar && <p className="text-sm text-gray-600 mt-2">✓ {reviewForm.avatar.name}</p>}
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleSubmitReview}
                    disabled={isSubmittingReview}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    {isSubmittingReview ? 'Đang gửi...' : 'Gửi đánh giá'}
                  </Button>
                  <Button
                    onClick={() => setShowReviewForm(false)}
                    variant="outline"
                  >
                    Hủy
                  </Button>
                </div>
              </div>
            )}

            {reviews.length > 0 ? (
              reviews.map((review) => {
                const reviewerName = review.name || review.user?.name || 'Ẩn danh';
                const reviewDate = review.createdAt ? new Date(review.createdAt).toLocaleDateString('vi-VN') : 'N/A';
                const initials = reviewerName[0] || '?';
                return (
                  <div key={review._id} className="border-b pb-6 last:border-b-0">
                    <div className="flex items-center gap-4 mb-2">
                      <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center overflow-hidden">
                        {(review as any).avatar ? (
                          <img src={(review as any).avatar} alt={reviewerName} className="w-full h-full object-cover" />
                        ) : (
                          <span>{initials}</span>
                        )}
                      </div>
                      <div>
                        <p>{reviewerName}</p>
                        <div className="flex items-center gap-2">
                          <div className="flex">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                className={`w-4 h-4 ${
                                  i < review.rating
                                    ? "fill-yellow-400 text-yellow-400"
                                    : "text-gray-300"
                                }`}
                              />
                            ))}
                          </div>
                          <span className="text-sm text-gray-500">
                            {reviewDate}
                          </span>
                        </div>
                      </div>
                    </div>
                    <p className="text-gray-700">{review.comment}</p>
                  </div>
                );
              })
            ) : (
              <p className="text-gray-500">Chưa có đánh giá nào</p>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {relatedLaptops.length > 0 && (
        <section>
          <h2 className="mb-6">Sản phẩm liên quan</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {relatedLaptops.map((product) => (
              <ProductCard key={product._id} laptop={product} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
