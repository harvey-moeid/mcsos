import { useState } from "react";
import type { Account } from "../../shared/model";
import type { Config } from "../TikTokWorkspace";
import { Notice, pretty } from "./ui";
export function AccountForm({
  disabled,
  onSave,
}: {
  disabled: boolean;
  onSave: (p: unknown) => void;
}) {
  return (
    <form
      className="panel tt-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        onSave({
          username: f.get("username"),
          label: f.get("label"),
          owned_or_managed: true,
        });
      }}
    >
      <h3>Tambah akun TikTok</h3>
      <div className="two-fields">
        <label className="field">
          Nama akun
          <input name="label" required maxLength={80} />
        </label>
        <label className="field">
          Username
          <input
            name="username"
            required
            pattern="@?[A-Za-z0-9_.]{1,24}"
            placeholder="@username"
          />
        </label>
      </div>
      <label className="approval-consent">
        <input type="checkbox" required />
        Saya memiliki atau secara sah mengelola akun ini.
      </label>
      <button className="button primary" disabled={disabled}>
        Tambah akun TikTok
      </button>
    </form>
  );
}
export function AccountCard({
  account: a,
  busy,
  config,
  browser,
  action,
  onLabels,
  queue,
}: {
  account: Account;
  busy: boolean;
  config: Config;
  browser: (id: string) => void;
  action: (path: string, input: unknown) => void;
  onLabels: (input: unknown) => void;
  queue: number;
}) {
  const [verify, setVerify] = useState(false),
    [disconnect, setDisconnect] = useState(false),
    [mode, setMode] = useState("manual");
  const expired =
    a.tiktok?.verifiedAt &&
    Date.now() - Date.parse(a.tiktok.verifiedAt) > 86400000;
  return (
    <article className="panel tt-form">
      <h3>{a.label}</h3>
      <p>@{a.browser?.expectedUsername || a.username}</p>
      <span className="tt-badge">
        {expired ? "login_required" : a.tiktok?.status || "unverified"}
      </span>
      <p className="muted">
        Verifikasi terakhir: {pretty(a.tiktok?.verifiedAt)} · sumber manual
      </p>
      <p>{queue} konten dalam antrean akun ini</p>
      <p>
        {[...(a.groups || []), ...(a.labels || [])].join(" · ") ||
          "Belum ada grup/label"}
      </p>
      <div className="tt-actions">
        <a
          className="button"
          href="https://www.tiktok.com/"
          target="_blank"
          rel="noreferrer"
        >
          Buka TikTok Web
        </a>
        <button
          className="button"
          disabled={busy}
          onClick={() => setVerify(!verify)}
        >
          Verifikasi identitas / health check
        </button>
        <button
          className="button"
          disabled={busy || !config.sessionEnabled || !config.browserConfigured}
          onClick={() => browser(a.id)}
        >
          Login ulang / kelola profile browser
        </button>
        <button
          className="button danger"
          disabled={busy}
          onClick={() => setDisconnect(!disconnect)}
        >
          Disconnect & hapus referensi sesi
        </button>
      </div>
      {verify && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            action("verify", {
              username: f.get("username"),
              mode,
              checked_identity: true,
            });
            setVerify(false);
          }}
        >
          <Notice>
            Login secara manual. Periksa menu profil TikTok untuk username
            aktif. Ini pernyataan pemilik; MCSOS tidak membaca sesi browser
            pribadi Anda. Untuk sesi provider, tutup sesi login setelah
            memeriksa identitas.
          </Notice>
          <label className="field">
            Mode
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="manual">Browser pribadi · handoff manual</option>
              <option
                value="connected_browser"
                disabled={!config.sessionEnabled || !a.browser?.enabled}
              >
                Browser provider · identitas diperiksa manual
              </option>
            </select>
          </label>
          <label className="field">
            Username yang terlihat
            <input name="username" required placeholder="username aktif" />
          </label>
          <label className="approval-consent">
            <input type="checkbox" required />
            Saya telah memeriksa username yang benar-benar login.
          </label>
          <button className="button primary" disabled={busy}>
            Catat verifikasi
          </button>
        </form>
      )}
      {disconnect && (
        <div role="alert">
          <Notice>
            Referensi terenkripsi dan token MCSOS dihapus. Tutup sesi aktif
            terlebih dahulu. Logout/hapus profile remote dilakukan pada
            provider; riwayat konten dipertahankan.
          </Notice>
          <button
            className="button danger"
            disabled={busy}
            onClick={() => {
              action("disconnect", {});
              setDisconnect(false);
            }}
          >
            Konfirmasi hapus referensi sesi
          </button>
        </div>
      )}
      <details>
        <summary>Ubah nama, grup dan label</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const split = (v: FormDataEntryValue | null) =>
              String(v || "")
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean);
            onLabels({
              username: f.get("username"),
              label: f.get("label"),
              groups: split(f.get("groups")),
              labels: split(f.get("labels")),
            });
          }}
        >
          <label className="field">
            Nama
            <input
              name="label"
              defaultValue={a.label}
              required
              maxLength={80}
            />
          </label>
          <label className="field">
            Handle akun (perubahan membatalkan verifikasi)
            <input
              name="username"
              defaultValue={a.browser?.expectedUsername || a.username}
              required
              pattern="@?[A-Za-z0-9_.]{1,24}"
            />
          </label>
          <label className="field">
            Grup (pisahkan koma)
            <input name="groups" defaultValue={a.groups?.join(", ")} />
          </label>
          <label className="field">
            Label (pisahkan koma)
            <input name="labels" defaultValue={a.labels?.join(", ")} />
          </label>
          <button className="button" disabled={busy}>
            Simpan label
          </button>
        </form>
      </details>
    </article>
  );
}
