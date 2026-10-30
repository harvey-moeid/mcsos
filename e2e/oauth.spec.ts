import { test, expect, type Page } from "@playwright/test";
import { createHash, randomBytes } from "node:crypto";

const callback = "https://client.example/oauth/callback";

async function mockNavigation(page: Page, urlPattern: string, body: string) {
  // Fetch interception also catches the second URL in a redirect chain;
  // Playwright routing only handles the chain's first request.
  const session = await page.context().newCDPSession(page);
  await session.send("Fetch.enable", {
    patterns: [{ urlPattern, requestStage: "Request" }],
  });
  session.on("Fetch.requestPaused", async ({ requestId }) => {
    await session.send("Fetch.fulfillRequest", {
      requestId,
      responseCode: 200,
      responseHeaders: [{ name: "Content-Type", value: "text/html" }],
      body: Buffer.from(body).toString("base64"),
    });
  });
}

async function consent(page: Page) {
  // This client and all storage belong to the isolated local workerd runtime.
  const registration = await page.request.post("/oauth/register", {
    data: {
      client_name: "Local OAuth regression test",
      redirect_uris: [callback],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"],
    },
  });
  expect(registration.status()).toBe(201);
  const client = await registration.json();
  const query = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: callback,
    response_type: "code",
    scope: "mcp:read",
    state: randomBytes(24).toString("base64url"),
    code_challenge: createHash("sha256")
      .update(randomBytes(48))
      .digest("base64url"),
    code_challenge_method: "S256",
    resource: "http://127.0.0.1:8792/mcp",
  });
  const response = await page.goto("/authorize?" + query);
  expect(response?.status()).toBe(200);
  return response!;
}

test("consent POST reaches GitHub in Chromium without a CSP violation", async ({
  page,
}) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("form-action")) violations.push(message.text());
  });
  // No real GitHub request, account login, or authorization grant is made.
  await mockNavigation(
    page,
    "https://github.com/login/oauth/authorize?*",
    "GitHub login reached",
  );
  const response = await consent(page);
  const cspHeaders = (await response.headersArray()).filter(
    (header) => header.name.toLowerCase() === "content-security-policy",
  );
  expect(cspHeaders).toHaveLength(1);
  expect(cspHeaders[0].value).toContain(
    "form-action 'self' https://github.com https://client.example",
  );
  expect(cspHeaders[0].value).toContain("frame-ancestors 'none'");
  await page.getByRole("button", { name: "Izinkan dan login GitHub" }).click();
  await expect(page).toHaveURL(
    /^https:\/\/github\.com\/login\/oauth\/authorize\?/,
  );
  await expect(page.getByText("GitHub login reached")).toBeVisible();
  expect(violations).toEqual([]);
});

test("denying consent reaches only the registered client callback", async ({
  page,
}) => {
  await mockNavigation(page, callback + "?*", "Client callback reached");
  await consent(page);
  await page.getByRole("button", { name: "Tolak", exact: true }).click();
  await expect(page).toHaveURL(/^https:\/\/client\.example\/oauth\/callback\?/);
  expect(new URL(page.url()).searchParams.get("error")).toBe("access_denied");
  await expect(page.getByText("Client callback reached")).toBeVisible();
});

test("a used consent form returns 400 and can restart with a fresh consent", async ({
  page,
}) => {
  await consent(page);
  const handle = await page.locator('[name="handle"]').inputValue();
  const restart = await page.locator('[name="restart"]').inputValue();
  const first = await page.request.post("/authorize", {
    form: { handle, restart, decision: "allow" },
    maxRedirects: 0,
  });
  expect(first.status()).toBe(302);
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/authorize") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Izinkan dan login GitHub" }).click();
  expect((await response).status()).toBe(400);
  await expect(
    page.getByRole("heading", { name: "Mulai ulang otorisasi" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Mulai ulang login" }),
  ).toHaveAttribute("href", restart);
  await page.getByRole("link", { name: "Mulai ulang login" }).click();
  await expect(
    page.getByRole("button", { name: "Izinkan dan login GitHub" }),
  ).toBeVisible();
  expect(await page.locator('[name="handle"]').inputValue()).not.toBe(handle);
});

test("missing binding cookies cannot authorize and external restart links are refused", async ({
  page,
}) => {
  await consent(page);
  await page.locator('[name="restart"]').evaluate((input: HTMLInputElement) => {
    input.value = "https://evil.example/authorize?client_id=attacker";
  });
  await page.context().clearCookies();
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/authorize") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Izinkan dan login GitHub" }).click();
  expect((await response).status()).toBe(400);
  await expect(
    page.getByRole("link", { name: "Mulai ulang login" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Buka dashboard" }),
  ).toHaveAttribute("href", "/");
});
