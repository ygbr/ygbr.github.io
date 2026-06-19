// Per-product reconcile: create if new, otherwise update price/stock/status,
// keep the description in sync, and pause/reactivate based on stock.
import { predictCategory, getCategoryAttributes, requiredAttributes } from "./category.mjs";
import {
  buildCreateBody, buildUpdateBody, descText, descHash, desiredStatus,
} from "./itemBuilder.mjs";

export async function syncProduct(client, p, meta, { dryRun }) {
  // Cache a category prediction for visibility / the create path.
  if (!p.ml.categoryId) {
    const pred = await predictCategory(client, p.mlTitle);
    if (pred) p.ml.categoryId = pred.category_id;
  }

  // ---- existing listing: update ----
  if (p.ml.itemId) {
    const status = desiredStatus(p);
    const dHash = descHash(p, meta);
    const fieldsChanged =
      p.ml.syncedPrice !== p.price ||
      p.ml.syncedQuantity !== p.quantity ||
      p.ml.syncedStatus !== status;
    const descChanged = p.ml.syncedDescHash !== dHash;

    if (!fieldsChanged && !descChanged) {
      return { action: "noop", itemId: p.ml.itemId };
    }
    if (dryRun) {
      return { action: "update", itemId: p.ml.itemId, body: buildUpdateBody(p), descChanged };
    }
    if (fieldsChanged) await client.put(`/items/${p.ml.itemId}`, buildUpdateBody(p));
    if (descChanged) {
      // PUT updates an existing description; items created without one need POST.
      const dbody = { plain_text: descText(p, meta) };
      try { await client.put(`/items/${p.ml.itemId}/description`, dbody); }
      catch { await client.post(`/items/${p.ml.itemId}/description`, dbody); }
    }

    p.ml.status = status;
    p.ml.syncedPrice = p.price;
    p.ml.syncedQuantity = p.quantity;
    p.ml.syncedStatus = status;
    p.ml.syncedDescHash = dHash;
    p.ml.lastSyncedAt = new Date().toISOString();
    return { action: "update", itemId: p.ml.itemId };
  }

  // ---- new listing: create (gated on a confirmed category) ----
  if (!p.ml.categoryId) {
    return { action: "error", reason: "no category prediction available" };
  }
  if (!p.ml.categoryConfirmed) {
    return {
      action: "skip-create",
      categoryId: p.ml.categoryId,
      reason: "verify ml.categoryId then set ml.categoryConfirmed=true to publish",
    };
  }

  const allAttrs = await getCategoryAttributes(client, p.ml.categoryId);
  const required = requiredAttributes(allAttrs);
  const defines = (id) => allAttrs.some((a) => a.id === id);

  // Attributes we synthesize beyond BRAND/MODEL.
  const extras = [];
  const have = new Set(["BRAND", "MODEL"]);

  // Send the real item condition so condition-gated rules evaluate correctly
  // (e.g. GTIN is `used_hidden`, so it's not required once ML knows it's used).
  const condId =
    p.mlCondition === "used" ? "2230581" :
    p.mlCondition === "new" ? "2230284" : null;
  if (condId && defines("ITEM_CONDITION")) {
    extras.push({ id: "ITEM_CONDITION", value_id: condId });
    have.add("ITEM_CONDITION");
  }

  // Used gear has no barcode: declare the empty-GTIN reason rather than send a
  // fake code (ML rejects free text and validates GTIN as a real 8-14 digit code).
  if (defines("GTIN")) {
    have.add("GTIN");
    if (defines("EMPTY_GTIN_REASON")) {
      extras.push({ id: "EMPTY_GTIN_REASON", value_id: "17055160" }); // "não tem código cadastrado"
      have.add("EMPTY_GTIN_REASON");
    }
  }

  // Per-product category-specific attributes from products.json (ml.attributes).
  if (Array.isArray(p.ml.attributes)) {
    for (const a of p.ml.attributes) { extras.push(a); have.add(a.id); }
  }

  const missing = required.map((a) => a.id).filter((id) => !have.has(id));
  const body = buildCreateBody(p, meta, extras);

  if (dryRun) return { action: "create", body, missingRequiredAttrs: missing };

  const created = await client.post(`/items`, body);
  await client.post(`/items/${created.id}/description`, { plain_text: descText(p, meta) });

  p.ml.itemId = created.id;
  p.ml.permalink = created.permalink || null;
  p.ml.status = created.status || null;
  p.ml.syncedPrice = p.price;
  p.ml.syncedQuantity = p.quantity;
  p.ml.syncedStatus = desiredStatus(p);
  p.ml.syncedDescHash = descHash(p, meta);
  p.ml.lastSyncedAt = new Date().toISOString();
  return { action: "create", itemId: created.id, missingRequiredAttrs: missing };
}
