const origin = process.env.STAGING_PUBLIC_ORIGIN;
if (
  !origin ||
  !origin.startsWith("https://") ||
  new URL(origin).hostname === "sosial-mcp.muidsoft.com"
)
  throw new Error("STAGING_PUBLIC_ORIGIN HTTPS terpisah diperlukan.");
for (const [path, status] of [
  ["/", 200],
  ["/api/workspace", 401],
  ["/api/tiktok/config", 401],
  ["/mcp", 401],
  ["/.well-known/oauth-authorization-server", 200],
  ["/.well-known/oauth-protected-resource/mcp", 200],
]) {
  const response = await fetch(new URL(path, origin), {
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
  });
  if (response.status !== status)
    throw new Error(
      path + ": HTTP " + response.status + ", expected " + status,
    );
  if (path === "/mcp" && !response.headers.has("www-authenticate"))
    throw new Error("MCP auth challenge tidak ada");
  console.log(path + " → " + status);
  await response.body?.cancel();
}
console.log(
  "Smoke staging anonim PASS; login owner/OAuth eksternal wajib diverifikasi terpisah.",
);
