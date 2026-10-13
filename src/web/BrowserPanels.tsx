import { useEffect, useState } from "react";
import {
  Globe,
  RefreshCw,
  ExternalLink,
  Check,
  AlertTriangle,
  LoaderCircle,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { request } from "./client";
import type { Account, Workspace } from "../shared/model";
import type { BrowserJob, BrowserTarget } from "../shared/browser";
type PublicJob = ReturnType<
  typeof import("../shared/browser").safeBrowserJob
> & { result?: unknown; source?: string };
export function BrowserSettings({
  account,
  workspace,
  onSave,
  onNotify,
  onChanged,
  onDemoVerify,
}: {
  account: Account;
  workspace: Workspace;
  onSave: (
    enabled: boolean,
    profileId?: string,
    expectedUsername?: string,
  ) => Promise<void>;
  onNotify: (s: string, error?: boolean) => void;
  onChanged: () => Promise<void>;
  onDemoVerify: () => void;
}) {
  const [profile, setProfile] = useState(""),
    [expectedUsername, setExpectedUsername] = useState(
      account.browser?.expectedUsername || account.username,
    ),
    [enabled, setEnabled] = useState(account.browser?.enabled || false),
    [busy, setBusy] = useState(false),
    [config, setConfig] = useState(false),
    [login, setLogin] = useState<{
      id: string;
      liveUrl: string;
      expiresAt: string;
      platformUrl: string;
    } | null>(null),
    [logins, setLogins] = useState<
      { id: string; status: string; browserId?: string }[]
    >([]),
    [recovery, setRecovery] = useState(""),
    [job, setJob] = useState<PublicJob | null>(null);
  useEffect(() => {
    if (workspace.demo) {
      setConfig(true);
      setProfile(
        account.browser?.enabled ? "11111111-1111-4111-8111-111111111111" : "",
      );
      return;
    }
    request<{
      profileId?: string;
      enabled: boolean;
      configured: boolean;
      expectedUsername?: string;
    }>(`/api/browser/accounts/${account.id}`, workspace.csrf)
      .then((c) => {
        setProfile(c.profileId || "");
        setExpectedUsername(c.expectedUsername || account.username);
        setEnabled(c.enabled);
        setConfig(c.configured);
      })
      .catch((e) => onNotify(e.message, true));
    request<{
      items: {
        id: string;
        accountId: string;
        status: string;
        browserId?: string;
      }[];
    }>("/api/browser/logins", workspace.csrf)
      .then((r) => setLogins(r.items.filter((l) => l.accountId === account.id)))
      .catch(() => undefined);
  }, [account.id]);
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      onNotify(e instanceof Error ? e.message : "Aksi browser gagal.", true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="info-box browser-notice">
        <Globe size={18} />
        <p>
          Browser Use adalah opsi tambahan. Profile menyimpan sesi login di
          layanan browser. Gunakan satu profile per akun. Password dan cookie
          tidak diminta aplikasi ini.
        </p>
      </div>
      {!config && !workspace.demo && (
        <p className="table-error">
          Aktifkan BROWSER_USE_ENABLED dan isi BROWSER_USE_API_KEY pada Worker
          terlebih dahulu.
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void act(() =>
            onSave(enabled, profile || undefined, expectedUsername),
          );
        }}
      >
        <label className="approval-consent">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span>Izinkan opsi Browser Use untuk akun @{account.username}</span>
        </label>
        <label className="field">
          Username browser yang harus cocok
          <input
            value={expectedUsername}
            onChange={(e) => setExpectedUsername(e.target.value)}
            placeholder="Handle akun, bukan display name"
            maxLength={40}
          />
          <span className="muted">
            Nama tampilan TikTok dari API bisa berbeda dari handle. Isi handle
            akun yang benar.
          </span>
        </label>
        <label className="field">
          Browser Use Profile ID
          <input
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
            placeholder="UUID profile dari Browser Use Cloud"
            autoComplete="off"
          />
          <span className="muted">
            Buat profile di dashboard Browser Use, lalu salin ID-nya. ID ini
            tidak dibagikan ke klien MCP.
          </span>
        </label>
        <button
          className="button primary"
          type="submit"
          disabled={busy || (!config && enabled)}
        >
          <Check size={15} />
          Simpan koneksi
        </button>
      </form>
      <div className="browser-steps">
        <h3>Login & verifikasi</h3>
        <p className="muted">
          Status: {account.browser?.status || "belum terhubung"}. Browser baru
          tidak membuktikan akun sudah login.
        </p>
        <div className="heading-actions">
          <button
            className="button"
            disabled={busy || !account.browser?.enabled}
            onClick={() =>
              void act(async () => {
                if (workspace.demo) {
                  onNotify(
                    "Demo: login browser nyata memerlukan Browser Use Cloud.",
                  );
                  return;
                }
                setLogin(
                  await request(
                    `/api/browser/accounts/${account.id}/login`,
                    workspace.csrf,
                    "POST",
                    {},
                  ),
                );
              })
            }
          >
            <ExternalLink size={15} />
            Buka sesi login
          </button>
          <button
            className="button"
            disabled={busy || !account.browser?.enabled}
            onClick={() =>
              void act(async () => {
                if (workspace.demo) {
                  onDemoVerify();
                  return;
                }
                const j = await request<PublicJob>(
                  `/api/browser/accounts/${account.id}/probe`,
                  workspace.csrf,
                  "POST",
                  {},
                );
                setJob(j);
                onNotify(
                  "Pemeriksaan identitas dimulai. Periksa job sampai selesai.",
                );
              })
            }
          >
            <ShieldCheck size={15} />
            Periksa identitas
          </button>
        </div>
        {login && (
          <div className="browser-login">
            <p>
              Buka browser privat ini, login secara manual ke{" "}
              {login.platformUrl}, dan selesaikan verifikasi akun sendiri.
            </p>
            <a
              className="button"
              href={login.liveUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Buka live browser <ExternalLink size={14} />
            </a>
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await request(
                    `/api/browser/accounts/${account.id}/login-close`,
                    workspace.csrf,
                    "POST",
                    { login_id: login.id },
                  );
                  setLogin(null);
                  await onChanged();
                  onNotify(
                    "Sesi login ditutup. Jalankan Periksa identitas sebelum approval browser.",
                  );
                })
              }
            >
              Tutup sesi & simpan
            </button>
            <small>Link ini memberi akses ke sesi login. Jangan bagikan.</small>
          </div>
        )}
        {logins.map((l) => (
          <div className="browser-login" key={l.id}>
            <strong>Sesi {l.status}</strong>
            <small>ID: {l.id}</small>
            {!l.browserId && (
              <label className="field">
                ID browser dari Cloud (pemulihan)
                <input
                  value={recovery}
                  onChange={(e) => setRecovery(e.target.value)}
                  placeholder="Browser UUID"
                />
              </label>
            )}
            <button
              className="button"
              disabled={busy || (!l.browserId && !recovery)}
              onClick={() =>
                void act(async () => {
                  await request(
                    `/api/browser/accounts/${account.id}/login-close`,
                    workspace.csrf,
                    "POST",
                    { login_id: l.id, browser_id: recovery || undefined },
                  );
                  setLogins((items) => items.filter((x) => x.id !== l.id));
                  await onChanged();
                  onNotify("Sesi dihentikan; profile dapat dipakai kembali.");
                })
              }
            >
              Hentikan sesi
            </button>
          </div>
        ))}
        {job && (
          <div className="browser-job-note">
            <strong>Job: {job.id}</strong>
            <p>Status: {job.status}</p>
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  const current = await request<PublicJob>(
                    `/api/browser/jobs/${job.id}/poll`,
                    workspace.csrf,
                    "POST",
                    {},
                  );
                  setJob(current);
                  await onChanged();
                })
              }
            >
              <RefreshCw size={14} />
              Periksa hasil
            </button>
          </div>
        )}
      </div>
      <p className="muted">
        API tetap tersedia. Pilihan eksekusi ditentukan saat approval setiap
        draft. Browser memerlukan saldo tersendiri dan tidak menghapus ketentuan
        platform.
      </p>
    </>
  );
}
export function BrowserAccountForm({
  onCreate,
  busy,
}: {
  onCreate: (input: Record<string, string>) => void;
  busy: boolean;
}) {
  const [platform, setPlatform] = useState("instagram"),
    [username, setUsername] = useState(""),
    [label, setLabel] = useState(""),
    [profile, setProfile] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onCreate({ platform, username, label, profile_id: profile });
      }}
    >
      <p className="muted">
        Tambahkan akun browser bila koneksi API belum tersedia. Akun harus
        diverifikasi sebelum dipakai untuk eksekusi.
      </p>
      <label className="field">
        Platform
        <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
          <option value="instagram">Instagram</option>
          <option value="tiktok">TikTok</option>
        </select>
      </label>
      <label className="field">
        Username akun
        <input
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="username tanpa @"
          maxLength={40}
        />
      </label>
      <label className="field">
        Label akun
        <input
          required
          maxLength={80}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </label>
      <label className="field">
        Browser Use Profile ID
        <input
          required
          value={profile}
          onChange={(e) => setProfile(e.target.value)}
          placeholder="Profile UUID"
        />
      </label>
      <div className="modal-actions">
        <button type="submit" disabled={busy} className="button primary">
          Tambahkan akun browser
        </button>
      </div>
    </form>
  );
}
export function BrowserJobs({
  workspace,
  onNotify,
  onInspect,
}: {
  workspace: Workspace;
  onNotify: (s: string, e?: boolean) => void;
  onInspect: (id: string) => void;
}) {
  const [jobs, setJobs] = useState<PublicJob[]>([]),
    [cursor, setCursor] = useState<string | undefined>(),
    [account, setAccount] = useState(workspace.accounts[0]?.id || ""),
    [kind, setKind] = useState("stats"),
    [target, setTarget] = useState(""),
    [term, setTerm] = useState(""),
    [busy, setBusy] = useState(false);
  async function load(more = false) {
    if (workspace.demo) return;
    setBusy(true);
    try {
      const r = await request<{ items: PublicJob[]; cursor?: string }>(
        "/api/browser/jobs" +
          (more && cursor ? "?cursor=" + encodeURIComponent(cursor) : ""),
        workspace.csrf,
      );
      setJobs((old) => (more ? [...old, ...r.items] : r.items));
      setCursor(r.cursor);
    } catch (e) {
      onNotify(e instanceof Error ? e.message : "Gagal memuat job.", true);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <section className="panel browser-jobs">
      <div className="panel-heading">
        <div>
          <h3>Browser Use · pekerjaan tambahan</h3>
          <p>
            Job asinkron. Hasil baca dilabeli sumber browser; aksi publik tetap
            memerlukan approval.
          </p>
        </div>
        <button className="button" disabled={busy} onClick={() => void load()}>
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>
      <form
        className="browser-read-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (workspace.demo) {
            onNotify(
              "Demo: job browser nyata memerlukan API key dan profile login.",
            );
            return;
          }
          setBusy(true);
          try {
            await request("/api/browser/read", workspace.csrf, "POST", {
              account_id: account,
              kind,
              target_url: target || undefined,
              ...(kind === "research"
                ? term.startsWith("#")
                  ? { hashtag: term.slice(1) }
                  : { username: term.replace(/^@/, "") }
                : {}),
            });
            await load();
            onNotify("Job baca dimulai.");
          } catch (e) {
            onNotify(
              e instanceof Error ? e.message : "Job gagal dimulai.",
              true,
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="two-fields">
          <label className="field">
            Akun
            <select
              value={account}
              onChange={(e) => setAccount(e.target.value)}
            >
              {workspace.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label} · {a.platform}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Jenis baca
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setTarget("");
              }}
            >
              {[
                { id: "stats", name: "Statistik yang terlihat" },
                { id: "posts", name: "Konten akun" },
                { id: "comments", name: "Komentar posting" },
                { id: "conversations", name: "Daftar percakapan IG" },
                { id: "conversation", name: "Pesan thread IG" },
                { id: "research", name: "Profil / hashtag publik" },
              ].map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {["comments", "conversation"].includes(kind) && (
          <label className="field">
            URL posting / thread tepat
            <input
              type="url"
              required
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="https://www.instagram.com/p/.../"
            />
          </label>
        )}
        {kind === "research" && (
          <label className="field">
            Username atau #hashtag
            <input
              required
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
          </label>
        )}
        <button className="button" type="submit" disabled={busy || !account}>
          <Globe size={15} />
          Mulai job baca
        </button>
        <small>
          Memakai saldo Browser Use. Tidak mempublikasikan atau mengirim pesan.
        </small>
      </form>
      {jobs.length ? (
        <div className="browser-job-list">
          {[...jobs]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map((j) => (
              <button
                className="log-entry"
                onClick={() => onInspect(j.id)}
                key={j.id}
              >
                <span className="log-icon">
                  <Globe size={16} />
                </span>
                <div>
                  <strong>
                    {j.type === "action"
                      ? "Eksekusi draft"
                      : j.type === "probe"
                        ? "Pemeriksaan identitas"
                        : j.readKind}
                  </strong>
                  <p>
                    {
                      workspace.accounts.find((a) => a.id === j.accountId)
                        ?.label
                    }{" "}
                    · {j.status}
                  </p>
                  <small>{j.detailCode}</small>
                </div>
                <ExternalLink size={14} />
              </button>
            ))}
        </div>
      ) : (
        <p className="muted browser-empty">
          Belum ada job browser. Hubungkan profile dan periksa identitas
          terlebih dahulu.
        </p>
      )}
      {cursor && (
        <div className="load-more">
          <button
            className="button"
            disabled={busy}
            onClick={() => void load(true)}
          >
            Muat job berikutnya
          </button>
        </div>
      )}
    </section>
  );
}
export function BrowserJobInspector({
  id,
  workspace,
  onChanged,
  onNotify,
  onDraft,
}: {
  id: string;
  workspace: Workspace;
  onChanged: () => Promise<void>;
  onNotify: (s: string, e?: boolean) => void;
  onDraft: (
    accountId: string,
    kind: "comment_reply" | "dm_reply",
    target: BrowserTarget,
    text: string,
  ) => void;
}) {
  const [job, setJob] = useState<PublicJob | null>(null),
    [busy, setBusy] = useState(false),
    [runId, setRunId] = useState(""),
    [checked, setChecked] = useState(false),
    [reply, setReply] = useState("");
  async function load() {
    setJob(await request(`/api/browser/jobs/${id}`, workspace.csrf));
  }
  useEffect(() => {
    void load().catch((e) => onNotify(e.message, true));
  }, [id]);
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      await load();
      await onChanged();
    } catch (e) {
      onNotify(e instanceof Error ? e.message : "Aksi gagal.", true);
    } finally {
      setBusy(false);
    }
  }
  if (!job)
    return (
      <div className="loading-inline">
        <LoaderCircle className="spin" size={20} />
      </div>
    );
  const rows =
    job.result &&
    typeof job.result === "object" &&
    "items" in job.result &&
    Array.isArray(job.result.items)
      ? (job.result.items as {
          id: string;
          author?: string;
          text?: string;
          url?: string;
        }[])
      : [];
  return (
    <>
      <div className="browser-job-note">
        <strong>{job.id}</strong>
        <p>
          {job.type} · {job.status} · {job.remoteStatus || "belum diketahui"}
        </p>
        {job.detailCode && <p>{job.detailCode}</p>}
        <button
          className="button"
          disabled={busy}
          onClick={() =>
            void act(async () => {
              await request(
                `/api/browser/jobs/${id}/poll`,
                workspace.csrf,
                "POST",
                {},
              );
            })
          }
        >
          <RefreshCw size={15} />
          Periksa status
        </button>
        {job.remoteStatus &&
          !["completed", "failed", "cancelled"].includes(job.remoteStatus) && (
            <button
              className="button danger"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await request(
                    `/api/browser/jobs/${id}/stop`,
                    workspace.csrf,
                    "POST",
                    {},
                  );
                })
              }
            >
              Hentikan run
            </button>
          )}
      </div>
      {job.evidence && (
        <div className="info-box">
          <AlertTriangle size={18} />
          <div>
            <p>
              Browser melaporkan: {job.evidence.outcome}. Akun: @
              {job.evidence.observedUsername}.
            </p>
            {job.evidence.url && (
              <a
                href={job.evidence.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Periksa hasil di platform <ExternalLink size={13} />
              </a>
            )}
            <p>
              Laporan agen merupakan bukti tambahan. Periksa langsung sebelum
              menandai aksi selesai.
            </p>
          </div>
        </div>
      )}
      {job.status === "uncertain" && !job.remoteStatus && (
        <div className="browser-recovery">
          <label className="field">
            Pulihkan run yang responsnya hilang
            <input
              value={runId}
              onChange={(e) => setRunId(e.target.value)}
              placeholder="Run UUID dari Browser Use Cloud"
            />
          </label>
          <button
            className="button"
            disabled={busy || !runId}
            onClick={() =>
              void act(async () => {
                await request(
                  `/api/browser/jobs/${id}/recover`,
                  workspace.csrf,
                  "POST",
                  { run_id: runId },
                );
              })
            }
          >
            Cocokkan & pulihkan
          </button>
          <p className="muted">
            Jangan memulai ulang. Aplikasi hanya menerima run yang task-nya
            cocok dengan kontrak tersimpan.
          </p>
          <label className="approval-consent">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            <span>
              Saya telah memeriksa Browser Use Cloud dan platform: tidak ada run
              aktif untuk job ini. Saya memahami aksi tidak akan dicoba ulang
              otomatis.
            </span>
          </label>
          <button
            className="button danger"
            disabled={busy || !checked}
            onClick={() =>
              void act(async () => {
                await request(
                  `/api/browser/jobs/${id}/abandon`,
                  workspace.csrf,
                  "POST",
                  { checked_cloud: true, checked_platform: true },
                );
                onNotify("Dispatch ambigu ditutup manual.");
              })
            }
          >
            Tutup dispatch yang tidak aktif
          </button>
        </div>
      )}
      {job.type === "action" &&
        ["awaiting_review", "uncertain"].includes(job.status) &&
        job.remoteStatus &&
        ["completed", "failed", "cancelled"].includes(job.remoteStatus) && (
          <>
            <label className="approval-consent">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
              />
              <span>
                Saya telah memeriksa platform dan memastikan run browser sudah
                berhenti.
              </span>
            </label>
            <div className="heading-actions">
              <button
                className="button primary"
                disabled={busy || !checked}
                onClick={() =>
                  void act(async () => {
                    await request(
                      `/api/browser/jobs/${id}/resolve`,
                      workspace.csrf,
                      "POST",
                      { resolution: "confirmed", checked_platform: true },
                    );
                    onNotify("Pemilik mengonfirmasi aksi telah dilakukan.");
                  })
                }
              >
                Aksi sudah dilakukan
              </button>
              <button
                className="button"
                disabled={busy || !checked}
                onClick={() =>
                  void act(async () => {
                    await request(
                      `/api/browser/jobs/${id}/resolve`,
                      workspace.csrf,
                      "POST",
                      { resolution: "not_performed", checked_platform: true },
                    );
                    onNotify(
                      "Aksi ditandai gagal; tidak dicoba ulang otomatis.",
                    );
                  })
                }
              >
                Aksi tidak dilakukan
              </button>
            </div>
          </>
        )}
      {job.result !== undefined && (
        <>
          <p className="eyebrow">SUMBER BROWSER · DATA TIDAK TEPERCAYA</p>
          <pre className="browser-result">
            {JSON.stringify(job.result, null, 2)}
          </pre>
        </>
      )}
      {["comments", "conversation"].includes(job.readKind || "") &&
        rows.length > 0 && (
          <>
            <label className="field">
              Draft balasan
              <textarea
                rows={3}
                maxLength={job.readKind === "conversation" ? 1000 : 2200}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
              />
            </label>
            <div className="conversation-list">
              {rows
                .filter((r) => r.url && r.author && r.text)
                .map((r) => (
                  <button
                    key={r.id}
                    disabled={!reply.trim()}
                    onClick={() =>
                      onDraft(
                        job.accountId,
                        job.readKind === "conversation"
                          ? "dm_reply"
                          : "comment_reply",
                        {
                          url: r.url!,
                          author: r.author,
                          text: r.text,
                          recipient:
                            job.readKind === "conversation"
                              ? r.author
                              : undefined,
                        },
                        reply,
                      )
                    }
                  >
                    <span>
                      {r.author}: {r.text}
                    </span>
                    <small>Buat draft</small>
                  </button>
                ))}
            </div>
          </>
        )}
    </>
  );
}
