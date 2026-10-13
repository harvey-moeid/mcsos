import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
const excluded = new Set([
  "node_modules",
  "dist",
  "work",
  ".wrangler",
  ".git",
  "tests",
]);
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/,
  /\bEAA[A-Za-z0-9]{70,}\b/,
];
let failed = false;
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (
      excluded.has(entry.name) ||
      entry.name.startsWith(".env") ||
      entry.name === ".dev.vars"
    )
      continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (
      /\.(?:ts|tsx|js|mjs|json|jsonc|md|ya?ml)$/.test(entry.name) &&
      entry.name !== "package-lock.json"
    ) {
      const text = await readFile(path, "utf8");
      if (patterns.some((p) => p.test(text))) {
        console.error(`Possible credential in ${path} (value redacted)`);
        failed = true;
      }
    }
  }
}
await walk(".");
if (failed) process.exitCode = 1;
else
  console.log(
    "Credential pattern scan passed. This supplements review; it is not a complete secret scanner.",
  );
