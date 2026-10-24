import { useReviewTranslation } from '../hooks/useReviewTranslation';

interface ReviewData {
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

interface TranslatedReviewProps {
  review: ReviewData;
}

export function TranslatedReview({ review }: TranslatedReviewProps) {
  const { translation } = useReviewTranslation(review._id || '');

  const displayComment = translation?.comment ?? review.comment;

  return (
    <p className="text-gray-700">
      {displayComment}
    </p>
  );
}
