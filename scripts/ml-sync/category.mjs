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

/** Required attributes for a category (ids the create body must include). */
export async function getRequiredAttributes(client, categoryId) {
  const attrs = await client.get(`/categories/${categoryId}/attributes`, { auth: false });
  return (attrs || []).filter((a) => a.tags && (a.tags.required || a.tags.catalog_required));
}
