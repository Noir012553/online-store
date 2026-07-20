/**
 * Translation Helper - Single Source of Truth for Rule #1 + Rule #2
 * Implements centralized overlay logic to prevent "khung một đằng, ruột một nẻo" state
 *
 * QUY TẮC #1: Static UI
 * - Loads from Backend API (/api/translations?lang=X&ns=Y)
 * - Returns flat dot-notation keys (e.g., "button_add_to_cart")
 * - Used with t('key') hook pattern
 *
 * QUY TẮC #2: Dynamic Data
 * - Fetches entity-specific translations from Backend (/api/translations/dynamic)
 * - Overlays translated content onto original Vietnamese data
 * - Requires lang parameter in all API calls
 * - Auto-refetches when locale changes
 */

import { translationService } from './translationService';
import { interpolateTranslation } from './translationInterpolate';

export interface DynamicTranslationRequest {
  entityId: string;
  entityType: 'product' | 'category' | 'brand' | 'coupon' | 'order' | 'banner' | string;
  originalValue: string | Record<string, any>;
}

export interface DynamicTranslationResponse {
  [entityId: string]: string;
}

export interface TranslatedEntity {
  [key: string]: any;
  name?: string;
  description?: string;
  title?: string;
  subtitle?: string;
}

class TranslationHelper {
  private staticCache: Map<string, Record<string, string>> = new Map();
  private dynamicCache: Map<string, DynamicTranslationResponse> = new Map();

  /**
   * QUY TẮC #1: Get Static UI Translation
   * Returns a single translation key or entire namespace
   *
   * @param key - Dot-notation key (e.g., "button_add_to_cart", "common.button.add")
   * @param lang - Language code (en, vi, fr, etc)
   * @param namespace - Namespace (common, admin, checkout, products)
   * @param fallback - Fallback text if translation not found
   * @returns Translated string or fallback
   */
  async getStaticTranslation(
    key: string,
    lang: string,
    namespace: string = 'common',
    fallback?: string
  ): Promise<string> {
    try {
      // Load namespace translations if not cached
      const cacheKey = `${lang}:${namespace}`;
      let translations = this.staticCache.get(cacheKey);

      if (!translations) {
        translations = await translationService.getStaticTranslations(lang, namespace);
        this.staticCache.set(cacheKey, translations);
      }

      // Support dot-notation keys
      const value = this.getNestedValue(translations, key);
      return value || fallback || key;
    } catch (error) {
      console.error(`[TranslationHelper] Error getting static translation ${key}:`, error);
      return fallback || key;
    }
  }

  /**
   * QUY TẮC #2: Overlay Dynamic Data Translation
   * Fetches and applies translations to entity content (products, categories, etc.)
   *
   * @param entity - Original entity (Vietnamese)
   * @param fields - Fields to overlay (name, description, title, etc)
   * @param lang - Target language
   * @param entityType - Type of entity
   * @returns Entity with overlaid translations
   */
  async overlayDynamicTranslation(
    entity: TranslatedEntity,
    fields: string[],
    lang: string,
    entityType: string
  ): Promise<TranslatedEntity> {
    try {
      const entityId = entity.id || entity._id;
      if (!entityId) return entity;

      // Fetch dynamic translation from backend
      const cacheKey = `${lang}:${entityType}:${entityId}`;
      let translations = this.dynamicCache.get(cacheKey);
      const params = new URLSearchParams({ lang, entityType });

      if (!translations) {
        const response = await fetch(`/api/translations/dynamic?${params.toString()}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify([
            {
              entityId,
              entityType,
              originalValue: entity.name || entity.title,
            },
          ]),
        });

        if (response.ok) {
          const data = await response.json();
          translations = (data.data || {}) as DynamicTranslationResponse;
          this.dynamicCache.set(cacheKey, translations);
        } else {
          translations = {} as DynamicTranslationResponse;
        }
      } else {
        translations = translations as DynamicTranslationResponse;
      }

      // Apply translations to specified fields
      const overlayed = { ...entity };

      fields.forEach((field) => {
        if (translations && translations[entityId]) {
          overlayed[field] = translations[entityId];
        }
      });

      return overlayed;
    } catch (error) {
      console.error(`[TranslationHelper] Error overlaying dynamic translation:`, error);
      return entity;
    }
  }

  /**
   * QUY TẮC #2: Batch Overlay - Optimize for multiple entities
   * Fetches all translations in one API call for better performance
   *
   * @param entities - Array of entities to translate
   * @param fields - Fields to overlay
   * @param lang - Target language
   * @param entityType - Type of entities
   * @returns Array of entities with overlaid translations
   */
  async batchOverlayDynamicTranslations(
    entities: TranslatedEntity[],
    fields: string[],
    lang: string,
    entityType: string
  ): Promise<TranslatedEntity[]> {
    if (!entities.length) {
      return entities;
    }

    try {
      // Prepare batch request
      const batchItems = entities.map((entity) => ({
        entityId: entity.id || entity._id,
        entityType,
        originalValue: entity.name || entity.title,
      }));

      // Fetch all translations at once
      const params = new URLSearchParams({ lang, entityType });
      const response = await fetch(`/api/translations/dynamic?${params.toString()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batchItems),
      });

      if (!response.ok) {
        return entities;
      }

      const data = await response.json();
      const translations = data.data || {};

      // Apply translations to all entities
      return entities.map((entity) => {
        const entityId = entity.id || entity._id;
        const overlayed = { ...entity };

        fields.forEach((field) => {
          if (translations[entityId]) {
            overlayed[field] = translations[entityId];
          }
        });

        return overlayed;
      });
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error(`[TranslationHelper] Error in batch overlay:`, error);
      }
      return entities;
    }
  }

  /**
   * Interpolate variables in a translated string
   * @param text - Text with {variable} placeholders
   * @param variables - Object with variable values
   * @returns Interpolated text
   */
  interpolate(
    text: string,
    variables?: Record<string, string | number>
  ): string {
    return interpolateTranslation(text, variables);
  }

  /**
   * Clear caches when language changes
   * Used in LanguageContext to force fresh fetches
   */
  clearCaches(): void {
    this.staticCache.clear();
    this.dynamicCache.clear();
  }

  /**
   * Verify consistency between UI (Rule #1) and Data (Rule #2)
   * Checks if an entity has complete translation coverage
   * @param entityId - Entity ID
   * @param lang - Language
   * @returns True if both UI and data translations exist
   */
  async verifyTranslationConsistency(entityId: string, lang: string): Promise<boolean> {
    try {
      const params = new URLSearchParams({ entityId, lang });
      const response = await fetch(`/api/translations/verify?${params.toString()}`, {
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) return false;

      const data = await response.json();
      return data.data?.isConsistent || false;
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error(`[TranslationHelper] Error verifying consistency:`, error);
      }
      return false;
    }
  }

  /**
   * Helper: Get nested value from object using dot notation
   * @private
   */
  private getNestedValue(obj: Record<string, any>, path: string): string | undefined {
    if (!obj || !path) return undefined;

    const keys = path.split('.');
    let current: any = obj;

    for (const key of keys) {
      if (current && typeof current === 'object') {
        current = current[key];
      } else {
        return undefined;
      }
    }

    return typeof current === 'string' ? current : undefined;
  }

  /**
   * Get all fallback translations for offline support
   * Useful for progressive enhancement when API is unavailable
   * @param lang - Language code
   * @returns All translations for language or empty object
   */
  async getFallbackTranslations(lang: string): Promise<Record<string, Record<string, string>>> {
    try {
      return await translationService.getFallbackTranslations(lang);
    } catch (error) {
      console.error(`[TranslationHelper] Error getting fallback translations:`, error);
      return {};
    }
  }
}

// Singleton instance
export const translationHelper = new TranslationHelper();

export default translationHelper;
