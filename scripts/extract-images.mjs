// scripts/extract-images.mjs
//
// One-time / reproducible generator for the data-driven catalog.
//
// Reads the legacy inline `const PRODUCTS = [...]` array out of shop.html,
// decodes each base64 image to photos/<slug>.jpg, and emits products.json
// (the new single source of truth) enriched with the fields Mercado Livre
// needs (brand, model, weight, dimensions, listing type, warranty, ml state).
//
// Re-runnable: regenerates photos/ and products.json from shop.html. Once
// shop.html no longer carries the inline array (after the Phase A refactor),
// keep running this from a saved copy of the array if you ever need to
// regenerate images — normally you won't, products.json becomes the source.
//
// Usage:  node scripts/extract-images.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HTML = path.join(ROOT, "shop.html");
const PHOTOS_DIR = path.join(ROOT, "photos");
const OUT_JSON = path.join(ROOT, "products.json");

/**
 * Curated Mercado Livre metadata, indexed to match the order of the PRODUCTS
 * array in shop.html (24 items). Weights/dimensions are packed-parcel
 * ESTIMATES — confirm before shipping. Titles are kept <= 60 chars (ML limit)
 * via `mlTitle` where the display name is too long; otherwise the name is used.
 * listingTypeId: "free" by default; high-value items use "gold_special"
 * (Clássico) because ML commonly disallows free listings above a price
 * threshold and free listings get little exposure.
 */
const META = [
  // 1
  { slug: "airpods-max-azul-ceu", brand: "Apple", model: "AirPods Max",
    weightGrams: 800, dimensions: { length: 26, width: 22, height: 14 } },
  // 2
  { slug: "macbook-pro-14-m2-max", brand: "Apple", model: "MacBook Pro 14 M2 Max",
    mlTitle: 'MacBook Pro 14" M2 Max 32GB 1TB Liquid Retina XDR',
    listingTypeId: "gold_special",
    weightGrams: 2600, dimensions: { length: 40, width: 30, height: 10 } },
  // 3
  { slug: "mac-mini-m2-pro", brand: "Apple", model: "Mac mini M2 Pro",
    listingTypeId: "gold_special",
    weightGrams: 1600, dimensions: { length: 25, width: 25, height: 12 } },
  // 4
  { slug: "magic-keyboard-numerico-preto", brand: "Apple", model: "Magic Keyboard com teclado numérico",
    weightGrams: 600, dimensions: { length: 50, width: 18, height: 6 } },
  // 5
  { slug: "magic-mouse-2-preto", brand: "Apple", model: "Magic Mouse 2",
    weightGrams: 300, dimensions: { length: 18, width: 12, height: 6 } },
  // 6
  { slug: "magic-trackpad-preto", brand: "Apple", model: "Magic Trackpad",
    weightGrams: 350, dimensions: { length: 20, width: 16, height: 6 } },
  // 7
  { slug: "magic-keyboard-branco", brand: "Apple", model: "Magic Keyboard",
    weightGrams: 450, dimensions: { length: 45, width: 16, height: 6 } },
  // 8
  { slug: "mikrotik-hex-s-rb760igs", brand: "MikroTik", model: "hEX S (RB760iGS)",
    weightGrams: 400, dimensions: { length: 18, width: 14, height: 6 } },
  // 9
  { slug: "raspberry-pi-4-8gb", brand: "Raspberry Pi", model: "Pi 4 Model B 8GB",
    weightGrams: 200, dimensions: { length: 15, width: 12, height: 6 } },
  // 10
  { slug: "raspberry-pi-4-4gb", brand: "Raspberry Pi", model: "Pi 4 Model B 4GB",
    weightGrams: 200, dimensions: { length: 15, width: 12, height: 6 } },
  // 11
  { slug: "ipad-air-5-256gb-cellular-azul", brand: "Apple", model: "iPad Air 5ª geração",
    mlTitle: "iPad Air 5 256GB Wi-Fi + Cellular Azul Chip M1",
    listingTypeId: "gold_special",
    weightGrams: 800, dimensions: { length: 30, width: 22, height: 5 } },
  // 12
  { slug: "apple-watch-ultra-49mm", brand: "Apple", model: "Apple Watch Ultra",
    mlTitle: "Apple Watch Ultra 49mm Titânio GPS + Cellular",
    listingTypeId: "gold_special",
    weightGrams: 400, dimensions: { length: 16, width: 12, height: 9 } },
  // 13
  { slug: "dji-goggles-re", brand: "DJI", model: "Goggles RE (Racing Edition)",
    weightGrams: 1300, dimensions: { length: 30, width: 22, height: 18 } },
  // 14
  { slug: "dji-mavic-2-zoom-fly-more", brand: "DJI", model: "Mavic 2 Zoom",
    mlTitle: "Drone DJI Mavic 2 Zoom Fly More Combo 4K",
    listingTypeId: "gold_special",
    weightGrams: 3200, dimensions: { length: 40, width: 30, height: 20 } },
  // 15
  { slug: "motorola-one-hyper-128gb-azul", brand: "Motorola", model: "One Hyper",
    weightGrams: 450, dimensions: { length: 18, width: 12, height: 8 } },
  // 16
  { slug: "nvidia-jetson-nano-4gb", brand: "NVIDIA", model: "Jetson Nano Developer Kit",
    weightGrams: 350, dimensions: { length: 18, width: 14, height: 8 } },
  // 17
  { slug: "ubiquiti-unifi-g3-flex", brand: "Ubiquiti", model: "UniFi Protect G3 Flex (UVC-G3-Flex)",
    mlTitle: "Câmera Ubiquiti UniFi G3 Flex UVC-G3-Flex 1080p PoE",
    weightGrams: 300, dimensions: { length: 14, width: 10, height: 10 } },
  // 18
  { slug: "ubiquiti-cloud-key-gen2-plus", brand: "Ubiquiti", model: "UniFi Cloud Key Gen2 Plus (UCK-G2-Plus)",
    mlTitle: "Ubiquiti UniFi Cloud Key Gen2 Plus UCK-G2-Plus 1TB",
    weightGrams: 700, dimensions: { length: 18, width: 14, height: 10 } },
  // 19
  { slug: "starlink-standard-actuated-kit", brand: "Starlink", model: "Standard Actuated (antena v2)",
    mlTitle: "Starlink Kit Antena V2 Standard Actuated Motorizada",
    weightGrams: 5500, dimensions: { length: 50, width: 40, height: 20 } },
  // 20
  { slug: "apple-airport-extreme-a1521", brand: "Apple", model: "AirPort Extreme A1521 (6ª geração)",
    mlTitle: "Apple AirPort Extreme A1521 6ª Geração 802.11ac",
    weightGrams: 1000, dimensions: { length: 20, width: 12, height: 12 } },
  // 21
  { slug: "ubiquiti-unifi-ap-ac-hd", brand: "Ubiquiti", model: "UniFi AP AC HD (UAP-AC-HD)",
    mlTitle: "Ubiquiti UniFi AP AC HD UAP-AC-HD Wi-Fi 5 Wave 2",
    weightGrams: 700, dimensions: { length: 25, width: 25, height: 6 } },
  // 22
  { slug: "ubiquiti-unifi-ap-ac-shd", brand: "Ubiquiti", model: "UniFi AP AC SHD (UAP-AC-SHD)",
    mlTitle: "Ubiquiti UniFi AP AC SHD UAP-AC-SHD Wave 2 Segurança",
    weightGrams: 700, dimensions: { length: 25, width: 25, height: 6 } },
  // 23
  { slug: "ubiquiti-unifi-nanohd", brand: "Ubiquiti", model: "UniFi nanoHD (UAP-nanoHD)",
    mlTitle: "Ubiquiti UniFi nanoHD UAP-nanoHD Wi-Fi 5 Wave 2",
    weightGrams: 350, dimensions: { length: 18, width: 18, height: 5 } },
  // 24
  { slug: "ubiquiti-unifi-us-16-150w", brand: "Ubiquiti", model: "UniFi Switch US-16-150W",
    mlTitle: "Switch Ubiquiti UniFi US-16-150W 16 Portas PoE+ Gigabit",
    weightGrams: 2600, dimensions: { length: 45, width: 25, height: 10 } },
];

/** Extract the `const PRODUCTS = [...]` array literal from shop.html via
 * string-aware bracket counting, then evaluate it (data-only JS literal). */
function extractProducts(html) {
  const marker = "const PRODUCTS = [";
  const mi = html.indexOf(marker);
  if (mi === -1) throw new Error("PRODUCTS array not found in shop.html");
  const start = html.indexOf("[", mi);
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "[") depth++;
    else if (c === "]") { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) throw new Error("Could not find end of PRODUCTS array");
  const literal = html.slice(start, end + 1);
  // Data-only literal (strings/numbers/arrays/null) — safe to evaluate.
  return new Function(`return (${literal});`)();
}

function main() {
  const html = fs.readFileSync(HTML, "utf8");
  const products = extractProducts(html);
  if (products.length !== META.length) {
    throw new Error(`Product count ${products.length} != META count ${META.length}`);
  }
  fs.mkdirSync(PHOTOS_DIR, { recursive: true });

  const out = products.map((p, i) => {
    const m = META[i];
    // decode base64 data-URI -> photos/<slug>.jpg
    const match = /^data:image\/jpeg;base64,(.+)$/s.exec(p.image || "");
    if (!match) throw new Error(`Item ${i} (${m.slug}) has no jpeg data-URI`);
    fs.writeFileSync(path.join(PHOTOS_DIR, `${m.slug}.jpg`), Buffer.from(match[1], "base64"));

    return {
      id: m.slug,
      category: p.category,
      name: p.name,
      images: [`photos/${m.slug}.jpg`],
      icon: p.icon,
      price: p.price,
      condition: p.condition,
      quantity: p.quantity,
      description: p.description,
      specs: p.specs || [],
      note: p.note ?? null,

      brand: m.brand,
      model: m.model,
      mlTitle: m.mlTitle || p.name,
      mlCondition: "used",
      listingTypeId: m.listingTypeId || "free",
      warranty: "Sem garantia",
      shipping: {
        weightGrams: m.weightGrams,
        dimensions: m.dimensions,
        mode: "me2",
        localPickUp: true,
        freeShipping: false,
      },
      ml: {
        categoryId: null,
        categoryConfirmed: false,
        itemId: null,
        permalink: null,
        status: null,
        syncedPrice: null,
        syncedQuantity: null,
        syncedStatus: null,
        syncedDescHash: null,
        lastSyncedAt: null,
      },
    };
  });

  const doc = {
    meta: {
      siteBaseUrl: "https://ygor.dev",
      currency: "BRL",
      site: "MLB",
      location: "Ribeirão Preto · SP",
    },
    products: out,
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(doc, null, 2) + "\n");

  const bytes = out.reduce((a, _, i) =>
    a + fs.statSync(path.join(PHOTOS_DIR, `${META[i].slug}.jpg`)).size, 0);
  console.log(`Wrote ${out.length} photos (${(bytes / 1024 / 1024).toFixed(2)} MB) to photos/`);
  console.log(`Wrote products.json (${out.length} products)`);
}

main();
