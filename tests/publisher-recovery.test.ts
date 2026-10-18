import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SocialService } from "../src/worker/service";
import { seal } from "../src/worker/crypto";
import { scheduleKey, type Draft } from "../src/shared/model";
import {
  MemoryBucket,
  environment,
  account,
  media,
  approvedDraft,
} from "./helpers";

let bucket: MemoryBucket, service: SocialService;
beforeEach(async () => {
  bucket = new MemoryBucket();
  const env = environment(bucket);
  service = new SocialService(env);
  await service.store.put(`accounts/${account.id}.json`, {
    ...account,
    encryptedToken: await seal(
      { accessToken: "test-platform-token", expiresAt: account.expiresAt },
      env.TOKEN_ENCRYPTION_KEY!,
    ),
  });
  await service.store.put(`media-meta/${media.id}.json`, media);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function enqueue(patch: Partial<Draft> = {}) {
  const d = approvedDraft({
    scheduledAt: new Date(Date.now() - 60_000).toISOString(),
    ...patch,
  });
  await service.store.put(`drafts/${d.id}.json`, d);
  await service.store.put(scheduleKey(d.id, d.scheduledAt!), {
    draftId: d.id,
    at: d.scheduledAt,
  });
  return d;
}
async function current(id = "draft-1") {
  return (await service.store.require<Draft>(`drafts/${id}.json`)).value;
}

describe("dispatch recovery and cancellation", () => {
  it("recovers legacy pre-dispatch locks without blocking later items or duplicating dispatch", async () => {
    for (let i = 0; i < 6; i++) {
      const d = await enqueue({ id: `draft-${i}` });
      await service.store.claim(`${d.id}-r${d.revision}-a${d.attempts}`);
    }
    const prepare = vi.spyOn(service.platforms, "prepare").mockResolvedValue({
      id: "container-1",
      phase: "container",
    });
    await Promise.all([service.publishTick(), service.publishTick()]);
    await service.publishTick();
    expect(prepare).toHaveBeenCalledTimes(6);
    for (let i = 0; i < 6; i++)
      expect((await current(`draft-${i}`)).status).toBe("publishing");
  });

  it("failed status writes do not exhaust the dispatch budget or strand drafts", async () => {
    for (let i = 0; i < 6; i++) await enqueue({ id: `draft-${i}` });
    const original = service.store.put.bind(service.store);
    const put = vi
      .spyOn(service.store, "put")
      .mockImplementation(async (key, value, etag) => {
        if (
          /^drafts\/draft-[0-4]\.json$/.test(key) &&
          (value as Draft).status === "publishing"
        )
          throw new Error("R2 temporarily unavailable");
        return original(key, value, etag);
      });
    const prepare = vi.spyOn(service.platforms, "prepare").mockResolvedValue({
      id: "container-1",
      phase: "container",
    });
    await service.publishTick();
    expect(prepare).toHaveBeenCalledTimes(1);
    expect((await current("draft-5")).status).toBe("publishing");
    expect((await current("draft-0")).status).toBe("scheduled");
    put.mockRestore();
    await service.publishTick();
    expect(prepare).toHaveBeenCalledTimes(6);
    expect((await current("draft-0")).status).toBe("publishing");
  });

  it("does not dispatch when the status write committed but its acknowledgement was lost", async () => {
    await enqueue();
    const original = service.store.put.bind(service.store);
    const put = vi
      .spyOn(service.store, "put")
      .mockImplementation(async (key, value, etag) => {
        const result = await original(key, value, etag);
        if (
          key.startsWith("drafts/") &&
          (value as Draft).status === "publishing"
        )
          throw new Error("R2 acknowledgement lost");
        return result;
      });
    const prepare = vi.spyOn(service.platforms, "prepare");
    await service.publishTick();
    put.mockRestore();
    await service.publishTick(new Date(Date.now() + 180_000));
    expect(prepare).not.toHaveBeenCalled();
    expect((await current()).status).toBe("uncertain");
  });

  it("allows cancellation of a scheduled draft with a legacy orphan lock", async () => {
    const d = await enqueue();
    await service.store.claim(`${d.id}-r${d.revision}-a${d.attempts}`);
    await service.cancel(d.id);
    const prepare = vi.spyOn(service.platforms, "prepare");
    await service.publishTick();
    expect(prepare).not.toHaveBeenCalled();
    expect((await current()).status).toBe("draft");
    expect((await current()).approvedRevision).toBeUndefined();
  });

  it("does not dispatch if cancellation wins after the publisher reads the draft", async () => {
    const d = await enqueue();
    const original = service.store.put.bind(service.store);
    vi.spyOn(service.store, "put").mockImplementation(
      async (key, value, etag) => {
        if (
          key === `drafts/${d.id}.json` &&
          (value as Draft).status === "publishing"
        )
          await service.cancel(d.id);
        return original(key, value, etag);
      },
    );
    const prepare = vi.spyOn(service.platforms, "prepare");
    await service.publishTick();
    expect(prepare).not.toHaveBeenCalled();
    expect((await current()).status).toBe("draft");
  });

  it("rejects a stale cancellation if dispatch wins after cancellation reads the draft", async () => {
    const d = await enqueue();
    const original = service.store.put.bind(service.store);
    vi.spyOn(service.store, "put").mockImplementation(
      async (key, value, etag) => {
        if (
          key === `drafts/${d.id}.json` &&
          (value as Draft).status === "draft"
        )
          await service.publishTick();
        return original(key, value, etag);
      },
    );
    const prepare = vi.spyOn(service.platforms, "prepare").mockResolvedValue({
      id: "container-1",
      phase: "container",
    });
    await expect(service.cancel(d.id)).rejects.toThrow("Data berubah");
    expect(prepare).toHaveBeenCalledOnce();
    expect((await current()).status).toBe("publishing");
    expect(
      (await bucket.list({ prefix: "queue/scheduled/" })).objects,
    ).toHaveLength(1);
  });
});

describe("ambiguous platform responses", () => {
  const brokenResponses: [string, () => Response][] = [
    ["truncated JSON", () => new Response('{"id":', { status: 200 })],
    ["empty body", () => new Response(null, { status: 200 })],
    [
      "oversized body",
      () => new Response("{}", { headers: { "content-length": "2000001" } }),
    ],
    ["non-object JSON", () => Response.json(null)],
    ["JSON array", () => Response.json([])],
    ["missing action ID", () => Response.json({})],
    [
      "gateway HTML",
      () => new Response("<html>Bad gateway</html>", { status: 502 }),
    ],
    [
      "interrupted stream",
      () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new Error("connection reset"));
            },
          }),
        ),
    ],
  ];
  it.each(brokenResponses)(
    "holds a comment reply with %s as uncertain without retrying",
    async (_, response) => {
      await enqueue({
        kind: "comment_reply",
        targetId: "comment-123",
        mediaIds: [],
      });
      const fetch = vi.fn(async () => response());
      vi.stubGlobal("fetch", fetch);
      await service.publishTick();
      await service.publishTick(new Date(Date.now() + 600_000));
      expect(fetch).toHaveBeenCalledOnce();
      expect((await current()).status).toBe("uncertain");
      expect(
        (await bucket.list({ prefix: "queue/scheduled/" })).objects,
      ).toHaveLength(0);
    },
  );

  it("retries an unreadable polling response without repeating a public action", async () => {
    await enqueue({
      status: "publishing",
      providerId: "container-1",
      providerPhase: "container",
      executionRevision: 1,
    });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("truncated-json"))
      .mockResolvedValueOnce(Response.json({ status_code: "IN_PROGRESS" }));
    vi.stubGlobal("fetch", fetch);
    await service.publishTick();
    expect((await current()).status).toBe("publishing");
    await service.publishTick(new Date(Date.now() + 600_000));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(
      fetch.mock.calls.every(([, options]) => options.method === "GET"),
    ).toBe(true);
    expect((await current()).status).toBe("publishing");
  });

  it.each([
    ["malformed body", () => new Response("truncated-json")],
    ["missing ID", () => Response.json({})],
  ] as [string, () => Response][])(
    "records %s from media_publish using the latest execution revision",
    async (_, response) => {
      await enqueue({
        status: "publishing",
        providerId: "container-1",
        providerPhase: "container",
        executionRevision: 1,
      });
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(Response.json({ status_code: "FINISHED" }))
        .mockImplementationOnce(async () => response());
      vi.stubGlobal("fetch", fetch);
      await service.publishTick();
      await service.publishTick(new Date(Date.now() + 600_000));
      expect(fetch).toHaveBeenCalledTimes(2);
      expect((await current()).status).toBe("uncertain");
      expect((await current()).providerPhase).toBe("publish_requested");
      expect((await current()).publishedId).toBeUndefined();
    },
  );

  it("does not persist a fabricated provider ID after a successful response missing its ID", async () => {
    await enqueue();
    const fetch = vi.fn(async () => Response.json({}));
    vi.stubGlobal("fetch", fetch);
    await service.publishTick();
    await service.publishTick(new Date(Date.now() + 600_000));
    expect(fetch).toHaveBeenCalledOnce();
    expect((await current()).status).toBe("uncertain");
    expect((await current()).providerId).toBeUndefined();
  });

  it.each(["hide", "delete"] as const)(
    "requires explicit confirmation of comment %s",
    async (moderation) => {
      await enqueue({
        kind: "comment_moderation",
        targetId: "comment-123",
        mediaIds: [],
        moderation,
      });
      const fetch = vi.fn(async () => Response.json({}));
      vi.stubGlobal("fetch", fetch);
      await service.publishTick();
      await service.publishTick(new Date(Date.now() + 600_000));
      expect(fetch).toHaveBeenCalledOnce();
      expect((await current()).status).toBe("uncertain");
    },
  );

  it.each([
    ["comment_reply", { id: "reply-123" }],
    ["comment_moderation", { success: true }],
  ] as const)("accepts a valid %s confirmation", async (kind, confirmation) => {
    await enqueue({
      kind,
      targetId: "comment-123",
      mediaIds: [],
      moderation: "hide",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(confirmation)),
    );
    await service.publishTick();
    expect((await current()).status).toBe("published");
  });

  it.each([true, false])(
    "checks the DM confirmation after verifying a recent inbound message (valid=%s)",
    async (valid) => {
      await enqueue({
        kind: "dm_reply",
        targetId: "conversation-1",
        mediaIds: [],
      });
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({
            participants: {
              data: [{ id: account.platformId }, { id: "recipient-1" }],
            },
            messages: {
              data: [
                {
                  from: { id: "recipient-1" },
                  created_time: new Date().toISOString(),
                },
              ],
            },
          }),
        )
        .mockResolvedValueOnce(
          Response.json(valid ? { message_id: "mid.$opaque:aWdfZAG0==" } : {}),
        );
      vi.stubGlobal("fetch", fetch);
      await service.publishTick();
      await service.publishTick(new Date(Date.now() + 600_000));
      expect(fetch).toHaveBeenCalledTimes(2);
      expect((await current()).status).toBe(valid ? "published" : "uncertain");
    },
  );
});
