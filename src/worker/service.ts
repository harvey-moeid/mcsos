import {
  assertApproved,
  assertEditable,
  draftInput,
  scheduleKey,
  validateMedia,
  type Account,
  type Draft,
  type Idea,
  type Media,
  type Stats,
} from "../shared/model";
import { AppError, Store } from "./store";
import { Platforms, PlatformError, type RuntimeEnv } from "./platforms";
import { sign, digest } from "./crypto";
import { BrowserService } from "./browser-service";
import { validateBrowserTarget, type ExecutionMethod } from "../shared/browser";
import { z } from "zod";
import { TikTokService } from "./tiktok-service";
export class SocialService {
  readonly store: Store;
  readonly platforms: Platforms;
  readonly browser: BrowserService;
  constructor(readonly env: RuntimeEnv) {
    this.store = new Store(env.DATA);
    this.platforms = new Platforms(env);
    this.browser = new BrowserService(env);
  }
  async account(id: string) {
    if (!/^[\w-]+$/.test(id)) throw new AppError(400, "ID akun tidak valid.");
    return (await this.store.require<Account>(`accounts/${id}.json`)).value;
  }
  async createDraft(input: unknown, crosspostId?: string): Promise<Draft> {
    return this.store.locked("media-references", () => this.createDraftUnlocked(input, crosspostId));
  }
  private async createDraftUnlocked(input: unknown, crosspostId?: string) {
    const p = draftInput.parse(input);
    const a = await this.account(p.account_id);
    if (a.platform === "tiktok") {
      new TikTokService(this.env).enabled("TIKTOK_CONTENT_STUDIO_ENABLED");
      if (p.kind !== "post" || p.post_type === "reel") throw new AppError(400, "TikTok hanya mendukung persiapan posting manual.");
      if (p.disable_comment !== undefined || p.disable_duet !== undefined || p.disable_stitch !== undefined) throw new AppError(400, "Kontrol interaksi harus dipilih langsung di TikTok Web.");
    }
    for (const m of await this.media(p.media_ids)) if (m.accountId && m.accountId !== a.id) throw new AppError(403, "Media milik akun berbeda.");
    const at = new Date().toISOString();
    const d: Draft = {
      id: crypto.randomUUID(),
      accountId: p.account_id,
      kind: p.kind,
      caption: p.caption,
      notes: p.notes,
      aiGenerated: p.ai_generated,
      mediaIds: p.media_ids,
      postType: p.post_type,
      scheduledAt: p.scheduled_at,
      targetId:
        p.target_id ||
        (p.browser_target
          ? `browser-${await digest(JSON.stringify(p.browser_target))}`
          : undefined),
      browserTarget: p.browser_target,
      moderation: p.moderation,
      privacy: p.privacy,
      disableComment: p.disable_comment,
      disableDuet: p.disable_duet,
      disableStitch: p.disable_stitch,
      commercial: p.commercial,
      status: "draft",
      createdAt: at,
      updatedAt: at,
      revision: 1,
      attempts: 0,
      crosspostId,
    };
    await this.store.put(`drafts/${d.id}.json`, d);
    await this.store.log("draft.create", "success", {
      entityId: d.id,
      accountId: d.accountId,
    });
    return d;
  }
  async updateDraft(id: string, input: unknown): Promise<Draft> {
    return this.store.locked("media-references", () => this.updateDraftUnlocked(id, input));
  }
  private async updateDraftUnlocked(id: string, input: unknown) {
    const o = await this.store.require<Draft>(`drafts/${id}.json`);
    assertEditable(o.value);
    const a = await this.account(o.value.accountId);
    if (a.platform === "tiktok") new TikTokService(this.env).enabled("TIKTOK_CONTENT_STUDIO_ENABLED");
    const p = draftInput.parse(input);
    if (p.expected_revision !== undefined && p.expected_revision !== o.value.revision) throw new AppError(409, "Revisi draft berubah.");
    if (a.platform === "tiktok" && p.expected_revision === undefined) throw new AppError(400, "expected_revision wajib untuk edit TikTok.");
    if (a.platform === "tiktok" && (p.post_type === "reel" || p.disable_comment !== undefined || p.disable_duet !== undefined || p.disable_stitch !== undefined)) throw new AppError(400, "Opsi tidak didukung handoff TikTok.");
    for (const m of await this.media(p.media_ids)) if (m.accountId && m.accountId !== a.id) throw new AppError(403, "Media milik akun berbeda.");
    if (p.account_id !== o.value.accountId || p.kind !== o.value.kind)
      throw new AppError(400, "Akun dan jenis aksi tidak dapat diubah.");
    const d: Draft = {
      ...o.value,
      caption: p.caption,
      notes: p.notes,
      aiGenerated: p.ai_generated,
      mediaIds: p.media_ids,
      postType: p.post_type,
      scheduledAt: p.scheduled_at,
      targetId:
        p.target_id ||
        (p.browser_target
          ? `browser-${await digest(JSON.stringify(p.browser_target))}`
          : undefined),
      browserTarget: p.browser_target,
      moderation: p.moderation,
      privacy: p.privacy,
      disableComment: p.disable_comment,
      disableDuet: p.disable_duet,
      disableStitch: p.disable_stitch,
      commercial: p.commercial,
      status: "draft",
      revision: o.value.revision + 1,
      updatedAt: new Date().toISOString(),
      approval: undefined,
      approvedBy: undefined,
      approvedAt: undefined,
      approvedRevision: undefined,
      approvedBrowserBinding: undefined,
      executionMethod: undefined,
    };
    await this.store.create(`draft-history/${id}/${o.value.revision}.json`, o.value);
    await this.store.put(`drafts/${id}.json`, d, o.etag);
    await this.store.log("draft.update", "success", {
      entityId: id,
      accountId: d.accountId,
    });
    return d;
  }
  async media(ids: string[]) {
    const results: Media[] = [];
    for (const id of ids)
      results.push(
        (await this.store.require<Media>(`media-meta/${id}.json`)).value,
      );
    return results;
  }
  async approve(
    id: string,
    revision: number,
    owner: string,
    at?: string,
    method: ExecutionMethod = "api",
    browserConsent = false,
  ) {
    const o = await this.store.require<Draft>(`drafts/${id}.json`);
    if ((await this.account(o.value.accountId)).platform === "tiktok") {
      if (method !== "manual") throw new AppError(403, "TikTok: hanya handoff manual didukung.");
      return new TikTokService(this.env).approve(id, o.value.accountId, revision, owner, at);
    }
    if (method === "manual") throw new AppError(400, "Pilih jalur Instagram yang didukung.");
    assertEditable(o.value);
    if (o.value.revision !== revision)
      throw new AppError(
        409,
        "Revisi draft berubah. Periksa ulang sebelum approve.",
      );
    const a = await this.account(o.value.accountId);
    if (
      method === "api" &&
      (a.status !== "connected" || Date.parse(a.expiresAt) <= Date.now())
    )
      throw new AppError(409, "Hubungkan ulang akun sebelum menyetujui.");
    validateMedia(o.value, a, await this.media(o.value.mediaIds));
    if (a.platform === "tiktok") throw new AppError(403, "Semua aksi TikTok dinonaktifkan: profil saja.");
    if (method === "browser") {
      if (
        (await this.media(o.value.mediaIds)).some(
          (m) => m.size > 50 * 1024 * 1024,
        )
      )
        throw new AppError(
          400,
          "Media jalur browser maksimal 50 MB per file. Gunakan API untuk file besar.",
        );
      if (!browserConsent)
        throw new AppError(
          400,
          "Persetujuan eksplisit untuk Browser Use diperlukan.",
        );
      await this.browser.profile(a, true);
      if (o.value.kind !== "post") {
        if (!o.value.browserTarget)
          throw new AppError(400, "Target browser belum diisi.");
        validateBrowserTarget(o.value.browserTarget, a.platform, o.value.kind);
      }
    }
    if (o.value.kind === "comment_moderation" && !o.value.moderation)
      throw new AppError(400, "Pilih hide atau delete.");
    if (
      at &&
      (!Number.isFinite(Date.parse(at)) || Date.parse(at) < Date.now() - 60000)
    )
      throw new AppError(400, "Waktu jadwal tidak valid.");
    const now = new Date().toISOString();
    const d: Draft = {
      ...o.value,
      status: "scheduled",
      scheduledAt: at || now,
      executionMethod: method,
      approvedBrowserBinding:
        method === "browser" ? a.browser!.revision : undefined,
      approvedBy: owner,
      approvedAt: now,
      approvedRevision: revision,
      updatedAt: now,
      rejectionNote: undefined,
    };
    // Queue first: if the status write fails, the publisher discards this unapproved marker.
    await this.store.put(scheduleKey(id, d.scheduledAt!), {
      draftId: id,
      at: d.scheduledAt,
    });
    await this.store.put(`drafts/${id}.json`, d, o.etag);
    await this.store.log("approval.approve", "success", {
      entityId: id,
      accountId: d.accountId,
    });
    return d;
  }
  async reject(id: string, note: string) {
    const o = await this.store.require<Draft>(`drafts/${id}.json`);
    assertEditable(o.value);
    await this.store.put(
      `drafts/${id}.json`,
      {
        ...o.value,
        status: "rejected",
        rejectionNote: note.slice(0, 1000),
        updatedAt: new Date().toISOString(),
      },
      o.etag,
    );
    await this.store.log("approval.reject", "success", {
      entityId: id,
      accountId: o.value.accountId,
    });
  }
  async cancel(id: string) {
    const o = await this.store.require<Draft>(`drafts/${id}.json`);
    if (o.value.status !== "scheduled")
      throw new AppError(
        409,
        "Hanya jadwal yang belum diproses dapat dibatalkan.",
      );
    // Cancellation and dispatch compete on the same draft ETag. Legacy
    // pre-dispatch locks cannot prove execution started and must not block cancel.
    const d: Draft = {
      ...o.value,
      status: "draft",
      revision: o.value.revision + 1,
      approval: undefined,
      approvedBy: undefined,
      approvedAt: undefined,
      approvedRevision: undefined,
      approvedBrowserBinding: undefined,
      executionMethod: undefined,
      updatedAt: new Date().toISOString(),
    };
    await this.store.put(`drafts/${id}.json`, d, o.etag);
    await this.env.DATA.delete(scheduleKey(id, o.value.scheduledAt!));
    await this.store.log("schedule.cancel", "success", {
      entityId: id,
      accountId: d.accountId,
    });
    return d;
  }
  async deleteDraft(id: string) {
    const o = await this.store.require<Draft>(`drafts/${id}.json`);
    assertEditable(o.value);
    const tombstone = { ...o.value, status: "cancelled" as const, updatedAt: new Date().toISOString() };
    await this.store.put(`drafts/${id}.json`, tombstone, o.etag);
    await this.env.DATA.delete(`drafts/${id}.json`);
    await this.store.log("draft.delete", "success", {
      entityId: id,
      accountId: o.value.accountId,
    });
  }
  async stats(id: string, force = false) {
    const a = await this.account(id);
    if (a.platform === "tiktok") throw new AppError(403, "Statistik TikTok tidak tersedia, lihat profil.");
    const latest = await this.store.get<Stats>(`stats-latest/${id}.json`);
    if (
      !force &&
      latest &&
      Date.now() - Date.parse(latest.value.capturedAt) < 900000
    )
      return latest.value;
    const stats = await this.platforms.profile(a);
    await this.store.put(`stats-latest/${id}.json`, stats);
    return stats;
  }
  async mediaUrl(m: Media) {
    if (!this.env.SESSION_SECRET)
      throw new AppError(503, "Signing secret belum diatur.");
    const expires = String(Math.floor(Date.now() / 1000) + 86400);
    const sig = await sign(`${m.key}:${expires}`, this.env.SESSION_SECRET);
    return `${this.env.PUBLIC_ORIGIN}/media/${m.key.split("/").map(encodeURIComponent).join("/")}?expires=${expires}&sig=${sig}`;
  }
  async createIdea(input: unknown) {
    const p = z
      .object({
        account_id: z.string(),
        title: z.string().min(1).max(200),
        notes: z.string().max(5000).default(""),
        proposed_at: z.string().datetime({ offset: true }).optional(),
      })
      .parse(input);
    await this.account(p.account_id);
    const idea: Idea = {
      id: crypto.randomUUID(),
      accountId: p.account_id,
      title: p.title,
      notes: p.notes,
      proposedAt: p.proposed_at,
      status: "idea",
      createdAt: new Date().toISOString(),
    };
    await this.store.put(`calendar/${idea.id}.json`, idea);
    return idea;
  }
  async suggestion(id: string) {
    await this.account(id);
    const posts = (
      await this.store.list<import("../shared/model").Post>(
        `posts/${id}/`,
        undefined,
        200,
      )
    ).items;
    const buckets = new Map<
      string,
      { day: number; hour: number; engagement: number; samples: number }
    >();
    for (const p of posts) {
      const date = new Date(p.createdAt);
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Jakarta",
        weekday: "short",
        hour: "numeric",
        hourCycle: "h23",
      }).formatToParts(date);
      const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
          parts.find((x) => x.type === "weekday")!.value,
        ),
        hour = Number(parts.find((x) => x.type === "hour")!.value),
        k = `${day}-${hour}`;
      const b = buckets.get(k) || { day, hour, engagement: 0, samples: 0 };
      b.engagement += p.likes + p.comments + p.shares;
      b.samples++;
      buckets.set(k, b);
    }
    return {
      timezone: "Asia/Jakarta",
      sampleSize: posts.length,
      suggestions: [...buckets.values()]
        .map((b) => ({ ...b, engagement: b.engagement / b.samples }))
        .sort((a, b) => b.engagement - a.engagement)
        .slice(0, 5),
      notice:
        "Saran dari waktu posting historis, bukan aktivitas pengikut. Jadwal final membutuhkan persetujuan pemilik.",
    };
  }
  async publishTick(now = new Date()) {
    const list = await this.env.DATA.list({
      prefix: "queue/scheduled/",
      limit: 12,
    });
    const cutoff = now.toISOString().slice(0, 16).replace(/[-:T]/g, "");
    let processed = 0;
    for (const marker of list.objects) {
      if (processed >= 5) break;
      if (
        marker.key.slice(
          "queue/scheduled/".length,
          "queue/scheduled/".length + 12,
        ) > cutoff
      )
        break;
      const q = await this.store.get<{ draftId: string; at: string }>(
        marker.key,
      );
      if (!q) continue;
      const o = await this.store.get<Draft>(`drafts/${q.value.draftId}.json`);
      if (!o) {
        await this.env.DATA.delete(marker.key);
        continue;
      }
      let d = o.value;
      if ((await this.account(d.accountId)).platform === "tiktok") continue;
      if (!["scheduled", "publishing"].includes(d.status)) {
        if (now.getTime() - marker.uploaded.getTime() > 600000)
          await this.env.DATA.delete(marker.key);
        continue;
      }
      if (d.scheduledAt !== q.value.at) {
        await this.env.DATA.delete(marker.key);
        continue;
      }
      try {
        assertApproved(d);
      } catch {
        await this.env.DATA.delete(marker.key);
        continue;
      }
      if (d.status === "scheduled") {
        const running: Draft = {
          ...d,
          status: "publishing",
          updatedAt: now.toISOString(),
          attempts: d.attempts + 1,
          executionRevision: 1,
        };
        try {
          // This conditional transition is the dispatch claim. A separate lock
          // can survive a failed write and strand a scheduled draft forever.
          // If R2 commits but its response is lost, do not dispatch: a later
          // tick will reconcile the publishing draft without repeating an action.
          await this.store.put(`drafts/${d.id}.json`, running, o.etag);
        } catch {
          continue;
        }
        processed++;
        try {
          const a = await this.account(d.accountId);
          if (a.platform === "tiktok") throw new AppError(403, "Publikasi TikTok dinonaktifkan.");
          if (d.executionMethod === "browser") {
            const job = await this.browser.startAction(
              a,
              d,
              await this.media(d.mediaIds),
            );
            const updated = await this.setResult(running, {
              providerId: job.id,
              browserJobId: job.id,
              providerPhase: "browser",
            });
            await this.deferPoll(updated, marker.key, now);
            continue;
          }
          if (a.status !== "connected")
            throw new AppError(409, "Akun perlu koneksi ulang.");
          const media = await this.media(d.mediaIds);
          validateMedia(d, a, media);
          if (d.kind !== "post") {
            await this.platforms.action(a, d);
            await this.setResult(running, {
              status: "published",
              publishedId: d.targetId,
            });
            await this.env.DATA.delete(marker.key);
          } else {
            const prepared = await this.platforms.prepare(a, d, media, (m) =>
              this.mediaUrl(m),
            );
            const updated = await this.setResult(running, {
              providerId: prepared.id,
              providerPhase: prepared.phase,
              providerChildren: prepared.children,
              providerReadyChildren: [],
              updatedAt: new Date().toISOString(),
            });
            await this.deferPoll(updated, marker.key, now);
          }
        } catch (e) {
          await this.handlePublishError(running, e, marker.key);
        }
      } else {
        // Claim each execution revision across overlapping invocations, including different minutes.
        if (
          d.providerId &&
          !(await this.store.claim(`poll-${d.id}-e${d.executionRevision || 0}`))
        ) {
          const lock = await this.store.get<{ claimedAt: string }>(
            `queue/locks/poll-${d.id}-e${d.executionRevision || 0}.lock`,
          );
          if (
            lock &&
            now.getTime() - Date.parse(lock.value.claimedAt) > 180000
          ) {
            await this.setResult(d, {
              status: "uncertain",
              error:
                "Tahap publisher terputus. Periksa platform sebelum mengulang.",
            });
            await this.env.DATA.delete(marker.key);
          }
          continue;
        }
        if (!d.providerId) {
          if (now.getTime() - Date.parse(d.updatedAt) > 120000) {
            await this.setResult(d, {
              status: "uncertain",
              error:
                "Eksekusi terputus sebelum ID platform tersimpan. Periksa platform sebelum membuat draft baru.",
            });
            await this.env.DATA.delete(marker.key);
          }
          continue;
        }
        processed++;
        try {
          const a = await this.account(d.accountId);
          if (a.platform === "tiktok") throw new AppError(403, "Publikasi TikTok dinonaktifkan.");
          if (d.providerPhase === "browser") {
            const job = await this.browser.poll(
              d.browserJobId || d.providerId!,
            );
            if (
              ["awaiting_review", "uncertain", "failed", "confirmed"].includes(
                job.status,
              )
            ) {
              await this.setResult(d, {
                status:
                  job.status === "failed"
                    ? "failed"
                    : job.status === "confirmed"
                      ? "published"
                      : "uncertain",
                browserEvidence: job.evidence,
                error:
                  job.status === "confirmed"
                    ? undefined
                    : job.status === "awaiting_review"
                      ? "Browser melaporkan hasil. Periksa platform dan konfirmasi di dashboard."
                      : "Hasil browser belum pasti. Periksa job sebelum mencoba lagi.",
              });
              await this.env.DATA.delete(marker.key);
            } else await this.deferPoll(d, marker.key, now);
            continue;
          }
          if (d.providerPhase === "children") {
            const result = await this.platforms.advanceCarousel(
              a,
              d,
              await this.media(d.mediaIds),
              (m) => this.mediaUrl(m),
            );
            const updated = await this.setResult(d, {
              providerChildren: result.children,
              providerReadyChildren: result.ready,
              ...(result.parentId
                ? {
                    providerId: result.parentId,
                    providerPhase: "container" as const,
                  }
                : {}),
            });
            await this.deferPoll(updated, marker.key, now);
            continue;
          }
          const p = await this.platforms.poll(a, d);
          if (p.status === "published") {
            await this.setResult(d, {
              status: "published",
              publishedId: p.publishedId,
            });
            await this.env.DATA.delete(marker.key);
          } else if (p.status === "failed") {
            await this.setResult(d, {
              status: "failed",
              error:
                "Platform gagal memproses media. Buat draft baru setelah memperbaiki media.",
            });
            await this.env.DATA.delete(marker.key);
          } else if (p.status === "ready" && d.providerPhase === "container") {
            d = await this.setResult(d, {
              providerPhase: "publish_requested",
            });
            const id = await this.platforms.finish(a, d);
            await this.setResult(d, {
              status: "published",
              publishedId: id,
            });
            await this.env.DATA.delete(marker.key);
          } else if (
            p.status === "ready" &&
            d.providerPhase === "publish_requested"
          ) {
            await this.setResult(d, {
              status: "uncertain",
              error:
                "Publish sudah diminta tetapi hasil belum terkonfirmasi. Periksa Instagram sebelum mengulang.",
            });
            await this.env.DATA.delete(marker.key);
          } else if (now.getTime() - Date.parse(d.approvedAt!) > 48 * 3600000) {
            await this.setResult(d, {
              status: "uncertain",
              error: "Pemrosesan terlalu lama. Periksa platform secara manual.",
            });
            await this.env.DATA.delete(marker.key);
          } else {
            await this.deferPoll(d, marker.key, now);
          }
        } catch (e) {
          await this.handlePublishError(d, e, marker.key, true);
        }
      }
    }
  }
  async deferPoll(d: Draft, marker: string, now: Date) {
    await this.setResult(d, {});
    const next = new Date(now.getTime() + 60000).toISOString();
    const key = scheduleKey(d.id, next);
    await this.store.put(key, { draftId: d.id, at: d.scheduledAt });
    if (key !== marker) await this.env.DATA.delete(marker);
  }
  async setResult(d: Draft, patch: Partial<Draft>) {
    const o = await this.store.require<Draft>(`drafts/${d.id}.json`);
    if (
      o.value.status !== "publishing" ||
      (o.value.executionRevision || 0) !== (d.executionRevision || 0)
    )
      throw new AppError(409, "Status eksekusi telah berubah.", "conflict");
    const updated = {
      ...o.value,
      ...patch,
      executionRevision: (o.value.executionRevision || 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    await this.store.put(`drafts/${d.id}.json`, updated, o.etag);
    if (patch.status)
      await this.store.log(
        `publish.${patch.status}`,
        patch.status === "published" ? "success" : "error",
        { entityId: d.id, accountId: d.accountId },
      );
    return updated;
  }
  async handlePublishError(
    d: Draft,
    error: unknown,
    marker: string,
    poll = false,
  ) {
    if (
      error instanceof AppError &&
      error.status === 409 &&
      error.code === "conflict"
    )
      return;
    if (
      error instanceof AppError &&
      error.code === "browser_busy" &&
      d.executionMethod === "browser" &&
      !d.browserJobId &&
      d.attempts <= 15
    ) {
      const next = new Date(Date.now() + 60000).toISOString();
      await this.setResult(d, {
        status: "scheduled",
        error:
          "Profile browser masih dipakai. Menunggu antrean tanpa mendispatch aksi.",
      });
      await this.store.put(scheduleKey(d.id, next), {
        draftId: d.id,
        at: d.scheduledAt,
      });
      await this.env.DATA.delete(marker);
      return;
    }
    const e =
      error instanceof AppError
        ? error
        : new AppError(500, "Eksekusi terputus; perlu pemeriksaan manual.");
    if (
      e instanceof PlatformError &&
      e.retryable &&
      !e.ambiguous &&
      d.attempts < 4
    ) {
      const next = new Date(Date.now() + 60000 * 2 ** d.attempts).toISOString();
      await this.setResult(d, {
        status: poll ? "publishing" : "scheduled",
        attempts: d.attempts + 1,
        error: e.message,
      });
      await this.store.put(scheduleKey(d.id, next), {
        draftId: d.id,
        at: d.scheduledAt,
      });
      await this.env.DATA.delete(marker);
      return;
    }
    const ambiguous =
      (e instanceof PlatformError && e.ambiguous) ||
      !(error instanceof AppError);
    await this.setResult(d, {
      status: ambiguous ? "uncertain" : "failed",
      error: e.message,
    });
    await this.env.DATA.delete(marker);
  }
  async maintenanceAccounts() {
    const tasks = await this.env.DATA.list({
      prefix: "maintenance-tasks/",
      limit: 2,
    });
    for (const task of tasks.objects) {
      const pending = await this.store.get<{ accountId: string }>(task.key);
      if (!pending) continue;
      const a = await this.account(pending.value.accountId);
      try {
        await this.platforms.refresh(a);
        const stats = await this.stats(a.id, true);
        await this.store.put(
          `stats/${a.id}/${stats.capturedAt.slice(0, 10).replaceAll("-", "/")}.json`,
          stats,
        );
        await this.store.log("snapshot", "success", { accountId: a.id });
      } catch (e) {
        if (e instanceof PlatformError && e.authFailed) {
          const o = await this.store.require<Account>(`accounts/${a.id}.json`);
          await this.store.put(
            `accounts/${a.id}.json`,
            { ...o.value, status: "reconnect" },
            o.etag,
          );
        }
        await this.store.log("maintenance", "error", {
          accountId: a.id,
          detail: "Refresh atau snapshot gagal. Periksa koneksi dan izin akun.",
        });
      }
      await this.env.DATA.delete(task.key);
    }
  }
  async maintenance() {
    const accounts = (await this.store.accounts()).filter(
      (a) => a.platformId !== "browser-only",
    );
    const day = new Date().toISOString().slice(0, 10);
    for (const a of accounts)
      await this.store.create(`maintenance-tasks/${day}_${a.id}.json`, {
        accountId: a.id,
      });
    await this.maintenanceAccounts();
    // Daily cleanup is independent from per-account API calls.

    // Bounded pagination with persisted cursors; do not scan an entire year each day.
    for (const prefix of [
      "logs/",
      "stats/",
      "research/",
      "limits/",
      "queue/locks/",
    ]) {
      const state = await this.store.get<{ cursor?: string }>(
        `maintenance/${prefix.replaceAll("/", "-")}.json`,
      );
      const l = await this.env.DATA.list({
        prefix,
        cursor: state?.value.cursor,
        limit: 100,
      });
      const cutoff = new Date(Date.now() - 365 * 86400000);
      const remove: string[] = [];
      for (const o of l.objects) {
        if ((prefix === "logs/" || prefix === "stats/") && o.uploaded < cutoff)
          remove.push(o.key);
        if (
          prefix === "limits/" &&
          o.uploaded.getTime() < Date.now() - 2 * 86400000
        )
          remove.push(o.key);
        if (prefix === "research/") {
          const r = await this.store.get<{ expiresAt?: string }>(o.key);
          if (r?.value.expiresAt && Date.parse(r.value.expiresAt) < Date.now())
            remove.push(o.key);
        }
        if (
          prefix === "queue/locks/" &&
          o.key.includes("/poll-") &&
          o.uploaded.getTime() < Date.now() - 2 * 86400000
        )
          remove.push(o.key);
      }
      if (remove.length) await this.env.DATA.delete(remove);
      await this.store.put(`maintenance/${prefix.replaceAll("/", "-")}.json`, {
        cursor: l.truncated ? l.cursor : undefined,
      });
    }
  }
}
