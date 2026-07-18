export const toDateInputValue = (value?: string | Date) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getCouponCount = (items?: any[]) => (Array.isArray(items) ? items.length : 0);

export type MultiSelectOption = {
  id: string;
  label: string;
};

export type CouponFormState = {
  _id?: string;
  code: string;
  description: string;
  discountType: 'percentage' | 'fixed';
  discountValue: string;
  maxUses: string;
  minOrderAmount: string;
  currencyCode: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  applicableProducts: string[];
  applicableCategories: string[];
};

export type CouponRecord = {
  _id: string;
  code: string;
  description?: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  maxUses?: number;
  currentUses?: number;
  minOrderAmount?: number;
  currencyCode: string;
  applicableProducts?: any[];
  applicableCategories?: any[];
  startDate?: string;
  endDate?: string;
  isActive?: boolean;
  isDeleted?: boolean;
  createdAt?: string;
  updatedAt?: string;
};
