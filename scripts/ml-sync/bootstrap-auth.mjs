// One-time helper to obtain the FIRST Mercado Livre refresh token.
//
// Prereqs (env): ML_CLIENT_ID, ML_CLIENT_SECRET, ML_REDIRECT_URI
//   (ML_REDIRECT_URI must exactly match the redirect URI registered on your
//    ML app, e.g. https://ygor.dev/ )
//
// Step 1 — print the authorization URL, open it in the browser where you are
//          logged into your ML seller account, and authorize:
//     ML_CLIENT_ID=... ML_REDIRECT_URI=https://ygor.dev/ node bootstrap-auth.mjs url
//
// Step 2 — the browser redirects to ML_REDIRECT_URI?code=TG-xxxx. Copy that
//          code and exchange it (within a few minutes — codes expire fast):
//     ML_CLIENT_ID=... ML_CLIENT_SECRET=... ML_REDIRECT_URI=https://ygor.dev/ \
//       node bootstrap-auth.mjs exchange TG-xxxxxxxxxxxx
//
// It writes scripts/ml-sync/.tokens.json (gitignored) for local runs AND
// prints the refresh_token to store as the ML_REFRESH_TOKEN GitHub secret.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { API } from "./config.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const cmd = process.argv[2];
const need = (n) => { const v = process.env[n]; if (!v) throw new Error(`Missing env ${n}`); return v; };

if (cmd === "url") {
  const u = new URL("https://auth.mercadolivre.com.br/authorization");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", need("ML_CLIENT_ID"));
  u.searchParams.set("redirect_uri", need("ML_REDIRECT_URI"));
  console.log("\nOpen this URL, authorize, then copy the `code` from the redirect:\n");
  console.log(u.toString() + "\n");
} else if (cmd === "exchange") {
  const code = process.argv[3];
  if (!code) throw new Error("Pass the authorization code: node bootstrap-auth.mjs exchange <code>");
  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: need("ML_CLIENT_ID"),
      client_secret: need("ML_CLIENT_SECRET"),
      code,
      redirect_uri: need("ML_REDIRECT_URI"),
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Token exchange failed (${res.status}): ${JSON.stringify(data)}`);
  fs.writeFileSync(path.join(HERE, ".tokens.json"), JSON.stringify({ refresh_token: data.refresh_token }, null, 2) + "\n");
  console.log("\n✓ Wrote scripts/ml-sync/.tokens.json (for local runs).");
  console.log("\nStore this as the GitHub secret ML_REFRESH_TOKEN:\n");
  console.log(data.refresh_token + "\n");
} else {
  console.log("Usage: node bootstrap-auth.mjs <url|exchange [code]>  (see file header)");
  process.exit(1);
}
