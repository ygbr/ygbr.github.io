// Per-product reconcile: create if new, otherwise update price/stock/status,
// keep the description in sync, and pause/reactivate based on stock.
import { predictCategory, getRequiredAttributes } from "./category.mjs";
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
    if (descChanged) await client.put(`/items/${p.ml.itemId}/description`, { plain_text: descText(p, meta) });

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

  const required = await getRequiredAttributes(client, p.ml.categoryId);
  const have = new Set(["BRAND", "MODEL"]);
  const missing = required.map((a) => a.id).filter((id) => !have.has(id));
  const body = buildCreateBody(p, meta);

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
