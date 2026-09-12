export function findCategoryBySlug(categories: any[], slug: string): any | null {
  const normalizedSlug = {
    'laptop-office': 'office-laptop',
    'laptop-van-phong': 'office-laptop',
    'laptop-gaming': 'gaming-laptop',
  }[slug] || slug;

  return categories.find(
    (category) => category.slug === normalizedSlug
      || category._id === normalizedSlug
      || category._id === slug,
  ) || null;
}
