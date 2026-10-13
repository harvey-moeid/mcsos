const enc = new TextEncoder();
export const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
export const unb64 = (s: string) =>
  Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export async function digest(s: string) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s))),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
async function key(secret: string) {
  const raw = unb64(secret);
  if (raw.length !== 32)
    throw new Error("TOKEN_ENCRYPTION_KEY harus base64 32 byte.");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
export async function seal(value: unknown, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await key(secret),
    enc.encode(JSON.stringify(value)),
  );
  return `${b64(iv)}.${b64(new Uint8Array(bytes))}`;
}
export async function open<T>(value: string, secret: string): Promise<T> {
  const [iv, data] = value.split(".");
  const bytes = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64(iv) },
    await key(secret),
    unb64(data),
  );
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}
export async function sign(value: string, secret: string) {
  const k = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return b64(
    new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(value))),
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
export async function verify(value: string, signature: string, secret: string) {
  const k = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  try {
    return await crypto.subtle.verify(
      "HMAC",
      k,
      unb64(
        signature
          .replaceAll("-", "+")
          .replaceAll("_", "/")
          .padEnd(Math.ceil(signature.length / 4) * 4, "="),
      ),
      enc.encode(value),
    );
  } catch {
    return false;
  }
}
export function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
