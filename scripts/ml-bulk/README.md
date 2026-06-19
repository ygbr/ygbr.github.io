# Phase B — Publish the initial 24 listings via "Anunciar em massa"

This is the fastest way to get every product live. ML's bulk template guides
the per-category required attributes, which is the tedious part to do by API.

## Before you start
The product photos must be **publicly reachable** because ML downloads them by
URL at publish time. After this branch is merged and GitHub Pages has deployed,
verify a couple of them return HTTP 200:

```
https://ygor.dev/photos/airpods-max-azul-ceu.jpg
https://ygor.dev/photos/macbook-pro-14-m2-max.jpg
```

## Generate the data
```
node scripts/build-bulk-csv.mjs
```
Produces **`mercadolivre-bulk.csv`** (repo root) — 24 rows grouped by category,
with columns already mapped to ML's fields:

| Column | Maps to | Notes |
|---|---|---|
| SKU | `seller_custom_field` | **Keep this** — the sync (Phase C) finds each listing by it |
| Título | Title | already trimmed to ≤ 60 chars |
| Condição | Condition | `Usado` |
| Preço (BRL) / Estoque | Price / Quantity | |
| Marca / Modelo | BRAND / MODEL attributes | |
| Tipo de anúncio | Listing type | `Grátis` (high-value items use `Clássico`) |
| Forma de envio | Shipping | `Mercado Envios` |
| Frete grátis / Retirada em mãos | shipping flags | `Não` / `Sim` (buyer pays, pickup allowed) |
| Peso (g) / Comprimento·Largura·Altura | parcel weight + dims | **estimates — confirm them** |
| Fotos (URLs) | pictures | full `https://ygor.dev/photos/…` URLs |
| Descrição | Description | full copy + specs + condition + location |

## Upload steps (you, in the browser logged into your ML account)
1. Open the bulk hub: <https://www.mercadolivre.com.br/anunciar-em-massa/hub?from=list>
   (or **Vender → Produtos → Ir para o Anunciador em Massa**).
2. **Download the official template** for your account (it has one tab per category).
3. Open `mercadolivre-bulk.csv` in Excel/Google Sheets (it's UTF-8 with a BOM, so
   accents render correctly). Copy each product's values into the matching
   **category tab** of the official template.
4. Fill any extra **required attributes** ML flags per category (e.g. color, screen
   size). Leave **SKU** = the value from the CSV — Phase C relies on it.
5. Set, for every row: **Tipo de anúncio = Grátis**, **Envio = Mercado Envios**,
   **Frete grátis = Não**, **Retirada em mãos = Sim**.
6. Upload the filled template and confirm.

## Notes
- **High-value items** (MacBook, Mac mini, iPad Air, Apple Watch Ultra, DJI Mavic):
  ML often **won't allow `Grátis`** for these — use **`Clássico`** (already set in the
  CSV's "Tipo de anúncio"). Classic only charges commission when the item sells.
- **Weights/dimensions are estimates.** Confirm them in `products.json`
  (`shipping.weightGrams`, `shipping.dimensions`) and re-run the generator before
  uploading; accurate values mean accurate buyer shipping quotes.
- Photos are currently **illustrative** (stock images). ML rewards real photos and
  may flag obvious catalog images — replace `photos/<id>.jpg` with real shots when
  you can (same filenames, nothing else changes).
- **Mercado Pago** is already linked at the account level — no per-listing setting.

After the listings are live, move on to **Phase C** (`scripts/ml-sync/README.md`)
so price/stock stay in sync automatically.
