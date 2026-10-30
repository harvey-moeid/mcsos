import { readFile, writeFile, mkdir } from "node:fs/promises";
const origin = process.env.STAGING_PUBLIC_ORIGIN;
if (
  !origin ||
  new URL(origin).protocol !== "https:" ||
  new URL(origin).hostname === "sosial-mcp.muidsoft.com" ||
  new URL(origin).hostname.endsWith(".invalid") ||
  new URL(origin).origin !== origin
)
  throw new Error(
    "Isi STAGING_PUBLIC_ORIGIN HTTPS yang nyata dan terpisah, tanpa path.",
  );
const config = JSON.parse(await readFile("wrangler.staging.jsonc", "utf8"));
config.vars.PUBLIC_ORIGIN = origin;
// Config is emitted at repo root: relative entrypoint/assets/schema paths stay correct.
await writeFile(
  "wrangler.staging.local.jsonc",
  JSON.stringify(config, null, 2) + "\n",
);
console.log(
  "wrangler.staging.local.jsonc siap. Dry-run sebelum deploy; tidak ada resource produksi yang dipakai.",
);
