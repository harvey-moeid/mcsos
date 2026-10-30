import { test, expect } from "@playwright/test";
import { createHmac } from "node:crypto";
const origin = "http://127.0.0.1:8792";
test.beforeEach(async ({ context }) => {
  const payload = `42.${Math.floor(Date.now() / 1000) + 600}.ui-csrf`,
    sig = createHmac("sha256", "ui-test-only-secret-with-at-least-32-bytes")
      .update(payload)
      .digest("base64url");
  await context.addCookies([
    {
      name: "social_local",
      value: payload + "." + sig,
      url: origin,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
});
async function navigate(page: import("@playwright/test").Page, label: string) {
  if ((page.viewportSize()?.width || 0) < 720) {
    const mobile = page.getByRole("button", {
      name: "Seluler " + label,
      exact: true,
    });
    if (await mobile.count()) {
      await mobile.click();
      return;
    }
    await page.getByRole("button", { name: "Menu navigasi" }).click();
  }
  await page
    .getByRole("navigation", { name: "Navigasi workspace", exact: true })
    .getByRole("button", { name: label, exact: true })
    .click();
}
test("real owner API: account, manual draft, edit, approval, queue, handoff and evidence", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?view=overview");
  await expect(
    page.getByText("Ide siap. Keputusan di tangan Anda."),
  ).toBeVisible();
  await navigate(page, "Akun terhubung");
  const username = `${info.project.name}.owner`,
    label = `Akun ${info.project.name}`;
  const accountForm = page.locator("form").filter({
    has: page.getByRole("heading", {
      name: "Tambah akun TikTok",
      exact: true,
    }),
  });
  await accountForm
    .getByRole("textbox", { name: "Nama akun", exact: true })
    .fill(label);
  await accountForm
    .getByRole("textbox", { name: "Username", exact: true })
    .fill(username);
  await accountForm.getByRole("checkbox").check();
  await accountForm
    .getByRole("button", { name: "Tambah akun TikTok", exact: true })
    .click();
  const card = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: label, exact: true }) });
  await expect(card).toBeVisible();
  await card
    .getByRole("button", { name: "Verifikasi identitas / health check" })
    .click();
  await card
    .getByRole("textbox", { name: "Username yang terlihat" })
    .fill(username);
  await card
    .getByRole("checkbox", {
      name: "Saya telah memeriksa username yang benar-benar login.",
    })
    .check();
  await card.getByRole("button", { name: "Catat verifikasi" }).click();
  await expect(card.getByText("ready", { exact: true })).toBeVisible();
  await navigate(page, "AI Content Studio");
  await expect(
    page.getByText("AI tidak tersedia:", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Buat konten manual", exact: true })
    .click();
  let dialog = page.getByRole("dialog", { name: "Buat konten TikTok" });
  await dialog
    .getByLabel("Akun TikTok aktif")
    .selectOption({ label: `${label} · @${username}` });
  await dialog.getByLabel("Jenis konten").selectOption("photo");
  await dialog
    .getByLabel("Caption & hashtag")
    .fill("Konten <script>window.injected=true</script> " + info.project.name);
  await dialog.getByRole("checkbox", { name: "test.png" }).check();
  await dialog.getByRole("button", { name: "Simpan draft TikTok" }).click();
  await expect(dialog).toBeHidden();
  await navigate(page, "Inbox approval");
  let draftCard = page.locator("article").filter({
    has: page.getByText(
      "Konten <script>window.injected=true</script> " + info.project.name,
      { exact: true },
    ),
  });
  await draftCard
    .getByRole("button", { name: "Edit konten", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Edit konten TikTok" });
  await dialog
    .getByLabel("Caption & hashtag")
    .fill("Caption final " + info.project.name);
  await dialog.getByRole("button", { name: "Simpan draft TikTok" }).click();
  await expect(dialog).toBeHidden();
  draftCard = page.locator("article").filter({
    has: page.getByText("Caption final " + info.project.name, {
      exact: true,
    }),
  });
  await draftCard.getByRole("button", { name: "Minta approval" }).click();
  await draftCard.getByRole("button", { name: "Detail & approval" }).click();
  dialog = page.getByRole("dialog", { name: "Tinjau konten TikTok" });
  await expect(
    dialog.getByRole("button", { name: "Setujui revisi untuk handoff manual" }),
  ).toBeDisabled();
  await dialog.getByRole("checkbox", { name: /Saya meninjau akun/ }).check();
  await dialog
    .getByRole("button", { name: "Setujui revisi untuk handoff manual" })
    .click();
  await dialog
    .getByRole("button", { name: "Masukkan ke antrean manual" })
    .click();
  await dialog
    .getByRole("checkbox", { name: /Saya sudah memeriksa akun aktif/ })
    .check();
  await dialog
    .getByRole("button", { name: "Mulai handoff & tunggu pemeriksaan" })
    .click();
  await expect(
    dialog.getByText("Menunggu pemeriksaan", { exact: true }),
  ).toBeVisible();
  await dialog.getByLabel("Username yang diperiksa").fill(username);
  await dialog
    .getByLabel("URL posting TikTok")
    .fill(`https://www.tiktok.com/@${username}/video/12345`);
  await dialog
    .getByRole("checkbox", { name: /Saya telah memeriksa hasil/ })
    .check();
  await dialog
    .getByRole("button", { name: "Simpan konfirmasi pemilik" })
    .click();
  await expect(
    dialog.getByText("Terpublikasi (konfirmasi pemilik)", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Tutup dialog TikTok" }).click();
  await navigate(page, "Analitik");
  await page.getByLabel("Akun analitik").selectOption({ label });
  await page.getByText("Catat metrik / impor JSON", { exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "views", exact: true })
    .fill("100");
  await page.getByRole("spinbutton", { name: "likes", exact: true }).fill("10");
  await page.getByRole("button", { name: "Simpan metrik manual" }).click();
  await expect(
    page.getByRole("cell", { name: "manual", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Tidak tersedia", exact: true }).first(),
  ).toBeVisible();
  await navigate(page, "Antrean & kalender");
  await page.getByLabel("Tampilan kalender TikTok").selectOption("week");
  await page.getByLabel("Tampilan kalender TikTok").selectOption("day");
  await expect(page.locator(".tt-calendar.day")).toBeVisible();
  if (info.project.name === "android")
    await page.getByRole("button", { name: "Menu navigasi" }).click();
  await page.getByRole("button", { name: "Terang", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Gelap", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  if (info.project.name === "android")
    await page.getByRole("button", { name: "Tutup navigasi" }).click();
  expect(
    await page.evaluate(() =>
      Boolean((window as unknown as { injected?: boolean }).injected),
    ),
  ).toBe(false);
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 2,
    ),
  ).toBe(true);
  if (info.project.name === "android")
    await expect
      .poll(async () => {
        const box = await page.locator("#workspace-sidebar").boundingBox();
        return box ? box.x + box.width : 0;
      })
      .toBeLessThanOrEqual(1);
  await page.screenshot({
    path: `docs/evidence/${info.project.name}-queue.png`,
    fullPage: true,
  });
});
test("empty, error, loading and session expiration are visible without false AI success", async ({
  page,
}) => {
  await page.route("**/api/tiktok/config", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    await route.continue();
  });
  await page.goto("/?view=studio");
  await expect(page.getByLabel("Memuat studio TikTok")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Buat dengan AI" }),
  ).toBeDisabled();
  await page.route("**/api/workspace", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "Sesi berakhir" }),
    }),
  );
  await page.reload();
  await expect(
    page.getByText("Sesi dashboard kedaluwarsa.", { exact: false }),
  ).toBeVisible();
});
test("multi-file media upload UI tracks progress and surfaces provider failures", async ({
  page,
}, info) => {
  const username = `upload.${info.project.name}`;
  await page.goto("/?view=accounts");
  const form = page.locator("form").filter({
    has: page.getByRole("heading", {
      name: "Tambah akun TikTok",
      exact: true,
    }),
  });
  await form
    .getByRole("textbox", { name: "Nama akun", exact: true })
    .fill("Upload " + info.project.name);
  await form
    .getByRole("textbox", { name: "Username", exact: true })
    .fill(username);
  await form.getByRole("checkbox").check();
  await form
    .getByRole("button", { name: "Tambah akun TikTok", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Upload " + info.project.name,
      exact: true,
    }),
  ).toBeVisible();
  await navigate(page, "AI Content Studio");
  await page
    .getByRole("button", { name: "Buat konten manual", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Buat konten TikTok" });
  let initiated = 0,
    completed = 0;
  await page.route("**/api/media/initiate", (route) => {
    initiated++;
    return route.fulfill({
      json: {
        id: "mock-upload-" + initiated,
        multipart: false,
        partSize: 10485760,
        url: origin + "/mock-s3-upload",
      },
    });
  });
  await page.route("**/mock-s3-upload", async (route) => {
    await new Promise((r) => setTimeout(r, 100));
    await route.fulfill({ status: 200, body: "" });
  });
  await page.route("**/api/media/mock-upload-*/complete", (route) => {
    completed++;
    return route.fulfill({
      json: {
        id: "mock-media",
        key: "media/mock/file.png",
        filename: "file.png",
        mime: "image/png",
        width: 1,
        height: 1,
        size: 68,
        verified: true,
        createdAt: new Date().toISOString(),
      },
    });
  });
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=",
    "base64",
  );
  await dialog.getByLabel("Upload beberapa media").setInputFiles([
    { name: "a.png", mimeType: "image/png", buffer: png },
    { name: "b.png", mimeType: "image/png", buffer: png },
  ]);
  await expect(dialog.getByRole("progressbar")).toBeVisible();
  await expect.poll(() => completed).toBe(2);
  expect(initiated).toBe(2);
  await expect(dialog.getByRole("progressbar")).toBeHidden();
  await page.route("**/api/media/initiate", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "R2 provider belum dikonfigurasi." },
    }),
  );
  await dialog
    .getByLabel("Upload beberapa media")
    .setInputFiles([
      { name: "failure.png", mimeType: "image/png", buffer: png },
    ]);
  await expect(dialog.getByRole("alert")).toContainText(
    "R2 provider belum dikonfigurasi.",
  );
});

test("future schedule is stored in WIB and remains a manual queue", async ({
  page,
}, info) => {
  await page.goto("/?view=accounts");
  const username = `schedule.${info.project.name}`,
    label = `Jadwal ${info.project.name}`;
  const form = page
    .locator("form")
    .filter({
      has: page.getByRole("heading", {
        name: "Tambah akun TikTok",
        exact: true,
      }),
    });
  await form
    .getByRole("textbox", { name: "Nama akun", exact: true })
    .fill(label);
  await form
    .getByRole("textbox", { name: "Username", exact: true })
    .fill(username);
  await form.getByRole("checkbox").check();
  await form
    .getByRole("button", { name: "Tambah akun TikTok", exact: true })
    .click();
  const card = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: label, exact: true }) });
  await card
    .getByRole("button", { name: "Verifikasi identitas / health check" })
    .click();
  await card
    .getByRole("textbox", { name: "Username yang terlihat" })
    .fill(username);
  await card
    .getByRole("checkbox", { name: /Saya telah memeriksa username/ })
    .check();
  await card.getByRole("button", { name: "Catat verifikasi" }).click();
  await expect(card.getByText("ready", { exact: true })).toBeVisible();
  await navigate(page, "AI Content Studio");
  await page
    .getByRole("button", { name: "Buat konten manual", exact: true })
    .click();
  let dialog = page.getByRole("dialog", { name: "Buat konten TikTok" });
  await dialog
    .getByLabel("Akun TikTok aktif")
    .selectOption({ label: `${label} · @${username}` });
  await dialog.getByLabel("Jenis konten").selectOption("photo");
  await dialog
    .getByLabel("Caption & hashtag")
    .fill("Konten terjadwal " + info.project.name);
  await dialog
    .getByLabel("Usulan jadwal WIB")
    .fill(
      new Date(Date.now() + 86400000 + 7 * 3600000).toISOString().slice(0, 16),
    );
  await dialog.getByRole("checkbox", { name: "test.png" }).check();
  await dialog.getByRole("button", { name: "Simpan draft TikTok" }).click();
  await expect(dialog).toBeHidden();
  await navigate(page, "Inbox approval");
  const draft = page
    .locator("article")
    .filter({
      has: page.getByText("Konten terjadwal " + info.project.name, {
        exact: true,
      }),
    });
  await draft.getByRole("button", { name: "Detail & approval" }).click();
  dialog = page.getByRole("dialog", { name: "Tinjau konten TikTok" });
  await dialog.getByRole("checkbox", { name: /Saya meninjau akun/ }).check();
  await dialog
    .getByRole("button", { name: "Setujui revisi untuk handoff manual" })
    .click();
  await dialog
    .getByRole("button", { name: "Masukkan ke antrean manual" })
    .click();
  await expect(dialog.getByText("Terjadwal", { exact: true })).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Mulai handoff & tunggu pemeriksaan" }),
  ).toHaveCount(0);
});
