import { useCallback } from 'react';

export interface SelectedDetail {
  type: 'metric' | 'product' | 'coupon' | 'customer' | 'category' | 'order' | 'summary';
  title?: string;
  subtitle?: string;
  id?: string;
  item?: any;
}

export interface DetailFormState {
  type: string;
  name?: string;
  description?: string;
  price?: string;
  brand?: string;
  code?: string;
  discountValue?: string;
  discountType?: string;
  email?: string;
  phone?: string;
  label?: string;
  [key: string]: any;
}

export const useStatisticsDetail = () => {
  const getDetailTitle = useCallback((selectedDetail: SelectedDetail | null, locale: string, getProductName: Function, t: Function) => {
    if (!selectedDetail) return '';
    
    switch (selectedDetail.type) {
      case 'metric':
        return selectedDetail.title || '';
      case 'product':
        return getProductName(selectedDetail.item, locale) || selectedDetail.title || '';
      case 'coupon':
        return selectedDetail.item?.code || '';
      case 'customer':
        return selectedDetail.item?.name || selectedDetail.item?.email || t('not_updated');
      case 'order':
        return String(selectedDetail.item?._id || '').toUpperCase();
      case 'category':
        return selectedDetail.item?.label || '';
      default:
        return selectedDetail.title || '';
    }
  }, []);

  const getDetailSubtitle = useCallback((selectedDetail: SelectedDetail | null, t: Function) => {
    if (!selectedDetail) return '';
    
    switch (selectedDetail.type) {
      case 'metric':
        return selectedDetail.subtitle || '';
      case 'coupon':
        return t(selectedDetail.item?.discountType || '');
      case 'customer':
        return selectedDetail.item?.email || t('not_updated');
      case 'category':
        return t('admin_statistics_categories');
      case 'order':
        return selectedDetail.item?.customerName || selectedDetail.item?.customer?.name || t('not_updated');
      default:
        return selectedDetail.subtitle || '';
    }
  }, []);

  const canEdit = useCallback((type: string) => {
    return ['product', 'coupon', 'customer'].includes(type);
  }, []);

  const canMarkDelivered = useCallback((type: string) => {
    return type === 'order';
  }, []);

  return {
    getDetailTitle,
    getDetailSubtitle,
    canEdit,
    canMarkDelivered,
  };
};
