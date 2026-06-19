// Build Mercado Livre API request bodies from a product entry.
import crypto from "node:crypto";
import { CURRENCY } from "./config.mjs";

/** Full listing description (plain text) shared by create + update. */
export function descText(p, meta) {
  const lines = [p.description];
  if (p.specs && p.specs.length) {
    lines.push("", "Características:");
    for (const s of p.specs) lines.push(`• ${s}`);
  }
  if (p.note) lines.push("", `Observação: ${p.note}`);
  lines.push(
    "",
    `Condição: ${p.condition}`,
    `Local: ${meta.location}`,
    "Pagamento via Mercado Pago. Envio por Mercado Envios ou retirada em mãos combinada."
  );
  // ML's description endpoint rejects typographic primes/quotes as non-plain-text.
  return lines.join("\n")
    .replace(/[″“”]/g, '"')  // ″ “ ” -> "
    .replace(/[′‘’]/g, "'"); // ′ ‘ ’ -> '
}

export function descHash(p, meta) {
  return crypto.createHash("sha256").update(descText(p, meta)).digest("hex");
}

/** POST /items body to publish a new listing. */
export function buildCreateBody(p, meta, extraAttributes = []) {
  const d = p.shipping.dimensions;
  return {
    title: p.mlTitle.slice(0, 60),
    category_id: p.ml.categoryId,
    seller_custom_field: p.id, // SKU = slug → lets discover() match listings back to products
    price: p.price,
    currency_id: CURRENCY,
    available_quantity: p.quantity,
    buying_mode: "buy_it_now",
    condition: p.mlCondition,
    listing_type_id: p.listingTypeId,
    pictures: p.images.map((img) => ({ source: `${meta.siteBaseUrl}/${img}` })),
    attributes: [
      { id: "BRAND", value_name: p.brand },
      { id: "MODEL", value_name: p.model },
      ...extraAttributes,
    ],
    sale_terms: [{ id: "WARRANTY_TYPE", value_name: p.warranty }],
    shipping: {
      mode: "me2",
      local_pick_up: p.shipping.localPickUp,
      free_shipping: p.shipping.freeShipping,
      dimensions: `${d.length}x${d.width}x${d.height},${p.shipping.weightGrams}`,
    },
  };
}

/** Desired listing status from stock. */
export function desiredStatus(p) {
  return p.quantity > 0 ? "active" : "paused";
}

/** PUT /items body for price/stock/status updates on an existing listing. */
export function buildUpdateBody(p) {
  if (p.quantity > 0) {
    return { price: p.price, available_quantity: p.quantity, status: "active" };
  }
  return { status: "paused" };
}
