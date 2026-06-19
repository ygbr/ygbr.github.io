// Backfill ml.itemId / permalink / status for products that were created
// outside this tool (e.g. via the bulk spreadsheet) by matching each
// listing's seller_custom_field (which we set to the product id / SKU).
export async function discover(client, userId, products) {
  const ids = [];
  let offset = 0;
  // page through the seller's items
  for (;;) {
    const page = await client.get(`/users/${userId}/items/search?limit=50&offset=${offset}`);
    const results = page.results || [];
    ids.push(...results);
    const total = page.paging && typeof page.paging.total === "number" ? page.paging.total : ids.length;
    offset += 50;
    if (results.length === 0 || ids.length >= total) break;
  }
  if (ids.length === 0) return 0;

  // multiget seller_custom_field for all items
  const bySku = new Map();
  for (let i = 0; i < ids.length; i += 20) {
    const chunk = ids.slice(i, i + 20).join(",");
    const items = await client.get(`/items?ids=${chunk}&attributes=id,seller_custom_field,status,permalink`);
    for (const entry of items) {
      const it = entry.body || entry;
      if (it && it.seller_custom_field) bySku.set(it.seller_custom_field, it);
    }
  }

  let matched = 0;
  for (const p of products) {
    if (p.ml.itemId) continue;
    const it = bySku.get(p.id);
    if (it) {
      p.ml.itemId = it.id;
      p.ml.permalink = it.permalink || null;
      p.ml.status = it.status || null;
      matched++;
    }
  }
  return matched;
}
