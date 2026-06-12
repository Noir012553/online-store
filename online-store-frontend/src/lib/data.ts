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

export interface Brand {
  name: string;
  logo: string;
}

export const brands: Brand[] = [
  { name: "Dell", logo: "https://upload.wikimedia.org/wikipedia/commons/4/48/Dell_Logo.svg" },
  { name: "HP", logo: "https://upload.wikimedia.org/wikipedia/commons/a/ad/HP_logo_2012.svg" },
  { name: "Lenovo", logo: "https://upload.wikimedia.org/wikipedia/commons/b/b8/Lenovo_logo_2015.svg" },
  { name: "Asus", logo: "https://upload.wikimedia.org/wikipedia/commons/b/b0/ASUS_Corporate_Logo.svg" },
  { name: "Acer", logo: "https://upload.wikimedia.org/wikipedia/commons/0/00/Acer_2011.svg" },
  { name: "MSI", logo: "https://upload.wikimedia.org/wikipedia/vi/6/6c/Msi_logo.png" },
];

/**
 * Get category name from value (string)
 */
export const getCategoryName = (categoryValue: any): string => {
  if (!categoryValue) return '';
  return String(categoryValue).trim();
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
