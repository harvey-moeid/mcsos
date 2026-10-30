import { createRequire } from "node:module";
import { resolve, dirname, extname } from "node:path";
import { readFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
const wranglerDir = dirname(require.resolve("wrangler/package.json"));
const { Miniflare, convertV4MiniflareOptions } = require(
  require.resolve("miniflare", { paths: [wranglerDir] }),
);
const origin = "http://127.0.0.1:8792";
const config = {
  modules: true,
  modulesRoot: resolve("."),
  scriptPath: resolve("work/worker-build/index.js"),
  host: "127.0.0.1",
  port: 8792,
  compatibilityDate: "2026-10-13",
  compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
  r2Buckets: ["DATA"],
  kvNamespaces: ["CACHE", "OAUTH_KV"],
  bindings: {
    PUBLIC_ORIGIN: origin,
    OWNER_GITHUB_ID: "42",
    META_API_VERSION: "v25.0",
    SCRAPING_ENABLED: "false",
    R2_BUCKET_NAME: "test",
    ENVIRONMENT: "test",
    BROWSER_USE_ENABLED: "false",
    BROWSER_USE_MAX_COST_USD: "0.50",
    BROWSER_USE_MAX_RUNS_PER_DAY: "20",
    TIKTOK_CONTENT_STUDIO_ENABLED: "true",
    TIKTOK_ANALYTICS_ENABLED: "true",
    TIKTOK_SESSION_ENABLED: "false",
    TIKTOK_BROWSER_PUBLISH_ENABLED: "false",
    AI_CONTENT_ENABLED: "false",
    AI_PROVIDER: "none",
    AI_MODEL: "",
    AI_MAX_REQUESTS_PER_DAY: "20",
    AI_MAX_OUTPUT_TOKENS: "2048",
    SESSION_SECRET: "ui-test-only-secret-with-at-least-32-bytes",
  },
  serviceBindings: {
    ASSETS: async (req) => {
      const pathname = new URL(req.url).pathname;
      const file = pathname.startsWith("/assets/")
        ? resolve("dist", "." + pathname)
        : resolve("dist/index.html");
      if (!file.startsWith(resolve("dist") + "/"))
        return new Response(null, { status: 404 });
      try {
        return new Response(await readFile(file), {
          headers: {
            "Content-Type":
              {
                ".js": "application/javascript",
                ".css": "text/css",
                ".html": "text/html",
                ".woff2": "font/woff2",
                ".woff": "font/woff",
              }[extname(file)] || "application/octet-stream",
          },
        });
      } catch {
        return new Response(null, { status: 404 });
      }
    },
  },
};
const mf = new Miniflare(
  convertV4MiniflareOptions ? convertV4MiniflareOptions(config) : config,
);
await mf.ready;
const bucket = await mf.getR2Bucket("DATA");
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=",
  "base64",
);
await bucket.put("media/ui-image/test.png", png, {
  httpMetadata: { contentType: "image/png" },
});
await bucket.put(
  "media-meta/ui-image.json",
  JSON.stringify({
    id: "ui-image",
    key: "media/ui-image/test.png",
    filename: "test.png",
    mime: "image/png",
    size: png.length,
    width: 1,
    height: 1,
    createdAt: new Date().toISOString(),
    verified: true,
  }),
);
console.log(
  "Local workerd UI runtime ready on " +
    origin +
    " (isolated, no remote providers).",
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, async () => {
    await mf.dispose();
    process.exit(0);
  });
