export function findCategoryBySlug(categories: any[], slug: string): any | null {
  return categories.find(category => category.slug === slug || category._id === slug) || null;
}
