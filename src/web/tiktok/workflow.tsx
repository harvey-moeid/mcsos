import { useState, useMemo } from "react";
import type { Account, Draft, Media } from "../../shared/model";
import { Notice, Dialog, wib, pretty, statusLabels } from "./ui";
export function DraftList({
  drafts,
  accounts,
  busy,
  onEdit,
  onSelect,
  onAction,
  onHistory,
}: {
  drafts: Draft[];
  accounts: Account[];
  busy: boolean;
  onEdit: (d: Draft) => void;
  onSelect: (d: Draft) => void;
  onAction: (d: Draft, a: string) => void;
  onHistory: (d: Draft) => void;
}) {
  const [status, setStatus] = useState("all"),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(0),
    [deleteId, setDeleteId] = useState("");
  const filtered = drafts.filter(
    (d) =>
      (status === "all" || d.status === status) &&
      d.caption.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="tt-actions">
        <label>
          Filter status
          <select
            aria-label="Status TikTok"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
          >
            <option value="all">Semua status</option>
            {Object.entries(statusLabels).map(([v, l]) => (
              <option value={v} key={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          Cari konten
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Cari caption TikTok"
          />
        </label>
      </div>
      {!filtered.length && (
        <Notice>
          Belum ada konten untuk filter ini. Buat draft manual atau siapkan ide
          melalui AI Content Studio.
        </Notice>
      )}
      <div className="tt-grid">
        {filtered.slice(page * 12, (page + 1) * 12).map((d) => (
          <article className="panel tt-form" key={d.id}>
            <span className="tt-badge">
              {statusLabels[d.status] || d.status}
            </span>
            <h3>{accounts.find((a) => a.id === d.accountId)?.label}</h3>
            <p className="tt-caption">{d.caption || "Caption belum diisi"}</p>
            <small>
              Revisi {d.revision} · {pretty(d.scheduledAt)}
            </small>
            {d.status === "scheduled" &&
              Date.parse(d.scheduledAt || "") < Date.now() && (
                <p className="table-error">
                  Jadwal terlewat: periksa antrean secara manual.
                </p>
              )}
            <div className="tt-actions">
              <button className="button" onClick={() => onSelect(d)}>
                Detail & approval
              </button>
              {d.status === "draft" && (
                <>
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => onEdit(d)}
                  >
                    Edit konten
                  </button>
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => onAction(d, "request-approval")}
                  >
                    Minta approval
                  </button>
                </>
              )}
              <button
                className="button"
                disabled={busy}
                onClick={() => onAction(d, "duplicate")}
              >
                Duplikat
              </button>
              <button
                className="button"
                disabled={busy}
                onClick={() => onHistory(d)}
              >
                Riwayat revisi
              </button>
              {[
                "pending_approval",
                "approved",
                "scheduled",
                "ready_for_manual_publish",
                "cancelled",
                "failed",
              ].includes(d.status) && (
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => onAction(d, "reset")}
                >
                  Kembalikan ke draft
                </button>
              )}
              {[
                "draft",
                "pending_approval",
                "approved",
                "scheduled",
                "ready_for_manual_publish",
              ].includes(d.status) && (
                <button
                  className="button danger"
                  disabled={busy}
                  onClick={() => setDeleteId(d.id)}
                >
                  Batalkan konten
                </button>
              )}
              {deleteId === d.id && (
                <div role="alert">
                  <p>Batalkan konten dan hapus approval revisi ini?</p>
                  <button
                    className="button danger"
                    disabled={busy}
                    onClick={() => {
                      onAction(d, "cancel");
                      setDeleteId("");
                    }}
                  >
                    Konfirmasi pembatalan
                  </button>
                  {d.status === "draft" && (
                    <button
                      className="button danger"
                      disabled={busy}
                      onClick={() => {
                        onAction(d, "delete");
                        setDeleteId("");
                      }}
                    >
                      Hapus draft permanen
                    </button>
                  )}
                  <button className="button" onClick={() => setDeleteId("")}>
                    Kembali
                  </button>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
      <div className="tt-actions">
        <button
          className="button"
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
        >
          Sebelumnya
        </button>
        <span>
          Halaman {page + 1} · {filtered.length} konten dimuat
        </span>
        <button
          className="button"
          disabled={(page + 1) * 12 >= filtered.length}
          onClick={() => setPage(page + 1)}
        >
          Berikutnya
        </button>
      </div>
    </>
  );
}
export function Review({
  draft: d,
  account: a,
  media,
  history,
  busy,
  close,
  action,
}: {
  draft: Draft;
  account: Account;
  media: Media[];
  history: Draft[];
  busy: boolean;
  close: () => void;
  action: (a: string, p: Record<string, unknown>) => void;
}) {
  const [approved, setApproved] = useState(false),
    [active, setActive] = useState(false),
    [handoffId] = useState(crypto.randomUUID()),
    [outcome, setOutcome] = useState("published");
  return (
    <Dialog title="Tinjau konten TikTok" close={close}>
      <div className="tt-review">
        <h3>
          {a?.label} · @
          {d.approval?.username || a?.browser?.expectedUsername || a?.username}
        </h3>
        <span className="tt-badge">{statusLabels[d.status]}</span>
        <p>
          Revisi {d.revision} · jadwal {pretty(d.scheduledAt)} · metode handoff
          manual
        </p>
        <p className="preserve-lines">{d.caption}</p>
        <p>Catatan: {d.notes || "Tidak ada"}</p>
        <p>
          Disclosure: {d.commercial} · label AI:{" "}
          {d.aiGenerated ? "Perlu diperiksa" : "Tidak ditandai"}
        </p>
        <ul>
          {media
            .filter((m) => d.mediaIds.includes(m.id))
            .map((m) => (
              <li key={m.id}>
                <a href={m.previewUrl} target="_blank" rel="noreferrer">
                  Unduh / buka {m.filename}
                </a>{" "}
                · {m.width}×{m.height}
              </li>
            ))}
        </ul>
        <button
          className="button"
          onClick={() =>
            navigator.clipboard.writeText(d.caption).catch(() => {})
          }
        >
          Salin caption
        </button>
        <Notice>
          Pastikan username akun aktif sebelum melanjutkan. Pilih privasi,
          komentar, duet, stitch, cover, disclosure dan label AI langsung di
          TikTok. Tidak ada unggahan atau klik publik otomatis.
        </Notice>
        {["draft", "pending_approval", "rejected"].includes(d.status) && (
          <>
            <label className="approval-consent">
              <input
                type="checkbox"
                checked={approved}
                onChange={(e) => setApproved(e.target.checked)}
              />
              Saya meninjau akun, caption, media, disclosure dan jadwal pada
              revisi {d.revision}.
            </label>
            <button
              className="button primary"
              disabled={busy || !approved}
              onClick={() =>
                action("approve", {
                  checked_content: true,
                  username: a.tiktok?.verifiedUsername,
                })
              }
            >
              Setujui revisi untuk handoff manual
            </button>
          </>
        )}
        {d.status === "approved" && (
          <button
            className="button primary"
            disabled={busy}
            onClick={() => action("schedule", {})}
          >
            Masukkan ke antrean manual
          </button>
        )}
        {d.status === "ready_for_manual_publish" && (
          <>
            <label className="approval-consent">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              Saya sudah memeriksa akun aktif @{d.approval?.username}; saya akan
              mempublikasikan sendiri.
            </label>
            <button
              className="button primary"
              disabled={busy || !active}
              onClick={() =>
                action("handoff", {
                  checked_account: true,
                  request_id: handoffId,
                })
              }
            >
              Mulai handoff & tunggu pemeriksaan
            </button>
          </>
        )}
        {["awaiting_verification", "uncertain"].includes(d.status) && (
          <>
            <a
              className="button primary"
              href="https://www.tiktok.com/tiktokstudio/upload"
              target="_blank"
              rel="noreferrer"
            >
              Buka TikTok untuk publikasi manual
            </a>
            <Notice>
              Jika hasil belum jelas, jangan kirim ulang. Periksa profil dan
              posting di TikTok, lalu catat hasil berikut.
            </Notice>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                action("confirm", {
                  outcome,
                  checked_platform: true,
                  username: f.get("username"),
                  url: String(f.get("url") || "") || undefined,
                  observed_at: new Date().toISOString(),
                });
              }}
            >
              <label className="field">
                Hasil yang diperiksa
                <select
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                >
                  <option value="published">
                    Saya melihat posting terpublikasi
                  </option>
                  <option value="uncertain" disabled={d.status === "uncertain"}>
                    Hasil belum pasti
                  </option>
                  <option value="failed">
                    Saya memastikan posting tidak dilakukan / gagal
                  </option>
                </select>
              </label>
              <label className="field">
                Username yang diperiksa
                <input name="username" required />
              </label>
              <label className="field">
                URL posting TikTok
                <input
                  type="url"
                  name="url"
                  required={outcome === "published"}
                  placeholder="https://www.tiktok.com/@username/video/…"
                />
              </label>
              <label className="approval-consent">
                <input type="checkbox" required />
                Saya telah memeriksa hasil pada platform dan akun yang tepat.
              </label>
              <button className="button" disabled={busy}>
                Simpan konfirmasi pemilik
              </button>
            </form>
          </>
        )}
        {d.publication && (
          <Notice>
            Publikasi dicatat dari pemeriksaan manual:{" "}
            <a href={d.publication.url} target="_blank" rel="noreferrer">
              Buka bukti posting
            </a>{" "}
            · {pretty(d.publication.observedAt)}. Bukan verifikasi API TikTok.
          </Notice>
        )}
        {history.length > 0 && (
          <details open>
            <summary>Riwayat revisi tersimpan</summary>
            {history.map((h) => (
              <article className="tt-ai-result" key={h.revision}>
                <h4>
                  Revisi {h.revision} · {pretty(h.updatedAt)}
                </h4>
                <p className="preserve-lines">{h.caption}</p>
              </article>
            ))}
          </details>
        )}
      </div>
    </Dialog>
  );
}
export function Calendar({
  drafts,
  onSelect,
}: {
  drafts: Draft[];
  onSelect: (d: Draft) => void;
}) {
  const today = wib(new Date().toISOString()).slice(0, 10),
    [anchor, setAnchor] = useState(today),
    [mode, setMode] = useState("month");
  // Calendar date arithmetic is local-free: use UTC noon to avoid timezone/date rollover.
  const calendarDays = useMemo(() => {
    const base = new Date(anchor + "T12:00:00Z");
    if (mode === "month") base.setUTCDate(1);
    const n =
      mode === "day"
        ? 1
        : mode === "week"
          ? 7
          : new Date(
              Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0),
            ).getUTCDate();
    return Array.from({ length: n }, (_, i) =>
      new Date(base.getTime() + i * 86400000).toISOString().slice(0, 10),
    );
  }, [anchor, mode]);
  return (
    <div className="panel tt-form">
      <div className="tt-actions">
        <label>
          Tanggal kalender
          <input
            type="date"
            value={anchor}
            onChange={(e) => {
              if (e.target.value) setAnchor(e.target.value);
            }}
          />
        </label>
        <label>
          Tampilan
          <select
            aria-label="Tampilan kalender TikTok"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="day">Harian</option>
            <option value="week">Mingguan</option>
            <option value="month">Bulanan</option>
          </select>
        </label>
      </div>
      <div className={`tt-calendar ${mode}`}>
        {calendarDays.map((day) => (
          <div key={day} className={day === today ? "today" : ""}>
            <strong>
              {day.slice(8)}
              <small> {day.slice(5, 7)}</small>
            </strong>
            {drafts
              .filter((d) => wib(d.scheduledAt).startsWith(day))
              .map((d) => (
                <button key={d.id} onClick={() => onSelect(d)}>
                  {wib(d.scheduledAt).slice(11)} ·{" "}
                  {d.caption.slice(0, 45) || "Tanpa caption"}
                  <small>{statusLabels[d.status]}</small>
                </button>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
