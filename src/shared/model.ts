import { z } from "zod";
import {
  browserTargetSchema,
  type BrowserBinding,
  type BrowserTarget,
  type BrowserEvidence,
  type ExecutionMethod,
} from "./browser";
export const platformSchema = z.enum(["instagram", "tiktok"]);
export type Platform = z.infer<typeof platformSchema>;
export const kindSchema = z.enum([
  "post",
  "comment_reply",
  "comment_moderation",
  "dm_reply",
]);
export const statusSchema = z.enum([
  "draft",
  "rejected",
  "scheduled",
  "publishing",
  "published",
  "failed",
  "uncertain",
]);
export type DraftStatus = z.infer<typeof statusSchema>;
export interface Account {
  id: string;
  platform: Platform;
  label: string;
  username: string;
  platformId: string;
  status: "connected" | "reconnect";
  expiresAt: string;
  scopes: string[];
  encryptedToken?: string;
  loginMode?: "instagram" | "facebook";
  pageId?: string;
  demo?: boolean;
  avatar?: string;
  browser?: BrowserBinding;
}
export interface Tokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
  refreshExpiresAt?: string;
  userAccessToken?: string;
}
export interface Media {
  id: string;
  key: string;
  filename: string;
  mime: string;
  size: number;
  width: number;
  height: number;
  duration?: number;
  createdAt: string;
  verified: boolean;
  previewUrl?: string;
}
export const draftInput = z.object({
  account_id: z.string().min(1),
  kind: kindSchema.default("post"),
  caption: z.string().max(2200).default(""),
  media_ids: z.array(z.string()).max(10).default([]),
  post_type: z.enum(["photo", "video", "reel", "carousel"]).default("photo"),
  scheduled_at: z.string().datetime({ offset: true }).optional(),
  target_id: z
    .string()
    .regex(/^[\w-]+$/)
    .optional(),
  moderation: z.enum(["hide", "delete"]).optional(),
  privacy: z
    .enum([
      "PUBLIC_TO_EVERYONE",
      "MUTUAL_FOLLOW_FRIENDS",
      "FOLLOWER_OF_CREATOR",
      "SELF_ONLY",
    ])
    .optional(),
  disable_comment: z.boolean().optional(),
  disable_duet: z.boolean().optional(),
  disable_stitch: z.boolean().optional(),
  browser_target: browserTargetSchema.optional(),
  commercial: z.enum(["none", "own_brand", "paid_partnership"]).default("none"),
});
export type DraftInput = z.infer<typeof draftInput>;
export interface Draft {
  id: string;
  accountId: string;
  kind: z.infer<typeof kindSchema>;
  caption: string;
  mediaIds: string[];
  postType: DraftInput["post_type"];
  scheduledAt?: string;
  targetId?: string;
  browserTarget?: BrowserTarget;
  executionMethod?: ExecutionMethod;
  approvedBrowserBinding?: number;
  browserJobId?: string;
  browserEvidence?: BrowserEvidence;
  moderation?: "hide" | "delete";
  privacy?: DraftInput["privacy"];
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
  commercial: DraftInput["commercial"];
  status: DraftStatus;
  createdAt: string;
  updatedAt: string;
  revision: number;
  approvedBy?: string;
  approvedAt?: string;
  approvedRevision?: number;
  crosspostId?: string;
  rejectionNote?: string;
  attempts: number;
  executionRevision?: number;
  providerId?: string;
  providerPhase?:
    "container" | "publish_requested" | "processing" | "children" | "browser";
  providerChildren?: string[];
  providerReadyChildren?: string[];
  publishedId?: string;
  error?: string;
}
export interface Stats {
  accountId: string;
  capturedAt: string;
  followers: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  reach?: number;
  source: "official" | "demo" | "browser";
}
export interface Post {
  id: string;
  accountId: string;
  caption: string;
  createdAt: string;
  type: string;
  url?: string;
  thumbnail?: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  source?: "official" | "browser" | "demo";
}
export interface Activity {
  id: string;
  at: string;
  accountId?: string;
  action: string;
  status: "success" | "error" | "pending";
  entityId?: string;
  detail?: string;
}
export interface Idea {
  id: string;
  accountId: string;
  title: string;
  notes: string;
  proposedAt?: string;
  status: "idea" | "draft";
  draftId?: string;
  createdAt: string;
}
export interface Page<T> {
  items: T[];
  cursor?: string;
}
export interface Workspace {
  accounts: Account[];
  drafts: Draft[];
  media: Media[];
  stats: Stats[];
  posts: Post[];
  logs: Activity[];
  ideas: Idea[];
  demo: boolean;
  csrf?: string;
  owner?: string;
  cursors?: Partial<
    Record<"drafts" | "media" | "posts" | "logs" | "ideas", string>
  >;
}
export function safeAccount(a: Account): Omit<Account, "encryptedToken"> {
  const { encryptedToken: _, ...rest } = a;
  return {
    ...rest,
    browser: a.browser
      ? {
          enabled: a.browser.enabled,
          expectedUsername: a.browser.expectedUsername,
          status: a.browser.status,
          revision: a.browser.revision,
          verifiedAt: a.browser.verifiedAt,
        }
      : undefined,
  };
}
export function scheduleKey(draftId: string, at: string) {
  return `queue/scheduled/${new Date(at).toISOString().slice(0, 16).replace(/[-:T]/g, "")}_${draftId}.json`;
}
export function assertEditable(d: Draft) {
  if (!["draft", "rejected"].includes(d.status))
    throw new Error(
      "Draft terkunci. Batalkan jadwal dari dashboard sebelum mengedit.",
    );
}
export function assertApproved(d: Draft) {
  if (!d.approvedBy || !d.approvedAt || d.approvedRevision !== d.revision)
    throw new Error("Persetujuan tidak valid untuk revisi ini.");
}
export function validateMedia(
  d: Draft,
  a: Account,
  media: Media[],
  maxDuration = 600,
) {
  if (d.kind !== "post") {
    if (!d.targetId) throw new Error("Target komentar/percakapan wajib diisi.");
    if (d.kind === "dm_reply" && d.caption.length > 1000)
      throw new Error("Balasan DM maksimal 1000 karakter.");
    if (d.kind !== "comment_moderation" && !d.caption.trim())
      throw new Error("Balasan tidak boleh kosong.");
    return;
  }
  if (!media.length || media.length !== d.mediaIds.length)
    throw new Error("Pilih media yang sudah selesai diupload.");
  if (
    d.postType === "carousel"
      ? media.length < 2 || media.length > 10
      : media.length !== 1
  )
    throw new Error("Jumlah media tidak sesuai jenis posting.");
  for (const m of media) {
    if (!m.verified || m.width <= 0 || m.height <= 0)
      throw new Error("Media belum divalidasi.");
    if (m.mime.startsWith("image/")) {
      if (m.mime !== "image/jpeg")
        throw new Error("Foto harus JPEG; tidak ada transcoding otomatis.");
      if (["video", "reel"].includes(d.postType))
        throw new Error("Jenis posting memerlukan video.");
      if (m.size > 8 * 1024 * 1024) throw new Error("Foto maksimal 8 MB.");
      const r = m.width / m.height;
      if (a.platform === "instagram" && (r < 0.8 || r > 1.91))
        throw new Error("Rasio foto Instagram harus antara 4:5 dan 1.91:1.");
    } else {
      if (!["video/mp4", "video/quicktime"].includes(m.mime))
        throw new Error("Video harus MP4 atau MOV.");
      if (d.postType === "photo")
        throw new Error("Jenis foto tidak menerima video.");
      if (!m.duration || m.duration < 3 || m.duration > maxDuration)
        throw new Error(`Durasi video harus 3–${maxDuration} detik.`);
      if (m.size > 1024 * 1024 * 1024)
        throw new Error("Video maksimal 1 GB untuk konfigurasi ini.");
      if (m.width < 320 || m.height < 320)
        throw new Error("Resolusi video minimal 320px.");
    }
  }
}
