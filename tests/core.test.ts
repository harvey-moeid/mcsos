import { beforeEach, describe, expect, it, vi } from "vitest";
import { SocialService } from "../src/worker/service";
import { AppError } from "../src/worker/store";
import { PlatformError, sanitizePlatformData } from "../src/worker/platforms";
import { seal, open, sign, verify } from "../src/worker/crypto";
import { requireOwner, ownerSession } from "../src/worker/auth";
import {
  assertApproved,
  validateMedia,
  scheduleKey,
  draftInput,
  type Draft,
} from "../src/shared/model";
import {
  MemoryBucket,
  environment,
  account,
  media,
  approvedDraft,
} from "./helpers";
import { jpegDimensions } from "../src/worker/media";
import { TOOL_NAMES, mcpFetch } from "../src/worker/mcp";
import type { OAuthResourceContext } from "@cloudflare/workers-oauth-provider";
let bucket: MemoryBucket, service: SocialService;
beforeEach(async () => {
  bucket = new MemoryBucket();
  service = new SocialService(environment(bucket));
  await service.store.put(`accounts/${account.id}.json`, account);
  await service.store.put(`media-meta/${media.id}.json`, media);
});
async function enqueue(d = approvedDraft()) {
  await service.store.put(`drafts/${d.id}.json`, d);
  await service.store.put(scheduleKey(d.id, d.scheduledAt!), {
    draftId: d.id,
    at: d.scheduledAt,
  });
  return d;
}
describe("approval boundaries", () => {
  it("MCP draft creation cannot smuggle approval, status or provider IDs", async () => {
    const d = await service.createDraft({
      account_id: account.id,
      caption: "hello",
      media_ids: [media.id],
      status: "published",
      approvedBy: "42",
      providerId: "injected",
    });
    expect(d.status).toBe("draft");
    expect(d.approvedBy).toBeUndefined();
    expect(d.providerId).toBeUndefined();
  });
  it("rejects approval of an unseen revision", async () => {
    const d = await service.createDraft({
      account_id: account.id,
      media_ids: [media.id],
    });
    await expect(service.approve(d.id, 2, "42")).rejects.toThrow("Revisi");
  });
  it("approval is bound to exact revision", async () => {
    const d = await service.createDraft({
      account_id: account.id,
      media_ids: [media.id],
    });
    const a = await service.approve(d.id, 1, "42");
    expect(a.status).toBe("scheduled");
    expect(a.approvedRevision).toBe(a.revision);
    expect(() => assertApproved({ ...a, revision: 2 })).toThrow();
  });
  it("approved draft cannot be edited or deleted via MCP service", async () => {
    const d = await enqueue();
    await expect(
      service.updateDraft(d.id, { account_id: account.id }),
    ).rejects.toThrow("terkunci");
    await expect(service.deleteDraft(d.id)).rejects.toThrow("terkunci");
  });
  it("cancel clears approval and increments revision", async () => {
    const d = await enqueue();
    const cancelled = await service.cancel(d.id);
    expect(cancelled.status).toBe("draft");
    expect(cancelled.approvedBy).toBeUndefined();
    expect(cancelled.revision).toBe(2);
  });
  it("cancel is refused once the draft transitions to publishing", async () => {
    const d = await enqueue(approvedDraft({ status: "publishing" }));
    await expect(service.cancel(d.id)).rejects.toThrow("belum diproses");
  });
  it("invalid media is rejected at approval", async () => {
    const d = await service.createDraft({ account_id: account.id });
    await expect(service.approve(d.id, 1, "42")).rejects.toThrow("media");
  });
  it("expired accounts cannot approve", async () => {
    await service.store.put(`accounts/${account.id}.json`, {
      ...account,
      expiresAt: "2000-01-01T00:00:00Z",
    });
    const d = await service.createDraft({
      account_id: account.id,
      media_ids: [media.id],
    });
    await expect(service.approve(d.id, 1, "42")).rejects.toThrow(
      "Hubungkan ulang",
    );
  });
  it("target IDs cannot inject graph paths", () => {
    expect(() =>
      draftInput.parse({
        account_id: "a",
        target_id: "x/messages?access_token=evil",
      }),
    ).toThrow();
  });
  it("validates reply targets and empty messages", () => {
    expect(() =>
      validateMedia(
        approvedDraft({ kind: "dm_reply", targetId: "dm", caption: "" }),
        account,
        [],
      ),
    ).toThrow();
    expect(() =>
      validateMedia(
        approvedDraft({
          kind: "comment_reply",
          targetId: "comment",
          caption: "hello",
        }),
        account,
        [],
      ),
    ).not.toThrow();
  });
});
describe("publisher concurrency and uncertain outcomes", () => {
  it("overlapping cron runs call the provider once", async () => {
    await enqueue();
    const prepare = vi
      .spyOn(service.platforms, "prepare")
      .mockResolvedValue({ id: "container-1", phase: "container" });
    await Promise.all([
      service.publishTick(),
      service.publishTick(),
      service.publishTick(),
    ]);
    expect(prepare).toHaveBeenCalledTimes(1);
    const d = (await service.store.require<Draft>("drafts/draft-1.json")).value;
    expect(d.status).toBe("publishing");
    expect(d.providerId).toBe("container-1");
  });
  it("an unapproved marker never executes", async () => {
    await enqueue(approvedDraft({ approvedRevision: undefined }));
    const prepare = vi.spyOn(service.platforms, "prepare");
    await service.publishTick();
    expect(prepare).not.toHaveBeenCalled();
  });
  it("lost platform response becomes uncertain and is not retried", async () => {
    await enqueue();
    const prepare = vi
      .spyOn(service.platforms, "prepare")
      .mockRejectedValue(new PlatformError("lost", true, true));
    await service.publishTick();
    await service.publishTick();
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(
      (await service.store.require<Draft>("drafts/draft-1.json")).value.status,
    ).toBe("uncertain");
  });
  it("crash between side effect and provider ID does not cause another publish", async () => {
    await enqueue(
      approvedDraft({
        status: "publishing",
        updatedAt: new Date(Date.now() - 180000).toISOString(),
      }),
    );
    const prepare = vi.spyOn(service.platforms, "prepare");
    await service.publishTick();
    expect(prepare).not.toHaveBeenCalled();
    expect(
      (await service.store.require<Draft>("drafts/draft-1.json")).value.status,
    ).toBe("uncertain");
  });
  it("Instagram publish occurs only after ready container and once", async () => {
    await enqueue(
      approvedDraft({
        status: "publishing",
        providerId: "container-1",
        providerPhase: "container",
      }),
    );
    vi.spyOn(service.platforms, "poll").mockResolvedValue({ status: "ready" });
    const finish = vi
      .spyOn(service.platforms, "finish")
      .mockResolvedValue("post-1");
    await Promise.all([service.publishTick(), service.publishTick()]);
    expect(finish).toHaveBeenCalledTimes(1);
    expect(
      (await service.store.require<Draft>("drafts/draft-1.json")).value
        .publishedId,
    ).toBe("post-1");
  });
  it("an uncertain media_publish is never submitted a second time", async () => {
    await enqueue(
      approvedDraft({
        status: "publishing",
        providerId: "container-1",
        providerPhase: "publish_requested",
      }),
    );
    vi.spyOn(service.platforms, "poll").mockResolvedValue({ status: "ready" });
    const finish = vi.spyOn(service.platforms, "finish");
    await service.publishTick();
    expect(finish).not.toHaveBeenCalled();
    expect(
      (await service.store.require<Draft>("drafts/draft-1.json")).value.status,
    ).toBe("uncertain");
  });
  it("queue-before-approval race keeps a fresh marker for next cron", async () => {
    const d = await enqueue(
      approvedDraft({
        status: "draft",
        approvedBy: undefined,
        approvedRevision: undefined,
      }),
    );
    await service.publishTick();
    expect(await bucket.head(scheduleKey(d.id, d.scheduledAt!))).not.toBeNull();
  });
  it("future schedules are not executed", async () => {
    await enqueue(
      approvedDraft({
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
      }),
    );
    const prepare = vi.spyOn(service.platforms, "prepare");
    await service.publishTick();
    expect(prepare).not.toHaveBeenCalled();
  });
  it("optimistic writes reject stale ETags", async () => {
    await service.store.put("x.json", { a: 1 });
    const original = await service.store.require("x.json");
    await service.store.put("x.json", { a: 2 }, original.etag);
    await expect(
      service.store.put("x.json", { a: 3 }, original.etag),
    ).rejects.toBeInstanceOf(AppError);
  });
});
describe("encryption and dashboard authentication", () => {
  it("encrypts tokens with randomized IVs and detects tampering", async () => {
    const env = environment(),
      a = await seal({ token: "secret" }, env.TOKEN_ENCRYPTION_KEY!),
      b = await seal({ token: "secret" }, env.TOKEN_ENCRYPTION_KEY!);
    expect(a).not.toBe(b);
    expect(a).not.toContain("secret");
    expect(await open(a, env.TOKEN_ENCRYPTION_KEY!)).toEqual({
      token: "secret",
    });
    await expect(
      open(a.slice(0, -4) + "AAAA", env.TOKEN_ENCRYPTION_KEY!),
    ).rejects.toThrow();
  });
  it("HMAC signatures are bound to the payload", async () => {
    const s = await sign("media:123", "key");
    expect(await verify("media:123", s, "key")).toBe(true);
    expect(await verify("media:124", s, "key")).toBe(false);
  });
  it("dashboard mutation requires owner session, exact origin and CSRF", async () => {
    const env = environment(),
      expires = Math.floor(Date.now() / 1000) + 100,
      payload = `42.${expires}.csrf`,
      sig = await sign(payload, env.SESSION_SECRET!),
      headers = {
        cookie: `__Host-social=${payload}.${sig}`,
        origin: env.PUBLIC_ORIGIN,
        "x-csrf-token": "csrf",
      };
    expect(
      await requireOwner(
        new Request(env.PUBLIC_ORIGIN + "/api/drafts", {
          method: "POST",
          headers,
        }),
        env,
      ),
    ).toEqual({ id: "42", csrf: "csrf" });
    await expect(
      requireOwner(
        new Request(env.PUBLIC_ORIGIN + "/api/drafts", {
          method: "POST",
          headers: { ...headers, origin: "https://evil.example" },
        }),
        env,
      ),
    ).rejects.toThrow("CSRF");
  });
  it("a signed session for another GitHub identity is rejected", async () => {
    const env = environment(),
      payload = `43.${Math.floor(Date.now() / 1000) + 100}.csrf`;
    const sig = await sign(payload, env.SESSION_SECRET!);
    expect(
      await ownerSession(
        new Request(env.PUBLIC_ORIGIN, {
          headers: { cookie: `__Host-social=${payload}.${sig}` },
        }),
        env,
      ),
    ).toBeNull();
  });
  it("invalid/missing sessions are denied", async () => {
    await expect(
      requireOwner(
        new Request("https://social.example/api/workspace"),
        environment(),
      ),
    ).rejects.toThrow("Login");
  });
});
describe("MCP protocol and tool surface", () => {
  const context = () =>
    ({
      props: { ownerId: "42" },
      auth: { scope: ["mcp:read", "mcp:draft"] },
    }) as OAuthResourceContext<{ ownerId: string }>;
  it("exposes all planned tools and no approval/publish tools", () => {
    expect(TOOL_NAMES.length).toBe(35);
    expect(TOOL_NAMES.some((x) => /approve|publish/.test(x))).toBe(false);
  });
  it("handles initialize over stateless Streamable HTTP", async () => {
    const req = new Request("https://social.example/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "Codex-test", version: "1" },
        },
      }),
    });
    const r = await mcpFetch(req, environment(bucket), context());
    expect(r.status).toBe(200);
    const json = (await r.json()) as {
      result: { serverInfo: { name: string } };
    };
    expect(json.result.serverInfo.name).toBe("social-mcp");
  });
  it("lists tools for a second stateless request", async () => {
    const r = await mcpFetch(
      new Request("https://social.example/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": "2025-03-26",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
      }),
      environment(bucket),
      context(),
    );
    const json = (await r.json()) as { result: { tools: { name: string }[] } };
    expect(json.result.tools.map((t) => t.name)).toEqual([...TOOL_NAMES]);
  });
  it("rejects another owner and untrusted origins before reading data", async () => {
    await expect(
      mcpFetch(new Request("https://social.example/mcp"), environment(bucket), {
        ...context(),
        props: { ownerId: "evil" },
      }),
    ).rejects.toThrow("pemilik");
    await expect(
      mcpFetch(
        new Request("https://social.example/mcp", {
          headers: { origin: "https://evil.example" },
        }),
        environment(bucket),
        context(),
      ),
    ).rejects.toThrow("Origin");
  });
});
describe("media checks", () => {
  it("extracts dimensions from JPEG SOF without trusting client metadata", () => {
    const b = new Uint8Array([
      255, 216, 255, 192, 0, 17, 8, 5, 70, 4, 56, 3, 1, 17, 0, 2, 17, 0, 3, 17,
      0,
    ]);
    expect(jpegDimensions(b)).toEqual({ width: 1080, height: 1350 });
  });
  it("rejects arbitrary binary disguised as JPEG", () => {
    expect(() => jpegDimensions(new Uint8Array([0, 0, 0, 0]))).toThrow("JPEG");
  });
  it("rejects PNG and invalid IG aspect ratios", () => {
    expect(() =>
      validateMedia(approvedDraft(), account, [
        { ...media, mime: "image/png" },
      ]),
    ).toThrow("JPEG");
    expect(() =>
      validateMedia(approvedDraft(), account, [
        { ...media, width: 200, height: 1000 },
      ]),
    ).toThrow("Rasio");
  });
});
describe("safe retries and lifecycle", () => {
  it("retries a read-only transient failure before any public side effect", async () => {
    await enqueue();
    const prepare = vi
      .spyOn(service.platforms, "prepare")
      .mockRejectedValueOnce(
        new PlatformError("creator query unavailable", true, false),
      )
      .mockResolvedValue({ id: "container-after-retry", phase: "container" });
    await service.publishTick();
    const retry = (await service.store.require<Draft>("drafts/draft-1.json"))
      .value;
    expect(retry.status).toBe("scheduled");
    expect(retry.attempts).toBeLessThanOrEqual(4);
    const pending = await bucket.list({ prefix: "queue/scheduled/" });
    expect(pending.objects.length).toBe(1);
    await service.publishTick(new Date(Date.now() + 10 * 60000));
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(
      (await service.store.require<Draft>("drafts/draft-1.json")).value
        .providerId,
    ).toBe("container-after-retry");
  });
  it("preserves media and drafts during retention cleanup", async () => {
    const d = await service.createDraft({
      account_id: account.id,
      media_ids: [media.id],
    });
    await service.store.put("media/preserved.jpg", "image");
    vi.spyOn(service.platforms, "refresh").mockResolvedValue();
    vi.spyOn(service, "stats").mockResolvedValue({
      accountId: account.id,
      capturedAt: new Date().toISOString(),
      followers: 1,
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      source: "official",
    });
    await service.maintenance();
    expect(await bucket.head(`drafts/${d.id}.json`)).not.toBeNull();
    expect(await bucket.head("media/preserved.jpg")).not.toBeNull();
  });
});

describe("upstream response redaction", () => {
  it("removes tokens and signed pagination URLs recursively", () => {
    const clean = sanitizePlatformData(
      {
        data: [
          {
            caption: "hello token-secret-value",
            access_token: "token-secret-value",
          },
        ],
        paging: {
          next: "https://graph.example?access_token=token-secret-value",
          cursors: { after: "cursor-123" },
        },
        refresh_token: "refresh-secret",
      },
      ["token-secret-value"],
    );
    expect(JSON.stringify(clean)).not.toContain("token-secret-value");
    expect(JSON.stringify(clean)).not.toContain("refresh-secret");
    expect(clean).toEqual({
      data: [{ caption: "hello [redacted]" }],
      paging: { cursors: { after: "cursor-123" } },
    });
  });
});

describe("publisher phase fencing", () => {
  it("refuses a stale execution revision instead of overwriting a newer provider ID", async () => {
    const d = await enqueue(
      approvedDraft({ status: "publishing", executionRevision: 1 }),
    );
    await service.setResult(d, { providerId: "new-container" });
    await expect(
      service.setResult(d, { providerId: "stale-container" }),
    ).rejects.toThrow("telah berubah");
    expect(
      (await service.store.require<Draft>("drafts/draft-1.json")).value
        .providerId,
    ).toBe("new-container");
  });
  it("claims carousel advancement across invocations in different minutes", async () => {
    const d = await enqueue(
      approvedDraft({
        status: "publishing",
        providerId: "child-1",
        providerPhase: "children",
        providerChildren: ["child-1"],
        providerReadyChildren: [],
        executionRevision: 1,
      }),
    );
    let release: (result: {
      children: string[];
      ready: string[];
      parentId: string;
    }) => void = () => {};
    let entered: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const advance = vi
      .spyOn(service.platforms, "advanceCarousel")
      .mockImplementation(async () => {
        entered();
        return new Promise((resolve) => {
          release = resolve;
        });
      });
    const now = new Date();
    const first = service.publishTick(now);
    await started;
    await service.publishTick(new Date(now.getTime() + 60000));
    expect(advance).toHaveBeenCalledTimes(1);
    release({
      children: ["child-1"],
      ready: ["child-1"],
      parentId: "parent-1",
    });
    await first;
    expect(
      (await service.store.require<Draft>(`drafts/${d.id}.json`)).value
        .providerId,
    ).toBe("parent-1");
  });
  it("poll deferral retains the owner schedule and moves queue readiness", async () => {
    const d = await enqueue(
      approvedDraft({
        status: "publishing",
        providerId: "tt-publish",
        providerPhase: "processing",
        executionRevision: 1,
      }),
    );
    vi.spyOn(service.platforms, "poll").mockResolvedValue({
      status: "processing",
    });
    const now = new Date();
    await service.publishTick(now);
    const current = (await service.store.require<Draft>(`drafts/${d.id}.json`))
      .value;
    expect(current.scheduledAt).toBe(d.scheduledAt);
    expect(current.executionRevision).toBe(2);
    const queued = await bucket.list({ prefix: "queue/scheduled/" });
    expect(queued.objects[0].key).toBe(
      scheduleKey(d.id, new Date(now.getTime() + 60000).toISOString()),
    );
  });
});
