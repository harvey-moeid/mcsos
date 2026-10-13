import type { Account, Activity, Page } from "../shared/model";
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "request_failed",
  ) {
    super(message);
  }
}
export class Store {
  constructor(readonly bucket: R2Bucket) {}
  async get<T>(key: string): Promise<{ value: T; etag: string } | null> {
    const o = await this.bucket.get(key);
    if (!o) return null;
    return { value: await o.json<T>(), etag: o.etag };
  }
  async require<T>(key: string) {
    const o = await this.get<T>(key);
    if (!o) throw new AppError(404, "Data tidak ditemukan.");
    return o;
  }
  async put<T>(key: string, value: T, etag?: string) {
    const o = await this.bucket.put(key, JSON.stringify(value), {
      httpMetadata: { contentType: "application/json" },
      ...(etag ? { onlyIf: { etagMatches: etag } } : {}),
    });
    if (!o)
      throw new AppError(
        409,
        "Data berubah. Muat ulang sebelum mencoba lagi.",
        "conflict",
      );
    return o.etag;
  }
  async create<T>(key: string, value: T) {
    const o = await this.bucket.put(key, JSON.stringify(value), {
      onlyIf: { etagDoesNotMatch: "*" },
      httpMetadata: { contentType: "application/json" },
    });
    return o !== null;
  }
  async list<T>(
    prefix: string,
    cursor?: string,
    limit = 100,
  ): Promise<Page<T>> {
    const l = await this.bucket.list({ prefix, cursor, limit });
    const items: T[] = [];
    for (const obj of l.objects) {
      const value = await this.get<T>(obj.key);
      if (value) items.push(value.value);
    }
    return { items, cursor: l.truncated ? l.cursor : undefined };
  }
  async accounts() {
    return (await this.list<Account>("accounts/", undefined, 25)).items;
  }
  async log(
    action: string,
    status: Activity["status"],
    extra: Pick<Activity, "accountId" | "entityId" | "detail"> = {},
  ) {
    const at = new Date().toISOString(),
      id = crypto.randomUUID();
    await this.put(
      `logs/${at.slice(0, 10).replaceAll("-", "/")}/${at}_${id}.json`,
      { id, at, action, status, ...extra } satisfies Activity,
    );
  }
  async claim(id: string) {
    return this.create(`queue/locks/${id}.lock`, {
      claimedAt: new Date().toISOString(),
    });
  }
}
