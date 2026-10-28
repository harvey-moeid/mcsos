import { readFile, readdir, stat } from "node:fs/promises";
const config = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
if (
  config.name !== "social-mcp" ||
  config.r2_buckets[0].bucket_name !== "social-mcp-data" ||
  config.vars.PUBLIC_ORIGIN !== "https://sosial-mcp.muidsoft.com"
)
  throw new Error("Identitas produksi berubah.");
if (config.triggers?.crons?.length)
  throw new Error("Default tidak boleh mempunyai Cron.");
if (config.vars.TIKTOK_BROWSER_PUBLISH_ENABLED !== "false")
  throw new Error("Publikasi browser TikTok harus nonaktif.");
if (
  config.kv_namespaces[0].id !== "6e08598e41274553bf7db547512d6f9f" ||
  config.kv_namespaces[1].id !== "efc61cba98f2463bba732f3c8653f0d4"
)
  throw new Error("ID KV produksi berubah.");
const index = await readFile("dist/index.html", "utf8");
if (!index.includes("/assets/")) throw new Error("SPA artifact tidak valid.");
for (const file of await readdir("dist/assets")) {
  const path = "dist/assets/" + file;
  if (file.endsWith(".js")) {
    if ((await stat(path)).size > 650000)
      throw new Error("Bundle frontend terlalu besar.");
    const code = await readFile(path, "utf8");
    if (/X-Browser-Use-API-Key|x-goog-api-key|Bearer \$\{this.env/.test(code))
      throw new Error("Kode provider server masuk bundle frontend.");
  }
}
if (!(await stat("work/worker-build/index.js")).size)
  throw new Error("Worker bundle kosong.");
console.log(
  "Identitas Cloudflare, no-Cron, default aman, SPA dan bundle Worker: PASS",
);
