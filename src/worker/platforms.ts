import type {
  Account,
  Draft,
  Media,
  Post,
  Stats,
  Tokens,
} from "../shared/model";
import { open, seal } from "./crypto";
import { AppError, Store } from "./store";
export type Secrets = {
  BROWSER_USE_API_KEY: string;
  TOKEN_ENCRYPTION_KEY: string;
  SESSION_SECRET: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  META_CLIENT_ID: string;
  META_FB_CLIENT_ID: string;
  META_FB_CLIENT_SECRET: string;
  META_CLIENT_SECRET: string;
  TIKTOK_CLIENT_KEY: string;
  TIKTOK_CLIENT_SECRET: string;
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
};
export type RuntimeEnv = Env & Partial<Secrets>;
type Json = Record<string, unknown>;
export class PlatformError extends AppError {
  constructor(
    message: string,
    public retryable = false,
    public ambiguous = false,
    public authFailed = false,
  ) {
    super(502, message, "platform_error");
  }
}
export async function boundedJson(response: Response): Promise<Json> {
  const size = Number(response.headers.get("content-length") || 0);
  if (size > 2_000_000)
    throw new PlatformError("Respons platform terlalu besar.");
  if (!response.body) throw new PlatformError("Respons platform kosong.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 2_000_000) {
      await reader.cancel();
      throw new PlatformError("Respons platform terlalu besar.");
    }
    chunks.push(value);
  }
  const all = new Uint8Array(length);
  let off = 0;
  for (const c of chunks) {
    all.set(c, off);
    off += c.length;
  }
  try {
    const data: unknown = JSON.parse(new TextDecoder().decode(all));
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error("Expected a JSON object");
    return data as Json;
  } catch {
    throw new PlatformError("Respons platform tidak valid.");
  }
}
export function sanitizePlatformData(
  v: unknown,
  tokens: string[] = [],
): unknown {
  if (Array.isArray(v)) return v.map((x) => sanitizePlatformData(x, tokens));
  if (v && typeof v === "object") {
    const clean: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      if (
        /^(access_token|refresh_token|client_secret|appsecret_proof|userAccessToken)$/i.test(
          k,
        )
      )
        continue;
      if ((k === "next" || k === "previous") && typeof x === "string") continue;
      clean[k] = sanitizePlatformData(x, tokens);
    }
    return clean;
  }
  if (typeof v === "string") {
    let clean = v;
    for (const token of tokens.filter((t) => t.length > 6))
      clean = clean.replaceAll(token, "[redacted]");
    return clean;
  }
  return v;
}
function obj(v: unknown): Json {
  return v && typeof v === "object" ? (v as Json) : {};
}
function array(v: unknown): Json[] {
  return Array.isArray(v) ? v.map(obj) : [];
}
function responseId(value: unknown): string {
  // IDs are opaque: message IDs can contain punctuation or base64 padding.
  if (typeof value === "string" && value.trim().length > 0) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0)
    return String(value);
  throw new PlatformError(
    "Platform tidak memberikan ID aksi yang valid; hasil belum diketahui.",
    false,
    true,
  );
}
export class Platforms {
  readonly store: Store;
  constructor(readonly env: RuntimeEnv) {
    this.store = new Store(env.DATA);
  }
  async tokens(a: Account) {
    if (!a.encryptedToken || !this.env.TOKEN_ENCRYPTION_KEY)
      throw new AppError(409, "Akun perlu dihubungkan ulang.");
    return open<Tokens>(a.encryptedToken, this.env.TOKEN_ENCRYPTION_KEY);
  }
  async rateLimit(a: Account) {
    const minute = Math.floor(Date.now() / 60000),
      key = `limits/${a.id}/${minute}.json`;
    for (let i = 0; i < 5; i++) {
      const o = await this.store.get<{ count: number; blockedUntil?: number }>(
        key,
      );
      if (o?.value.blockedUntil && o.value.blockedUntil > Date.now())
        throw new AppError(
          429,
          "Platform sedang membatasi permintaan. Coba beberapa menit lagi.",
        );
      if ((o?.value.count || 0) >= 20)
        throw new AppError(
          429,
          "Batas konservatif 20 permintaan/menit tercapai.",
        );
      const value = { count: (o?.value.count || 0) + 1 };
      try {
        if (o) await this.store.put(key, value, o.etag);
        else if (!(await this.store.create(key, value))) continue;
        return;
      } catch (e) {
        if (!(e instanceof AppError && e.status === 409)) throw e;
      }
    }
    throw new AppError(429, "Permintaan bersamaan terlalu banyak.");
  }
  async call(
    a: Account,
    path: string,
    body?: Json,
    method?: string,
  ): Promise<Json> {
    if (a.platform === "tiktok" && (body !== undefined || (method && method !== "GET") || path !== "user/info/?fields=open_id,display_name,avatar_url"))
      throw new AppError(403, "TikTok hanya untuk melihat profil.");
    await this.rateLimit(a);
    const t = await this.tokens(a);
    if (Date.parse(t.expiresAt) <= Date.now())
      throw new AppError(409, "Token kedaluwarsa. Hubungkan ulang akun.");
    const base =
      a.platform === "instagram"
        ? `https://${a.loginMode === "facebook" ? "graph.facebook.com" : "graph.instagram.com"}/${this.env.META_API_VERSION}/`
        : "https://open.tiktokapis.com/v2/";
    const readOnly = (method || (!body ? "GET" : "POST")) === "GET";
    let response: Response;
    try {
      response = await fetch(base + path, {
        method: method || (body ? "POST" : "GET"),
        headers: {
          Authorization: `Bearer ${t.accessToken}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new PlatformError(
        "Koneksi platform terputus; hasil aksi belum diketahui.",
        true,
        !readOnly,
      );
    }
    let data: Json;
    try {
      data = await boundedJson(response);
    } catch {
      // Fetch resolving only confirms receipt of headers. A broken, empty or
      // oversized body after a mutation cannot prove the action did not happen.
      throw new PlatformError(
        readOnly
          ? "Respons platform tidak dapat dibaca. Coba kembali nanti."
          : "Respons platform tidak dapat dibaca; hasil aksi belum diketahui.",
        readOnly,
        !readOnly,
      );
    }
    const error = obj(data.error),
      code = String(error.code ?? "ok");
    if (
      !response.ok ||
      (a.platform === "tiktok" && code !== "ok") ||
      (a.platform === "instagram" && data.error)
    ) {
      if (response.status === 429) {
        const key = `limits/${a.id}/${Math.floor(Date.now() / 60000)}.json`;
        const retry = Number(response.headers.get("retry-after")) || 60;
        const o = await this.store.get<{ count: number }>(key);
        await this.store.put(
          key,
          {
            count: o?.value.count || 20,
            blockedUntil: Date.now() + Math.min(retry, 3600) * 1000,
          },
          o?.etag,
        );
      }
      // Never echo provider messages: they can include tokens, payloads and private text.
      throw new PlatformError(
        `Platform menolak permintaan (HTTP ${response.status}, kode ${code.replace(/[^\w-]/g, "").slice(0, 50)}).`,
        response.status === 429 || response.status >= 500,
        !readOnly && response.status >= 500,
        response.status === 401 ||
          code === "190" ||
          code === "access_token_invalid",
      );
    }
    return obj(
      sanitizePlatformData(data, [t.accessToken, t.refreshToken || ""]),
    );
  }
  async profile(a: Account): Promise<Stats> {
    if (a.platform === "instagram") {
      const p = await this.call(
        a,
        `${a.platformId}?fields=id,username,followers_count,media_count`,
      );
      let reach: number | undefined;
      try {
        const r = await this.call(
          a,
          `${a.platformId}/insights?metric=reach&period=day`,
        );
        const first = array(r.data)[0];
        reach = Number(obj(array(first?.values)[0]).value || 0);
      } catch (e) {
        if (!(e instanceof PlatformError)) throw e;
      }
      return {
        accountId: a.id,
        capturedAt: new Date().toISOString(),
        followers: Number(p.followers_count || 0),
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        reach,
        source: "official",
      };
    }
    throw new AppError(403, "Statistik TikTok dinonaktifkan. Hanya profil dasar.");
  }
  async posts(a: Account, cursor?: string) {
    if (a.platform !== "instagram") throw new AppError(403, "Video TikTok tidak tersedia dalam mode profil.");
    const r = await this.call(a, `${a.platformId}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=25${cursor ? `&after=${encodeURIComponent(cursor)}` : ""}`);
    const posts = array(r.data).map((item) => ({
      id: String(item.id), accountId: a.id, caption: String(item.caption || ""),
      createdAt: String(item.timestamp), type: String(item.media_type || "VIDEO"),
      url: String(item.permalink || ""),
      thumbnail: String(item.thumbnail_url || (item.media_type === "IMAGE" ? item.media_url : "") || ""),
      views: Number(item.view_count || 0), likes: Number(item.like_count || 0),
      comments: Number(item.comments_count || 0), shares: 0,
    }) satisfies Post);
    for (const post of posts) await this.store.put(`posts/${a.id}/${post.id}.json`, post);
    return { items: posts, cursor: String(obj(obj(r.paging).cursors).after || "") || undefined };
  }
  async metrics(a: Account, postId: string) {
    if (a.platform !== "instagram") throw new AppError(403, "Metrik TikTok tidak tersedia.");
    return this.call(a, `${postId}/insights?metric=views,reach,saved,shares,total_interactions`);
  }
  async tiktokProfile(a: Account) {
    if (a.platform !== "tiktok") throw new AppError(400, "Hanya untuk TikTok.");
    const result = await this.call(a, "user/info/?fields=open_id,display_name,avatar_url");
    const user = obj(obj(result.data).user);
    return { displayName: String(user.display_name || a.username), avatarUrl: String(user.avatar_url || a.avatar || "") };
  }
  async prepare(
    a: Account,
    d: Draft,
    media: Media[],
    url: (m: Media) => Promise<string>,
  ): Promise<{
    id: string;
    phase: "container" | "processing" | "children";
    children?: string[];
  }> {
    if (a.platform !== "instagram") throw new AppError(403, "TikTok tidak mendukung posting.");
    const params = async (m: Media, isChild = false): Promise<Json> =>
      m.mime.startsWith("image/")
        ? {
            image_url: await url(m),
            ...(isChild ? { is_carousel_item: true } : { caption: d.caption }),
          }
        : {
            video_url: await url(m),
            media_type: isChild ? "VIDEO" : "REELS",
            ...(isChild ? { is_carousel_item: true } : { caption: d.caption }),
          };
    let body: Json;
    if (d.postType === "carousel") {
      const children: string[] = [];
      for (const m of media.slice(0, 3)) {
        const c = await this.call(
          a,
          `${a.platformId}/media`,
          await params(m, true),
        );
        children.push(responseId(c.id));
      }
      return { id: children[0], phase: "children", children };
    } else body = await params(media[0]);
    const r = await this.call(a, `${a.platformId}/media`, body);
    return { id: responseId(r.id), phase: "container" };
  }
  async advanceCarousel(
    a: Account,
    d: Draft,
    media: Media[],
    url: (m: Media) => Promise<string>,
  ) {
    const children = [...(d.providerChildren || [])],
      ready = [...(d.providerReadyChildren || [])];
    for (const child of children
      .filter((id) => !ready.includes(id))
      .slice(0, 3)) {
      const r = await this.call(a, `${child}?fields=status_code`);
      if (r.status_code === "FINISHED") ready.push(child);
      if (["ERROR", "EXPIRED"].includes(String(r.status_code)))
        throw new PlatformError("Media carousel gagal diproses.");
    }
    if (ready.length === children.length && children.length < media.length) {
      for (const m of media.slice(children.length, children.length + 3)) {
        const body = m.mime.startsWith("image/")
          ? { image_url: await url(m), is_carousel_item: true }
          : {
              video_url: await url(m),
              media_type: "VIDEO",
              is_carousel_item: true,
            };
        const r = await this.call(a, `${a.platformId}/media`, body);
        children.push(responseId(r.id));
      }
    }
    if (children.length === media.length && ready.length === children.length) {
      const r = await this.call(a, `${a.platformId}/media`, {
        media_type: "CAROUSEL",
        children: children.join(","),
        caption: d.caption,
      });
      return { children, ready, parentId: responseId(r.id) };
    }
    return { children, ready, parentId: undefined };
  }
  async poll(
    a: Account,
    d: Draft,
  ): Promise<{
    status: "processing" | "ready" | "published" | "failed";
    publishedId?: string;
  }> {
    if (a.platform !== "instagram") throw new AppError(403, "Tidak ada status posting TikTok.");
    const r = await this.call(a, `${d.providerId}?fields=status_code`);
    return {
      status:
        r.status_code === "FINISHED"
          ? "ready"
          : r.status_code === "PUBLISHED"
            ? "published"
            : ["ERROR", "EXPIRED"].includes(String(r.status_code))
              ? "failed"
              : "processing",
      publishedId: r.status_code === "PUBLISHED" ? d.providerId : undefined,
    };
  }
  async finish(a: Account, d: Draft) {
    if (a.platform !== "instagram") throw new AppError(403, "TikTok tidak mendukung posting.");
    const r = await this.call(a, `${a.platformId}/media_publish`, {
      creation_id: d.providerId,
    });
    return responseId(r.id);
  }
  async comments(a: Account, postId: string) {
    if (a.platform === "tiktok")
      throw new AppError(
        409,
        "Komentar TikTok tidak tersedia pada Display API; dihapus dari v1.",
      );
    return this.call(
      a,
      `${postId}/comments?fields=id,text,username,timestamp,replies&limit=50`,
    );
  }
  async conversations(a: Account) {
    if (a.platform !== "instagram")
      throw new AppError(400, "DM hanya untuk Instagram.");
    return this.call(
      a,
      `${a.platformId}/conversations?platform=instagram&fields=id,updated_time,participants&limit=25`,
    );
  }
  async conversation(a: Account, id: string) {
    return this.call(
      a,
      `${id}?fields=id,participants,messages.limit(25){id,created_time,from,to,message}`,
    );
  }
  async action(a: Account, d: Draft) {
    if (a.platform !== "instagram")
      throw new AppError(409, "Fitur ini tidak tersedia untuk TikTok.");
    if (d.kind === "comment_reply") {
      const result = await this.call(a, `${d.targetId}/replies`, {
        message: d.caption,
      });
      responseId(result.id);
      return result;
    }
    if (d.kind === "comment_moderation") {
      const result =
        d.moderation === "delete"
          ? await this.call(a, d.targetId!, undefined, "DELETE")
          : await this.call(a, d.targetId!, { hide: true });
      if (result.success !== true)
        throw new PlatformError(
          "Platform tidak mengonfirmasi moderasi; hasil aksi belum diketahui.",
          false,
          true,
        );
      return result;
    }
    // Verify a recent inbound message; API policy is not bypassed by dashboard approval.
    const conv = await this.conversation(a, d.targetId!);
    const participants = array(obj(conv.participants).data);
    const recipient = participants.find((p) => String(p.id) !== a.platformId);
    const messages = array(obj(conv.messages).data);
    const inbound = messages.find(
      (m) => String(obj(m.from).id) !== a.platformId,
    );
    if (
      !recipient ||
      !inbound ||
      Date.now() - Date.parse(String(inbound.created_time)) > 24 * 3600000
    )
      throw new AppError(
        409,
        "DM hanya dapat dibalas dalam jendela 24 jam setelah pesan masuk.",
      );
    const result = await this.call(a, `${a.platformId}/messages`, {
      recipient: { id: recipient.id },
      message: { text: d.caption },
    });
    responseId(result.message_id);
    return result;
  }
  async refresh(a: Account) {
    const t = await this.tokens(a);
    if (Date.parse(t.expiresAt) - Date.now() > 7 * 86400000) return;
    if (a.loginMode === "facebook")
      throw new PlatformError(
        "Facebook Login memerlukan otorisasi ulang saat grant mendekati masa berlaku.",
        false,
        false,
        true,
      );
    const response =
      a.platform === "instagram"
        ? await fetch(
            `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(t.accessToken)}`,
            { signal: AbortSignal.timeout(15000) },
          )
        : await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_key: this.env.TIKTOK_CLIENT_KEY || "",
              client_secret: this.env.TIKTOK_CLIENT_SECRET || "",
              grant_type: "refresh_token",
              refresh_token: t.refreshToken || "",
            }),
            signal: AbortSignal.timeout(15000),
          });
    const r = await boundedJson(response);
    if (!response.ok || r.error || !r.access_token)
      throw new PlatformError(
        "Refresh token gagal.",
        response.status >= 500,
        false,
        response.status < 500,
      );
    const tokens: Tokens = {
      accessToken: String(r.access_token),
      refreshToken:
        String(r.refresh_token || t.refreshToken || "") || undefined,
      expiresAt: new Date(
        Date.now() + Number(r.expires_in || 3600) * 1000,
      ).toISOString(),
    };
    const current = await this.store.require<Account>(`accounts/${a.id}.json`);
    await this.store.put(
      `accounts/${a.id}.json`,
      {
        ...current.value,
        encryptedToken: await seal(tokens, this.env.TOKEN_ENCRYPTION_KEY!),
        expiresAt: tokens.expiresAt,
        status: "connected",
      },
      current.etag,
    );
  }
}
