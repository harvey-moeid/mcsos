// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../src/web/App";
beforeEach(() => {
  localStorage.clear();
  history.replaceState({}, "", "/?demo=1");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("dashboard demo workflows", () => {
  it("shows explicit demo label, approval inbox and token warning", async () => {
    render(<App />);
    expect(
      await screen.findByRole("heading", { name: "Inbox approval." }),
    ).toBeTruthy();
    expect(screen.getByText(/Mode demo · data contoh/)).toBeTruthy();
    expect(
      screen.getByText("Ada akun yang perlu dihubungkan ulang."),
    ).toBeTruthy();
  });
  it("creates a draft without publishing or contacting a platform", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<App />);
    await screen.findByRole("heading", { name: "Inbox approval." });
    await user.click(screen.getByRole("button", { name: /Buat draft/ }));
    const dialog = screen.getByRole("dialog", { name: "Buat draft baru" });
    await user.type(
      within(dialog).getByPlaceholderText("Tuliskan cerita atau balasanmu…"),
      "Cerita test dari Codex",
    );
    await user.click(
      within(dialog).getByRole("button", { name: /Simpan draft/ }),
    );
    expect(await screen.findByText(/Cerita test dari Codex/)).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("requires explicit review checkbox before approval", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Inbox approval." });
    await user.click(
      screen.getAllByRole("button", { name: /Tinjau & setujui/ })[0],
    );
    const dialog = screen.getByRole("dialog", { name: "Tinjau & setujui" });
    const button = within(dialog).getByRole("button", {
      name: "Setujui revisi 1",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await user.click(within(dialog).getByRole("checkbox"));
    expect(button.disabled).toBe(false);
    await user.click(button);
    expect(await screen.findByText(/Simulasi: draft disetujui/)).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("bulk selection appears only on comment replies", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Inbox approval." });
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBe(2);
    await user.click(checkboxes[0]);
    expect(screen.getByText("1 balasan komentar dipilih")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Setujui balasan terpilih/ }),
    ).toBeTruthy();
  });
  it("navigates between all six real dashboard views", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Inbox approval." });
    for (const name of [
      "Antrean & kalender",
      "Analitik",
      "Akun terhubung",
      "Pustaka media",
      "Log aktivitas",
    ]) {
      await user.click(screen.getByRole("button", { name }));
      expect(screen.getByRole("heading", { name: name + "." })).toBeTruthy();
    }
  });
  it("turns a calendar idea into a new draft instead of PATCHing an empty ID", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Inbox approval." });
    await user.click(
      screen.getByRole("button", { name: "Antrean & kalender" }),
    );
    await user.click(
      screen.getAllByRole("button", { name: /Jadikan draft/ })[0],
    );
    expect(
      screen.getByRole("dialog", { name: "Buat draft baru" }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Simpan draft/ }));
    expect(
      await screen.findByText("Draft disimpan. Approval tetap diperlukan."),
    ).toBeTruthy();
  });
  it("supports light/dark/system theme settings", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Inbox approval." });
    await user.click(screen.getByRole("button", { name: "Terang" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    await user.click(screen.getByRole("button", { name: "Gelap" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});

describe("browser option in the dashboard", () => {
  it("connects and simulates verification without opening a real browser", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<App />);
    await screen.findByRole("heading", { name: "Inbox approval." });
    await user.click(screen.getByRole("button", { name: "Akun terhubung" }));
    await user.click(
      screen.getAllByRole("button", { name: /Pengaturan browser/ })[0],
    );
    const dialog = screen.getByRole("dialog", {
      name: "Browser Use · koneksi akun",
    });
    await user.click(within(dialog).getByRole("checkbox"));
    await user.type(
      within(dialog).getByPlaceholderText(
        "UUID profile dari Browser Use Cloud",
      ),
      "11111111-1111-4111-8111-111111111111",
    );
    await user.click(
      within(dialog).getByRole("button", { name: /Simpan koneksi/ }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: /Periksa identitas/ }),
    );
    expect(
      await screen.findByText(
        "Demo: sesi browser ditandai siap. Tidak ada browser nyata dibuka.",
      ),
    ).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("browser read UI accepts fixed operation types and exposes no free-form task input", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Inbox approval." });
    await user.click(screen.getByRole("button", { name: "Akun terhubung" }));
    expect(
      screen.getByRole("heading", { name: "Browser Use · pekerjaan tambahan" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /Mulai job baca/ })).toBeTruthy();
    expect(screen.queryByPlaceholderText(/task|instruksi bebas/i)).toBeNull();
  });
  it("approval route defaults to the official API and an unavailable browser option is disabled", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Inbox approval." });
    await user.click(
      screen.getAllByRole("button", { name: /Tinjau & setujui/ })[0],
    );
    const select = screen.getByRole("combobox", {
      name: "Jalur eksekusi",
    });
    expect(select).toHaveProperty("value", "api");
    const option = within(select).getByRole("option", {
      name: /Browser Use/,
    });
    expect(option.hasAttribute("disabled")).toBe(true);
  });
});
