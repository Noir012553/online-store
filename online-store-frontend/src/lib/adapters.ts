import { z } from 'zod';
import { Laptop, ProductDescriptionImage, ProductPromotion } from './data';

const PROMOTION_SPEC_PATTERN = /(?:giảm|giam|khuyến mãi|khuyen mai|ưu đãi|uu dai|offer|discount|promotion|hssv|sinh viên|sinh vien|student)/i;
const ASSET_REFERENCE_SCHEMA = z.object({
  sourceUrl: z.string().nullable().optional(),
  storageProvider: z.literal('r2'),
  storageAccount: z.string(),
  bucket: z.string(),
  storageKey: z.string(),
  publicUrl: z.string(),
  publicId: z.string(),
  contentHash: z.string(),
  mimeType: z.string(),
  bytes: z.number(),
}).passthrough();

/**
 * Base Adapter class to handle data transformation and validation
 */
export abstract class BaseAdapter<TInput, TOutput> {
  protected abstract schema: z.ZodType<TOutput>;

  /**
   * Transforms and validates the input data
   */
  public transform(data: any): TOutput {
    try {
      // Pre-transform logic can be added here if needed (e.g., snake_case to camelCase)
      const normalizedData = this.beforeParse(data);
      
      // Validate with Zod
      const validatedData = this.schema.parse(normalizedData);

      // Post-transform logic
      return this.afterParse(validatedData);
    } catch (error) {
      if (error instanceof z.ZodError) {
      }
      // Return a safe fallback or re-throw based on requirements
      // For now, we'll return the data but log the error
      return data as unknown as TOutput;
    }
  }

  /**
   * Hook for pre-processing data before Zod validation
   */
  protected beforeParse(data: any): any {
    return data;
  }

  /**
   * Hook for post-processing data after Zod validation
   */
  protected afterParse(data: TOutput): TOutput {
    return data;
  }

  /**
   * Transforms an array of items
   */
  public transformArray(data: any[]): TOutput[] {
    if (!Array.isArray(data)) return [];
    return data.map(item => this.transform(item));
  }
}

/**
 * Zod Schema for Product (Laptop)
 * This ensures the data matches the Laptop interface and provides defaults
 */
export const LaptopSchema = z.object({
  id: z.string().or(z.number()).transform(val => String(val)),
  _id: z.string().optional(),
  name: z.string().trim().min(1),
  brand: z.string().trim().min(1),
  category: z.string().trim().min(1),
  categoryId: z.string().optional(),
  categoryName: z.string().optional(),
  price: z.number().nonnegative(),
  formattedPrice: z.string().optional(),
  baseCurrencyCode: z.string(),
  originalPrice: z.number().optional(),
  formattedOriginalPrice: z.string().optional(),
  discountPercentage: z.number().optional(),
  image: z.string().trim().min(1),
  imageAsset: ASSET_REFERENCE_SCHEMA.nullable().optional(),
  images: z.array(z.string()).default([]),
  imageAssets: z.array(ASSET_REFERENCE_SCHEMA).default([]),
  rating: z.number().default(0),
  reviews: z.number().default(0),
  inStock: z.boolean().optional(),
  countInStock: z.number().nonnegative().optional(),
  specs: z
    .record(z.string(), z.union([z.string(), z.number(), z.null(), z.undefined()]))
    .default({})
    .transform((specs) => {
      const cleanedSpecs: Record<string, string | number> = {};
      for (const key in specs) {
        const value = specs[key];
        if (value !== null && value !== undefined) {
          cleanedSpecs[key] = value;
        }
      }
      return cleanedSpecs;
    }),
  specLabels: z.record(z.string(), z.string()).default({}),
  description: z.string().optional(),
  technicalDescription: z.string().optional(),
  descriptionImages: z.array(z.object({
    url: z.string().trim().min(1),
    alt: z.string().optional(),
    asset: ASSET_REFERENCE_SCHEMA.nullable().optional(),
  })).default([]),
  promotions: z.array(z.object({
    type: z.string().trim().min(1),
    title: z.string().trim().min(1),
    giftQuantity: z.number().optional(),
    giftProductName: z.string().optional(),
    giftProductUrl: z.string().optional(),
    giftValueVND: z.number().optional(),
    scope: z.string().optional(),
    discountText: z.string().optional(),
  })).default([]),
  specDisplay: z.array(z.object({
    field: z.string(),
    label: z.string(),
    value: z.string(),
  })).optional().default([]),
  featured: z.boolean().default(false),
  deal: z.object({
    discount: z.number().optional().default(0),
    endTime: z.union([z.string(), z.date()]).optional(),
  }).optional(),
});

/**
 * Product Adapter to normalize API response into Laptop interface
 */
export class ProductAdapter extends BaseAdapter<any, Laptop> {
  protected schema = LaptopSchema;

  protected beforeParse(data: any): any {
    if (!data) return {};

    const normalized = { ...data };
    if (!normalized.id && normalized._id) {
      normalized.id = normalized._id;
    }
    if (typeof normalized.name === 'string') {
      normalized.name = normalized.name.trim();
    }

    // Handle description
    if (normalized.description !== undefined && normalized.description !== null) {
      normalized.description = String(normalized.description);
    }

    if (typeof normalized.specs === 'string') {
      try {
        const parsedSpecs = JSON.parse(normalized.specs);
        normalized.specs = parsedSpecs && typeof parsedSpecs === 'object' && !Array.isArray(parsedSpecs)
          ? parsedSpecs
          : {};
      } catch {
        normalized.specs = {};
      }
    }

    if (!normalized.specs || typeof normalized.specs !== 'object' || Array.isArray(normalized.specs)) {
      normalized.specs = {};
    }

    normalized.specs = Object.fromEntries(
      Object.entries(normalized.specs)
        .filter(([, value]) => value !== null && value !== undefined)
        .map(([key, value]) => [key, typeof value === 'string' || typeof value === 'number' ? value : String(value)])
    );

    if (normalized.technicalDescription !== undefined && normalized.technicalDescription !== null) {
      normalized.technicalDescription = String(normalized.technicalDescription);
    }

    normalized.descriptionImages = Array.isArray(normalized.descriptionImages)
      ? normalized.descriptionImages
        .map((image: any): ProductDescriptionImage | null => {
          if (typeof image === 'string') return { url: image };
          if (!image || typeof image !== 'object') return null;
          const url = String(image.url || '').trim();
          return url ? {
            url,
            alt: typeof image.alt === 'string' ? image.alt : undefined,
            asset: image.asset && typeof image.asset === 'object' ? image.asset : undefined,
          } : null;
        })
        .filter((image: ProductDescriptionImage | null): image is ProductDescriptionImage => Boolean(image))
      : [];

    normalized.promotions = Array.isArray(normalized.promotions)
      ? normalized.promotions
        .filter((promotion: any): promotion is ProductPromotion => (
          promotion && typeof promotion === 'object'
          && typeof promotion.type === 'string'
          && typeof promotion.title === 'string'
        ))
        .map((promotion: ProductPromotion) => ({
          ...promotion,
          ...(promotion.giftQuantity !== undefined && { giftQuantity: Number(promotion.giftQuantity) }),
          ...(promotion.giftValueVND !== undefined && { giftValueVND: Number(promotion.giftValueVND) }),
        }))
        .filter((promotion: ProductPromotion) => (
          (promotion.giftQuantity === undefined || Number.isFinite(promotion.giftQuantity))
          && (promotion.giftValueVND === undefined || Number.isFinite(promotion.giftValueVND))
        ))
      : [];

    // Handle specDisplay array
    if (!Array.isArray(normalized.specDisplay)) {
      normalized.specDisplay = [];
    }

    // Preserve the category returned by the backend without inventing a value.
    if (normalized.category && typeof normalized.category === 'object') {
      const categoryName = normalized.category.name
        || normalized.categoryName
        || normalized.category.key
        || normalized.category.slug
        || normalized.category._id
        || normalized.category.id;
      normalized.categoryId = normalized.category._id || normalized.category.id;
      if (typeof categoryName === 'string' && categoryName.trim()) {
        normalized.categoryName = categoryName.trim();
        normalized.category = categoryName.trim();
      } else {
        delete normalized.category;
      }
    } else if (typeof normalized.category === 'string') {
      const categoryName = normalized.category.trim();
      if (categoryName) {
        normalized.category = categoryName;
      } else {
        delete normalized.category;
      }
    } else {
      delete normalized.category;
    }

    // Map backend field names
    if (normalized.numReviews !== undefined) {
      normalized.reviews = Number(normalized.numReviews);
    } else if (Array.isArray(normalized.reviews)) {
      normalized.reviews = normalized.reviews.length;
    } else if (normalized.reviews === undefined) {
      normalized.reviews = 0;
    }

    if (normalized.countInStock !== undefined) {
      normalized.inStock = Number(normalized.countInStock) > 0;
    } else {
      delete normalized.inStock;
    }

    return normalized;
  }

  protected afterParse(data: Laptop): Laptop {
    const specDisplayByField = new Map(
      (data.specDisplay || []).map((spec) => [spec.field, spec]),
    );
    const promotionSpecEntries = Object.entries(data.specs).filter(([key, value]) => {
      const label = data.specLabels?.[key] || specDisplayByField.get(key)?.label || key;
      return PROMOTION_SPEC_PATTERN.test(`${label} ${value}`);
    });

    if (promotionSpecEntries.length > 0) {
      const promotionKeys = new Set(promotionSpecEntries.map(([key]) => key));

      data = {
        ...data,
        specs: Object.fromEntries(Object.entries(data.specs).filter(([key]) => !promotionKeys.has(key))),
        specLabels: Object.fromEntries(Object.entries(data.specLabels || {}).filter(([key]) => !promotionKeys.has(key))),
        specDisplay: (data.specDisplay || []).filter((spec) => !promotionKeys.has(spec.field)),
      };
    }

    return data;
  }
}

// Singleton instances for easy use
export const productAdapter = new ProductAdapter();
