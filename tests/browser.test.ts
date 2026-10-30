import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { BrowserService } from "../src/worker/browser-service";
import { BrowserCloud, BrowserCloudError } from "../src/worker/browser-cloud";
import { SocialService } from "../src/worker/service";
import {
  safeAccount,
  scheduleKey,
  type Account,
  type Draft,
} from "../src/shared/model";
import {
  browserReadSchema,
  safeBrowserJob,
  safePlatformUrl,
  validateBrowserTarget,
  type BrowserJob,
} from "../src/shared/browser";
import { seal, digest } from "../src/worker/crypto";
import {
  MemoryBucket,
  environment,
  account,
  media,
  approvedDraft,
} from "./helpers";
import type { CloudRun } from "../src/worker/browser-cloud";
const profileId = "11111111-1111-4111-8111-111111111111",
  runId = "22222222-2222-4222-8222-222222222222",
  sessionId = "33333333-3333-4333-8333-333333333333",
  browserId = "44444444-4444-4444-8444-444444444444";
let bucket: MemoryBucket,
  social: SocialService,
  browser: BrowserService,
  a: Account,
  task: string;
beforeEach(async () => {
  bucket = new MemoryBucket();
  const env = {
    ...environment(bucket),
    BROWSER_USE_ENABLED: "true",
    BROWSER_USE_API_KEY: "test-private-browser-api-key",
    BROWSER_USE_MAX_COST_USD: "0.50",
    BROWSER_USE_MAX_RUNS_PER_DAY: "20",
  };
  social = new SocialService(env);
  browser = social.browser;
  a = {
    ...account,
    browser: {
      enabled: true,
      status: "ready",
      revision: 1,
      verifiedAt: new Date().toISOString(),
      encryptedProfile: await seal(profileId, env.TOKEN_ENCRYPTION_KEY!),
    },
  };
  await social.store.put(`accounts/${a.id}.json`, a);
  await social.store.put(`media-meta/${media.id}.json`, media);
  task = "";
  vi.spyOn(browser.cloud, "createRun").mockImplementation(async (t) => {
    task = t;
    return { id: runId, status: "running", sessionId };
  });
  vi.spyOn(browser.cloud, "listBrowsers").mockResolvedValue({
    items: [{ id: browserId, status: "active", agentSessionId: sessionId }],
    totalItems: 1,
  });
  vi.spyOn(browser.cloud, "stopBrowser").mockResolvedValue();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function receipt(
  jobId: string,
  outcome = "observed",
  data: unknown = null,
  username = a.username,
) {
  const j = await browser.current(jobId);
  return {
    id: runId,
    status: "completed" as const,
    sessionId,
    output: {
      job_id: j.id,
      intent_hash: j.intentHash,
      account_username: username,
      outcome,
      evidence_url: "https://www.instagram.com/p/post-123/?secret=removed",
      data,
    },
  };
}
async function action() {
  const d = approvedDraft({
    executionMethod: "browser",
    approvedBrowserBinding: 1,
  });
  await social.store.put(`drafts/${d.id}.json`, d);
  return { d, job: await browser.startAction(a, d, [media]) };
}
describe("profile binding and approval", () => {
  it("never exposes profile IDs, encrypted profile data, or login capability through MCP account metadata", () => {
    const safe = safeAccount(a),
      serialized = JSON.stringify(safe);
    expect(serialized).not.toContain(profileId);
    expect(serialized).not.toContain(a.browser!.encryptedProfile!);
    expect(safe.browser?.status).toBe("ready");
  });
  it("keeps execution selection unavailable to draft creation", async () => {
    const d = await social.createDraft({
      account_id: a.id,
      media_ids: [media.id],
      execution_method: "browser",
      approvedBrowserBinding: 1,
      browser_consent: true,
    });
    expect(d.executionMethod).toBeUndefined();
    expect(d.approvedBrowserBinding).toBeUndefined();
  });
  it("requires explicit owner consent for browser approval", async () => {
    const d = await social.createDraft({
      account_id: a.id,
      media_ids: [media.id],
    });
    await expect(
      social.approve(d.id, 1, "42", undefined, "browser", false),
    ).rejects.toThrow("eksplisit");
    expect(browser.cloud.createRun).not.toHaveBeenCalled();
  });
  it("requires verified browser identity before approval", async () => {
    await social.store.put(`accounts/${a.id}.json`, {
      ...a,
      browser: { ...a.browser, status: "unverified" },
    });
    const d = await social.createDraft({
      account_id: a.id,
      media_ids: [media.id],
    });
    await expect(
      social.approve(d.id, 1, "42", undefined, "browser", true),
    ).rejects.toThrow("Verifikasi");
  });
  it("supports explicit browser approval on a browser-only account without pretending API token exists", async () => {
    await social.store.put(`accounts/${a.id}.json`, {
      ...a,
      platformId: "browser-only",
      status: "reconnect",
      expiresAt: "1970-01-01T00:00:00Z",
    });
    const d = await social.createDraft({
      account_id: a.id,
      media_ids: [media.id],
    });
    const approved = await social.approve(
      d.id,
      1,
      "42",
      undefined,
      "browser",
      true,
    );
    expect(approved.executionMethod).toBe("browser");
    expect(approved.approvedBrowserBinding).toBe(1);
    await expect(social.approve(d.id, 1, "42")).rejects.toThrow();
  });
  it("rejects TikTok studio when feature disabled and always blocks agent approval", async () => {
    await social.store.put(`accounts/${a.id}.json`, {
      ...a,
      platform: "tiktok",
    });
    await expect(
      social.createDraft({
        account_id: a.id,
        media_ids: [media.id],
      }),
    ).rejects.toThrow("belum diaktifkan");
    const existing = approvedDraft({
      accountId: a.id,
      status: "draft",
    });
    await social.store.put(`drafts/${existing.id}.json`, existing);
    await expect(social.approve(existing.id, 1, "42", undefined, "browser", true)).rejects.toThrow("handoff manual");
    expect(browser.cloud.createRun).not.toHaveBeenCalled();
  });
  it("invalidates the old approval binding when profile settings change", async () => {
    const d = approvedDraft({
      executionMethod: "browser",
      approvedBrowserBinding: 1,
    });
    await browser.settings(a.id, {
      enabled: true,
      profile_id: "55555555-5555-4555-8555-555555555555",
    });
    await expect(
      browser.startAction(await browser.account(a.id), d, [media]),
    ).rejects.toThrow("Persetujuan");
    expect(browser.cloud.createRun).not.toHaveBeenCalled();
  });
  it("prevents sharing an enabled profile across accounts", async () => {
    await social.store.put("accounts/another.json", {
      ...account,
      id: "another",
      username: "another",
    });
    await expect(
      browser.settings("another", { enabled: true, profile_id: profileId }),
    ).rejects.toThrow("satu akun");
  });
  it("browser replies require exact target identity and safe URL", async () => {
    const d = await social.createDraft({
      account_id: a.id,
      kind: "comment_reply",
      caption: "Hello",
      browser_target: {
        url: "https://www.instagram.com/p/abc/",
        author: "visitor",
        text: "Original comment",
      },
    });
    expect(d.targetId).toMatch(/^browser-/);
    const approved = await social.approve(
      d.id,
      1,
      "42",
      undefined,
      "browser",
      true,
    );
    expect(approved.browserTarget?.text).toBe("Original comment");
  });
});
describe("cloud transport contract", () => {
  it("uses the documented V4 endpoint/header and bounded run cost without passing credentials to the agent", async () => {
    const cloud = new BrowserCloud(browser.env);
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({ id: runId, status: "queued", sessionId }),
      );
    vi.stubGlobal("fetch", fetch);
    await cloud.createRun("fixed task", profileId, { type: "object" });
    expect(fetch.mock.calls[0][0]).toBe(
      "https://api.browser-use.com/api/v4/runs",
    );
    const opts = fetch.mock.calls[0][1] as RequestInit;
    expect(
      (opts.headers as Record<string, string>)["X-Browser-Use-API-Key"],
    ).toBe(browser.env.BROWSER_USE_API_KEY);
    const payload = JSON.parse(String(opts.body));
    expect(payload.maxCostUsd).toBe(0.5);
    expect(payload.browserSettings).toEqual({
      profileId,
      proxyCountryCode: null,
      record: false,
    });
    expect(String(opts.body)).not.toContain(browser.env.BROWSER_USE_API_KEY);
  });
  it("classifies POST timeouts and malformed successful responses as ambiguous", async () => {
    const cloud = new BrowserCloud(browser.env);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    await expect(cloud.createRun("task", profileId, {})).rejects.toMatchObject({
      ambiguous: true,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ status: "queued" })),
    );
    await expect(cloud.createRun("task", profileId, {})).rejects.toMatchObject({
      ambiguous: true,
    });
  });
  it("honors provider Retry-After on throttling", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 429,
          headers: { "Retry-After": "120" },
        }),
      ),
    );
    await expect(
      new BrowserCloud(browser.env).run(runId),
    ).rejects.toMatchObject({ retryAfter: 120, ambiguous: false });
  });
  it("feature-off blocks new work while status/stop remain available for cleanup", async () => {
    const cloud = new BrowserCloud({
      ...browser.env,
      BROWSER_USE_ENABLED: "false",
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ id: runId, status: "cancelled", sessionId }),
        ),
    );
    await expect(cloud.createRun("task", profileId, {})).rejects.toThrow(
      "belum diaktifkan",
    );
    expect((await cloud.cancel(runId)).status).toBe("cancelled");
  });
});
describe("dispatch ledger, leases, and uncertain outcomes", () => {
  it("dispatches a given approved revision only once", async () => {
    const { d, job } = await action();
    const again = await browser.startAction(a, d, [media]);
    expect(again.id).toBe(job.id);
    expect(browser.cloud.createRun).toHaveBeenCalledTimes(1);
    expect(task).toContain("ACTION CONTRACT");
    expect(task).toContain("Hello");
    expect(task).not.toContain(profileId);
    expect(task).not.toContain(browser.env.BROWSER_USE_API_KEY);
  });
  it("concurrent requests cannot run two agents on one profile", async () => {
    const results = await Promise.allSettled([
      browser.startProbe(a.id),
      browser.startProbe(a.id),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(browser.cloud.createRun).toHaveBeenCalledTimes(1);
  });
  it("a missing create response never triggers automatic redispatch", async () => {
    vi.mocked(browser.cloud.createRun).mockImplementation(async (t) => {
      task = t;
      throw new BrowserCloudError(502, true);
    });
    const { d, job } = await action();
    expect(job.status).toBe("uncertain");
    await browser.startAction(a, d, [media]);
    expect(browser.cloud.createRun).toHaveBeenCalledTimes(1);
    await expect(browser.settings(a.id, { enabled: false })).rejects.toThrow(
      "aktif",
    );
  });
  it("a definite create rejection releases profile lease without retrying a public action", async () => {
    vi.mocked(browser.cloud.createRun).mockRejectedValue(
      new BrowserCloudError(402, false),
    );
    const { job } = await action();
    expect(job.status).toBe("failed");
    await expect(
      browser.settings(a.id, { enabled: false }),
    ).resolves.toMatchObject({ enabled: false });
  });
  it("limits daily starts using conditional writes during concurrency", async () => {
    const limited = new BrowserService({
      ...browser.env,
      BROWSER_USE_MAX_RUNS_PER_DAY: "3",
    });
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => limited.budget()),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
  });
  it("recovers only the exact task contract, not an unrelated run UUID", async () => {
    vi.mocked(browser.cloud.createRun).mockImplementation(async (t) => {
      task = t;
      throw new BrowserCloudError(502, true);
    });
    const { job } = await action();
    vi.spyOn(browser.cloud, "run").mockResolvedValue({
      id: runId,
      status: "running",
      sessionId,
      task: "unrelated task",
    });
    await expect(browser.recover(job.id, runId)).rejects.toThrow("tidak cocok");
    vi.mocked(browser.cloud.run).mockResolvedValue({
      id: runId,
      status: "running",
      sessionId,
      task,
    });
    expect((await browser.recover(job.id, runId)).status).toBe("running");
    expect(browser.cloud.createRun).toHaveBeenCalledTimes(1);
  });
  it("keeps an active profile locked until provider completion and browser stop", async () => {
    const job = await browser.startProbe(a.id);
    vi.spyOn(browser.cloud, "run").mockResolvedValue({
      id: runId,
      status: "running",
      sessionId,
    });
    await browser.poll(job.id);
    expect(browser.cloud.stopBrowser).not.toHaveBeenCalled();
    await expect(browser.startProbe(a.id)).rejects.toThrow("dipakai");
  });
  it("successful agent action is held for independent owner review", async () => {
    const { job } = await action();
    vi.spyOn(browser.cloud, "run").mockResolvedValue(
      await receipt(job.id, "action_reported"),
    );
    const result = await browser.poll(job.id);
    expect(result.status).toBe("awaiting_review");
    expect(result.evidence?.url).toBe("https://www.instagram.com/p/post-123/");
    expect(browser.cloud.stopBrowser).toHaveBeenCalledWith(browserId);
    const publicJson = JSON.stringify(await browser.getResult(job.id));
    expect(publicJson).not.toContain(profileId);
    expect(publicJson).not.toContain("encryptedPayload");
  });
  it("failed public runs remain uncertain rather than blindly retried", async () => {
    const { job } = await action();
    vi.spyOn(browser.cloud, "run").mockResolvedValue({
      id: runId,
      status: "failed",
      sessionId,
    });
    expect((await browser.poll(job.id)).status).toBe("uncertain");
    expect(browser.cloud.createRun).toHaveBeenCalledTimes(1);
  });
  it("invalid receipt hash or account cannot mark a probe verified", async () => {
    const job = await browser.startProbe(a.id);
    const r = await receipt(job.id);
    r.output.intent_hash = "0".repeat(64);
    vi.spyOn(browser.cloud, "run").mockResolvedValue(r);
    expect((await browser.poll(job.id)).status).toBe("uncertain");
  });
  it("marks blocked/login sessions and never automates challenge bypass", async () => {
    const job = await browser.startProbe(a.id);
    expect(task).toContain("never solve or bypass");
    vi.spyOn(browser.cloud, "run").mockResolvedValue(
      await receipt(job.id, "challenge"),
    );
    expect((await browser.poll(job.id)).status).toBe("failed");
    expect((await browser.account(a.id)).browser?.status).toBe(
      "login_required",
    );
  });
  it("cleanup errors retain lease and surface cleanupPending", async () => {
    const job = await browser.startProbe(a.id);
    vi.spyOn(browser.cloud, "run").mockResolvedValue(await receipt(job.id));
    vi.mocked(browser.cloud.stopBrowser).mockRejectedValue(
      new Error("offline"),
    );
    expect((await browser.poll(job.id)).cleanupPending).toBe(true);
    await expect(browser.settings(a.id, { enabled: false })).rejects.toThrow(
      "aktif",
    );
  });
});
describe("read capability boundaries", () => {
  it("accepts only the enumerated read jobs, never a free-form action task", () => {
    expect(() =>
      browserReadSchema.parse({
        account_id: a.id,
        kind: "publish",
        task: "post now",
      }),
    ).toThrow();
    const p = browserReadSchema.parse({
      account_id: a.id,
      kind: "stats",
      task: "post now",
    });
    expect(p).not.toHaveProperty("task");
  });
  it("job prompt forbids public mutations and treats page content as data", async () => {
    await browser.startRead({ account_id: a.id, kind: "stats" });
    expect(task).toContain("READ-ONLY CONTRACT");
    expect(task).toContain("Never post, reply, moderate");
    expect(task).toContain("untrusted data");
  });
  it("returns explicitly sourced statistics without estimating missing numbers", async () => {
    const job = await browser.startRead({ account_id: a.id, kind: "stats" });
    vi.spyOn(browser.cloud, "run").mockResolvedValue(
      await receipt(job.id, "observed", {
        followers: 123,
        views: null,
        likes: null,
        comments: null,
        shares: null,
      }),
    );
    await browser.poll(job.id);
    const result = await browser.getResult(job.id);
    expect(result.source).toBe("browser");
    expect(result.trust).toBe("untrusted_external_data");
    expect(result.result).toEqual({
      followers: 123,
      views: null,
      likes: null,
      comments: null,
      shares: null,
    });
  });
  it("strips unknown fields including credential-like fields from returned data", async () => {
    const job = await browser.startRead({
      account_id: a.id,
      kind: "comments",
      target_url: "https://www.instagram.com/p/abc/",
    });
    vi.spyOn(browser.cloud, "run").mockResolvedValue(
      await receipt(job.id, "observed", {
        items: [
          {
            id: "comment",
            author: "visitor",
            text: "hello",
            url: "https://www.instagram.com/p/abc/",
            access_token: "secret",
            liveUrl: "https://live.browser-use.com/token",
          },
        ],
      }),
    );
    await browser.poll(job.id);
    expect(JSON.stringify(await browser.getResult(job.id))).not.toContain(
      "secret",
    );
    expect(JSON.stringify(await browser.getResult(job.id))).not.toContain(
      "liveUrl",
    );
  });
  it("rejects external target URLs, credential URLs, and unsupported TikTok DMs", async () => {
    await expect(
      browser.startRead({
        account_id: a.id,
        kind: "comments",
        target_url: "https://evil.example/",
      }),
    ).rejects.toThrow("domain");
    await social.store.put(`accounts/${a.id}.json`, {
      ...a,
      platform: "tiktok",
    });
    await expect(
      browser.startRead({
        account_id: a.id,
        kind: "conversation",
        target_url: "https://www.tiktok.com/",
      }),
    ).rejects.toThrow("unsupported");
  });
});
describe("publisher integration and owner result confirmation", () => {
  it("dispatches through Browser Use only after route-specific approval and holds final status", async () => {
    const d = await social.createDraft({
      account_id: a.id,
      caption: "Hello",
      media_ids: [media.id],
    });
    const approved = await social.approve(
      d.id,
      1,
      "42",
      undefined,
      "browser",
      true,
    );
    const prepare = vi.spyOn(social.platforms, "prepare");
    const now = new Date();
    await social.publishTick(now);
    let current = (await social.store.require<Draft>(`drafts/${d.id}.json`))
      .value;
    expect(current.providerPhase).toBe("browser");
    expect(current.browserJobId).toBeTruthy();
    expect(prepare).not.toHaveBeenCalled();
    vi.spyOn(browser.cloud, "run").mockResolvedValue(
      await receipt(current.browserJobId!, "action_reported"),
    );
    await social.publishTick(new Date(now.getTime() + 60000));
    current = (await social.store.require<Draft>(`drafts/${d.id}.json`)).value;
    expect(current.status).toBe("uncertain");
    await browser.resolve(current.browserJobId!, "confirmed");
    expect(
      (await social.store.require<Draft>(`drafts/${d.id}.json`)).value.status,
    ).toBe("published");
    expect(browser.cloud.createRun).toHaveBeenCalledTimes(1);
  });
  it("cannot confirm an unknown or still-running provider result", async () => {
    const { job, d } = await action();
    await social.store.put(`drafts/${d.id}.json`, {
      ...d,
      status: "uncertain",
      browserJobId: job.id,
    });
    await expect(browser.resolve(job.id, "confirmed")).rejects.toThrow(
      "run selesai",
    );
  });
  it("approval binding cannot silently switch after API failure", async () => {
    const d = await social.createDraft({
      account_id: a.id,
      media_ids: [media.id],
    });
    await social.approve(d.id, 1, "42");
    vi.spyOn(social.platforms, "prepare").mockRejectedValue(
      new Error("ambiguous external result"),
    );
    await social.publishTick();
    expect(browser.cloud.createRun).not.toHaveBeenCalled();
    expect(
      (await social.store.require<Draft>(`drafts/${d.id}.json`)).value
        .executionMethod,
    ).toBe("api");
  });
});
describe("exact target validation", () => {
  it("disallows lookalike hosts, credentials, non-HTTPS, and unrelated thread paths", () => {
    for (const url of [
      "https://instagram.com.evil.test/p/x/",
      "https://user:pass@www.instagram.com/p/x/",
      "http://www.instagram.com/p/x/",
    ])
      expect(() => safePlatformUrl(url, "instagram")).toThrow();
    expect(() =>
      validateBrowserTarget(
        {
          url: "https://www.instagram.com/direct/inbox/",
          recipient: "visitor",
        },
        "instagram",
        "dm_reply",
      ),
    ).toThrow("thread");
  });
  it("requires both author and original comment text before browser moderation", () => {
    expect(() =>
      validateBrowserTarget(
        { url: "https://www.instagram.com/p/x/" },
        "instagram",
        "comment_moderation",
      ),
    ).toThrow("author");
    expect(
      validateBrowserTarget(
        {
          url: "https://www.instagram.com/p/x/?token=secret",
          author: "visitor",
          text: "Original",
        },
        "instagram",
        "comment_reply",
      ).url,
    ).toBe("https://www.instagram.com/p/x/");
  });
});

describe("login, recovery, and active-job maintenance", () => {
  it("accepts a real browser handle independently from TikTok API display name", async () => {
    await social.store.put(`accounts/${a.id}.json`, {
      ...a,
      platform: "tiktok",
      username: "Studio Rasa",
    });
    browser.env.TIKTOK_SESSION_ENABLED = "true";
    await browser.settings(a.id, {
      enabled: true,
      profile_id: profileId,
      expected_username: "studio.rasa",
    });
    const current = await browser.account(a.id);
    expect(current.browser?.expectedUsername).toBe("studio.rasa");
    await expect(browser.startProbe(a.id)).rejects.toThrow("manual_action_required");
    expect(browser.cloud.createRun).not.toHaveBeenCalled();
    expect(current.browser?.status).toBe("unverified");
  });
  it("opens a manual login session and keeps its live URL encrypted and owner-side", async () => {
    vi.spyOn(browser.cloud, "createLogin").mockResolvedValue({
      id: browserId,
      liveUrl: "https://live.browser-use.com/private-session",
      timeoutAt: new Date(Date.now() + 600000).toISOString(),
    });
    const login = await browser.openLogin(a.id);
    expect(login.liveUrl).toContain("private-session");
    const stored = await browser.store.require<
      import("../src/shared/browser").BrowserLogin
    >(`browser/logins/${login.id}.json`);
    expect(JSON.stringify(stored.value)).not.toContain("private-session");
    expect(stored.value.encryptedLiveUrl).toBeTruthy();
    await expect(browser.startProbe(a.id)).rejects.toThrow("dipakai");
    await browser.closeLogin(login.id, a.id);
    await expect(browser.startProbe(a.id)).resolves.toMatchObject({
      status: "running",
    });
  });
  it("cannot attach an unrelated browser session during login recovery", async () => {
    vi.spyOn(browser.cloud, "createLogin").mockRejectedValue(
      new BrowserCloudError(502, true),
    );
    await expect(browser.openLogin(a.id)).rejects.toThrow("pemulihan");
    const logins =
      await browser.store.list<import("../src/shared/browser").BrowserLogin>(
        "browser/logins/",
      );
    vi.spyOn(browser.cloud, "browser").mockResolvedValue({
      id: browserId,
      status: "active",
      metadata: { socialJob: "not-this-login", socialAccount: a.id },
    });
    await expect(
      browser.closeLogin(logins.items[0].id, a.id, browserId),
    ).rejects.toThrow("tidak cocok");
  });
  it("active pending queue avoids scanning historic completed jobs", async () => {
    const job = await browser.startRead({ account_id: a.id, kind: "stats" });
    vi.spyOn(browser.cloud, "run").mockResolvedValue(
      await receipt(job.id, "observed", {
        followers: 1,
        views: null,
        likes: null,
        comments: null,
        shares: null,
      }),
    );
    for (let i = 0; i < 15; i++)
      await browser.store.put(`browser/jobs/historic-${i}.json`, {
        id: `historic-${i}`,
        status: "completed",
      });
    await browser.tick();
    expect((await browser.current(job.id)).status).toBe("completed");
    expect(
      (await bucket.list({ prefix: "browser/pending/" })).objects,
    ).toHaveLength(0);
  });
  it("old polls cannot overwrite a result already confirmed by the owner", async () => {
    const { job } = await action();
    let release: (r: CloudRun) => void = () => {};
    let entered: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    vi.spyOn(browser.cloud, "run").mockImplementation(async () => {
      entered();
      return new Promise((resolve) => {
        release = resolve;
      });
    });
    const poll = browser.poll(job.id);
    await started;
    const o = await browser.store.require<BrowserJob>(
      `browser/jobs/${job.id}.json`,
    );
    await browser.store.put(
      `browser/jobs/${job.id}.json`,
      { ...o.value, status: "confirmed", remoteStatus: "completed" },
      o.etag,
    );
    release(await receipt(job.id, "action_reported"));
    await poll;
    expect((await browser.current(job.id)).status).toBe("confirmed");
  });
  it("a wrong logged-in account marks the binding as needing login instead of ready", async () => {
    const job = await browser.startProbe(a.id);
    vi.spyOn(browser.cloud, "run").mockResolvedValue(
      await receipt(job.id, "login_required", null, "different-account"),
    );
    expect((await browser.poll(job.id)).status).toBe("failed");
    expect((await browser.account(a.id)).browser?.status).toBe(
      "login_required",
    );
  });
  it("manual closure of an unknown dispatch never causes redispatch", async () => {
    vi.mocked(browser.cloud.createRun).mockRejectedValue(
      new BrowserCloudError(502, true),
    );
    const { job } = await action();
    await browser.abandon(job.id);
    expect((await browser.current(job.id)).status).toBe("failed");
    await expect(
      browser.settings(a.id, { enabled: false }),
    ).resolves.toMatchObject({ enabled: false });
    expect(browser.cloud.createRun).toHaveBeenCalledTimes(1);
  });
});

describe("bounded waiting and media", () => {
  it("waits on a busy profile before dispatch without sending another public task", async () => {
    await browser.startProbe(a.id);
    const d = await social.createDraft({
      account_id: a.id,
      media_ids: [media.id],
    });
    await social.approve(d.id, 1, "42", undefined, "browser", true);
    await social.publishTick();
    const current = (await social.store.require<Draft>(`drafts/${d.id}.json`))
      .value;
    expect(current.status).toBe("scheduled");
    expect(current.error).toContain("Menunggu");
    expect(current.approvedRevision).toBe(current.revision);
    expect(browser.cloud.createRun).toHaveBeenCalledTimes(1);
  });
  it("rejects oversized browser media before dispatch", async () => {
    await social.store.put(`media-meta/${media.id}.json`, {
      ...media,
      mime: "video/mp4",
      duration: 20,
      size: 60 * 1024 * 1024,
    });
    const d = await social.createDraft({
      account_id: a.id,
      media_ids: [media.id],
      post_type: "video",
    });
    await expect(
      social.approve(d.id, 1, "42", undefined, "browser", true),
    ).rejects.toThrow("50 MB");
    expect(browser.cloud.createRun).not.toHaveBeenCalled();
  });
});
