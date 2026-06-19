# Phase C — Keep Mercado Livre in sync with `products.json`

`products.json` (repo root) is the single source of truth. This tool reconciles
it with your Mercado Livre (MLB) listings:

- **discovers** existing listings by SKU (`seller_custom_field` = product `id`),
  so listings created via the Phase B spreadsheet are picked up automatically —
  no pasting item IDs;
- **updates** price, stock and description on every change;
- **pauses** a listing when stock hits 0 and **reactivates** it when restocked;
- **creates** brand-new products via the API (gated on a confirmed category);
- writes the resulting `itemId` / `permalink` / `status` back into `products.json`.

Runs hands-off in GitHub Actions on every push that changes `products.json`.

## Files
| File | Role |
|---|---|
| `index.mjs` | orchestrator (`--dry-run` supported) |
| `auth.mjs` | OAuth refresh + rotating-token persistence |
| `bootstrap-auth.mjs` | one-time helper to get the first refresh token |
| `mlClient.mjs` | fetch wrapper (auth, retry/backoff, error surfacing) |
| `discover.mjs` | backfill item IDs by SKU |
| `category.mjs` | category prediction + required attributes |
| `itemBuilder.mjs` | build create/update bodies + description |
| `sync.mjs` | per-product reconcile |
| `state.mjs` | read/write `products.json` |

## One-time setup
1. **Create an ML app** at <https://developers.mercadolivre.com.br/devcenter> →
   note **App ID** (`client_id`) and **Secret** (`client_secret`); set a
   **Redirect URI** (e.g. `https://ygor.dev/`).
2. **Get the first refresh token** (browser logged into your seller account):
   ```bash
   cd scripts/ml-sync && npm install
   ML_CLIENT_ID=... ML_REDIRECT_URI=https://ygor.dev/ node bootstrap-auth.mjs url
   # open the printed URL, authorize, copy the ?code=TG-... from the redirect, then:
   ML_CLIENT_ID=... ML_CLIENT_SECRET=... ML_REDIRECT_URI=https://ygor.dev/ \
     node bootstrap-auth.mjs exchange TG-xxxxxxxx
   ```
   This writes `.tokens.json` (gitignored) and prints the `refresh_token`.
3. **Create a fine-grained GitHub PAT** scoped to this repo with
   **Secrets: write** and **Contents: write** (used to rotate the token secret).
4. **Add repo Actions secrets** (Settings → Secrets and variables → Actions):
   `ML_CLIENT_ID`, `ML_CLIENT_SECRET`, `ML_REFRESH_TOKEN` (from step 2),
   `GH_SECRETS_PAT` (from step 3).

## Run it
```bash
# dry run — no auth, prints predicted categories + the bodies it WOULD send
node scripts/ml-sync/index.mjs --dry-run

# real sync — locally (uses .tokens.json) or in CI (uses the secrets)
cd scripts/ml-sync && node index.mjs
```
In GitHub Actions it runs automatically on pushes that touch `products.json`,
or via **Actions → ml-sync → Run workflow**.

## Adding / changing products later
- **Change price or stock:** edit `products.json`, commit, push → the listing
  updates; stock 0 pauses it, restock reactivates it.
- **Add a new product:**
  1. add the entry to `products.json` (and a `photos/<id>.jpg`);
  2. run the sync once — it predicts and stores `ml.categoryId` (no listing yet);
  3. verify that category id, set `"categoryConfirmed": true`;
  4. fill any required attributes the run reports as `⚠ unmapped required attrs`
     (add them to the create body in `itemBuilder.mjs` if a category needs more
     than BRAND/MODEL);
  5. push again → the listing is created.
  > Or just add it to the next Phase B spreadsheet upload — the sync will discover
  > it by SKU.

## How token rotation stays safe on a public repo
The `refresh_token` is single-use and rotates on every refresh. On each run the
tool refreshes once and immediately writes the **new** token back into the
`ML_REFRESH_TOKEN` secret (libsodium sealed box, via `GH_SECRETS_PAT`) **before**
doing any catalog work. `concurrency: ml-sync` prevents two runs from rotating at
once. Nothing secret is ever committed; only public listing IDs land in
`products.json`. If a run dies after rotating but before the write-back, re-bootstrap
the token (step 2) and update the `ML_REFRESH_TOKEN` secret.

## Gotchas
- Access token lives 6 h; we always refresh at the start of a run, so it's never stale.
- `condition: used` isn't allowed in a few categories — such items error individually
  (the run continues); adjust the category or condition for those.
- `me2` needs weight + dimensions — already in `products.json`; keep them accurate.
- Picture URLs must be live (GitHub Pages deployed) before a create, or ML rejects them.
