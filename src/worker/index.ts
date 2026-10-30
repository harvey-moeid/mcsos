import {
  OAuthProvider,
  type OAuthResourceContext,
} from "@cloudflare/workers-oauth-provider";
import { z } from "zod";
import { ownerApi } from "./owner-api";
import { authRoute, type AuthEnv } from "./auth";
import { connectRoute, facebookConnect } from "./connections";
import { mcpFetch } from "./mcp";
import { AppError } from "./store";
import type { RuntimeEnv } from "./platforms";
import { verify } from "./crypto";
async function mediaFetch(req: Request, env: RuntimeEnv) {
  const u = new URL(req.url),
    key = decodeURIComponent(u.pathname.slice("/media/".length)),
    expires = u.searchParams.get("expires") || "",
    sig = u.searchParams.get("sig") || "";
  if (
    !key.startsWith("media/") ||
    !env.SESSION_SECRET ||
    !/^\d+$/.test(expires) ||
    !Number.isSafeInteger(Number(expires)) ||
    Number(expires) < Date.now() / 1000 ||
    Number(expires) > Date.now() / 1000 + 86460 ||
    !(await verify(`${key}:${expires}`, sig, env.SESSION_SECRET))
  )
    throw new AppError(403, "URL media tidak valid atau kedaluwarsa.");
  if (!["GET", "HEAD"].includes(req.method))
    throw new AppError(405, "Method tidak diizinkan.");
  const headers = new Headers({
    "Cache-Control": "private, max-age=300",
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
  });
  const head = await env.DATA.head(key);
  if (!head) throw new AppError(404, "Media tidak ditemukan.");
  head.writeHttpMetadata(headers);
  headers.set("ETag", head.httpEtag);
  let start = 0,
    end = head.size - 1;
  const range = req.headers.get("range");
  if (range) {
    const r = range.match(/^bytes=(\d*)-(\d*)$/);
    if (!r || (!r[1] && !r[2]))
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${head.size}` },
      });
    if (!r[1]) start = Math.max(0, head.size - Number(r[2]));
    else {
      start = Number(r[1]);
      if (r[2]) end = Math.min(end, Number(r[2]));
    }
    if (start > end || start >= head.size)
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${head.size}` },
      });
    headers.set("Content-Range", `bytes ${start}-${end}/${head.size}`);
  }
  headers.set("Content-Length", String(end - start + 1));
  if (req.method === "HEAD")
    return new Response(null, { status: range ? 206 : 200, headers });
  const o = await env.DATA.get(key, {
    range: { offset: start, length: end - start + 1 },
  });
  return new Response(o?.body, { status: range ? 206 : 200, headers });
}
const defaultHandler: ExportedHandler<RuntimeEnv> = {
  async fetch(req, env) {
    const path = new URL(req.url).pathname;
    const auth = await authRoute(req, env as AuthEnv);
    if (auth) return auth;
    const fb = await facebookConnect(req, env);
    if (fb) return fb;
    const connection = await connectRoute(req, env);
    if (connection) return connection;
    if (path.startsWith("/api/")) return ownerApi(req, env);
    if (path.startsWith("/media/")) return mediaFetch(req, env);
    if (path.startsWith("/auth/") || path.startsWith("/oauth/"))
      throw new AppError(404, "Endpoint tidak ditemukan.");
    return env.ASSETS.fetch(req);
  },
};
export default {
  async fetch(req: Request, env: RuntimeEnv, ctx: ExecutionContext) {
    try {
      if (new URL(req.url).origin !== env.PUBLIC_ORIGIN)
        throw new AppError(400, "Host tidak sesuai PUBLIC_ORIGIN.");
      const provider = new OAuthProvider<RuntimeEnv>({
        apiRoute: "/mcp",
        apiHandler: {
          fetch: (r, e, c) =>
            mcpFetch(r, e, c as OAuthResourceContext<{ ownerId: string }>),
        },
        defaultHandler,
        authorizeEndpoint: "/authorize",
        tokenEndpoint: "/oauth/token",
        clientRegistrationEndpoint: "/oauth/register",
        scopesSupported: ["mcp:read", "mcp:draft", "offline_access"],
        requiredScopes: ["mcp:read"],
        clientIdMetadataDocumentEnabled: true,
        resourceMetadata: {
          resource: env.PUBLIC_ORIGIN + "/mcp",
          authorization_servers: [env.PUBLIC_ORIGIN],
        },
        accessTokenTTL: 3600,
      });
      const result = await provider.fetch(req, env, ctx);
      const response = new Response(result.body, result);
      response.headers.set("X-Content-Type-Options", "nosniff");
      response.headers.set("Referrer-Policy", "no-referrer");
      response.headers.set("X-Frame-Options", "DENY");
      if (!new URL(req.url).pathname.startsWith("/authorize"))
        response.headers.set(
          "Content-Security-Policy",
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.cdninstagram.com https://*.fbcdn.net https://*.tiktokcdn.com https://*.tiktokcdn-us.com; media-src 'self' blob: data:; font-src 'self'; connect-src 'self' https://*.r2.cloudflarestorage.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
        );
      if (new URL(req.url).protocol === "https:")
        response.headers.set(
          "Strict-Transport-Security",
          "max-age=31536000; includeSubDomains",
        );
      if (new URL(req.url).pathname.startsWith("/api/"))
        response.headers.set("Cache-Control", "no-store");
      return response;
    } catch (e) {
      if (e instanceof z.ZodError)
        return Response.json(
          {
            error: "Input tidak valid.",
            details: e.issues.map((i) => ({
              path: i.path,
              message: i.message,
            })),
          },
          { status: 400 },
        );
      return Response.json(
        {
          error:
            e instanceof AppError
              ? e.message
              : "Permintaan gagal. Periksa konfigurasi dan log server.",
        },
        {
          status: e instanceof AppError ? e.status : 500,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }
  },
} satisfies ExportedHandler<RuntimeEnv>;
