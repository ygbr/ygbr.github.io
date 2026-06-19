// Orchestrator for the Mercado Livre sync.
//
//   node index.mjs            # real sync (needs ML_* env / .tokens.json)
//   node index.mjs --dry-run  # no auth, no writes: predicts categories and
//                             # prints the request bodies it WOULD send
//
// Per-product errors are collected (one bad item never aborts the rest).
import { getAccessToken } from "./auth.mjs";
import { MLClient } from "./mlClient.mjs";
import { read, write } from "./state.mjs";
import { discover } from "./discover.mjs";
import { syncProduct } from "./sync.mjs";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const doc = read();
  let client;

  if (dryRun) {
    client = new MLClient(null); // only unauthenticated category prediction is used
    console.log("DRY RUN — no authentication, no changes to Mercado Livre.\n");
  } else {
    const token = await getAccessToken();
    client = new MLClient(token);
    const me = await client.get("/users/me");
    const matched = await discover(client, me.id, doc.products);
    console.log(`Discovered ${matched} existing listing(s) by SKU.\n`);
  }

  const summary = {};
  for (const p of doc.products) {
    try {
      const r = await syncProduct(client, p, doc.meta, { dryRun });
      summary[r.action] = (summary[r.action] || 0) + 1;
      const id = r.itemId ? ` ${r.itemId}` : "";
      const cat = r.categoryId ? ` [${r.categoryId}]` : "";
      const reason = r.reason ? ` — ${r.reason}` : "";
      const warn = r.missingRequiredAttrs && r.missingRequiredAttrs.length
        ? ` ⚠ unmapped required attrs: ${r.missingRequiredAttrs.join(", ")}` : "";
      console.log(`[${r.action}] ${p.id}${id}${cat}${reason}${warn}`);
    } catch (e) {
      summary.error = (summary.error || 0) + 1;
      const detail = e.body ? " :: " + JSON.stringify(e.body) : "";
      console.error(`[error] ${p.id}: ${e.message}${detail}`);
    }
  }

  if (!dryRun) write(doc);
  console.log("\nSummary:", JSON.stringify(summary));
  if (summary.error) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
