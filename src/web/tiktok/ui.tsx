import { useEffect } from "react";
export const statusLabels: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Menunggu approval",
  approved: "Disetujui",
  scheduled: "Terjadwal",
  ready_for_manual_publish: "Siap publikasi manual",
  awaiting_verification: "Menunggu pemeriksaan",
  published: "Terpublikasi (konfirmasi pemilik)",
  uncertain: "Hasil belum pasti",
  failed: "Gagal",
  cancelled: "Dibatalkan",
  unsupported: "Tidak didukung",
};
export const templates = {
  edukasi:
    "Hook: Tahukah kamu…\nMasalah:\n3 langkah praktis:\nCTA: Simpan untuk nanti.\n#edukasi",
  cerita:
    "Hook: Awalnya saya…\nTantangan:\nPerubahan:\nPelajaran:\nCTA: Bagikan pengalamanmu.",
  produk:
    "Hook:\nKebutuhan audiens:\nDemonstrasi produk:\nDisclosure komersial:\nCTA:",
};
export function wib(value?: string) {
  return value
    ? new Date(Date.parse(value) + 7 * 3600000).toISOString().slice(0, 16)
    : "";
}
export function iso(value: string) {
  return value ? new Date(value + ":00+07:00").toISOString() : undefined;
}
export function pretty(value?: string) {
  return value
    ? new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Jakarta",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Belum ada";
}
export function Notice({ children }: { children: React.ReactNode }) {
  return <p className="tt-notice">{children}</p>;
}
export function Dialog({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const old = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>(".tt-dialog");
    dialog?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const focus = dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input:not(:disabled),textarea,select:not(:disabled),summary,[tabindex="0"]',
        );
        if (!focus?.length) return;
        const first = focus[0],
          last = focus[focus.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === dialog)
        ) {
          e.preventDefault();
          last.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last || document.activeElement === dialog)
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      old?.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop">
      <section
        className="modal wide tt-dialog"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="modal-header">
          <h2>{title}</h2>
          <button
            className="button"
            onClick={close}
            aria-label="Tutup dialog TikTok"
          >
            Tutup
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
