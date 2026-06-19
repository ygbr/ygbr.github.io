// scripts/build-bulk-csv.mjs
//
// Phase B — generate mercadolivre-bulk.csv from products.json for the
// "Anunciar em massa" (bulk advertiser) flow.
//
// You still download the official template from your logged-in ML account
// (Vender > Produtos > Anunciador em Massa), but this CSV carries every field
// already mapped to ML's columns so you can paste them into the matching
// category tab. Rows are grouped by category. See scripts/ml-bulk/README.md.
//
// Usage:  node scripts/build-bulk-csv.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(fs.readFileSync(path.join(ROOT, "products.json"), "utf8"));
const BASE = data.meta.siteBaseUrl;

const LISTING_LABEL = { free: "Grátis", gold_special: "Clássico", gold_pro: "Premium" };

const HEADERS = [
  "SKU", "Categoria (site)", "Título", "Condição", "Preço (BRL)", "Estoque",
  "Marca", "Modelo", "Tipo de anúncio", "Forma de envio", "Frete grátis",
  "Retirada em mãos", "Peso (g)", "Comprimento (cm)", "Largura (cm)", "Altura (cm)",
  "Fotos (URLs)", "Descrição",
];

/** Build the full ML listing description from product copy + specs + meta. */
function buildDescription(p) {
  const lines = [p.description];
  if (p.specs && p.specs.length) {
    lines.push("", "Características:");
    for (const s of p.specs) lines.push(`• ${s}`);
  }
  if (p.note) lines.push("", `Observação: ${p.note}`);
  lines.push(
    "",
    `Condição: ${p.condition}`,
    `Local: ${data.meta.location}`,
    "Pagamento via Mercado Pago. Envio por Mercado Envios ou retirada em mãos combinada.",
  );
  return lines.join("\n");
}

/** RFC-4180 CSV cell escaping. */
function cell(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function row(p) {
  const d = p.shipping.dimensions;
  return [
    p.id,
    p.category,
    p.mlTitle,
    "Usado",
    p.price,
    p.quantity,
    p.brand,
    p.model,
    LISTING_LABEL[p.listingTypeId] || p.listingTypeId,
    "Mercado Envios",
    p.shipping.freeShipping ? "Sim" : "Não",
    p.shipping.localPickUp ? "Sim" : "Não",
    p.shipping.weightGrams,
    d.length, d.width, d.height,
    p.images.map((img) => `${BASE}/${img}`).join(" | "),
    buildDescription(p),
  ].map(cell).join(",");
}

// group by category, stable order
const byCat = [...data.products].sort((a, b) =>
  a.category.localeCompare(b.category) || a.mlTitle.localeCompare(b.mlTitle));

const csv = [HEADERS.map(cell).join(","), ...byCat.map(row)].join("\n") + "\n";
const out = path.join(ROOT, "mercadolivre-bulk.csv");
fs.writeFileSync(out, "﻿" + csv); // BOM so Excel reads UTF-8 (acentos) correctly
console.log(`Wrote mercadolivre-bulk.csv — ${data.products.length} rows across ${new Set(data.products.map((p) => p.category)).size} categories`);
