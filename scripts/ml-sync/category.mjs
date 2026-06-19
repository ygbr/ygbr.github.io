// Category prediction + required-attribute lookup (used by the create path).
// Both endpoints are public (no auth needed).
import { SITE } from "./config.mjs";

/** Predict the best MLB category for a title. Returns the top match or null. */
export async function predictCategory(client, title) {
  const res = await client.get(
    `/sites/${SITE}/domain_discovery/search?q=${encodeURIComponent(title)}`,
    { auth: false }
  );
  return Array.isArray(res) && res.length ? res[0] : null; // {category_id, category_name, domain_id, ...}
}

/** All attributes defined for a category. */
export async function getCategoryAttributes(client, categoryId) {
  return (await client.get(`/categories/${categoryId}/attributes`, { auth: false })) || [];
}

/** Required attributes (subset the create body must include). */
export function requiredAttributes(attrs) {
  return attrs.filter((a) => a.tags && (a.tags.required || a.tags.catalog_required));
}
