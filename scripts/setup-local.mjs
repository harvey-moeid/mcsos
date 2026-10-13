import { randomBytes } from "node:crypto";
import { writeFile, access } from "node:fs/promises";
try {
  await access(".dev.vars");
  console.log(".dev.vars sudah ada; tidak ditimpa.");
} catch {
  await writeFile(
    ".dev.vars",
    `# Hanya untuk pengembangan. Isi kredensial aplikasi milikmu.\nTOKEN_ENCRYPTION_KEY=${randomBytes(32).toString("base64")}\nSESSION_SECRET=${randomBytes(48).toString("base64url")}\nGITHUB_CLIENT_ID=\nGITHUB_CLIENT_SECRET=\nMETA_CLIENT_ID=\nMETA_CLIENT_SECRET=\nMETA_FB_CLIENT_ID=\nMETA_FB_CLIENT_SECRET=\nTIKTOK_CLIENT_KEY=\nTIKTOK_CLIENT_SECRET=\nR2_ACCOUNT_ID=\nR2_ACCESS_KEY_ID=\nR2_SECRET_ACCESS_KEY=\nBROWSER_USE_API_KEY=\n`,
    { mode: 0o600 },
  );
  console.log(
    ".dev.vars dibuat dengan kunci acak. Nilai secret tidak dicetak.",
  );
}
