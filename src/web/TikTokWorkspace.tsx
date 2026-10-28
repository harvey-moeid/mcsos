import { useEffect, useState } from "react";
import type { Account, Draft, Media, Workspace } from "../shared/model";
import { request, uploadFile } from "./client";
import { TOOL_NAMES } from "../shared/tool-names";

import { AccountForm, AccountCard } from "./tiktok/accounts";
import { AIStudio, DraftComposer } from "./tiktok/content";
import { DraftList, Review, Calendar } from "./tiktok/workflow";
import { TikTokAnalytics } from "./tiktok/analytics";
import { Notice } from "./tiktok/ui";
type Props = {
  workspace: Workspace;
  view: string;
  filter: string;
  reload: () => Promise<void>;
  notify: (s: string, error?: boolean) => void;
  browser: (id: string) => void;
};
export type Config = {
  contentStudio: boolean;
  sessionEnabled: boolean;
  analyticsEnabled: boolean;
  browserConfigured: boolean;
  aiConfigured: boolean;
  aiProvider: string;
  browserPublish: string;
  scheduler: string;
};
export function TikTokWorkspace({
  workspace: w,
  view,
  filter,
  reload,
  notify,
  browser,
}: Props) {
  const [config, setConfig] = useState<Config | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [editor, setEditor] = useState<Draft | "new" | null>(null),
    [selected, setSelected] = useState<Draft | null>(null),
    [history, setHistory] = useState<Draft[]>([]),
    [cursor, setCursor] = useState<string | undefined>();
  const allAccounts = w.accounts.filter((a) => a.platform === "tiktok"),
    accounts = allAccounts.filter((a) => filter === "all" || a.id === filter);
  const drafts = w.drafts.filter((d) =>
    accounts.some((a) => a.id === d.accountId),
  );
  useEffect(() => {
    if (w.demo) return;
    let active = true;
    request<Config>("/api/tiktok/config")
      .then((c) => {
        if (active) setConfig(c);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [w.demo]);
  const act = async (fn: () => Promise<unknown>) => {
    if (busy || w.demo) return;
    setBusy(true);
    setError("");
    try {
      await fn();
      await reload();
    } catch (e) {
      const s = e instanceof Error ? e.message : "Permintaan gagal.";
      setError(s);
      notify(s, true);
    } finally {
      setBusy(false);
    }
  };
  const command = (
    d: Draft,
    action: string,
    extra: Record<string, unknown> = {},
  ) =>
    request<Draft>(`/api/tiktok/drafts/${d.id}/${action}`, w.csrf, "POST", {
      account_id: d.accountId,
      revision: d.revision,
      ...extra,
    });
  if (w.demo)
    return ["studio", "overview", "settings", "mcp"].includes(view) ? (
      <Notice>
        Studio TikTok memakai backend owner-only. Masuk dengan GitHub pada
        instalasi nyata untuk mengelola akun; tidak ada integrasi demo yang
        mengaku aktif.
      </Notice>
    ) : null;
  if (error && !config)
    return (
      <div role="alert" className="table-error">
        {error}
        <button className="button" onClick={() => location.reload()}>
          Muat ulang
        </button>
      </div>
    );
  if (!config)
    return (
      <div
        className="tt-skeleton"
        aria-label="Memuat studio TikTok"
        aria-busy="true"
      />
    );
  return (
    <section className="tt-workspace" aria-label="Workspace TikTok">
      {error && (
        <p role="alert" className="table-error">
          {error}
        </p>
      )}
      {!config.contentStudio && (
        <Notice>
          Studio TikTok belum diaktifkan. Administrator dapat mengatur
          TIKTOK_CONTENT_STUDIO_ENABLED di Worker. Tidak ada tindakan TikTok
          otomatis.
        </Notice>
      )}
      {view === "overview" && (
        <>
          <div className="tt-hero">
            <span className="eyebrow">MCSOS · TIKTOK AI STUDIO v2.0</span>
            <h2>Ide siap. Keputusan di tangan Anda.</h2>
            <p>
              Siapkan konten, tinjau setiap revisi, dan lanjutkan secara manual
              di TikTok.
            </p>
          </div>
          <div className="tt-metrics">
            {[
              ["Akun TikTok", allAccounts.length],
              [
                "Draft",
                drafts.filter((d) =>
                  ["draft", "pending_approval"].includes(d.status),
                ).length,
              ],
              [
                "Siap manual",
                drafts.filter((d) => d.status === "ready_for_manual_publish")
                  .length,
              ],
              ["Terkonfirmasi", drafts.filter((d) => d.publication).length],
            ].map(([label, value]) => (
              <article className="panel" key={label}>
                <p>{label}</p>
                <strong>{value}</strong>
                <small>Sumber: internal MCSOS</small>
              </article>
            ))}
          </div>
          <Notice>
            AI menyiapkan. Pemilik menyetujui. Bukti publikasi dicatat setelah
            pemilik memeriksa platform. Tidak ada Cron atau auto-publish TikTok.
          </Notice>
        </>
      )}
      {view === "accounts" && (
        <>
          <h2>Akun TikTok · Session-First</h2>
          <AccountForm
            disabled={busy || !config.contentStudio}
            onSave={(input) =>
              act(async () => {
                await request("/api/tiktok/accounts", w.csrf, "POST", input);
                notify(
                  "Akun ditambahkan. Verifikasi identitas sebelum approval.",
                );
              })
            }
          />
          {!accounts.length && (
            <Notice>
              Belum ada akun TikTok. Tambahkan hanya akun milik Anda atau yang
              sah Anda kelola.
            </Notice>
          )}
          <div className="tt-grid">
            {accounts.map((a) => (
              <AccountCard
                key={a.id}
                account={a}
                busy={busy}
                config={config}
                browser={browser}
                action={(path, input) =>
                  act(async () => {
                    await request(
                      `/api/tiktok/accounts/${a.id}/${path}`,
                      w.csrf,
                      "POST",
                      input,
                    );
                    notify(
                      path === "disconnect"
                        ? "Referensi sesi MCSOS dihapus. Hapus profile remote lewat provider bila diperlukan."
                        : "Identitas dicatat sebagai konfirmasi manual pemilik.",
                    );
                  })
                }
                onLabels={(input) =>
                  act(() =>
                    request(
                      `/api/tiktok/accounts/${a.id}`,
                      w.csrf,
                      "PATCH",
                      input,
                    ),
                  )
                }
                queue={
                  drafts.filter(
                    (d) =>
                      d.accountId === a.id &&
                      [
                        "scheduled",
                        "ready_for_manual_publish",
                        "awaiting_verification",
                      ].includes(d.status),
                  ).length
                }
              />
            ))}
          </div>
        </>
      )}
      {view === "studio" && (
        <>
          <AIStudio
            accounts={accounts}
            csrf={w.csrf}
            configured={config.aiConfigured}
            onError={(s) => notify(s, true)}
            onUse={(text) => {
              const a = accounts[0];
              if (!a) return;
              setEditor({
                id: "",
                accountId: a.id,
                kind: "post",
                caption: text,
                aiGenerated: true,
                mediaIds: [],
                postType: "video",
                commercial: "none",
                status: "draft",
                revision: 0,
                attempts: 0,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });
            }}
          />
          <button
            className="button primary"
            disabled={!accounts.length || !config.contentStudio}
            onClick={() => setEditor("new")}
          >
            Buat konten manual
          </button>
          <Notice>
            Editor manual tetap tersedia tanpa provider AI. Hasil AI memerlukan
            pemeriksaan fakta dan label AI yang sesuai.
          </Notice>
        </>
      )}
      {["inbox", "queue"].includes(view) && (
        <>
          <div className="section-bar">
            <div>
              <h2>
                {view === "inbox"
                  ? "Draft & approval TikTok"
                  : "Kalender & antrean TikTok"}
              </h2>
              <p className="muted">
                Jadwal Asia/Jakarta · publikasi melalui handoff manusia
              </p>
            </div>
            <button
              className="button primary"
              disabled={busy || !accounts.length || !config.contentStudio}
              onClick={() => setEditor("new")}
            >
              Buat draft TikTok
            </button>
          </div>
          {view === "queue" && (
            <>
              <button
                className="button"
                disabled={busy || !config.contentStudio}
                onClick={() =>
                  act(async () => {
                    const result = await request<{
                      cursor?: string;
                      processed: number;
                    }>("/api/tiktok/process-due", w.csrf, "POST", { cursor });
                    setCursor(result.cursor);
                    notify(
                      `${result.processed} konten menjadi siap manual.${result.cursor ? " Proses halaman berikutnya untuk melanjutkan." : " Sapuan antrean selesai."}`,
                    );
                  })
                }
              >
                Periksa jadwal jatuh tempo
                {cursor ? " · halaman berikutnya" : ""}
              </button>
              <Calendar drafts={drafts} onSelect={setSelected} />
            </>
          )}
          <DraftList
            drafts={
              view === "inbox"
                ? drafts.filter((d) =>
                    ["draft", "pending_approval", "rejected"].includes(
                      d.status,
                    ),
                  )
                : drafts
            }
            accounts={accounts}
            busy={busy}
            onEdit={setEditor}
            onSelect={setSelected}
            onAction={(d, a) =>
              act(async () => {
                await command(d, a);
                notify("Status konten diperbarui.");
              })
            }
            onHistory={(d) =>
              act(async () => {
                const r = await request<{ items: Draft[] }>(
                  `/api/tiktok/drafts/${d.id}/history?account_id=${d.accountId}`,
                  w.csrf,
                );
                setHistory(r.items);
                setSelected(d);
              })
            }
          />
        </>
      )}
      {view === "analytics" && (
        <TikTokAnalytics
          key={filter}
          accounts={accounts}
          csrf={w.csrf}
          enabled={config.analyticsEnabled}
          notify={notify}
        />
      )}
      {view === "settings" && (
        <div className="panel tt-settings">
          <h2>Konfigurasi & kemampuan TikTok</h2>
          <dl>
            {Object.entries(config).map(([k, v]) => (
              <div key={k}>
                <dt>
                  {(
                    {
                      contentStudio: "Studio konten",
                      sessionEnabled: "Sesi browser",
                      analyticsEnabled: "Analitik",
                      browserConfigured: "Provider browser siap",
                      aiConfigured: "Provider AI siap",
                      aiProvider: "Provider AI",
                      browserPublish: "Publikasi browser",
                      scheduler: "Pemrosesan jadwal",
                    } as Record<string, string>
                  )[k] || k}
                </dt>
                <dd>
                  {typeof v === "boolean"
                    ? v
                      ? "Aktif"
                      : "Nonaktif"
                    : v === "unsupported"
                      ? "Tidak didukung"
                      : v === "manual"
                        ? "Manual"
                        : v}
                </dd>
              </div>
            ))}
          </dl>
          <Notice>
            Secret diatur melalui Wrangler di server. Perubahan flag tidak
            mengaktifkan publikasi TikTok otomatis. Penghapusan referensi sesi
            MCSOS tidak menghapus cookie pada provider; hapus profile dari
            dashboard provider.
          </Notice>
          <a
            href="https://github.com/harvey-moeid/mcsos/tree/feat/tiktok-ai-studio-v2/docs"
            target="_blank"
            rel="noreferrer"
          >
            Panduan konfigurasi, keamanan, deployment dan recovery
          </a>
        </div>
      )}
      {view === "mcp" && (
        <div className="panel tt-settings">
          <h2>MCP tools</h2>
          <p>
            Endpoint Streamable HTTP + OAuth: <code>{location.origin}/mcp</code>
          </p>
          <p>
            Scope baca: mcp:read · edit draft/AI: mcp:draft. Approval dan
            handoff hanya di dashboard.
          </p>
          <ul>
            {TOOL_NAMES.map((name) => (
              <li key={name}>
                <code>{name}</code>
              </li>
            ))}
          </ul>
          <Notice>
            Gunakan list_accounts → account_id → create_post_draft /
            update_post_draft. generate_tiktok_content menerima task caption,
            ideas, calendar dan tugas studio lainnya. Cookie, token, profile
            UUID dan URL live tidak tersedia melalui MCP.
          </Notice>
          <button
            className="button"
            onClick={() =>
              navigator.clipboard
                .writeText(location.origin + "/mcp")
                .then(() => notify("Endpoint MCP disalin."))
                .catch(() => notify("Clipboard tidak tersedia.", true))
            }
          >
            Salin endpoint
          </button>
        </div>
      )}
      {editor && (
        <DraftComposer
          key={typeof editor === "string" ? "new" : editor.id}
          draft={editor === "new" ? undefined : editor}
          accounts={accounts}
          media={w.media}
          csrf={w.csrf}
          busy={busy}
          close={() => setEditor(null)}
          upload={async (files, accountId, progress) => {
            for (let i = 0; i < files.length; i++)
              await uploadFile(
                files[i],
                w.csrf!,
                (n) => progress(Math.round((i * 100 + n) / files.length)),
                accountId,
              );
            await reload();
          }}
          save={(input) =>
            act(async () => {
              const editing =
                editor !== "new" && editor.id ? editor : undefined;
              await request(
                editing ? `/api/drafts/${editing.id}` : "/api/drafts",
                w.csrf,
                editing ? "PATCH" : "POST",
                { ...input, expected_revision: editing?.revision },
              );
              setEditor(null);
              notify("Draft disimpan. Approval diperlukan untuk revisi ini.");
            })
          }
        />
      )}
      {selected && (
        <Review
          draft={w.drafts.find((d) => d.id === selected.id) || selected}
          account={allAccounts.find((a) => a.id === selected.accountId)!}
          media={w.media}
          history={history}
          busy={busy}
          close={() => {
            setSelected(null);
            setHistory([]);
          }}
          action={(action, input) =>
            act(async () => {
              await command(
                w.drafts.find((d) => d.id === selected.id) || selected,
                action,
                input,
              );
              notify("Status disimpan. Tidak ada publikasi otomatis.");
            })
          }
        />
      )}
    </section>
  );
}
