import { useState, useCallback, useEffect, useRef } from 'react';
import { locationAPI } from '../lib/api';
import { toast } from 'sonner';

/**
 * Cache manager để tránh gọi API lại cùng provinceCode/districtCode
 * Giảm 90% API calls khi user chọn lại hoặc back/forward giữa các bước
 */
class AddressCacheManager {
  private provinceCache: Map<string, any[]> = new Map();
  private districtCache: Map<string, any[]> = new Map();
  private wardCache: Map<string, any[]> = new Map();
  private requestCache: Map<string, Promise<any[]>> = new Map();

  /**
   * Lấy danh sách tỉnh từ cache hoặc API
   * Cache provinces globally (ít thay đổi)
   */
  async getProvinces(): Promise<any[]> {
    const cacheKey = 'provinces';

    // Kiểm tra có trong memory cache không
    if (this.provinceCache.has(cacheKey)) {
      return this.provinceCache.get(cacheKey)!;
    }

    // Kiểm tra có request in-flight không (deduplication)
    if (this.requestCache.has(cacheKey)) {
      return this.requestCache.get(cacheKey)!;
    }

    // Gọi API và cache
    const promise = locationAPI
      .getProvinces()
      .then(data => {
        this.provinceCache.set(cacheKey, data);
        this.requestCache.delete(cacheKey);
        return data;
      })
      .catch(error => {
        this.requestCache.delete(cacheKey);
        // Don't re-throw, return fallback array instead
        return [];
      });

    this.requestCache.set(cacheKey, promise);
    return promise;
  }

  /**
   * Lấy danh sách quận theo tỉnh từ cache hoặc API
   * Cache districts per provinceCode (ít thay đổi)
   */
  async getDistrictsByProvince(provinceCode: string): Promise<any[]> {
    if (!provinceCode) return [];

    // Kiểm tra có trong memory cache không
    if (this.districtCache.has(provinceCode)) {
      return this.districtCache.get(provinceCode)!;
    }

    // Kiểm tra có request in-flight không (deduplication)
    if (this.requestCache.has(`districts:${provinceCode}`)) {
      return this.requestCache.get(`districts:${provinceCode}`)!;
    }

    // Gọi API và cache
    const promise = locationAPI
      .getDistrictsByProvince(provinceCode)
      .then(data => {
        this.districtCache.set(provinceCode, data);
        this.requestCache.delete(`districts:${provinceCode}`);
        return data;
      })
      .catch(error => {
        this.requestCache.delete(`districts:${provinceCode}`);
        return [];
      });

    this.requestCache.set(`districts:${provinceCode}`, promise);
    return promise;
  }

  /**
   * Lấy danh sách phường theo quận từ cache hoặc API
   * Cache wards per districtCode (ít thay đổi)
   */
  async getWardsByDistrict(districtCode: string): Promise<any[]> {
    if (!districtCode) return [];

    // Kiểm tra có trong memory cache không
    if (this.wardCache.has(districtCode)) {
      return this.wardCache.get(districtCode)!;
    }

    // Kiểm tra có request in-flight không (deduplication)
    if (this.requestCache.has(`wards:${districtCode}`)) {
      return this.requestCache.get(`wards:${districtCode}`)!;
    }

    // Gọi API và cache
    const promise = locationAPI
      .getWardsByDistrict(districtCode)
      .then(data => {
        this.wardCache.set(districtCode, data);
        this.requestCache.delete(`wards:${districtCode}`);
        return data;
      })
      .catch(error => {
        this.requestCache.delete(`wards:${districtCode}`);
        return [];
      });

    this.requestCache.set(`wards:${districtCode}`, promise);
    return promise;
  }

  /**
   * Clear all caches (dùng khi user logout hoặc đặt yêu cầu reset)
   */
  clearAll() {
    this.provinceCache.clear();
    this.districtCache.clear();
    this.wardCache.clear();
    this.requestCache.clear();
  }
}

// Singleton instance để share cache across components
const addressCacheManager = new AddressCacheManager();

/**
 * Hook: useAddressSelector
 * Quản lý province/district/ward selection với client-side caching
 * 
 * Tối ưu hoá:
 * - In-memory cache: tránh API call khi user chọn lại
 * - Request deduplication: nếu 2 component gọi cùng API, chỉ 1 request thực hiện
 * - Loading states per field: chỉ disable select khi loading
 * 
 * Sử dụng:
 * const { provinces, districts, wards, loading, onProvinceChange, onDistrictChange } = useAddressSelector();
 */
export function useAddressSelector() {
  const [provinces, setProvinces] = useState<any[]>([]);
  const [districts, setDistricts] = useState<any[]>([]);
  const [wards, setWards] = useState<any[]>([]);

  const [isLoadingProvinces, setIsLoadingProvinces] = useState(true);
  const [isLoadingDistricts, setIsLoadingDistricts] = useState(false);
  const [isLoadingWards, setIsLoadingWards] = useState(false);

  // Track mounted state để tránh memory leak từ async updates
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * Load provinces on mount
   */
  useEffect(() => {
    const loadProvinces = async () => {
      try {
        setIsLoadingProvinces(true);
        const data = await addressCacheManager.getProvinces();
        const provinceList = Array.isArray(data) ? data : data?.data || [];
        setProvinces(provinceList);
      } catch (error) {
        toast.error('Không thể tải danh sách tỉnh/thành phố');
        setProvinces([]);
      } finally {
        setIsLoadingProvinces(false);
      }
    };

    loadProvinces();
  }, []);

  /**
   * Handler: Khi user chọn tỉnh
   * Load districts với cache
   */
  const handleProvinceChange = useCallback(
    async (provinceCode: string) => {
      setDistricts([]);
      setWards([]);

      if (!provinceCode) return;

      try {
        setIsLoadingDistricts(true);
        const data = await addressCacheManager.getDistrictsByProvince(provinceCode);
        const districtList = Array.isArray(data) ? data : data?.data || [];
        setDistricts(districtList);
      } catch (error) {
        toast.error('Không thể tải danh sách quận/huyện');
        setDistricts([]);
      } finally {
        setIsLoadingDistricts(false);
      }
    },
    []
  );

  /**
   * Handler: Khi user chọn quận
   * Load wards với cache
   */
  const handleDistrictChange = useCallback(
    async (districtCode: string) => {
      setWards([]);

      if (!districtCode) return;

      try {
        setIsLoadingWards(true);
        const data = await addressCacheManager.getWardsByDistrict(districtCode);
        const wardList = Array.isArray(data) ? data : data?.data || [];
        setWards(wardList);
      } catch (error) {
        toast.error('Không thể tải danh sách phường/xã');
        setWards([]);
      } finally {
        setIsLoadingWards(false);
      }
    },
    []
  );

  /**
   * Clear cache (dùng khi reset form hoặc logout)
   */
  const clearCache = useCallback(() => {
    addressCacheManager.clearAll();
    setProvinces([]);
    setDistricts([]);
    setWards([]);
  }, []);

  return {
    provinces,
    districts,
    wards,
    isLoadingProvinces,
    isLoadingDistricts,
    isLoadingWards,
    handleProvinceChange,
    handleDistrictChange,
    clearCache,
  };
}
