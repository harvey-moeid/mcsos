import { z } from "zod";
import { TikTokService } from "./tiktok-service";
import { AIService } from "./ai-service";
import type { SocialService } from "./service";
import { identifier } from "../shared/tiktok";
import type { Draft } from "../shared/model";
export async function tiktokApi(req: Request, social: SocialService, owner: string, read: () => Promise<unknown>): Promise<Response | null> {
  const u = new URL(req.url), path = u.pathname, tt = new TikTokService(social.env);
  if (!path.startsWith("/api/tiktok/")) return null;
  if (path === "/api/tiktok/config" && req.method === "GET") return Response.json({
    contentStudio: social.env.TIKTOK_CONTENT_STUDIO_ENABLED === "true", sessionEnabled: social.env.TIKTOK_SESSION_ENABLED === "true",
    analyticsEnabled: social.env.TIKTOK_ANALYTICS_ENABLED === "true", browserConfigured: social.env.BROWSER_USE_ENABLED === "true" && !!social.env.BROWSER_USE_API_KEY,
    aiConfigured: new AIService(social.env).configured(), aiProvider: social.env.AI_PROVIDER || "none", browserPublish: "unsupported", scheduler: "manual", timezone: "Asia/Jakarta",
  });
  if (path === "/api/tiktok/accounts" && req.method === "POST") return Response.json(await tt.createAccount(await read()), { status: 201 });
  const account = path.match(/^\/api\/tiktok\/accounts\/([\w-]+)(?:\/(verify|disconnect|analytics))?$/);
  if (account) {
    const id = identifier.parse(account[1]);
    if (req.method === "PATCH" && !account[2]) { await tt.updateAccount(id, await read()); return Response.json({ ok: true }); }
    if (req.method === "POST" && account[2] === "verify") return Response.json(await tt.verifyIdentity(id, await read()));
    if (req.method === "POST" && account[2] === "disconnect") return Response.json(await tt.disconnect(id));
    if (req.method === "GET" && account[2] === "analytics") return Response.json(await tt.analytics(id, u.searchParams.get("cursor") || undefined));
    if (req.method === "POST" && account[2] === "analytics") {
      const p = z.object({ items: z.array(z.unknown()).min(1).max(100) }).parse(await read());
      // Validate every row before mutation; each persisted snapshot remains independently auditable.
      const { metricInput } = await import("../shared/tiktok");
      const rows = p.items.map(x => metricInput.parse(x));
      const items = []; for (const row of rows) items.push(await tt.recordMetrics(id, row));
      return Response.json({ items }, { status: 201 });
    }
  }
  if (path === "/api/tiktok/ai" && req.method === "POST") return Response.json(await new AIService(social.env).generate(await read()));
  if (path === "/api/tiktok/process-due" && req.method === "POST") {
    const p = z.object({ cursor: z.string().optional() }).parse(await read());
    return Response.json(await tt.processDue(p.cursor));
  }
  const draft = path.match(/^\/api\/tiktok\/drafts\/([\w-]+)\/(request-approval|approve|schedule|handoff|confirm|reset|cancel|duplicate|history)$/);
  if (draft) {
    const id = identifier.parse(draft[1]);
    if (req.method === "GET" && draft[2] === "history") {
      await tt.draft(id, identifier.parse(u.searchParams.get("account_id")));
      return Response.json(await tt.store.list<Draft>(`draft-history/${id}/`, u.searchParams.get("cursor") || undefined, 25));
    }
    if (req.method !== "POST") return null;
    const input = await read(), p = z.object({ account_id: identifier, revision: z.number().int().positive().optional() }).parse(input);
    const o = await tt.draft(id, p.account_id);
    if (draft[2] === "request-approval") return Response.json(await tt.requestApproval(id, p.account_id, z.number().int().positive().parse(p.revision)));
    if (draft[2] === "approve") {
      const approval = z.object({ revision: z.number().int().positive(), scheduled_at: z.string().datetime({ offset: true }).optional(), checked_content: z.literal(true), username: z.string() }).parse(input);
      const a = (await tt.account(p.account_id)).value;
      if (approval.username !== tt.identity(a)) throw new Error("Username approval tidak cocok.");
      return Response.json(await tt.approve(id, p.account_id, approval.revision, owner, approval.scheduled_at));
    }
    if (draft[2] === "schedule") return Response.json(await tt.schedule(id, p.account_id));
    if (draft[2] === "handoff") {
      const handoff = z.object({ revision: z.number().int().positive(), request_id: z.string().uuid(), checked_account: z.literal(true) }).parse(input);
      return Response.json(await tt.handoff(id, p.account_id, handoff.revision, handoff.request_id));
    }
    if (draft[2] === "confirm") return Response.json(await tt.confirm(id, p.account_id, input, owner));
    if (draft[2] === "reset" || draft[2] === "cancel") return Response.json(await tt.reset(id, p.account_id, draft[2] === "cancel"));
    if (draft[2] === "duplicate") return Response.json(await social.createDraft({ account_id: p.account_id, caption: o.value.caption, media_ids: o.value.mediaIds, post_type: o.value.postType, notes: o.value.notes, ai_generated: o.value.aiGenerated, commercial: o.value.commercial }), { status: 201 });
  }
  return null;
}
