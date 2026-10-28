import { z } from "zod";
import type { Account, Draft, Media } from "./model";
export const identifier = z.string().regex(/^[\w-]{1,100}$/);
export const tiktokAccountInput = z.object({
  username: z.string().regex(/^@?[A-Za-z0-9_.]{1,24}$/),
  label: z.string().trim().min(1).max(80),
  groups: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  labels: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  owned_or_managed: z.literal(true),
});
export type TikTokIdentity = {
  status:
    "ready" | "unverified" | "login_required" | "blocked" | "disconnected";
  verifiedUsername?: string;
  verifiedAt?: string;
  source?: "manual";
  mode: "manual" | "connected_browser";
};
export interface TikTokApproval {
  accountId: string;
  username: string;
  identityRevision: number;
  draftId: string;
  revision: number;
  mediaFingerprint: string;
  captionFingerprint: string;
  method: "manual";
  scheduledAt: string | null;
  actor: string;
  at: string;
}
export interface PublicationEvidence {
  url: string;
  username: string;
  observedAt: string;
  recordedAt: string;
  actor: string;
  source: "manual";
}
export const metricInput = z
  .object({
    observed_at: z.string().datetime({ offset: true }),
    post_id: identifier.optional(),
    views: z.number().int().nonnegative().nullable().default(null),
    likes: z.number().int().nonnegative().nullable().default(null),
    comments: z.number().int().nonnegative().nullable().default(null),
    shares: z.number().int().nonnegative().nullable().default(null),
    followers: z.number().int().nonnegative().nullable().default(null),
  })
  .strict();
export type MetricSnapshot = Omit<
  z.infer<typeof metricInput>,
  "observed_at" | "post_id"
> & {
  id: string;
  accountId: string;
  postId?: string;
  observedAt: string;
  recordedAt: string;
  source:
    "official_api" | "permitted_browser_observation" | "manual" | "internal";
};
export function engagement(
  m: Pick<MetricSnapshot, "views" | "likes" | "comments" | "shares">,
) {
  return m.views !== null &&
    m.views > 0 &&
    m.likes !== null &&
    m.comments !== null &&
    m.shares !== null
    ? ((m.likes + m.comments + m.shares) / m.views) * 100
    : null;
}
export const transitions = {
  draft: ["pending_approval", "approved", "cancelled"],
  pending_approval: ["draft", "approved", "cancelled"],
  approved: ["draft", "scheduled", "ready_for_manual_publish", "cancelled"],
  scheduled: ["draft", "ready_for_manual_publish", "cancelled"],
  ready_for_manual_publish: ["draft", "awaiting_verification", "cancelled"],
  awaiting_verification: ["published", "uncertain", "failed"],
  uncertain: ["published", "failed"],
  failed: ["draft"],
  cancelled: ["draft"],
  rejected: ["draft", "approved"],
  publishing: ["awaiting_verification", "uncertain", "failed"],
  published: [],
  unsupported: ["draft"],
} satisfies Record<Draft["status"], readonly Draft["status"][]>;
export function assertTransition(from: Draft["status"], to: Draft["status"]) {
  if (!(transitions[from] as readonly string[]).includes(to))
    throw new Error("Perubahan status tidak diizinkan.");
}
export function tiktokPostUrl(value: string, username: string) {
  const u = new URL(value);
  if (
    u.protocol !== "https:" ||
    !["www.tiktok.com", "tiktok.com"].includes(u.hostname) ||
    u.port ||
    u.username ||
    u.password
  )
    throw new Error("Gunakan URL posting HTTPS TikTok.");
  const match = u.pathname.match(
    /^\/@([A-Za-z0-9_.]+)\/(video|photo)\/(\d+)\/?$/,
  );
  if (
    !match ||
    match[1].toLowerCase() !== username.replace(/^@/, "").toLowerCase()
  )
    throw new Error("URL posting harus cocok dengan akun yang disetujui.");
  return `https://www.tiktok.com${u.pathname.replace(/\/$/, "")}`;
}
export function validateTikTokDraft(d: Draft, a: Account, media: Media[]) {
  if (d.kind !== "post" || d.postType === "reel")
    throw new Error(
      "TikTok hanya mendukung draft foto/video dan handoff manual.",
    );
  if (
    d.mediaIds.length !== media.length ||
    !media.length ||
    new Set(d.mediaIds).size !== media.length
  )
    throw new Error("Pilih media yang sudah divalidasi.");
  if (d.postType === "carousel" ? media.length < 2 : media.length !== 1)
    throw new Error("Jumlah media tidak sesuai jenis konten.");
  for (const m of media) {
    if (
      !m.verified ||
      m.width <= 0 ||
      m.height <= 0 ||
      (m.accountId && m.accountId !== a.id)
    )
      throw new Error("Media belum valid atau milik akun berbeda.");
    if (
      ![
        "image/jpeg",
        "image/webp",
        "image/png",
        "video/mp4",
        "video/quicktime",
      ].includes(m.mime)
    )
      throw new Error("Format media tidak didukung.");
    if ((d.postType === "video") !== m.mime.startsWith("video/"))
      throw new Error("Jenis posting tidak sesuai media. Carousel hanya foto.");
    if (
      m.mime.startsWith("video/") &&
      (!m.duration || m.duration > 600 || m.duration < 3 || m.size > 1024 ** 3)
    )
      throw new Error(
        "Video harus 3–600 detik dan maksimal 1 GB untuk persiapan ini.",
      );
    if (m.mime.startsWith("image/") && m.size > 20 * 1024 ** 2)
      throw new Error("Gambar maksimal 20 MB.");
  }
}
export const aiInput = z.object({
  account_id: identifier,
  task: z.enum([
    "script",
    "hook",
    "caption",
    "hashtags",
    "ideas",
    "repurpose",
    "calendar",
    "variations",
    "cta",
    "recommendations",
  ]),
  language: z.enum(["id", "en"]).default("id"),
  brief: z.string().trim().min(3).max(6000),
});
export const aiOutput = z
  .object({
    items: z
      .array(
        z
          .object({
            title: z.string().max(200),
            text: z.string().min(1).max(6000),
            hashtags: z
              .array(z.string().regex(/^#[\p{L}\p{N}_]{1,100}$/u))
              .max(15),
            day: z.number().int().min(1).max(31).nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(10),
    notice: z.string().max(500),
  })
  .strict();
export type AIOutput = z.infer<typeof aiOutput>;
