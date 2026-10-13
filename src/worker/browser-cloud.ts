import { z } from "zod";
import { AppError } from "./store";
import { boundedJson, type RuntimeEnv } from "./platforms";
const uuid = z.string().uuid();
export const cloudRunSchema = z.object({
  id: uuid,
  status: z.enum([
    "queued",
    "dispatching",
    "running",
    "completed",
    "failed",
    "cancelled",
  ]),
  sessionId: uuid.optional(),
  task: z.string().optional(),
  output: z.unknown().optional(),
  result: z.string().nullable().optional(),
  totalCostUsd: z.string().optional(),
});
export type CloudRun = z.infer<typeof cloudRunSchema>;
export class BrowserCloudError extends AppError {
  constructor(
    status: number,
    public ambiguous: boolean,
    public retryAfter = 60,
  ) {
    super(
      status,
      `Browser Use gagal (HTTP ${status}). Periksa kredensial, saldo, dan status layanan.`,
      "browser_cloud_error",
    );
  }
}
export class BrowserCloud {
  constructor(readonly env: RuntimeEnv) {}
  assertConfigured() {
    if (
      this.env.BROWSER_USE_ENABLED !== "true" ||
      !this.env.BROWSER_USE_API_KEY
    )
      throw new AppError(
        503,
        "Browser Use belum diaktifkan atau API key belum diatur.",
      );
  }
  async call(path: string, method = "GET", payload?: unknown) {
    if (!this.env.BROWSER_USE_API_KEY)
      throw new AppError(503, "Browser Use API key belum diatur.");
    let r: Response;
    try {
      r = await fetch("https://api.browser-use.com/api/v4/" + path, {
        method,
        headers: {
          "X-Browser-Use-API-Key": this.env.BROWSER_USE_API_KEY!,
          "Content-Type": "application/json",
        },
        body: payload === undefined ? undefined : JSON.stringify(payload),
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new BrowserCloudError(502, method !== "GET");
    }
    if (!r.ok) {
      const retry = Math.max(
        30,
        Math.min(600, Number(r.headers.get("retry-after")) || 60),
      );
      await r.body?.cancel();
      throw new BrowserCloudError(
        r.status,
        method !== "GET" && r.status >= 500,
        retry,
      );
    }
    try {
      return await boundedJson(r);
    } catch {
      throw new BrowserCloudError(502, method !== "GET");
    }
  }
  async createRun(task: string, profileId: string, outputSchema: unknown) {
    this.assertConfigured();
    const maxCost = Number(this.env.BROWSER_USE_MAX_COST_USD);
    if (!Number.isFinite(maxCost) || maxCost <= 0 || maxCost > 5)
      throw new AppError(
        503,
        "Batas biaya Browser Use harus lebih dari 0 dan maksimal $5 per run.",
      );
    const r = await this.call("runs", "POST", {
      task,
      outputSchema,
      browserSettings: { profileId, proxyCountryCode: null, record: false },
      maxCostUsd: maxCost,
      agentmail: false,
    });
    const parsed = cloudRunSchema.safeParse(r);
    if (!parsed.success || !parsed.data.sessionId)
      throw new BrowserCloudError(502, true);
    return parsed.data;
  }
  async run(id: string) {
    return cloudRunSchema.parse(await this.call(`runs/${uuid.parse(id)}`));
  }
  async cancel(id: string) {
    return cloudRunSchema.parse(
      await this.call(`runs/${uuid.parse(id)}/cancel`, "POST"),
    );
  }
  async listBrowsers(sessionId: string) {
    const r = await this.call(
      `browsers?${new URLSearchParams({ agentSessionId: uuid.parse(sessionId), pageSize: "100", pageNumber: "1" })}`,
    );
    return z
      .object({
        items: z.array(
          z.object({
            id: uuid,
            status: z.enum(["active", "stopped"]),
            agentSessionId: uuid.nullable().optional(),
          }),
        ),
        totalItems: z.number().optional(),
      })
      .parse(r);
  }
  async stopBrowser(id: string) {
    await this.call(`browsers/${uuid.parse(id)}`, "PATCH", { action: "stop" });
  }
  async createLogin(profileId: string, metadata: Record<string, string>) {
    this.assertConfigured();
    const r = await this.call("browsers", "POST", {
      profileId,
      timeout: 10,
      enableRecording: false,
      proxyCountryCode: null,
      metadata,
    });
    const parsed = z
      .object({ id: uuid, liveUrl: z.string().url(), timeoutAt: z.string() })
      .safeParse(r);
    if (!parsed.success) throw new BrowserCloudError(502, true);
    return parsed.data;
  }
  async browser(id: string) {
    return z
      .object({
        id: uuid,
        status: z.enum(["active", "stopped"]),
        metadata: z.record(z.string()).optional(),
      })
      .parse(await this.call(`browsers/${uuid.parse(id)}`));
  }
}
