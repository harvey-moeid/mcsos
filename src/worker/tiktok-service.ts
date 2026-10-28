import { z } from "zod";
import { Store, AppError } from "./store";
import type { RuntimeEnv } from "./platforms";
import type { Account, Draft, Media } from "../shared/model";
import { safeAccount } from "../shared/model";
import { digest } from "./crypto";
import { canonicalUsername } from "../shared/browser";
import { assertTransition, engagement, metricInput, tiktokAccountInput, tiktokPostUrl, validateTikTokDraft, type MetricSnapshot, type TikTokApproval } from "../shared/tiktok";

export class TikTokService {
  readonly store: Store;
  constructor(readonly env: RuntimeEnv) { this.store = new Store(env.DATA); }
  enabled(flag: "TIKTOK_SESSION_ENABLED" | "TIKTOK_CONTENT_STUDIO_ENABLED" | "TIKTOK_ANALYTICS_ENABLED") {
    if (this.env[flag] !== "true") throw new AppError(503, "Fitur TikTok belum diaktifkan.", "feature_disabled");
  }
  async account(id: string) {
    z.string().regex(/^[\w-]{1,100}$/).parse(id);
    const o = await this.store.require<Account>(`accounts/${id}.json`);
    if (o.value.platform !== "tiktok") throw new AppError(400, "Pilih akun TikTok.");
    return o;
  }
  async createAccount(input: unknown) {
    this.enabled("TIKTOK_CONTENT_STUDIO_ENABLED");
    const p = tiktokAccountInput.parse(input), username = canonicalUsername(p.username);
    return this.store.locked("tiktok-accounts", async () => {
      const accounts = await this.store.accounts();
      if (accounts.filter(a => a.platform === "tiktok").length >= 10) throw new AppError(409, "Maksimal 10 akun TikTok.");
      if (accounts.some(a => a.platform === "tiktok" && a.username.toLowerCase() === username)) throw new AppError(409, "Akun TikTok sudah ada.");
      const a: Account = {
        id: crypto.randomUUID(), platform: "tiktok", platformId: "manual-only", label: p.label,
        username, status: "reconnect", expiresAt: "1970-01-01T00:00:00.000Z", scopes: [],
        groups: p.groups, labels: p.labels, identityRevision: 1,
        tiktok: { mode: "manual", status: "unverified" },
      };
      await this.store.put(`accounts/${a.id}.json`, a);
      await this.store.log("tiktok.account.create", "success", { accountId: a.id });
      return safeAccount(a);
    });
  }
  async updateAccount(id: string, input: unknown) {
    const p = z.object({ label: z.string().trim().min(1).max(80), groups: tiktokAccountInput.shape.groups, labels: tiktokAccountInput.shape.labels }).parse(input);
    const o = await this.account(id);
    await this.store.put(`accounts/${id}.json`, { ...o.value, ...p }, o.etag);
    await this.store.log("tiktok.account.update", "success", { accountId: id });
  }
  async verifyIdentity(id: string, input: unknown) {
    this.enabled("TIKTOK_CONTENT_STUDIO_ENABLED");
    const p = z.object({ username: z.string(), checked_identity: z.literal(true), mode: z.enum(["manual", "connected_browser"]).default("manual") }).parse(input);
    const o = await this.account(id), username = canonicalUsername(p.username);
    if (username !== canonicalUsername(o.value.browser?.expectedUsername || o.value.username)) throw new AppError(409, "Username tidak cocok dengan akun aktif.");
    if (p.mode === "connected_browser") {
      this.enabled("TIKTOK_SESSION_ENABLED");
      if (!o.value.browser?.enabled || !o.value.browser.encryptedProfile) throw new AppError(409, "Hubungkan profile browser dahulu.");
      const profile = await import("./crypto").then(c => c.open<string>(o.value.browser!.encryptedProfile!, this.env.TOKEN_ENCRYPTION_KEY!));
      const lease = await this.store.get<{ active: boolean }>(`browser/leases/${await digest(profile)}.json`);
      if (lease?.value.active) throw new AppError(409, "Tutup sesi login sebelum memverifikasi identitas.");
    }
    const at = new Date().toISOString();
    const a: Account = { ...o.value, identityRevision: (o.value.identityRevision || 0) + 1,
      tiktok: { mode: p.mode, status: "ready", verifiedUsername: username, verifiedAt: at, source: "manual" },
      browser: o.value.browser ? { ...o.value.browser, revision: o.value.browser.revision + 1, status: "unverified" } : undefined,
    };
    await this.store.put(`accounts/${id}.json`, a, o.etag);
    await this.store.log("tiktok.identity.owner_verify", "success", { accountId: id });
    return safeAccount(a);
  }
  identity(a: Account) {
    const t = a.tiktok;
    if (!t || t.status !== "ready" || !t.verifiedAt || Date.now() - Date.parse(t.verifiedAt) > 86400000 || t.verifiedUsername !== canonicalUsername(a.browser?.expectedUsername || a.username))
      throw new AppError(409, "login_required: verifikasi ulang username akun aktif (berlaku 24 jam).");
    return t.verifiedUsername!;
  }
  async disconnect(id: string) {
    const o = await this.account(id);
    if (o.value.browser?.encryptedProfile && this.env.TOKEN_ENCRYPTION_KEY) {
      const { open } = await import("./crypto");
      const profile = await open<string>(o.value.browser.encryptedProfile, this.env.TOKEN_ENCRYPTION_KEY);
      const lease = await this.store.get<{ active: boolean }>(`browser/leases/${await digest(profile)}.json`);
      if (lease?.value.active) throw new AppError(409, "Tutup sesi/job browser sebelum menghapus referensi sesi.");
    }
    const a: Account = { ...o.value, encryptedToken: undefined, scopes: [], status: "reconnect",
      identityRevision: (o.value.identityRevision || 0) + 1,
      tiktok: { status: "disconnected", mode: "manual" },
      browser: { enabled: false, status: "unverified", revision: (o.value.browser?.revision || 0) + 1 },
    };
    await this.store.put(`accounts/${id}.json`, a, o.etag);
    await this.store.log("tiktok.session.disconnect", "success", { accountId: id });
    return { account: safeAccount(a), remoteDeletion: "manual_action_required", notice: "Referensi sesi MCSOS dihapus. Logout dan hapus profile persisten di dashboard provider untuk menghapus cookie remote." };
  }
  async draft(id: string, accountId?: string) {
    z.string().regex(/^[\w-]{1,100}$/).parse(id);
    const o = await this.store.require<Draft>(`drafts/${id}.json`);
    await this.account(o.value.accountId);
    if (accountId && accountId !== o.value.accountId) throw new AppError(403, "Draft bukan milik akun aktif.");
    return o;
  }
  async media(d: Draft) {
    const media: Media[] = [];
    for (const id of d.mediaIds) media.push((await this.store.require<Media>(`media-meta/${id}.json`)).value);
    return media;
  }
  async fingerprints(d: Draft) {
    const media = await this.media(d);
    const fingerprints = [];
    for (const m of media) {
      const object = await this.env.DATA.head(m.key);
      if (!object) throw new AppError(409, "File media tidak tersedia.");
      fingerprints.push({ id: m.id, key: m.key, etag: object.etag, size: m.size, mime: m.mime, width: m.width, height: m.height, duration: m.duration, accountId: m.accountId });
    }
    return { media, mediaFingerprint: await digest(JSON.stringify(fingerprints)), captionFingerprint: await digest(JSON.stringify({ caption: d.caption, notes: d.notes, aiGenerated: d.aiGenerated, privacy: d.privacy, commercial: d.commercial, postType: d.postType })) };
  }
  async saveTransition(o: { value: Draft; etag: string }, status: Draft["status"], patch: Partial<Draft> = {}) {
    assertTransition(o.value.status, status);
    const updated = { ...o.value, ...patch, status, updatedAt: new Date().toISOString() };
    await this.store.put(`drafts/${updated.id}.json`, updated, o.etag);
    await this.store.log(`tiktok.${status}`, status === "failed" ? "error" : "success", { entityId: updated.id, accountId: updated.accountId });
    return updated;
  }
  async requestApproval(id: string, accountId: string, revision: number) {
    this.enabled("TIKTOK_CONTENT_STUDIO_ENABLED");
    const o = await this.draft(id, accountId);
    if (o.value.revision !== revision) throw new AppError(409, "Revisi draft berubah.");
    const a = (await this.account(accountId)).value;
    validateTikTokDraft(o.value, a, await this.media(o.value));
    return this.saveTransition(o, "pending_approval");
  }
  async approve(id: string, accountId: string, revision: number, owner: string, scheduledAt?: string) {
    this.enabled("TIKTOK_CONTENT_STUDIO_ENABLED");
    if (owner !== this.env.OWNER_GITHUB_ID) throw new AppError(403, "Hanya pemilik dapat menyetujui.");
    return this.store.locked("media-references", async () => {
      const o = await this.draft(id, accountId), a = (await this.account(accountId)).value, username = this.identity(a);
      if (o.value.revision !== revision) throw new AppError(409, "Revisi draft berubah.");
      if (scheduledAt && (!Number.isFinite(Date.parse(scheduledAt)) || Date.parse(scheduledAt) < Date.now() - 60000)) throw new AppError(400, "Waktu jadwal tidak valid.");
      const at = new Date().toISOString(), selected = scheduledAt || o.value.scheduledAt;
      if (selected && Date.parse(selected) < Date.now() - 60000) throw new AppError(400, "Jadwal terlewat. Ubah waktu sebelum approval.");
      const { media, mediaFingerprint, captionFingerprint } = await this.fingerprints(o.value);
      validateTikTokDraft(o.value, a, media);
      const approval: TikTokApproval = { accountId, username, identityRevision: a.identityRevision || 0, draftId: id, revision,
        mediaFingerprint, captionFingerprint, method: "manual", scheduledAt: selected || null, actor: owner, at };
      return this.saveTransition(o, "approved", { approval, approvedBy: owner, approvedAt: at, approvedRevision: revision, executionMethod: "manual", scheduledAt: selected });
    });
  }
  async checkApproval(d: Draft) {
    const a = (await this.account(d.accountId)).value, approval = d.approval, username = this.identity(a);
    const { media, mediaFingerprint, captionFingerprint } = await this.fingerprints(d);
    validateTikTokDraft(d, a, media);
    if (!approval || approval.actor !== this.env.OWNER_GITHUB_ID || approval.accountId !== a.id || approval.username !== username || approval.identityRevision !== (a.identityRevision || 0) || approval.draftId !== d.id || approval.revision !== d.revision || d.approvedRevision !== d.revision || approval.method !== "manual" || d.executionMethod !== "manual" || approval.scheduledAt !== (d.scheduledAt || null) || approval.mediaFingerprint !== mediaFingerprint || approval.captionFingerprint !== captionFingerprint)
      throw new AppError(409, "Approval tidak valid. Batalkan dan tinjau ulang revisi, akun, serta media.");
    return a;
  }
  async schedule(id: string, accountId: string) {
    const o = await this.draft(id, accountId); await this.checkApproval(o.value);
    const status = o.value.scheduledAt && Date.parse(o.value.scheduledAt) > Date.now() ? "scheduled" : "ready_for_manual_publish";
    return this.saveTransition(o, status);
  }
  async processDue(cursor?: string) {
    this.enabled("TIKTOK_CONTENT_STUDIO_ENABLED");
    const page = await this.store.list<Draft>("drafts/", cursor, 100);
    let processed = 0;
    for (const d of page.items) {
      if (d.status !== "scheduled" || d.executionMethod !== "manual" || !d.scheduledAt || Date.parse(d.scheduledAt) > Date.now()) continue;
      try {
        const o = await this.draft(d.id); await this.checkApproval(o.value);
        await this.saveTransition(o, "ready_for_manual_publish"); processed++;
      } catch (e) { if (!(e instanceof AppError && e.status === 409)) throw e; }
    }
    return { processed, cursor: page.cursor, mode: "manual_action_required" };
  }
  async handoff(id: string, accountId: string, revision: number, requestId: string) {
    this.enabled("TIKTOK_CONTENT_STUDIO_ENABLED");
    const o = await this.draft(id, accountId);
    if (o.value.revision !== revision) throw new AppError(409, "Revisi draft berubah.");
    const a = await this.checkApproval(o.value);
    if (o.value.status === "awaiting_verification" && o.value.handoffId === requestId) return o.value;
    if (o.value.status !== "ready_for_manual_publish") throw new AppError(409, "Konten belum siap atau handoff sedang menunggu pemeriksaan. Jangan mengirim dua kali.");
    return this.store.locked(`tiktok-handoff-${a.id}`, async () => this.saveTransition(o, "awaiting_verification", { handoffId: requestId, handoffAt: new Date().toISOString() }));
  }
  async confirm(id: string, accountId: string, input: unknown, owner: string) {
    const p = z.object({ revision: z.number().int(), outcome: z.enum(["published", "uncertain", "failed"]), checked_platform: z.literal(true), username: z.string(), url: z.string().max(500).optional(), observed_at: z.string().datetime({ offset: true }) }).parse(input);
    const o = await this.draft(id, accountId);
    if (owner !== this.env.OWNER_GITHUB_ID || o.value.revision !== p.revision || canonicalUsername(p.username) !== o.value.approval?.username) throw new AppError(409, "Konfirmasi tidak cocok dengan approval.");
    if (Date.parse(p.observed_at) > Date.now() + 60000 || Date.parse(p.observed_at) < Date.parse(o.value.handoffAt || o.value.createdAt)) throw new AppError(400, "Waktu observasi tidak valid.");
    if (p.outcome === "published" && !p.url) throw new AppError(400, "URL posting hasil wajib diisi.");
    const publication = p.outcome === "published" ? { url: tiktokPostUrl(p.url!, p.username), username: canonicalUsername(p.username), observedAt: p.observed_at, recordedAt: new Date().toISOString(), actor: owner, source: "manual" as const } : undefined;
    return this.saveTransition(o, p.outcome, { publication, publishedId: publication?.url });
  }
  async reset(id: string, accountId: string, cancel = false) {
    const o = await this.draft(id, accountId);
    return this.saveTransition(o, cancel ? "cancelled" : "draft", { approval: undefined, approvedAt: undefined, approvedBy: undefined, approvedRevision: undefined, executionMethod: undefined, revision: o.value.revision + 1 });
  }
  async recordMetrics(id: string, input: unknown) {
    this.enabled("TIKTOK_ANALYTICS_ENABLED"); await this.account(id);
    const p = metricInput.parse(input);
    if (Date.parse(p.observed_at) > Date.now() + 60000) throw new AppError(400, "Waktu observasi tidak boleh di masa depan.");
    if (p.post_id) { const d = await this.draft(p.post_id, id); if (d.value.status !== "published" || !d.value.publication) throw new AppError(409, "Metrik konten memerlukan publikasi terkonfirmasi."); }
    const m: MetricSnapshot = { id: crypto.randomUUID(), accountId: id, postId: p.post_id, observedAt: p.observed_at, recordedAt: new Date().toISOString(), source: "manual", views: p.views, likes: p.likes, comments: p.comments, shares: p.shares, followers: p.followers };
    await this.store.put(`tiktok/metrics/${id}/${m.observedAt}_${m.id}.json`, m);
    await this.store.log("tiktok.metrics.manual", "success", { accountId: id, entityId: m.id });
    return m;
  }
  async analytics(id: string, cursor?: string) {
    this.enabled("TIKTOK_ANALYTICS_ENABLED"); await this.account(id);
    const page = await this.store.list<MetricSnapshot>(`tiktok/metrics/${id}/`, cursor, 100);
    return { ...page, items: page.items.map(m => ({ ...m, engagementRate: engagement(m) })), notice: "Input manual pemilik; nilai tidak tersedia adalah null. Snapshot akun dan posting tidak dijumlahkan." };
  }
}
