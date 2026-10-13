import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { digest, escapeHtml, sign, verify } from "./crypto";
import { AppError, Store } from "./store";
import { boundedJson, type RuntimeEnv } from "./platforms";
export type AuthEnv = RuntimeEnv & { OAUTH_PROVIDER: OAuthHelpers };
export function cookie(req: Request, name: string) {
  return (
    req.headers
      .get("cookie")
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(name + "="))
      ?.slice(name.length + 1) || ""
  );
}
function cookieName(env: RuntimeEnv) {
  return new URL(env.PUBLIC_ORIGIN).protocol === "https:"
    ? "__Host-social"
    : "social_local";
}
function sessionCookie(env: RuntimeEnv, token: string, maxAge = 86400) {
  return `${cookieName(env)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${new URL(env.PUBLIC_ORIGIN).protocol === "https:" ? "; Secure" : ""}`;
}
export async function ownerSession(req: Request, env: RuntimeEnv) {
  if (!env.SESSION_SECRET || env.OWNER_GITHUB_ID === "UNCONFIGURED")
    return null;
  const token = cookie(req, cookieName(env));
  const [id, expires, csrf, sig] = token.split(".");
  if (
    !id ||
    id !== env.OWNER_GITHUB_ID ||
    Number(expires) <= Date.now() / 1000 ||
    !(await verify(`${id}.${expires}.${csrf}`, sig || "", env.SESSION_SECRET))
  )
    return null;
  return { id, csrf };
}
export async function requireOwner(req: Request, env: RuntimeEnv) {
  const owner = await ownerSession(req, env);
  if (!owner) throw new AppError(401, "Login sebagai pemilik terlebih dahulu.");
  if (!["GET", "HEAD"].includes(req.method)) {
    if (
      req.headers.get("origin") !== env.PUBLIC_ORIGIN ||
      req.headers.get("x-csrf-token") !== owner.csrf
    )
      throw new AppError(403, "Permintaan CSRF ditolak.");
  }
  return owner;
}
async function githubStart(env: RuntimeEnv, state: string) {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !env.SESSION_SECRET)
    throw new AppError(503, "GitHub OAuth belum dikonfigurasi.");
  const u = new URL("https://github.com/login/oauth/authorize");
  u.search = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: env.PUBLIC_ORIGIN + "/auth/github/callback",
    state,
    scope: "read:user",
  }).toString();
  return u.toString();
}
async function githubUser(req: Request, env: RuntimeEnv) {
  const code = new URL(req.url).searchParams.get("code");
  if (!code) throw new AppError(400, "OAuth tidak memberikan kode.");
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID!,
      client_secret: env.GITHUB_CLIENT_SECRET!,
      code,
      redirect_uri: env.PUBLIC_ORIGIN + "/auth/github/callback",
    }),
    signal: AbortSignal.timeout(15000),
  });
  const token = await boundedJson(response);
  if (!response.ok || !token.access_token)
    throw new AppError(401, "Login GitHub gagal.");
  const r = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "social-mcp",
    },
    signal: AbortSignal.timeout(15000),
  });
  const u = await boundedJson(r);
  if (!r.ok || String(u.id) !== env.OWNER_GITHUB_ID)
    throw new AppError(403, "Identitas ini bukan pemilik workspace.");
  return String(u.id);
}
function html(body: string, headers: HeadersInit = {}) {
  return new Response(
    `<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Social MCP · Otorisasi</title><body style="font:16px system-ui;max-width:600px;margin:10vh auto;padding:24px;background:#111716;color:#eef3ef">${body}</body></html>`,
    {
      headers: {
        "Content-Type": "text/html;charset=UTF-8",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
        "Cache-Control": "no-store",
        "X-Frame-Options": "DENY",
        ...Object.fromEntries(new Headers(headers)),
      },
    },
  );
}
export async function authRoute(
  req: Request,
  env: AuthEnv,
): Promise<Response | null> {
  const u = new URL(req.url),
    path = u.pathname;
  if (path === "/auth/logout" && req.method === "POST") {
    await requireOwner(req, env);
    return Response.json(
      { ok: true },
      { headers: { "Set-Cookie": sessionCookie(env, "", 0) } },
    );
  }
  if (path === "/auth/login" && req.method === "GET") {
    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !env.SESSION_SECRET)
      throw new AppError(503, "GitHub OAuth belum dikonfigurasi.");
    const state = crypto.randomUUID(),
      binding = crypto.randomUUID();
    await new Store(env.DATA).put(`auth-state/${await digest(state)}.json`, {
      binding: await digest(binding),
      expiresAt: Date.now() + 600000,
    });
    const headers = new Headers({
      Location: await githubStart(env, "dash_" + state),
      "Set-Cookie": `social_oauth=${binding}; HttpOnly; Path=/; SameSite=Lax; Max-Age=600${u.protocol === "https:" ? "; Secure" : ""}`,
    });
    return new Response(null, { status: 302, headers });
  }
  if (path === "/authorize") {
    if (req.method === "GET") {
      const original = await env.OAUTH_PROVIDER.parseAuthRequest(req);
      const client = await env.OAUTH_PROVIDER.lookupClient(original.clientId);
      const consent = await env.OAUTH_PROVIDER.beginConsent(original);
      return html(
        `<h1>Hubungkan klien AI</h1><p>Klien: <strong>${escapeHtml(client?.clientName || original.clientId)}</strong></p><p>Tujuan: ${escapeHtml(original.redirectUri)}</p><p>Akses akun, analitik, media, dan draft. Klien tidak dapat menyetujui atau mempublikasikan konten.</p><form method="POST" action="/authorize"><input type="hidden" name="handle" value="${escapeHtml(consent.handle)}"><button name="decision" value="allow">Izinkan dan login GitHub</button> <button name="decision" value="deny">Tolak</button></form>`,
        consent.headers,
      );
    }
    if (req.method === "POST") {
      const f = await req.formData();
      if (f.get("decision") === "deny") {
        const denied = await env.OAUTH_PROVIDER.denyConsent(
          req,
          String(f.get("handle")),
        );
        return new Response(null, { status: 302, headers: denied.headers });
      }
      const approved = await env.OAUTH_PROVIDER.approveConsent(
        req,
        String(f.get("handle")),
        { scope: ["mcp:read", "mcp:draft", "offline_access"] },
      );
      const upstream = await env.OAUTH_PROVIDER.beginUpstream(
        approved.request,
        { headers: approved.headers },
      );
      upstream.headers.set("Location", await githubStart(env, upstream.state));
      return new Response(null, { status: 302, headers: upstream.headers });
    }
  }
  if (path === "/auth/github/callback" && req.method === "GET") {
    const state = u.searchParams.get("state") || "";
    if (state.startsWith("dash_")) {
      const key = `auth-state/${await digest(state.slice(5))}.json`,
        store = new Store(env.DATA),
        record = await store.require<{ binding: string; expiresAt: number }>(
          key,
        );
      if (
        record.value.expiresAt < Date.now() ||
        record.value.binding !== (await digest(cookie(req, "social_oauth")))
      )
        throw new AppError(403, "OAuth state tidak valid.");
      if (!(await store.create(key + ".used", {})))
        throw new AppError(403, "OAuth state telah digunakan.");
      const id = await githubUser(req, env),
        csrf = crypto.randomUUID(),
        expires = Math.floor(Date.now() / 1000) + 86400,
        payload = `${id}.${expires}.${csrf}`;
      await env.DATA.delete(key);
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/",
          "Set-Cookie": sessionCookie(
            env,
            `${payload}.${await sign(payload, env.SESSION_SECRET!)}`,
          ),
        },
      });
    }
    const upstream = await env.OAUTH_PROVIDER.finishUpstream(req);
    const id = await githubUser(req, env);
    const done = await env.OAUTH_PROVIDER.completeAuthorization({
      request: upstream.request,
      userId: id,
      metadata: { label: "Social MCP owner" },
      scope: upstream.request.scope,
      props: { ownerId: id },
    });
    upstream.headers.set("Location", done.redirectTo);
    return new Response(null, { status: 302, headers: upstream.headers });
  }
  return null;
}
