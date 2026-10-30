import { createRequire } from "node:module";
import { createHash, createHmac } from "node:crypto";
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
    TIKTOK_CONTENT_STUDIO_ENABLED: "true",
    TIKTOK_ANALYTICS_ENABLED: "true",
    TIKTOK_SESSION_ENABLED: "false",
    TIKTOK_BROWSER_PUBLISH_ENABLED: "false",
    AI_CONTENT_ENABLED: "false",
    AI_PROVIDER: "none",
    AI_MODEL: "",
    AI_MAX_REQUESTS_PER_DAY: "20",
    AI_MAX_OUTPUT_TOKENS: "2048",
    R2_BUCKET_NAME: "test",
    ENVIRONMENT: "test",
    BROWSER_USE_ENABLED: "false",
    BROWSER_USE_MAX_COST_USD: "0.50",
    BROWSER_USE_MAX_RUNS_PER_DAY: "20",
    SESSION_SECRET: sessionSecret,
    GITHUB_CLIENT_ID: "runtime-oauth-test-client",
    GITHUB_CLIENT_SECRET: "runtime-oauth-test-secret",
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
  const r = await mf.dispatchFetch(origin + path, {
    ...options,
    redirect: "manual",
  });
  if (r.status !== status)
    throw new Error(
      `${path}: expected ${status}, got ${r.status}; ${await r.text()}`,
    );
  console.log(`${path.split("?")[0]} → ${r.status}`);
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
  const redirectUri = "https://client.example/oauth/callback";
  const registration = await check("/oauth/register", 201, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Isolated OAuth regression test",
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"],
    }),
  });
  const client = await registration.json();
  const authorizePath =
    "/authorize?" +
    new URLSearchParams({
      client_id: client.client_id,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "mcp:read",
      state: crypto.randomUUID(),
      code_challenge: "a".repeat(43),
      code_challenge_method: "S256",
      resource: origin + "/mcp",
    });
  async function consentForm() {
    const response = await check(authorizePath, 200);
    const csp = response.headers.get("content-security-policy");
    if (
      !csp.includes(
        "form-action 'self' https://github.com https://client.example",
      ) ||
      csp.includes(",")
    )
      throw new Error(
        "Consent CSP must be a single policy allowing only validated OAuth destinations",
      );
    const body = await response.text();
    const handle = body.match(/name="handle" value="([^"]+)"/)?.[1];
    if (!handle) throw new Error("Consent handle missing");
    const cookie = response.headers
      .getSetCookie()
      .map((v) => v.split(";")[0])
      .join("; ");
    return { handle, cookie };
  }
  const form = await consentForm();
  const consentOptions = {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: form.cookie,
    },
    body: new URLSearchParams({
      handle: form.handle,
      restart: authorizePath,
      decision: "allow",
    }).toString(),
  };
  const allowed = await check("/authorize", 302, consentOptions);
  const github = new URL(allowed.headers.get("location"));
  if (
    github.origin !== "https://github.com" ||
    github.searchParams.get("redirect_uri") !== origin + "/auth/github/callback"
  )
    throw new Error(
      "Consent did not redirect to GitHub with the correct callback",
    );
  const reused = await check("/authorize", 400, consentOptions);
  const recovery = await reused.text();
  if (
    !recovery.includes("Mulai ulang login") ||
    recovery.includes("Permintaan gagal.")
  )
    throw new Error(
      "A used consent must offer a safe restart instead of a server error",
    );
  const unbound = await check("/authorize", 400, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      handle: form.handle,
      decision: "allow",
      restart: "https://evil.example/authorize?x=1",
    }),
  });
  const unboundBody = await unbound.text();
  if (
    unboundBody.includes("evil.example") ||
    unboundBody.includes("Mulai ulang login")
  )
    throw new Error("Recovery must not trust an external restart URL");
  const expiredForm = await consentForm();
  // Simulate the provider's KV TTL removing an otherwise correctly bound form.
  const oauthKV = await mf.getKVNamespace("OAUTH_KV");
  await oauthKV.delete(
    "transaction:" +
      createHash("sha256").update(expiredForm.handle).digest("hex"),
  );
  const expired = await check("/authorize", 400, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: expiredForm.cookie,
    },
    body: new URLSearchParams({
      handle: expiredForm.handle,
      restart: authorizePath,
      decision: "allow",
    }),
  });
  if (!(await expired.text()).includes("Mulai ulang login"))
    throw new Error("Expired consent must offer a safe restart");
  const deniedForm = await consentForm();
  const denied = await check("/authorize", 302, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: deniedForm.cookie,
    },
    body: new URLSearchParams({ handle: deniedForm.handle, decision: "deny" }),
  });
  const callback = new URL(denied.headers.get("location"));
  if (
    callback.origin !== new URL(redirectUri).origin ||
    callback.searchParams.get("error") !== "access_denied"
  )
    throw new Error(
      "Deny must redirect to the registered client with access_denied",
    );
  await check("/auth/github/callback", 400);
  console.log(
    "OAuth consent redirects, one-use handles, cookie binding, and restart validation passed (isolated storage, no external login).",
  );
  const wrong = await mf.dispatchFetch("https://evil.example/api/workspace");
  if (wrong.status !== 400) throw new Error("Host validation failed");
  console.log("Host validation → 400");
  const bucket = await mf.getR2Bucket("DATA");
  const claimKey = "runtime-checks/dispatch.json";
  const initial = await bucket.put(
    claimKey,
    JSON.stringify({ status: "scheduled" }),
  );
  const claims = await Promise.all(
    ["publisher", "cancel"].map((winner) =>
      bucket.put(claimKey, JSON.stringify({ winner }), {
        onlyIf: { etagMatches: initial.etag },
      }),
    ),
  );
  if (claims.filter(Boolean).length !== 1)
    throw new Error("R2 conditional transition must have exactly one winner");
  await bucket.delete(claimKey);
  console.log("R2 concurrent conditional writes → one winner");
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
  const mutationHeaders = {
    Cookie: cookie,
    Origin: origin,
    "X-CSRF-Token": "test-csrf",
    "Content-Type": "application/json",
  };
  const post = (path, value, status = 200) =>
    check(path, status, {
      method: "POST",
      headers: mutationHeaders,
      body: JSON.stringify(value),
    });
  await check("/api/tiktok/config", 401);
  await check("/api/tiktok/accounts", 403, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: "{}",
  });
  const ta = await (
    await post(
      "/api/tiktok/accounts",
      { username: "runtime.owner", label: "Runtime", owned_or_managed: true },
      201,
    )
  ).json();
  await post(`/api/tiktok/accounts/${ta.id}/verify`, {
    username: ta.username,
    checked_identity: true,
  });
  await bucket.put(
    "media-meta/runtime-image.json",
    JSON.stringify({
      id: "runtime-image",
      accountId: ta.id,
      key: "media/test/file.jpg",
      filename: "test.jpg",
      mime: "image/jpeg",
      size: 10,
      width: 1080,
      height: 1920,
      verified: true,
      createdAt: new Date().toISOString(),
    }),
  );
  const td = await (
    await post(
      "/api/drafts",
      {
        account_id: ta.id,
        caption: "Persiapan runtime",
        post_type: "photo",
        media_ids: ["runtime-image"],
      },
      201,
    )
  ).json();
  await post(`/api/tiktok/drafts/${td.id}/request-approval`, {
    account_id: ta.id,
    revision: 1,
  });
  await post(`/api/tiktok/drafts/${td.id}/approve`, {
    account_id: ta.id,
    revision: 1,
    checked_content: true,
    username: ta.username,
  });
  await post(`/api/tiktok/drafts/${td.id}/schedule`, { account_id: ta.id });
  const requestId = crypto.randomUUID();
  await post(`/api/tiktok/drafts/${td.id}/handoff`, {
    account_id: ta.id,
    revision: 1,
    checked_account: true,
    request_id: requestId,
  });
  await post(
    `/api/tiktok/drafts/${td.id}/handoff`,
    {
      account_id: ta.id,
      revision: 1,
      checked_account: true,
      request_id: crypto.randomUUID(),
    },
    409,
  );
  const stored = await (await bucket.get(`drafts/${td.id}.json`)).json();
  if (stored.status !== "awaiting_verification" || stored.publication)
    throw new Error("Handoff must never claim publication");
  await post(`/api/tiktok/drafts/${td.id}/confirm`, {
    account_id: ta.id,
    revision: 1,
    outcome: "uncertain",
    checked_platform: true,
    username: ta.username,
    observed_at: new Date().toISOString(),
  });
  await post(
    `/api/tiktok/accounts/${ta.id}/analytics`,
    {
      items: [
        { observed_at: new Date().toISOString(), views: null, followers: 100 },
      ],
    },
    201,
  );
  await check(`/api/tiktok/accounts/${ta.id}/analytics`, 200, {
    headers: { Cookie: cookie },
  });
  await post(
    "/api/tiktok/ai",
    { account_id: ta.id, task: "caption", brief: "Test manual" },
    503,
  );
  await check("/media/media/test/file.jpg?expires=NaN&sig=bad", 403);
  await check("/media/media/test/file.jpg?expires=Infinity&sig=bad", 403);
  console.log("Runtime security smoke checks passed.");
} finally {
  await mf.dispose();
}
