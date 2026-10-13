import { z } from "zod";
import type { Platform } from "./model";
export const executionMethodSchema = z.enum(["api", "browser"]);
export type ExecutionMethod = z.infer<typeof executionMethodSchema>;
export interface BrowserBinding {
  expectedUsername?: string;
  enabled: boolean;
  status: "unverified" | "ready" | "login_required" | "blocked";
  revision: number;
  encryptedProfile?: string;
  verifiedAt?: string;
  lastProbeId?: string;
}
export interface BrowserEvidence {
  outcome: string;
  url?: string;
  observedUsername?: string;
}
export const browserTargetSchema = z.object({
  url: z.string().url().max(500),
  author: z.string().max(100).optional(),
  text: z.string().max(2000).optional(),
  recipient: z.string().max(100).optional(),
});
export type BrowserTarget = z.infer<typeof browserTargetSchema>;
export const browserReadSchema = z.object({
  account_id: z.string().regex(/^[\w-]+$/),
  kind: z.enum([
    "stats",
    "posts",
    "comments",
    "conversations",
    "conversation",
    "research",
  ]),
  target_url: z.string().url().max(500).optional(),
  hashtag: z
    .string()
    .regex(/^[\p{L}\p{N}_]{1,100}$/u)
    .optional(),
  username: z
    .string()
    .regex(/^[\w.]{1,40}$/)
    .optional(),
});
export type BrowserReadInput = z.infer<typeof browserReadSchema>;
export interface BrowserJob {
  id: string;
  accountId: string;
  type: "probe" | "read" | "action";
  readKind?: BrowserReadInput["kind"];
  draftId?: string;
  draftRevision?: number;
  bindingRevision: number;
  profileHash: string;
  encryptedPayload: string;
  intentHash: string;
  taskHash?: string;
  status:
    | "dispatching"
    | "running"
    | "completed"
    | "awaiting_review"
    | "failed"
    | "uncertain"
    | "confirmed";
  createdAt: string;
  updatedAt: string;
  runId?: string;
  sessionId?: string;
  remoteStatus?: string;
  result?: unknown;
  evidence?: BrowserEvidence;
  detailCode?: string;
  cleanupPending?: boolean;
  event?: string;
  pollAfter?: string;
}
export interface BrowserLogin {
  id: string;
  accountId: string;
  bindingRevision: number;
  profileHash: string;
  status: "opening" | "active" | "stopped" | "uncertain";
  browserId?: string;
  encryptedLiveUrl?: string;
  createdAt: string;
  expiresAt?: string;
}
export const usernameSchema = z.string().regex(/^[A-Za-z0-9_.]{1,40}$/);
export function canonicalUsername(value: string) {
  return usernameSchema.parse(value.replace(/^@/, "")).toLowerCase();
}
export function platformHome(platform: Platform) {
  return platform === "instagram"
    ? "https://www.instagram.com/"
    : "https://www.tiktok.com/";
}
export function safePlatformUrl(value: string, platform: Platform) {
  const u = new URL(value);
  const host = platform === "instagram" ? "instagram.com" : "tiktok.com";
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.port ||
    (u.hostname !== host && u.hostname !== `www.${host}`)
  )
    throw new Error("URL harus berada pada domain platform yang dipilih.");
  u.search = "";
  u.hash = "";
  return u.toString();
}
export function validateBrowserTarget(
  target: BrowserTarget,
  platform: Platform,
  kind: string,
) {
  const url = safePlatformUrl(target.url, platform),
    u = new URL(url);
  if (kind === "dm_reply") {
    if (
      platform !== "instagram" ||
      !/^\/direct\/t\/[\w-]+\/?$/.test(u.pathname) ||
      !target.recipient
    )
      throw new Error(
        "DM browser memerlukan thread Instagram dan username penerima.",
      );
    canonicalUsername(target.recipient);
  } else {
    if (
      !(
        platform === "instagram"
          ? /^\/(p|reel)\/[\w-]+\/?$/
          : /^\/@[\w.]+\/video\/\d+\/?$/
      ).test(u.pathname)
    )
      throw new Error("Target harus URL posting yang tepat.");
    if (!target.author || !target.text?.trim())
      throw new Error(
        "Target komentar memerlukan author dan teks asli untuk pencocokan tepat.",
      );
    canonicalUsername(target.author);
  }
  return { ...target, url };
}
export function safeBrowserJob(j: BrowserJob) {
  return {
    id: j.id,
    accountId: j.accountId,
    type: j.type,
    readKind: j.readKind,
    draftId: j.draftId,
    status: j.status,
    createdAt: j.createdAt,
    updatedAt: j.updatedAt,
    remoteStatus: j.remoteStatus,
    evidence: j.evidence,
    detailCode: j.detailCode,
    cleanupPending: j.cleanupPending,
  };
}
