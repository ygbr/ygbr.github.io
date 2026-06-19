// OAuth for Mercado Livre.
//
// The refresh_token is SINGLE-USE and rotates on every refresh, and this is a
// PUBLIC repo, so the token must never be committed. Strategy:
//   - CI (GitHub Actions): read the current token from the ML_REFRESH_TOKEN
//     secret (env), refresh, then write the NEW token straight back into the
//     secret via the GitHub API (libsodium sealed box) using GH_SECRETS_PAT.
//   - Local dev: read/write a gitignored scripts/ml-sync/.tokens.json.
// We persist the rotated refresh_token BEFORE the run uses the access token,
// so a crash mid-run can't strand us with a dead (already-rotated) token.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { API, GH_API, SECRET_NAME } from "./config.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_TOKEN_FILE = path.join(HERE, ".tokens.json"); // gitignored

function req(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

function loadRefreshToken() {
  if (fs.existsSync(LOCAL_TOKEN_FILE)) {
    try {
      const t = JSON.parse(fs.readFileSync(LOCAL_TOKEN_FILE, "utf8"));
      if (t.refresh_token) return t.refresh_token;
    } catch { /* fall through */ }
  }
  if (process.env.ML_REFRESH_TOKEN) return process.env.ML_REFRESH_TOKEN;
  throw new Error(
    "No refresh token found. Set ML_REFRESH_TOKEN, or create scripts/ml-sync/.tokens.json " +
    'with {"refresh_token":"..."} (see README).'
  );
}

/** Refresh and return a fresh access token; persists the rotated refresh token. */
export async function getAccessToken() {
  const client_id = req("ML_CLIENT_ID");
  const client_secret = req("ML_CLIENT_SECRET");
  const refresh_token = loadRefreshToken();

  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id, client_secret, refresh_token }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`OAuth refresh failed (${res.status}): ${JSON.stringify(data)}`);
  }
  await persistRefreshToken(data.refresh_token);
  return data.access_token;
}

async function persistRefreshToken(newToken) {
  const pat = process.env.GH_SECRETS_PAT;
  const repo = process.env.GH_REPO; // "owner/repo"
  if (pat && repo) {
    await updateGithubSecret(repo, SECRET_NAME, newToken, pat);
    console.log(`Rotated ${SECRET_NAME} GitHub secret.`);
  } else {
    fs.writeFileSync(LOCAL_TOKEN_FILE, JSON.stringify({ refresh_token: newToken }, null, 2) + "\n");
    console.log(`Rotated refresh token saved locally to ${path.relative(process.cwd(), LOCAL_TOKEN_FILE)}.`);
  }
}

async function updateGithubSecret(repo, name, value, pat) {
  const sodium = (await import("libsodium-wrappers")).default;
  await sodium.ready;
  const h = {
    Authorization: `Bearer ${pat}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const pkRes = await fetch(`${GH_API}/repos/${repo}/actions/secrets/public-key`, { headers: h });
  if (!pkRes.ok) throw new Error(`GitHub public-key fetch failed (${pkRes.status}): ${await pkRes.text()}`);
  const pk = await pkRes.json();

  const sealed = sodium.crypto_box_seal(
    sodium.from_string(value),
    sodium.from_base64(pk.key, sodium.base64_variants.ORIGINAL)
  );
  const encrypted_value = sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL);

  const putRes = await fetch(`${GH_API}/repos/${repo}/actions/secrets/${name}`, {
    method: "PUT",
    headers: { ...h, "Content-Type": "application/json" },
    body: JSON.stringify({ encrypted_value, key_id: pk.key_id }),
  });
  if (!putRes.ok) throw new Error(`GitHub secret update failed (${putRes.status}): ${await putRes.text()}`);
}
