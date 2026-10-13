import { createRequire } from "node:module";
import { createHmac } from "node:crypto";
import { resolve, dirname } from "node:path";
const require = createRequire(import.meta.url);
// Use the exact Miniflare/runtime that this pinned Wrangler release ships.
const wranglerDir = dirname(require.resolve("wrangler/package.json"));
const { Miniflare, convertV4MiniflareOptions } = require(
  require.resolve("miniflare", { paths: [wranglerDir] }),
);
const origin = "https://social.example",
  sessionSecret = "runtime-test-secret-32-byte-minimum";
const config = {
  modules: true,
  modulesRoot: resolve("."),
  scriptPath: resolve("work/worker-build/index.js"),
  compatibilityDate: "2026-10-13",
  compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
  r2Buckets: ["DATA"],
  kvNamespaces: ["CACHE", "OAUTH_KV"],
  bindings: {
    PUBLIC_ORIGIN: origin,
    OWNER_GITHUB_ID: "42",
    META_API_VERSION: "v25.0",
    SCRAPING_ENABLED: "false",
    TIKTOK_DIRECT_POST_ENABLED: "false",
    R2_BUCKET_NAME: "test",
    ENVIRONMENT: "test",
    BROWSER_USE_ENABLED: "false",
    BROWSER_USE_MAX_COST_USD: "0.50",
    BROWSER_USE_MAX_RUNS_PER_DAY: "20",
    SESSION_SECRET: sessionSecret,
  },
  serviceBindings: {
    ASSETS: () =>
      new Response("<html>Social MCP</html>", {
        headers: { "Content-Type": "text/html" },
      }),
  },
};
const mf = new Miniflare(
  convertV4MiniflareOptions ? convertV4MiniflareOptions(config) : config,
);
function signature(payload) {
  return createHmac("sha256", sessionSecret)
    .update(payload)
    .digest("base64url");
}
async function check(path, status, options) {
  const r = await mf.dispatchFetch(origin + path, options);
  if (r.status !== status)
    throw new Error(
      `${path}: expected ${status}, got ${r.status}; ${await r.text()}`,
    );
  console.log(`${path} → ${r.status}`);
  return r;
}
try {
  await check("/", 200);
  await check("/api/workspace", 401);
  await check("/api/browser/jobs", 401);
  await check("/api/browser/read", 401, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const challenge = await check("/mcp", 401);
  if (!challenge.headers.get("www-authenticate"))
    throw new Error("Missing MCP auth challenge");
  await check("/.well-known/oauth-authorization-server", 200);
  await check("/.well-known/oauth-protected-resource/mcp", 200);
  const wrong = await mf.dispatchFetch("https://evil.example/api/workspace");
  if (wrong.status !== 400) throw new Error("Host validation failed");
  console.log("Host validation → 400");
  const bucket = await mf.getR2Bucket("DATA");
  await bucket.put(
    "accounts/test.json",
    JSON.stringify({
      id: "test",
      platform: "instagram",
      label: "Test",
      username: "test",
      platformId: "ig-test",
      status: "connected",
      expiresAt: "2099-01-01T00:00:00Z",
      scopes: [],
      encryptedToken: "never-expose-this-value",
    }),
  );
  const payload = `42.${Math.floor(Date.now() / 1000) + 600}.test-csrf`,
    cookie = `__Host-social=${payload}.${signature(payload)}`;
  const workspace = await check("/api/workspace", 200, {
    headers: { Cookie: cookie },
  });
  if ((await workspace.text()).includes("never-expose-this-value"))
    throw new Error("Encrypted token leaked");
  await check("/api/drafts", 403, {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: origin,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  await check("/api/browser/read", 403, {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: origin,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ account_id: "test", kind: "stats" }),
  });
  await check("/api/browser/accounts/test/probe", 503, {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: origin,
      "X-CSRF-Token": "test-csrf",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  await check("/api/browser/jobs", 200, { headers: { Cookie: cookie } });
  await bucket.put(
    "media/test/file.jpg",
    new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
    { httpMetadata: { contentType: "image/jpeg" } },
  );
  const expires = String(Math.floor(Date.now() / 1000) + 600),
    sig = signature(`media/test/file.jpg:${expires}`),
    url = `/media/media/test/file.jpg?expires=${expires}&sig=${sig}`;
  const media = await check(url, 206, { headers: { Range: "bytes=5-9" } });
  if (
    media.headers.get("content-range") !== "bytes 5-9/10" ||
    new Uint8Array(await media.arrayBuffer()).length !== 5
  )
    throw new Error("Range request failed");
  await check("/media/media/test/file.jpg?expires=1&sig=bad", 403);
  console.log("Runtime security smoke checks passed.");
} finally {
  await mf.dispose();
}
