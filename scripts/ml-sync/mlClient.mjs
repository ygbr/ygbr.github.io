// Thin fetch wrapper for the Mercado Livre API:
// bearer auth, JSON, retry with exponential backoff on 429/5xx, and rich
// error surfacing (ML returns a `cause` array on validation failures).
import { API } from "./config.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class MLClient {
  constructor(accessToken) {
    this.token = accessToken;
  }

  async request(method, p, body, { auth = true } = {}) {
    const url = p.startsWith("http") ? p : API + p;
    const headers = { Accept: "application/json" };
    if (body) headers["Content-Type"] = "application/json";
    if (auth && this.token) headers.Authorization = `Bearer ${this.token}`;

    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
      } catch (e) {
        if (attempt < 5) { await sleep(Math.min(2 ** attempt * 1000, 16000)); continue; }
        throw e;
      }
      if ((res.status === 429 || res.status >= 500) && attempt < 5) {
        const ra = Number(res.headers.get("retry-after"));
        await sleep(ra ? ra * 1000 : Math.min(2 ** attempt * 1000, 16000));
        continue;
      }
      const text = await res.text();
      let data;
      try { data = text ? JSON.parse(text) : null; } catch { data = text; }
      if (!res.ok) {
        const err = new Error(`${method} ${url} -> ${res.status}`);
        err.status = res.status;
        err.body = data;
        throw err;
      }
      return data;
    }
  }

  get(p, o) { return this.request("GET", p, null, o); }
  post(p, b, o) { return this.request("POST", p, b, o); }
  put(p, b, o) { return this.request("PUT", p, b, o); }
}
