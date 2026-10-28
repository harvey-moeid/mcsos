import { z } from "zod";
import { tiktokApi } from "./tiktok-api";
import { TikTokService } from "./tiktok-service";
import { requireOwner } from "./auth";
import { connectRoute, facebookConnect } from "./connections";
import { mcpFetch } from "./mcp";
import { BrowserService } from "./browser-service";
import {
  executionMethodSchema,
  browserReadSchema,
  safeBrowserJob,
  type BrowserJob,
  type BrowserLogin,
} from "../shared/browser";
import { SocialService } from "./service";
import { AppError } from "./store";
import {
  safeAccount,
  type Draft,
  type Account,
  type Stats,
  type Post,
  type Media,
  type Activity,
  type Idea,
  type Tokens,
} from "../shared/model";
import type { RuntimeEnv } from "./platforms";
import { verify, open, seal } from "./crypto";
import {
  initiateUpload,
  uploadPartUrl,
  completeUpload,
  abortUpload,
  deleteMedia,
} from "./media";
const ident = z.string().regex(/^[\w-]+$/);
async function body(req: Request, max = 100000) {
  if (Number(req.headers.get("content-length") || 0) > max)
    throw new AppError(413, "Body terlalu besar.");
  const reader = req.body?.getReader();
  if (!reader) throw new AppError(400, "JSON body diperlukan.");
  let n = 0,
    text = "";
  const decoder = new TextDecoder();
  while (true) {
    const r = await reader.read();
    if (r.done) break;
    n += r.value.byteLength;
    if (n > max) {
      await reader.cancel();
      throw new AppError(413, "Body terlalu besar.");
    }
    text += decoder.decode(r.value, { stream: true });
  }
  text += decoder.decode();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AppError(400, "JSON tidak valid.");
  }
}
export async function ownerApi(req: Request, env: RuntimeEnv) {
  const owner = await requireOwner(req, env),
    u = new URL(req.url),
    path = u.pathname,
    service = new SocialService(env),
    store = service.store;
  const tt = await tiktokApi(req, service, owner.id, () => body(req));
  if (tt) return tt;
  if (path === "/api/workspace" && req.method === "GET") {
    const today = new Date().toISOString().slice(0, 10).replaceAll("-", "/");
    const [accounts, drafts, media, stats, posts, logs, ideas] =
      await Promise.all([
        store.accounts(),
        store.list<Draft>("drafts/", undefined, 100),
        store.list<Media>("media-meta/", undefined, 100),
        store.list<Stats>("stats-latest/", undefined, 25),
        store.list<Post>("posts/", undefined, 100),
        store.list<Activity>(`logs/${today}/`, undefined, 100),
        store.list<Idea>("calendar/", undefined, 100),
      ]);
    const previews = [];
    for (const m of media.items)
      previews.push({ ...m, previewUrl: await service.mediaUrl(m) });
    return Response.json({
      accounts: accounts.map(safeAccount),
      drafts: drafts.items,
      media: previews,
      stats: stats.items,
      posts: posts.items,
      logs: logs.items.sort((a, b) => b.at.localeCompare(a.at)),
      ideas: ideas.items,
      demo: false,
      csrf: owner.csrf,
      owner: owner.id,
      cursors: {
        drafts: drafts.cursor,
        media: media.cursor,
        posts: posts.cursor,
        logs: logs.cursor,
        ideas: ideas.cursor,
      },
    });
  }
  if (path.startsWith("/api/connect-pending/")) {
    const pendingId = ident.parse(path.split("/")[3]),
      key = `connect-pending/${pendingId}.json`,
      record = await store.require<{
        owner: string;
        expiresAt: number;
        encrypted: string;
      }>(key);
    if (
      record.value.owner !== owner.id ||
      record.value.expiresAt < Date.now() ||
      !env.TOKEN_ENCRYPTION_KEY
    )
      throw new AppError(403, "Pilihan koneksi kedaluwarsa.");
    const pending = await open<{
      pages: {
        id: string;
        name: string;
        access_token: string;
        instagram_business_account: { id: string; username?: string };
      }[];
      expiresAt: string;
      userToken: string;
    }>(record.value.encrypted, env.TOKEN_ENCRYPTION_KEY);
    if (req.method === "GET")
      return Response.json({
        items: pending.pages.map((p) => ({
          id: p.id,
          label: p.name,
          username: p.instagram_business_account.username,
        })),
      });
    if (req.method === "POST") {
      const selection = z
          .object({ page_ids: z.array(ident).min(1).max(10) })
          .parse(await body(req)),
        all = await store.accounts();
      for (const id of selection.page_ids) {
        const page = pending.pages.find((p) => p.id === id);
        if (!page) throw new AppError(400, "Page tidak valid.");
        const previous = all.find(
          (a) =>
            a.platform === "instagram" &&
            a.platformId === page.instagram_business_account.id,
        );
        if (
          !previous &&
          all.filter((a) => a.platform === "instagram").length >= 10
        )
          throw new AppError(409, "Maksimal 10 akun Instagram.");
        const a: Account = {
          id: previous?.id || crypto.randomUUID(),
          platform: "instagram",
          platformId: page.instagram_business_account.id,
          pageId: page.id,
          loginMode: "facebook",
          label: previous?.label || page.name,
          username: page.instagram_business_account.username || page.name,
          status: "connected",
          expiresAt: pending.expiresAt,
          scopes: [
            "instagram_basic",
            "instagram_content_publish",
            "instagram_manage_insights",
            "instagram_manage_comments",
            "instagram_manage_messages",
          ],
          encryptedToken: await seal(
            {
              accessToken: page.access_token,
              userAccessToken: pending.userToken,
              expiresAt: pending.expiresAt,
            } satisfies Tokens,
            env.TOKEN_ENCRYPTION_KEY,
          ),
        };
        await store.put(`accounts/${a.id}.json`, a);
        if (!previous) all.push(a);
        await store.log("account.connect", "success", { accountId: a.id });
      }
      await env.DATA.delete(key);
      return Response.json({ ok: true });
    }
    throw new AppError(405, "Method tidak diizinkan.");
  }
  if (path === "/api/config")
    return Response.json({
      mcpUrl: env.PUBLIC_ORIGIN + "/mcp",
      scrapingEnabled: env.SCRAPING_ENABLED === "true",
      instagramLogin: "Instagram Login",
      chatUploadLimitMB: 10,
      browserUseConfigured:
        env.BROWSER_USE_ENABLED === "true" && !!env.BROWSER_USE_API_KEY,
      browserUseMaxCostUsd: Number(env.BROWSER_USE_MAX_COST_USD),
    });
  const browser = service.browser;
  if (path === "/api/browser/accounts" && req.method === "POST")
    return Response.json(await browser.createAccount(await body(req)), {
      status: 201,
    });
  const browserAccount = path.match(
    /^\/api\/browser\/accounts\/([\w-]+)(?:\/(probe|login|login-close|login-resume))?$/,
  );
  if (browserAccount) {
    const id = ident.parse(browserAccount[1]);
    if (req.method === "GET" && !browserAccount[2])
      return Response.json(await browser.getSettings(id));
    if (req.method === "PATCH" && !browserAccount[2])
      return Response.json(await browser.settings(id, await body(req)));
    if (req.method === "POST" && browserAccount[2] === "probe")
      return Response.json(await browser.startProbe(id));
    if (req.method === "POST" && browserAccount[2] === "login")
      return Response.json(await browser.openLogin(id));
    if (req.method === "POST" && browserAccount[2] === "login-resume") {
      const p = z.object({ login_id: ident }).parse(await body(req));
      return Response.json(await browser.resumeLogin(p.login_id, id));
    }
    if (req.method === "POST" && browserAccount[2] === "login-close") {
      const p = z
        .object({ login_id: ident, browser_id: z.string().uuid().optional() })
        .parse(await body(req));
      return Response.json(
        await browser.closeLogin(p.login_id, id, p.browser_id),
      );
    }
  }
  if (path === "/api/browser/jobs" && req.method === "GET") {
    const page = await store.list<BrowserJob>(
      "browser/jobs/",
      u.searchParams.get("cursor") || undefined,
      50,
    );
    return Response.json({ ...page, items: page.items.map(safeBrowserJob) });
  }
  if (path === "/api/browser/logins" && req.method === "GET") {
    const page = await store.list<BrowserLogin>(
      "browser/logins/",
      undefined,
      50,
    );
    return Response.json({
      items: page.items
        .filter((l) => l.status !== "stopped")
        .map((l) => ({
          id: l.id,
          accountId: l.accountId,
          status: l.status,
          browserId: l.browserId,
          createdAt: l.createdAt,
          expiresAt: l.expiresAt,
        })),
    });
  }
  if (path === "/api/browser/read" && req.method === "POST")
    return Response.json(await browser.startRead(await body(req)), {
      status: 202,
    });
  const browserJob = path.match(
    /^\/api\/browser\/jobs\/([\w-]+)(?:\/(poll|recover|resolve|stop|abandon))?$/,
  );
  if (browserJob) {
    const id = ident.parse(browserJob[1]);
    if (req.method === "GET" && !browserJob[2])
      return Response.json(await browser.getResult(id));
    if (req.method === "POST" && browserJob[2] === "poll")
      return Response.json(await browser.poll(id));
    if (req.method === "POST" && browserJob[2] === "recover") {
      const p = z.object({ run_id: z.string().uuid() }).parse(await body(req));
      return Response.json(await browser.recover(id, p.run_id));
    }
    if (req.method === "POST" && browserJob[2] === "abandon") {
      z.object({
        checked_cloud: z.literal(true),
        checked_platform: z.literal(true),
      }).parse(await body(req));
      return Response.json(await browser.abandon(id));
    }
    if (req.method === "POST" && browserJob[2] === "resolve") {
      const p = z
        .object({
          resolution: z.enum(["confirmed", "not_performed"]),
          checked_platform: z.literal(true),
        })
        .parse(await body(req));
      return Response.json(await browser.resolve(id, p.resolution));
    }
    if (req.method === "POST" && browserJob[2] === "stop") {
      const j = await browser.current(id);
      if (!j.runId)
        throw new AppError(
          409,
          "Run ID belum diketahui. Pulihkan terlebih dahulu.",
        );
      await browser.cloud.cancel(j.runId);
      return Response.json(await browser.poll(id));
    }
  }
  if (path === "/api/publisher/run" && req.method === "POST") {
    await service.publishTick();
    return Response.json({ ok: true, mode: "manual" });
  }
  if (path === "/api/drafts" && req.method === "POST")
    return Response.json(await service.createDraft(await body(req)), {
      status: 201,
    });
  if (path === "/api/crosspost" && req.method === "POST") {
    const p = z
      .object({
        account_ids: z.array(ident).min(2).max(20),
        input: z.record(z.unknown()),
      })
      .parse(await body(req));
    const group = crypto.randomUUID(),
      items: Draft[] = [];
    for (const id of p.account_ids)
      items.push(
        await service.createDraft(
          { ...p.input, account_id: id, kind: "post" },
          group,
        ),
      );
    return Response.json({ items, crosspostId: group }, { status: 201 });
  }
  const draft = path.match(
    /^\/api\/drafts\/([\w-]+)(?:\/(approve|reject|cancel))?$/,
  );
  if (draft) {
    const id = ident.parse(draft[1]);
    if (req.method === "PATCH" && !draft[2])
      return Response.json(await service.updateDraft(id, await body(req)));
    if (req.method === "DELETE" && !draft[2]) {
      await service.deleteDraft(id);
      return Response.json({ ok: true });
    }
    if (req.method === "POST" && draft[2] === "approve") {
      const p = z
        .object({
          revision: z.number().int(),
          execution_method: executionMethodSchema.default("api"),
          browser_consent: z.boolean().default(false),
          scheduled_at: z.string().datetime({ offset: true }).optional(),
        })
        .parse(await body(req));
      return Response.json(
        await service.approve(
          id,
          p.revision,
          owner.id,
          p.scheduled_at,
          p.execution_method,
          p.browser_consent,
        ),
      );
    }
    if (req.method === "POST" && draft[2] === "reject") {
      const p = z.object({ note: z.string().max(1000) }).parse(await body(req));
      await service.reject(id, p.note);
      return Response.json({ ok: true });
    }
    if (req.method === "POST" && draft[2] === "cancel")
      return Response.json(await service.cancel(id));
  }
  if (path === "/api/bulk-approve" && req.method === "POST") {
    const p = z
      .object({
        items: z
          .array(z.object({ id: ident, revision: z.number().int() }))
          .min(1)
          .max(20),
      })
      .parse(await body(req));
    for (const item of p.items) {
      const d = (await store.require<Draft>(`drafts/${item.id}.json`)).value;
      if (d.kind !== "comment_reply")
        throw new AppError(400, "Bulk approve hanya untuk balasan komentar.");
    }
    const results = [];
    for (const i of p.items) {
      try {
        results.push({
          id: i.id,
          ok: true,
          draft: await service.approve(i.id, i.revision, owner.id),
        });
      } catch (e) {
        results.push({
          id: i.id,
          ok: false,
          error: e instanceof AppError ? e.message : "Gagal menyetujui.",
        });
      }
    }
    return Response.json({ results });
  }
  const account = path.match(
    /^\/api\/accounts\/([\w-]+)(?:\/(refresh|stats|posts|profile|comments|conversations))?$/,
  );
  if (account) {
    const id = ident.parse(account[1]),
      a = await service.account(id);
    if (req.method === "DELETE" && !account[2]) {
      if (a.platform === "tiktok") return Response.json(await new TikTokService(env).disconnect(id));
      const o = await store.require<Account>(`accounts/${id}.json`);
      await store.put(
        `accounts/${id}.json`,
        {
          ...o.value,
          encryptedToken: undefined,
          status: "reconnect",
          scopes: [],
        },
        o.etag,
      );
      await store.log("account.disconnect", "success", { accountId: id });
      return Response.json({ ok: true });
    }
    if (req.method === "PATCH" && !account[2]) {
      const p = z
          .object({ label: z.string().min(1).max(80) })
          .parse(await body(req)),
        o = await store.require<Account>(`accounts/${id}.json`);
      await store.put(
        `accounts/${id}.json`,
        { ...o.value, label: p.label },
        o.etag,
      );
      return Response.json({ ok: true });
    }
    if (account[2] === "refresh" && req.method === "POST") {
      await service.platforms.refresh(a);
      return Response.json({ ok: true });
    }
    if (account[2] === "stats")
      return Response.json(await service.stats(id, true));
    if (account[2] === "posts")
      return Response.json(
        await service.platforms.posts(
          a,
          u.searchParams.get("cursor") || undefined,
        ),
      );
    if (account[2] === "profile" && req.method === "GET")
      return Response.json(await service.platforms.tiktokProfile(a));
    if (account[2] === "comments")
      return Response.json(
        await service.platforms.comments(
          a,
          ident.parse(u.searchParams.get("post_id")),
        ),
      );
    if (account[2] === "conversations")
      return Response.json(await service.platforms.conversations(a));
  }
  if (path === "/api/conversation") {
    return Response.json(
      await service.platforms.conversation(
        await service.account(ident.parse(u.searchParams.get("account_id"))),
        ident.parse(u.searchParams.get("id")),
      ),
    );
  }
  if (path === "/api/media/initiate" && req.method === "POST")
    return Response.json(await initiateUpload(env, await body(req)));
  const media = path.match(
    /^\/api\/media\/([\w-]+)(?:\/(part|complete|abort))?$/,
  );
  if (media) {
    const id = ident.parse(media[1]);
    if (media[2] === "part" && req.method === "POST") {
      const p = z
        .object({ part_number: z.number().int().min(1).max(1000) })
        .parse(await body(req));
      return Response.json(await uploadPartUrl(env, id, p.part_number));
    }
    if (media[2] === "complete" && req.method === "POST") {
      const p = z
        .object({
          parts: z
            .array(
              z.object({
                PartNumber: z.number().int(),
                ETag: z.string().max(100),
              }),
            )
            .optional(),
        })
        .parse(await body(req));
      return Response.json(await completeUpload(env, id, p.parts));
    }
    if (media[2] === "abort" && req.method === "POST") {
      await abortUpload(env, id);
      return Response.json({ ok: true });
    }
    if (req.method === "DELETE" && !media[2]) {
      await deleteMedia(service, id);
      return Response.json({ ok: true });
    }
  }
  if (path === "/api/ideas" && req.method === "POST")
    return Response.json(await service.createIdea(await body(req)), {
      status: 201,
    });
  if (path === "/api/suggestions")
    return Response.json(
      await service.suggestion(ident.parse(u.searchParams.get("account_id"))),
    );
  if (path === "/api/list") {
    const kind = z
        .enum(["drafts", "media", "ideas", "posts", "stats", "logs"])
        .parse(u.searchParams.get("kind")),
      cursor = u.searchParams.get("cursor") || undefined;
    const accountId = u.searchParams.get("account_id");
    if (accountId) await service.account(ident.parse(accountId));
    let prefix = (
      {
        drafts: "drafts/",
        media: "media-meta/",
        ideas: "calendar/",
        posts: "posts/",
        stats: "stats/",
        logs: "logs/",
      } as const
    )[kind] as string;
    if (kind === "stats" && !accountId)
      throw new AppError(400, "account_id diperlukan.");
    if (["posts", "stats"].includes(kind) && accountId)
      prefix += accountId + "/";
    if (kind === "logs") {
      const date = z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .parse(u.searchParams.get("date"));
      prefix += date.replaceAll("-", "/") + "/";
    }
    return Response.json(await store.list(prefix, cursor, 50));
  }
  throw new AppError(404, "Endpoint tidak ditemukan.");
}
