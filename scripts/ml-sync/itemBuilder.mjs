// Build Mercado Livre API request bodies from a product entry.
import crypto from "node:crypto";
import { CURRENCY } from "./config.mjs";

/** Full listing description (plain text) shared by create + update. */
export function descText(p, meta) {
  const lines = [p.description];
  if (p.specs && p.specs.length) {
    lines.push("", "ESPECIFICAÇÕES");
    for (const s of p.specs) lines.push(`- ${s}`);
  }
  if (p.note) lines.push("", `OBSERVAÇÃO: ${p.note}`);
  lines.push(
    "",
    "ESTADO E CONDIÇÃO",
    `- ${p.condition}`,
    "- Produto usado, testado e em pleno funcionamento.",
    "- Item da foto é exatamente o que você recebe.",
    "",
    "ENVIO E RETIRADA",
    "- Enviamos para todo o Brasil por Mercado Envios.",
    `- Retirada em mãos combinada em ${meta.location}.`,
    "",
    "PAGAMENTO",
    "- Mercado Pago: cartão (parcelado), Pix ou boleto, com a segurança do Mercado Livre.",
    "",
    "Ficou com alguma dúvida? Envie sua pergunta que respondo rápido."
  );
  // ML's description endpoint rejects typographic primes/quotes as non-plain-text.
  return lines.join("\n")
    .replace(/[″“”]/g, '"')  // ″ “ ” -> "
    .replace(/[′‘’]/g, "'"); // ′ ‘ ’ -> '
}

export function descHash(p, meta) {
  return crypto.createHash("sha256").update(descText(p, meta)).digest("hex");
}

/** Listing pictures: curated ml.pictureSources (full URLs) if set, else the site images. */
export function buildPictures(p, meta) {
  if (Array.isArray(p.ml.pictureSources) && p.ml.pictureSources.length) {
    return p.ml.pictureSources.map((source) => ({ source }));
  }
  return p.images.map((img) => ({ source: `${meta.siteBaseUrl}/${img}` }));
}

/** Attribute list for create/update: BRAND + MODEL plus synthesized/per-product extras. */
export function buildAttributes(p, extras = []) {
  return [
    { id: "BRAND", value_name: p.brand },
    { id: "MODEL", value_name: p.model },
    ...extras,
  ];
}

/** Hash of the editable listing metadata (title + attributes + curated pictures) for change detection. */
export function metaHash(p, extras = []) {
  const payload = JSON.stringify({
    title: p.mlTitle.slice(0, 60),
    attributes: buildAttributes(p, extras),
    pictures: p.ml.pictureSources || null, // only curated photos are pushed on update
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
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
    pictures: buildPictures(p, meta),
    attributes: buildAttributes(p, extraAttributes),
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
