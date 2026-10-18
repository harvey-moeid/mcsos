import { digest, seal } from "./crypto";
import { cookie, requireOwner } from "./auth";
import { AppError, Store } from "./store";
import { boundedJson, type RuntimeEnv } from "./platforms";
import type { Account, Platform, Tokens } from "../shared/model";
const scopes = {
  instagram: [
    "instagram_business_basic",
    "instagram_business_content_publish",
    "instagram_business_manage_comments",
    "instagram_business_manage_messages",
    "instagram_business_manage_insights",
  ],
  tiktok: ["user.info.basic"],
};
export async function connectRoute(
  req: Request,
  env: RuntimeEnv,
): Promise<Response | null> {
  const u = new URL(req.url),
    match = u.pathname.match(/^\/auth\/(instagram|tiktok)\/(start|callback)$/);
  if (!match) return null;
  const platform = match[1] as Platform;
  const owner = await requireOwner(req, env);
  const store = new Store(env.DATA),
    client =
      platform === "instagram" ? env.META_CLIENT_ID : env.TIKTOK_CLIENT_KEY,
    secret =
      platform === "instagram"
        ? env.META_CLIENT_SECRET
        : env.TIKTOK_CLIENT_SECRET;
  if (!client || !secret || !env.TOKEN_ENCRYPTION_KEY)
    throw new AppError(503, `Kredensial ${platform} belum dikonfigurasi.`);
  const redirect = env.PUBLIC_ORIGIN + `/auth/${platform}/callback`;
  if (match[2] === "start") {
    const state = crypto.randomUUID();
    await store.put(`connect-state/${await digest(state)}.json`, {
      owner: owner.id,
      expiresAt: Date.now() + 600000,
      platform,
    });
    const url = new URL(
      platform === "instagram"
        ? "https://www.instagram.com/oauth/authorize"
        : "https://www.tiktok.com/v2/auth/authorize/",
    );
    url.search = new URLSearchParams({
      [platform === "instagram" ? "client_id" : "client_key"]: client,
      redirect_uri: redirect,
      response_type: "code",
      scope: scopes[platform].join(","),
      state,
      ...(platform === "instagram"
        ? { enable_fb_login: "0", force_authentication: "1" }
        : {}),
    }).toString();
    return Response.redirect(url.toString(), 302);
  }
  const state = u.searchParams.get("state"),
    code = u.searchParams.get("code");
  if (!state || !code)
    throw new AppError(400, "OAuth dibatalkan atau kode tidak tersedia.");
  const key = `connect-state/${await digest(state)}.json`,
    record = await store.require<{
      owner: string;
      expiresAt: number;
      platform: Platform;
    }>(key);
  if (
    record.value.owner !== owner.id ||
    record.value.platform !== platform ||
    record.value.expiresAt < Date.now()
  )
    throw new AppError(403, "OAuth state tidak valid.");
  if (!(await store.create(key + ".used", {})))
    throw new AppError(403, "Kode telah digunakan.");
  const body = new URLSearchParams({
    [platform === "instagram" ? "client_id" : "client_key"]: client,
    client_secret: secret,
    grant_type: "authorization_code",
    redirect_uri: redirect,
    code,
  });
  const response = await fetch(
    platform === "instagram"
      ? "https://api.instagram.com/oauth/access_token"
      : "https://open.tiktokapis.com/v2/oauth/token/",
    { method: "POST", body, signal: AbortSignal.timeout(20000) },
  );
  let r = await boundedJson(response);
  if (!response.ok || r.error || !r.access_token)
    throw new AppError(502, "Pertukaran token gagal. Periksa izin aplikasi.");
  if (platform === "instagram") {
    const long = await fetch(
      `https://graph.instagram.com/access_token?${new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: secret, access_token: String(r.access_token) })}`,
      { signal: AbortSignal.timeout(15000) },
    );
    const x = await boundedJson(long);
    if (!long.ok || !x.access_token)
      throw new AppError(
        502,
        "Token jangka panjang Instagram gagal diperoleh.",
      );
    r = { ...r, ...x };
  }
  const platformId = String(platform === "instagram" ? r.user_id : r.open_id);
  const profileResponse = await fetch(
    platform === "instagram"
      ? `https://graph.instagram.com/${env.META_API_VERSION}/me?fields=user_id,username`
      : "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url",
    {
      headers: { Authorization: `Bearer ${r.access_token}` },
      signal: AbortSignal.timeout(15000),
    },
  );
  const profile = await boundedJson(profileResponse);
  if (!profileResponse.ok)
    throw new AppError(502, "Profil akun tidak dapat dibaca.");
  const tt = profile.data as { user?: { display_name?: string; avatar_url?: string } } | undefined;
  const username = String(
    platform === "instagram"
      ? profile.username
      : tt?.user?.display_name || platformId,
  );
  const tokens: Tokens = {
    accessToken: String(r.access_token),
    refreshToken: r.refresh_token ? String(r.refresh_token) : undefined,
    expiresAt: new Date(
      Date.now() + Number(r.expires_in || 3600) * 1000,
    ).toISOString(),
    refreshExpiresAt: r.refresh_expires_in
      ? new Date(Date.now() + Number(r.refresh_expires_in) * 1000).toISOString()
      : undefined,
  };
  const accounts = await store.accounts(),
    existing = accounts.find(
      (a) => a.platform === platform && a.platformId === platformId,
    );
  if (!existing && accounts.filter((a) => a.platform === platform).length >= 10)
    throw new AppError(409, "Maksimal 10 akun per platform.");
  const a: Account = {
    id: existing?.id || crypto.randomUUID(),
    platform,
    platformId,
    label: existing?.label || username,
    username,
    avatar: platform === "tiktok" ? tt?.user?.avatar_url : existing?.avatar,
    status: "connected",
    expiresAt: tokens.expiresAt,
    scopes: r.scope ? String(r.scope).split(",") : scopes[platform],
    encryptedToken: await seal(tokens, env.TOKEN_ENCRYPTION_KEY),
  };
  await store.put(`accounts/${a.id}.json`, a);
  await env.DATA.delete(key);
  await store.log("account.connect", "success", { accountId: a.id });
  return Response.redirect(env.PUBLIC_ORIGIN + "/?view=accounts", 302);
}

/** Optional Facebook Login path for official hashtag and Business Discovery access. */
export async function facebookConnect(
  req: Request,
  env: RuntimeEnv,
): Promise<Response | null> {
  const u = new URL(req.url);
  if (!/^\/auth\/instagram-facebook\/(start|callback)$/.test(u.pathname))
    return null;
  const owner = await requireOwner(req, env),
    store = new Store(env.DATA);
  const client = env.META_FB_CLIENT_ID || env.META_CLIENT_ID,
    secret = env.META_FB_CLIENT_SECRET || env.META_CLIENT_SECRET;
  if (!client || !secret || !env.TOKEN_ENCRYPTION_KEY)
    throw new AppError(503, "Facebook Login belum dikonfigurasi.");
  const redirect = env.PUBLIC_ORIGIN + "/auth/instagram-facebook/callback",
    base = `https://graph.facebook.com/${env.META_API_VERSION}/`;
  const requested = [
    "instagram_basic",
    "instagram_content_publish",
    "instagram_manage_insights",
    "instagram_manage_comments",
    "instagram_manage_messages",
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_metadata",
  ];
  if (u.pathname.endsWith("/start")) {
    const state = crypto.randomUUID();
    await store.put(`connect-state/${await digest(state)}.json`, {
      owner: owner.id,
      expiresAt: Date.now() + 600000,
      platform: "instagram-facebook",
    });
    const url = new URL(
      `https://www.facebook.com/${env.META_API_VERSION}/dialog/oauth`,
    );
    url.search = new URLSearchParams({
      client_id: client,
      redirect_uri: redirect,
      response_type: "code",
      scope: requested.join(","),
      state,
    }).toString();
    return Response.redirect(url.toString(), 302);
  }
  const state = u.searchParams.get("state"),
    code = u.searchParams.get("code");
  if (!state || !code) throw new AppError(400, "OAuth dibatalkan.");
  const key = `connect-state/${await digest(state)}.json`,
    record = await store.require<{
      owner: string;
      expiresAt: number;
      platform: string;
    }>(key);
  if (
    record.value.owner !== owner.id ||
    record.value.expiresAt < Date.now() ||
    record.value.platform !== "instagram-facebook"
  )
    throw new AppError(403, "OAuth state tidak valid.");
  if (!(await store.create(key + ".used", {})))
    throw new AppError(403, "Kode telah digunakan.");
  const response = await fetch(
    base +
      "oauth/access_token?" +
      new URLSearchParams({
        client_id: client,
        client_secret: secret,
        redirect_uri: redirect,
        code,
      }),
    { signal: AbortSignal.timeout(15000) },
  );
  const short = await boundedJson(response);
  if (!response.ok || !short.access_token)
    throw new AppError(502, "Token Facebook gagal diperoleh.");
  const longResponse = await fetch(
    base +
      "oauth/access_token?" +
      new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: client,
        client_secret: secret,
        fb_exchange_token: String(short.access_token),
      }),
    { signal: AbortSignal.timeout(15000) },
  );
  const token = await boundedJson(longResponse);
  if (!longResponse.ok || !token.access_token)
    throw new AppError(502, "Token Facebook jangka panjang gagal diperoleh.");
  const pagesResponse = await fetch(
    base +
      "me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&limit=25",
    {
      headers: { Authorization: `Bearer ${token.access_token}` },
      signal: AbortSignal.timeout(15000),
    },
  );
  const pages = await boundedJson(pagesResponse);
  if (!pagesResponse.ok || !Array.isArray(pages.data))
    throw new AppError(502, "Facebook Pages tidak dapat dibaca.");
  const eligible = pages.data.filter(
    (p: Record<string, unknown>) =>
      p.instagram_business_account && p.access_token,
  ) as {
    id: string;
    name: string;
    access_token: string;
    instagram_business_account: { id: string; username?: string };
  }[];
  if (!eligible.length)
    throw new AppError(
      409,
      "Tidak ada Page yang terhubung ke akun Instagram profesional.",
    );
  // Store only encrypted candidates. The owner selects which Pages to connect in the dashboard.
  const pendingId = crypto.randomUUID(),
    expiresAt = new Date(
      Date.now() + Number(token.expires_in || 5184000) * 1000,
    ).toISOString();
  await store.put(`connect-pending/${pendingId}.json`, {
    owner: owner.id,
    expiresAt: Date.now() + 600000,
    encrypted: await seal(
      { pages: eligible, expiresAt, userToken: String(token.access_token) },
      env.TOKEN_ENCRYPTION_KEY,
    ),
  });
  await env.DATA.delete(key);
  return Response.redirect(
    env.PUBLIC_ORIGIN + "/?view=accounts&connect=" + pendingId,
    302,
  );
}
