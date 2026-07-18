import { z } from 'zod';
import { Laptop } from './data';

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
  name: z.string().default('product_unnamed'),
  brand: z.string().default('brand_generic'),
  category: z.string().default('product_category_laptop'),
  categoryId: z.string().optional(),
  categoryName: z.string().optional(),
  price: z.number().default(0),
  baseCurrencyCode: z.string(),
  originalPrice: z.number().optional(),
  image: z.string().default('/images/placeholder.jpg'),
  images: z.array(z.string()).default([]),
  rating: z.number().default(0),
  reviews: z.number().default(0),
  inStock: z.boolean().default(true),
  countInStock: z.number().default(0),
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
  description: z.string().optional(),
  features: z.array(z.string()).default([]),
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
    // Handle name
    if (normalized.name) {
      normalized.name = String(normalized.name) || "product_unnamed";
    } else {
      normalized.name = "product_unnamed";
    }

    // Handle description
    if (normalized.description) {
      normalized.description = String(normalized.description);
    }

    // Handle features array
    if (!Array.isArray(normalized.features)) {
      normalized.features = [];
    }

    // Handle specDisplay array
    if (!Array.isArray(normalized.specDisplay)) {
      normalized.specDisplay = [];
    }

    // Handle category
    if (normalized.category && typeof normalized.category === 'object') {
      const catName = normalized.category.name;
      const finalName = typeof catName === 'string' && catName.trim()
        ? catName
        : 'product_category_laptop';
      normalized.categoryId = normalized.category._id || normalized.category.id;
      normalized.categoryName = finalName;
      normalized.category = finalName;
    } else if (normalized.category) {
      const categoryName = String(normalized.category).trim();
      normalized.category = categoryName || 'product_category_laptop';
    } else {
      normalized.category = 'product_category_laptop';
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
    } else if (normalized.inStock === undefined) {
      normalized.inStock = true;
    }

    if (typeof normalized.specs !== 'object' || normalized.specs === null) {
      normalized.specs = {};
    }

    return normalized;
  }

  protected afterParse(data: Laptop): Laptop {
    // Example: Format image URLs if they are relative
    if (data.image && !data.image.startsWith('http') && !data.image.startsWith('/')) {
      // You could prepend a base URL here
    }
    
    return data;
  }
}

// Singleton instances for easy use
export const productAdapter = new ProductAdapter();
