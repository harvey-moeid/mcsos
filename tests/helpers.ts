import type { Draft, Account, Media } from "../src/shared/model";
import type { RuntimeEnv } from "../src/worker/platforms";
export class MemoryBucket {
  objects = new Map<
    string,
    { value: string | Uint8Array; etag: string; uploaded: Date; mime?: string }
  >();
  async get(key: string) {
    const o = this.objects.get(key);
    if (!o) return null;
    const text =
      typeof o.value === "string" ? o.value : new TextDecoder().decode(o.value);
    return {
      key,
      etag: o.etag,
      uploaded: o.uploaded,
      size:
        typeof o.value === "string"
          ? new TextEncoder().encode(o.value).length
          : o.value.byteLength,
      json: async () => JSON.parse(text),
      arrayBuffer: async () =>
        typeof o.value === "string"
          ? new TextEncoder().encode(o.value).buffer
          : o.value.slice().buffer,
    };
  }
  async head(key: string) {
    return this.get(key);
  }
  async put(
    key: string,
    value: string | Uint8Array,
    options?: { onlyIf?: { etagMatches?: string; etagDoesNotMatch?: string } },
  ) {
    const current = this.objects.get(key);
    if (options?.onlyIf?.etagDoesNotMatch === "*" && current) return null;
    if (
      options?.onlyIf?.etagMatches &&
      current?.etag !== options.onlyIf.etagMatches
    )
      return null;
    const o = { value, etag: crypto.randomUUID(), uploaded: new Date() };
    this.objects.set(key, o);
    return { key, ...o };
  }
  async delete(keys: string | string[]) {
    for (const k of Array.isArray(keys) ? keys : [keys]) this.objects.delete(k);
  }
  async list(options?: { prefix?: string; limit?: number; cursor?: string }) {
    const all = [...this.objects]
        .filter(([key]) => key.startsWith(options?.prefix || ""))
        .sort(([a], [b]) => a.localeCompare(b)),
      start = Number(options?.cursor || 0),
      n = options?.limit || 1000;
    const objects = all
      .slice(start, start + n)
      .map(([key, v]) => ({ key, etag: v.etag, uploaded: v.uploaded }));
    return {
      objects,
      truncated: start + n < all.length,
      cursor: String(start + n),
    };
  }
  async createMultipartUpload() {
    throw new Error("Not used by this test bucket.");
  }
  resumeMultipartUpload() {
    throw new Error("Not used by this test bucket.");
  }
  binding() {
    return Object.assign({} as R2Bucket, {
      get: this.get.bind(this),
      head: this.head.bind(this),
      put: this.put.bind(this),
      delete: this.delete.bind(this),
      list: this.list.bind(this),
    });
  }
}
export function environment(bucket = new MemoryBucket()): RuntimeEnv {
  return {
    DATA: bucket.binding(),
    PUBLIC_ORIGIN: "https://social.example",
    OWNER_GITHUB_ID: "42",
    META_API_VERSION: "v25.0",
    SCRAPING_ENABLED: "false",
    R2_BUCKET_NAME: "test",
    ENVIRONMENT: "test",
    TOKEN_ENCRYPTION_KEY: btoa(
      String.fromCharCode(...new Uint8Array(32).fill(7)),
    ),
    SESSION_SECRET: "test-session-secret-with-at-least-32-bytes",
  } as unknown as RuntimeEnv;
}
export const account: Account = {
  id: "account-1",
  platform: "instagram",
  platformId: "ig-1",
  label: "Test",
  username: "test",
  status: "connected",
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
  scopes: [],
};
export const media: Media = {
  id: "media-1",
  key: "media/media-1/test.jpg",
  filename: "test.jpg",
  mime: "image/jpeg",
  size: 1024,
  width: 1080,
  height: 1350,
  verified: true,
  createdAt: new Date().toISOString(),
};
export function approvedDraft(patch: Partial<Draft> = {}): Draft {
  const at = new Date().toISOString();
  return {
    id: "draft-1",
    accountId: account.id,
    kind: "post",
    caption: "Hello",
    mediaIds: [media.id],
    postType: "photo",
    commercial: "none",
    status: "scheduled",
    createdAt: at,
    updatedAt: at,
    scheduledAt: at,
    revision: 1,
    approvedRevision: 1,
    approvedBy: "42",
    approvedAt: at,
    attempts: 0,
    ...patch,
  };
}
