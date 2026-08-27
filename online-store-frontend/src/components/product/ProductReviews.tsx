import { Star, LogIn } from 'lucide-react';
import Link from 'next/link';
import { useLanguage } from '../../lib/i18n';
import { getIntlLocale } from '../../lib/localeUtils';
import { Button } from '../ui/button';
import { TranslatedReview } from '../TranslatedReview';
import { ImageWithFallback } from '../image/ImageWithFallback';
import { getReviewerFallbackUrl } from '../../lib/aboutMedia';

export interface ProductReview {
  _id?: string;
  name?: string;
  rating: number;
  comment: string;
  user?: {
    username?: string;
    name?: string;
  };
  avatar?: string;
  createdAt?: string;
}

export interface ProductReviewForm {
  rating: number;
  comment: string;
  avatar: File | null;
}

interface ProductReviewsProps {
  reviews: ProductReview[];
  isLoadingReviews: boolean;
  reviewsError: string | null;
  user: { name?: string } | null;
  loginHref: string;
  showReviewForm: boolean;
  reviewForm: ProductReviewForm;
  isSubmittingReview: boolean;
  onShowReviewForm: () => void;
  onReviewFormChange: (updates: Partial<ProductReviewForm>) => void;
  onReviewSubmit: () => void;
  onRetryReviews: () => void;
  onReviewCancel: () => void;
  onOpenImage: (src: string, alt: string) => void;
}

export function ProductReviews({
  reviews,
  isLoadingReviews,
  reviewsError,
  user,
  loginHref,
  showReviewForm,
  reviewForm,
  isSubmittingReview,
  onShowReviewForm,
  onReviewFormChange,
  onReviewSubmit,
  onRetryReviews,
  onReviewCancel,
  onOpenImage,
}: ProductReviewsProps) {
  const { t, locale } = useLanguage();

  return (
    <div className="space-y-6">
      {!showReviewForm && (
        user ? (
          <Button onClick={onShowReviewForm} className="bg-red-600 hover:bg-red-700">
            {t('btn_write_review', 'products')}
          </Button>
        ) : (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <LogIn className="w-5 h-5 text-blue-600" />
              <p className="text-sm text-blue-800">{t('msg_login_to_review', 'products')}</p>
            </div>
            <Link href={loginHref}>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                {t('btn_login', 'auth')}
              </Button>
            </Link>
          </div>
        )
      )}

      {showReviewForm && (
        <div className="border p-6 rounded-lg bg-white space-y-4 mb-6">
          <h3 className="font-bold">{t('btn_write_review', 'products')}</h3>

          <div>
            <label className="block text-sm mb-2">{t('label_rating', 'products')}</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => onReviewFormChange({ rating: star })}
                  aria-label={`${t('label_rating', 'products')} ${star}`}
                  className="p-1"
                >
                  <Star
                    className={`w-6 h-6 ${
                      star <= reviewForm.rating
                        ? 'fill-yellow-400 text-yellow-400'
                        : 'text-gray-300'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm mb-2">{t('label_your_review', 'products')}</label>
            <textarea
              id="review-comment"
              name="comment"
              value={reviewForm.comment}
              onChange={(event) => onReviewFormChange({ comment: event.target.value })}
              placeholder={t('placeholder_review_comment', 'products')}
              className="w-full border rounded-lg p-3 min-h-24"
              autoComplete="off"
            />
          </div>

          <div>
            <label htmlFor="review-avatar" className="block text-sm mb-2">{t('label_avatar', 'products')}</label>
            <div className="relative">
              <input
                id="review-avatar"
                name="avatar"
                type="file"
                accept="image/*"
                onChange={(event) => onReviewFormChange({ avatar: event.target.files?.[0] || null })}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="w-full border rounded-lg p-3 bg-white hover:bg-white transition-colors cursor-pointer flex items-center gap-2 text-gray-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-sm">{reviewForm.avatar ? reviewForm.avatar.name : t('placeholder_no_file', 'products')}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={onReviewSubmit}
              disabled={isSubmittingReview}
              className="bg-red-600 hover:bg-red-700"
            >
              {isSubmittingReview ? t('btn_submitting', 'products') : t('btn_submit_review', 'products')}
            </Button>
            <Button onClick={onReviewCancel} variant="outline">
              {t('btn_cancel', 'products')}
            </Button>
          </div>
        </div>
      )}

      {isLoadingReviews ? (
        <p className="text-gray-500">{t('loading_reviews', 'products', 'Loading reviews...')}</p>
      ) : reviewsError ? (
        <div className="flex items-center gap-3">
          <p className="text-red-600">{reviewsError}</p>
          <Button type="button" variant="outline" onClick={onRetryReviews}>
            {t('retry', 'common', 'Retry')}
          </Button>
        </div>
      ) : reviews.length > 0 ? (
        reviews.map((review) => {
          const reviewerName = review.name || review.user?.name || t('default_anonymous', 'products');
          const reviewerFallback = getReviewerFallbackUrl(review.avatar);
          const reviewDate = review.createdAt
            ? new Date(review.createdAt).toLocaleDateString(getIntlLocale(locale))
            : t('not_available', 'common');
          const initials = reviewerName[0] || '?';

          return (
            <div key={review._id} className="border-b pb-6 last:border-b-0">
              <div className="flex items-center gap-4 mb-2">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center overflow-hidden">
                  {review.avatar ? (
                    <button
                      type="button"
                      onClick={() => onOpenImage(reviewerFallback || review.avatar || '', reviewerName)}
                      className="h-full w-full cursor-zoom-in"
                      aria-label={reviewerName}
                    >
                      <ImageWithFallback
                        src={review.avatar}
                        fallbackSrc={reviewerFallback}
                        alt={reviewerName}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ) : (
                    <span>{initials}</span>
                  )}
                </div>
                <div>
                  <p>{reviewerName}</p>
                  <div className="flex items-center gap-2">
                    <div className="flex">
                      {Array.from({ length: 5 }).map((_, index) => (
                        <Star
                          key={index}
                          className={`w-4 h-4 ${
                            index < review.rating
                              ? 'fill-yellow-400 text-yellow-400'
                              : 'text-gray-300'
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-sm text-gray-500">{reviewDate}</span>
                  </div>
                </div>
              </div>
              <TranslatedReview review={review} />
            </div>
          );
        })
      ) : (
        <p className="text-gray-500">{t('empty_no_reviews', 'products')}</p>
      )}
    </div>
  );
}
