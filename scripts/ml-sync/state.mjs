// Read/write the catalog source of truth (products.json at repo root).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PRODUCTS_PATH = path.join(ROOT, "products.json");

export function read() {
  return JSON.parse(fs.readFileSync(PRODUCTS_PATH, "utf8"));
}

export function write(doc) {
  fs.writeFileSync(PRODUCTS_PATH, JSON.stringify(doc, null, 2) + "\n");
}
