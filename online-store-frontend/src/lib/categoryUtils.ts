/**
 * Convert category name to slug
 * Example: "Laptop Gaming" -> "laptop-gaming"
 */
export function categoryToSlug(name: string): string {
  if (typeof name !== 'string') {
    return '';
  }

  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]/g, '');
}

/**
 * Convert slug to category name pattern
 * Example: "laptop-gaming" -> "Laptop Gaming" (for matching)
 */
export function slugToPattern(slug: string): string {
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Find category by slug
 */
export function findCategoryBySlug(categories: any[], slug: string): any | null {
  return categories.find(cat => {
    const catNameStr = String(cat.name || '');
    return (
      catNameStr.toLowerCase() === slug.replace(/-/g, ' ') ||
      categoryToSlug(catNameStr) === slug
    );
  }) || null;
}
