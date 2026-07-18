import { DEFAULT_LOCALE } from './i18n/types';

// Data types for the laptop store

export interface Laptop {
  id: string;
  _id?: string;
  name: string;
  brand: string;
  category: string;
  categoryId?: string;
  categoryName?: string;
  price: number;
  baseCurrencyCode: string;
  originalPrice?: number;
  image: string;
  images: string[];
  rating: number;
  reviews: number;
  inStock: boolean;
  specs: Record<string, string | number>;
  description?: string;
  features: string[];
  featured?: boolean;
  deal?: {
    discount: number;
    endTime?: Date | string;
  };
}

export interface Review {
  id: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  date: Date;
}

/**
 * Get translated value from object with locale keys (Rule #2: Dynamic Data Translations)
 * Handles both {vi: ..., en: ...} format and fallbacks
 */
export const getTranslatedValue = (value: any, locale: string = DEFAULT_LOCALE, fallbackToAny: boolean = true): string => {
  if (!value) return '';

  // If it's an object with locale-specific values
  if (typeof value === 'object' && value !== null) {
    // Try exact locale match first
    if (value[locale]) {
      return String(value[locale]).trim();
    }
    // Fallback to any available locale value
    if (fallbackToAny) {
      const firstValue = Object.values(value).find(v => v);
      if (firstValue) {
        return String(firstValue).trim();
      }
    }
  }

  // Fallback to string conversion
  return String(value).trim();
};

/**
 * Get the category name returned by the API from a product object.
 *
 * @param product - Product object with category info
 * @returns Category name
 */
export const getProductCategoryName = (product: any): string => {
  return getCategoryName(product?.category);
};

/**
 * Get the category name returned by the API.
 *
 * @param categoryValue - Category object or string
 * @returns The category name or an empty string when no category is present
 */
export const getCategoryName = (categoryValue: any): string => {
  if (!categoryValue) return '';

  if (typeof categoryValue === 'object') {
    return typeof categoryValue.name === 'string' ? categoryValue.name.trim() : '';
  }

  return typeof categoryValue === 'string' ? categoryValue.trim() : '';
};

/**
 * Get product name from value - supports both string and object (Rule #2: Dynamic Data Translations)
 */
export const getProductName = (productValue: any, locale?: string): string => {
  if (!productValue) return '';

  const lang = locale || DEFAULT_LOCALE;

  // If it's an object with locale-specific names
  if (typeof productValue === 'object' && productValue !== null) {
    // Handle product translations object (multilingual: { vi: "...", en: "..." })
    if (productValue[lang]) {
      const localizedValue = productValue[lang];
      // If the localized value is still an object, recursively resolve it
      if (typeof localizedValue === 'object') {
        return String(localizedValue.name || localizedValue).trim();
      }
      return String(localizedValue).trim();
    }
    // Handle product object with name property
    if (productValue.name) {
      // If name is itself a multilingual object, resolve it recursively
      if (typeof productValue.name === 'object' && productValue.name !== null) {
        // Try locale-specific first
        if (productValue.name[lang]) {
          return String(productValue.name[lang]).trim();
        }
        // Fallback to first available value in the object
        const firstValue = Object.values(productValue.name).find(v => v);
        if (firstValue) {
          return String(firstValue).trim();
        }
      }
      // Otherwise treat name as string
      const nameValue = productValue.name;
      if (typeof nameValue === 'string') {
        return nameValue.trim();
      }
    }
  }

  // Fallback to string conversion
  return String(productValue).trim();
};

export const features = [
  {
    icon: "Truck",
    titleKey: "feature_shipping_title",
    descKey: "feature_shipping_desc",
  },
  {
    icon: "Shield",
    titleKey: "feature_warranty_title",
    descKey: "feature_warranty_desc",
  },
  {
    icon: "Headphones",
    titleKey: "feature_support_title",
    descKey: "feature_support_desc",
  },
  {
    icon: "CreditCard",
    titleKey: "feature_payment_title",
    descKey: "feature_payment_desc",
  },
];

export const faqKeys = [
  { questionKey: 'faq_1_question', answerKey: 'faq_1_answer' },
  { questionKey: 'faq_2_question', answerKey: 'faq_2_answer' },
  { questionKey: 'faq_3_question', answerKey: 'faq_3_answer' },
  { questionKey: 'faq_4_question', answerKey: 'faq_4_answer' },
];
