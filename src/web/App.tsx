import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  LayoutDashboard,
  CalendarDays,
  ChartNoAxesCombined,
  Users,
  Images,
  ScrollText,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Search,
  Clock,
  CheckCheck,
  X,
  MessageCircle,
  Heart,
  Send,
  Bookmark,
  Upload,
  AlertTriangle,
  RefreshCw,
  Link,
  Copy,
  LogOut,
  Menu,
  Sun,
  Moon,
  Monitor,
  LoaderCircle,
  ExternalLink,
  Lightbulb,
  Trash2,
  Edit3,
  Filter,
  Play,
  ShieldCheck,
  Inbox,
  Music2,
  Eye,
} from "lucide-react";
import {
  BrowserSettings,
  BrowserAccountForm,
  BrowserJobs,
  BrowserJobInspector,
} from "./BrowserPanels";
import {
  validateBrowserTarget,
  type ExecutionMethod,
  type BrowserTarget,
} from "../shared/browser";
import { validateMedia } from "../shared/model";
import type {
  Account,
  Activity,
  Draft,
  Idea,
  Media,
  Workspace,
} from "../shared/model";
import { loadDemo, saveDemo, seedDemo, DEMO_KEY } from "./demo";
import { getWorkspace, request, uploadFile, inspectFile } from "./client";
type View = "inbox" | "queue" | "analytics" | "accounts" | "media" | "logs";
const navigation = [
  { id: "inbox", label: "Inbox approval", icon: LayoutDashboard },
  { id: "queue", label: "Antrean & kalender", icon: CalendarDays },
  { id: "analytics", label: "Analitik", icon: ChartNoAxesCombined },
  { id: "accounts", label: "Akun terhubung", icon: Users },
  { id: "media", label: "Pustaka media", icon: Images },
  { id: "logs", label: "Log aktivitas", icon: ScrollText },
] as const;
const fmt = new Intl.NumberFormat("id-ID"),
  compact = (n: number) =>
    new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n),
  date = (
    s: string,
    options: Intl.DateTimeFormatOptions = {
      dateStyle: "medium",
      timeStyle: "short",
    },
  ) =>
    new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      ...options,
    }).format(new Date(s));
function localInput(s?: string) {
  if (!s) return "";
  const d = new Date(s);
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(d)
    .replace(" ", "T");
}
function inputISO(s: string) {
  return new Date(s + ":00+07:00").toISOString();
}
const labels: Record<string, string> = {
  draft: "Menunggu approval",
  rejected: "Ditolak",
  scheduled: "Terjadwal",
  publishing: "Memproses",
  published: "Terpublikasi",
  failed: "Gagal",
  uncertain: "Perlu diperiksa",
  post: "Posting",
  comment_reply: "Balasan komentar",
  comment_moderation: "Moderasi",
  dm_reply: "Balasan DM",
};
function Instagram({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.6" cy="6.5" r=".9" fill="currentColor" stroke="none" />
    </svg>
  );
}
function PlatformIcon({
  platform,
  size = 14,
}: {
  platform: Account["platform"];
  size?: number;
}) {
  return platform === "instagram" ? (
    <Instagram size={size} />
  ) : (
    <Music2 size={size} />
  );
}
function Badge({ status }: { status: string }) {
  return (
    <span className={`badge ${status}`}>
      <span className="dot" />
      {labels[status] || status}
    </span>
  );
}
function Empty({
  icon: Icon = Inbox,
  title,
  children,
}: {
  icon?: typeof Inbox;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <Icon size={32} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", fn);
    const previous = document.activeElement as HTMLElement | null;
    const first = document.querySelector<HTMLElement>(".modal button");
    first?.focus();
    return () => {
      document.removeEventListener("keydown", fn);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Tab") {
            const nodes = e.currentTarget.querySelectorAll<HTMLElement>(
              "button:not(:disabled),input,textarea,select,a[href]",
            );
            const first = nodes[0],
              last = nodes[nodes.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <header>
          <h2>{title}</h2>
          <button
            className="icon-btn"
            aria-label="Tutup dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
function PostPreview({
  draft,
  account,
  media,
}: {
  draft: Draft;
  account?: Account;
  media: Media[];
}) {
  const m = media.find((m) => m.id === draft.mediaIds[0]);
  return (
    <div
      className={`post-preview ${account?.platform === "tiktok" ? "tiktok-preview" : ""}`}
    >
      <div className="post-account">
        <span className="avatar small">{account?.label.slice(0, 1)}</span>
        <span>
          <strong>{account?.username}</strong>
          <small>
            {account?.platform === "instagram" ? "Original content" : "TikTok"}
          </small>
        </span>
        <MoreHorizontal size={18} />
      </div>
      {draft.kind === "post" ? (
        <>
          <div className="post-image">
            {m?.previewUrl ? (
              m.mime.startsWith("video/") ? (
                <video src={m.previewUrl} controls preload="metadata" />
              ) : (
                <img src={m.previewUrl} alt={m.filename} />
              )
            ) : (
              <div className="media-placeholder">
                <Images size={28} />
                <span>Media belum dipilih</span>
              </div>
            )}
            {draft.postType === "carousel" && (
              <span className="carousel-count">1/{draft.mediaIds.length}</span>
            )}
          </div>
          <div className="post-tools">
            <Heart size={20} />
            <MessageCircle size={20} />
            <Send size={19} />
            <Bookmark size={20} />
          </div>
          <p className="post-caption">
            <strong>{account?.username}</strong>{" "}
            {draft.caption || "Caption belum ditulis."}
          </p>
        </>
      ) : (
        <div className="reply-preview">
          <span className="eyebrow">{labels[draft.kind]}</span>
          {draft.kind === "comment_moderation" ? (
            <>
              <ShieldCheck size={30} />
              <p>
                {draft.moderation === "delete" ? "Hapus" : "Sembunyikan"}{" "}
                komentar
              </p>
            </>
          ) : (
            <p className="reply-bubble">{draft.caption}</p>
          )}
          <small>Target: {draft.targetId}</small>
        </div>
      )}
    </div>
  );
}
export default function App() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null),
    [loading, setLoading] = useState(true),
    [loginError, setLoginError] = useState(""),
    [view, setView] = useState<View>(
      (new URLSearchParams(location.search).get("view") as View) || "inbox",
    ),
    [accountFilter, setAccountFilter] = useState("all"),
    [typeFilter, setTypeFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [sidebar, setSidebar] = useState(false),
    [theme, setTheme] = useState(
      localStorage.getItem("social-theme") || "system",
    ),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState<{ message: string; error: boolean } | null>(
      null,
    ),
    [editor, setEditor] = useState<Draft | "new" | null>(null),
    [approval, setApproval] = useState<Draft | null>(null),
    [reject, setReject] = useState<Draft | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [detail, setDetail] = useState<Activity | null>(null),
    [confirm, setConfirm] = useState<{
      title: string;
      text: string;
      action: () => Promise<void>;
    } | null>(null),
    [ideaEditor, setIdeaEditor] = useState(false),
    [mcpInfo, setMcpInfo] = useState(false),
    [conversation, setConversation] = useState(false),
    [browserSettingsId, setBrowserSettingsId] = useState<string | null>(null),
    [browserCreate, setBrowserCreate] = useState(false),
    [browserJobId, setBrowserJobId] = useState<string | null>(null),
    [pendingPages, setPendingPages] = useState<
      { id: string; label: string; username?: string }[] | null
    >(null);
  const notify = (message: string, error = false) =>
    setToast({ message, error });
  useEffect(() => {
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("social-theme", theme);
  }, [theme]);
  useEffect(() => {
    let alive = true;
    if (new URLSearchParams(location.search).get("demo") === "1") {
      setWorkspace(loadDemo());
      setLoading(false);
    } else
      getWorkspace()
        .then((w) => {
          if (alive) setWorkspace(w);
        })
        .catch((e) => {
          if (alive) setLoginError(e.message);
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (workspace?.demo) saveDemo(workspace);
  }, [workspace]);
  useEffect(() => {
    const pendingId = new URLSearchParams(location.search).get("connect");
    if (workspace && !workspace.demo && pendingId)
      request<{ items: { id: string; label: string; username?: string }[] }>(
        `/api/connect-pending/${pendingId}`,
        workspace.csrf,
      )
        .then((r) => setPendingPages(r.items))
        .catch((e) => notify(e.message, true));
  }, [workspace?.owner]);
  async function reload() {
    if (workspace?.demo) return;
    setWorkspace(await getWorkspace());
  }
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Aksi gagal.", true);
    } finally {
      setBusy(false);
    }
  }
  function demoUpdate(
    fn: (w: Workspace) => Workspace,
    action: string,
    accountId?: string,
    entityId?: string,
  ) {
    setWorkspace((w) =>
      w
        ? {
            ...fn(w),
            logs: [
              {
                id: crypto.randomUUID(),
                at: new Date().toISOString(),
                action,
                status: "success",
                accountId,
                entityId,
              },
              ...w.logs,
            ],
          }
        : w,
    );
  }
  async function approveDraft(
    d: Draft,
    at?: string,
    method: ExecutionMethod = "api",
  ) {
    await run(async () => {
      if (workspace!.demo) {
        const a = workspace!.accounts.find((a) => a.id === d.accountId)!;
        if (method === "browser" && a.browser?.status !== "ready")
          throw new Error("Verifikasi identitas browser terlebih dahulu.");
        if (method === "browser" && d.kind !== "post") {
          if (!d.browserTarget)
            throw new Error("Target browser belum lengkap.");
          validateBrowserTarget(d.browserTarget, a.platform, d.kind);
        }
        if (
          method === "api" &&
          (a.status !== "connected" || Date.parse(a.expiresAt) <= Date.now())
        )
          throw new Error("Hubungkan ulang akun sebelum menyetujui.");
        validateMedia(
          d,
          a,
          workspace!.media.filter((m) => d.mediaIds.includes(m.id)),
        );
        demoUpdate(
          (w) => ({
            ...w,
            drafts: w.drafts.map((x) =>
              x.id === d.id
                ? {
                    ...x,
                    status: "scheduled",
                    scheduledAt: at || new Date().toISOString(),
                    approvedBy: "demo-owner",
                    approvedAt: new Date().toISOString(),
                    approvedRevision: x.revision,
                    executionMethod: method,
                    approvedBrowserBinding:
                      method === "browser" ? a.browser?.revision : undefined,
                  }
                : x,
            ),
          }),
          "approval.approve",
          d.accountId,
          d.id,
        );
      } else {
        await request(`/api/drafts/${d.id}/approve`, workspace!.csrf, "POST", {
          revision: d.revision,
          scheduled_at: at,
          execution_method: method,
          browser_consent: method === "browser",
        });
        await reload();
      }
      setApproval(null);
      notify(
        workspace!.demo
          ? "Simulasi: draft disetujui. Tidak ada konten dikirim ke platform."
          : "Draft disetujui dan masuk antrean publisher.",
      );
    });
  }
  async function cancelDraft(d: Draft) {
    await run(async () => {
      if (workspace!.demo)
        demoUpdate(
          (w) => ({
            ...w,
            drafts: w.drafts.map((x) =>
              x.id === d.id
                ? {
                    ...x,
                    status: "draft",
                    revision: x.revision + 1,
                    approvedBy: undefined,
                    approvedAt: undefined,
                    approvedRevision: undefined,
                  }
                : x,
            ),
          }),
          "schedule.cancel",
          d.accountId,
          d.id,
        );
      else {
        await request(
          `/api/drafts/${d.id}/cancel`,
          workspace!.csrf,
          "POST",
          {},
        );
        await reload();
      }
      notify("Jadwal dibatalkan. Edit draft lalu setujui kembali.");
    });
  }
  const accounts = workspace?.accounts || [],
    drafts = workspace?.drafts || [],
    media = workspace?.media || [];
  const filtered = useMemo(
    () =>
      drafts.filter(
        (d) =>
          (accountFilter === "all" || d.accountId === accountFilter) &&
          (!search || d.caption.toLowerCase().includes(search.toLowerCase())),
      ),
    [drafts, accountFilter, search],
  );
  const pending = filtered.filter((d) => d.status === "draft"),
    shown = pending.filter(
      (d) => typeFilter === "all" || d.kind === typeFilter,
    ),
    account = (id: string) => accounts.find((a) => a.id === id),
    scopedAccounts = accounts.filter(
      (a) => accountFilter === "all" || a.id === accountFilter,
    );
  if (loading)
    return (
      <main className="loading">
        <LoaderCircle className="spin" size={30} />
        <p>Membuka workspace…</p>
      </main>
    );
  if (!workspace)
    return (
      <main className="login-screen">
        <div className="login-art">
          <div className="brand">
            <span className="brand-icon">s.</span>
            <strong>
              social<span>mcp</span>
            </strong>
          </div>
          <p className="eyebrow">YOUR SOCIAL WORKSPACE</p>
          <h1>
            Ide dari AI.
            <br />
            Keputusan tetap
            <br />
            <em>di tanganmu.</em>
          </h1>
          <p>
            Instagram dan TikTok dalam satu ruang kerja. Analitik, konten, dan
            percakapan — dengan approval di setiap langkah.
          </p>
          <div className="login-note">
            <ShieldCheck size={18} /> Satu pemilik. Semua aksi publik menunggu
            persetujuan.
          </div>
        </div>
        <div className="login-panel">
          <span className="eyebrow">SELAMAT DATANG</span>
          <h2>Masuk ke workspace</h2>
          <p>
            Login dengan akun GitHub pemilik untuk mengelola koneksi dan
            menyetujui konten.
          </p>
          <a className="button primary" href="/auth/login">
            Login dengan GitHub <ArrowUpRight size={18} />
          </a>
          <div className="divider">atau jelajahi dulu</div>
          <button
            className="button"
            onClick={() => {
              history.replaceState({}, "", "?demo=1");
              setWorkspace(loadDemo());
            }}
          >
            Buka demo interaktif <ArrowUpRight size={17} />
          </button>
          <small>
            Demo memakai data contoh di browser. Tidak terhubung ke akun sosial.
          </small>
          {loginError && (
            <div className="setup-note">
              <Monitor size={16} />
              <span>
                {loginError} Untuk instalasi lokal, jalankan Worker dan isi
                konfigurasi OAuth.
              </span>
            </div>
          )}
          <footer>
            Compatible with ChatGPT / Codex · Claude · MCP clients
          </footer>
        </div>
      </main>
    );
  return (
    <div className="app-shell">
      {sidebar && (
        <div className="sidebar-overlay" onClick={() => setSidebar(false)} />
      )}
      <aside className={`sidebar ${sidebar ? "open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setView("inbox");
          }}
        >
          <span className="brand-icon">s.</span>
          <strong>
            social<span>mcp</span>
          </strong>
        </a>
        <div className="workspace-name">
          <div className="avatar">W</div>
          <span>
            <strong>Personal workspace</strong>
            <small>Satu pemilik · {accounts.length} akun</small>
          </span>
          <ChevronDown size={16} />
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav>
          {navigation.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${view === n.id ? "active" : ""}`}
              onClick={() => {
                setView(n.id);
                setSearch("");
                setSidebar(false);
              }}
            >
              <n.icon size={19} />
              <span>{n.label}</span>
              {n.id === "inbox" && (
                <b>{drafts.filter((d) => d.status === "draft").length}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="mcp-card">
            <span className="mcp-symbol">✳</span>
            <h4>AI, meet your socials.</h4>
            <p>Hubungkan ChatGPT, Codex, atau Claude ke workspace ini.</p>
            <button onClick={() => setMcpInfo(true)}>
              Hubungkan MCP <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="theme-switch" aria-label="Tema">
            {[
              { id: "light", icon: Sun, label: "Terang" },
              { id: "dark", icon: Moon, label: "Gelap" },
              { id: "system", icon: Monitor, label: "Sistem" },
            ].map((t) => (
              <button
                className={theme === t.id ? "active" : ""}
                key={t.id}
                aria-label={t.label}
                title={t.label}
                onClick={() => setTheme(t.id)}
              >
                <t.icon size={15} />
              </button>
            ))}
          </div>
          <div className="profile">
            <span className="avatar small">Y</span>
            <span>
              <strong>You</strong>
              <small>
                {workspace.demo ? "Demo workspace" : "Workspace owner"}
              </small>
            </span>
            <button
              className="icon-btn"
              aria-label="Keluar"
              onClick={() =>
                run(async () => {
                  if (!workspace.demo)
                    await request("/auth/logout", workspace.csrf, "POST", {});
                  history.replaceState({}, "", "/");
                  setWorkspace(null);
                })
              }
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-btn mobile-menu"
            aria-label="Menu navigasi"
            onClick={() => setSidebar(true)}
          >
            <Menu size={21} />
          </button>
          <div className="breadcrumb">
            Workspace <span>/</span>{" "}
            <strong>{navigation.find((n) => n.id === view)?.label}</strong>
          </div>
          <div className="topbar-right">
            <label className="account-select">
              <Users size={15} />
              <select
                aria-label="Filter akun"
                value={accountFilter}
                onChange={(e) => {
                  setAccountFilter(e.target.value);
                  setSelected([]);
                }}
              >
                <option value="all">Semua akun</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label} · {a.platform === "instagram" ? "IG" : "TikTok"}
                  </option>
                ))}
              </select>
            </label>
            <span className="owner-tag">
              <span className="dot" />
              {workspace.demo ? "Demo" : "Private"}
            </span>
          </div>
        </header>
        {workspace.demo && (
          <div className="demo-strip">
            <Monitor size={14} />
            <span>
              Mode demo · data contoh tersimpan di browser. Tidak ada aksi ke
              platform.
            </span>
            <button
              onClick={() => {
                localStorage.removeItem(DEMO_KEY);
                setWorkspace(seedDemo());
                notify("Data demo direset.");
              }}
            >
              Reset demo
            </button>
          </div>
        )}
        <main className="main-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {view === "inbox"
                  ? "YOU HAVE THE FINAL SAY"
                  : "PERSONAL SOCIAL WORKSPACE"}
              </p>
              <h1>
                {
                  (
                    {
                      inbox: "Inbox approval",
                      queue: "Antrean & kalender",
                      analytics: "Analitik",
                      accounts: "Akun terhubung",
                      media: "Pustaka media",
                      logs: "Log aktivitas",
                    } as Record<View, string>
                  )[view]
                }
                <span className="heading-dot">.</span>
              </h1>
              <p>
                {
                  (
                    {
                      inbox:
                        "Dari ide menjadi konten. Tinjau, sempurnakan, lalu setujui.",
                      queue:
                        "Atur ritme kontenmu. Semua waktu dalam WIB (Asia/Jakarta).",
                      analytics:
                        "Lihat apa yang bekerja, lalu tentukan langkah berikutnya.",
                      accounts:
                        "Satu ruang kerja untuk semua akun Instagram dan TikTok.",
                      media:
                        "Simpan bahan cerita berikutnya. JPEG, MP4, dan MOV tanpa transcoding.",
                      logs: "Jejak setiap tool call, persetujuan, dan hasil eksekusi.",
                    } as Record<View, string>
                  )[view]
                }
              </p>
            </div>
            <div className="heading-actions">
              {view === "inbox" && (
                <button
                  className="button"
                  onClick={() => setConversation(true)}
                >
                  <MessageCircle size={16} />
                  Percakapan
                </button>
              )}
              {["inbox", "queue"].includes(view) && (
                <button
                  className="button primary"
                  onClick={() => setEditor("new")}
                >
                  <Plus size={17} />
                  Buat draft
                </button>
              )}
              {view === "analytics" && (
                <button
                  className="button"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      if (workspace.demo) {
                        notify("Demo menggunakan metrik contoh.");
                        return;
                      }
                      for (const a of scopedAccounts.filter(
                        (a) => a.status === "connected",
                      )) {
                        await request(
                          `/api/accounts/${a.id}/stats`,
                          workspace.csrf,
                        );
                        await request(
                          `/api/accounts/${a.id}/posts`,
                          workspace.csrf,
                        );
                      }
                      await reload();
                      notify("Data resmi diperbarui.");
                    })
                  }
                >
                  <RefreshCw size={16} className={busy ? "spin" : ""} />
                  Refresh data
                </button>
              )}
            </div>
          </div>
          {accounts.some((a) =>
            a.platformId === "browser-only"
              ? a.browser?.status !== "ready"
              : a.status === "reconnect" ||
                Date.parse(a.expiresAt) <= Date.now(),
          ) && (
            <div className="warning-banner">
              <AlertTriangle size={18} />
              <span>
                <strong>Ada akun yang perlu dihubungkan ulang.</strong> Periksa
                jalur API dan status browser sebelum menyetujui jadwal.
              </span>
              <button onClick={() => setView("accounts")}>
                Periksa akun <ArrowUpRight size={14} />
              </button>
            </div>
          )}
          {view === "inbox" && (
            <>
              <div className="summary-grid">
                <Summary
                  label="Menunggu persetujuan"
                  value={pending.length}
                  icon={Inbox}
                  note="Keputusan ada di tanganmu"
                />
                <Summary
                  label="Konten terjadwal"
                  value={
                    filtered.filter((d) => d.status === "scheduled").length
                  }
                  icon={CalendarDays}
                  note="Sudah mendapat persetujuan"
                />
                <Summary
                  label="Akun terhubung"
                  value={
                    scopedAccounts.filter(
                      (a) =>
                        a.status === "connected" ||
                        (a.browser?.enabled && a.browser.status === "ready"),
                    ).length
                  }
                  icon={Users}
                  note={`${scopedAccounts.length} akun dalam workspace`}
                />
                <Summary
                  label="Perlu perhatian"
                  value={
                    filtered.filter((d) =>
                      ["failed", "uncertain"].includes(d.status),
                    ).length
                  }
                  icon={AlertTriangle}
                  note="Tinjau detail di antrean"
                  attention
                />
              </div>
              <div className="section-bar">
                <div className="tabs">
                  {[
                    { id: "all", label: "Semua draft" },
                    { id: "post", label: "Posting" },
                    { id: "comment_reply", label: "Komentar" },
                    { id: "dm_reply", label: "DM" },
                    { id: "comment_moderation", label: "Moderasi" },
                  ].map((t) => (
                    <button
                      key={t.id}
                      className={typeFilter === t.id ? "active" : ""}
                      onClick={() => {
                        setTypeFilter(t.id);
                        setSelected([]);
                      }}
                    >
                      {t.label}
                      <span>
                        {
                          pending.filter(
                            (d) => t.id === "all" || d.kind === t.id,
                          ).length
                        }
                      </span>
                    </button>
                  ))}
                </div>
                <label className="search">
                  <Search size={16} />
                  <input
                    placeholder="Cari draft…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
              </div>
              {selected.length > 0 && (
                <div className="bulk-bar">
                  <span>{selected.length} balasan komentar dipilih</span>
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const items = selected
                          .map((id) => drafts.find((d) => d.id === id)!)
                          .filter(Boolean);
                        if (workspace.demo)
                          demoUpdate(
                            (w) => ({
                              ...w,
                              drafts: w.drafts.map((d) =>
                                selected.includes(d.id) &&
                                d.kind === "comment_reply"
                                  ? {
                                      ...d,
                                      status: "scheduled",
                                      scheduledAt: new Date().toISOString(),
                                      approvedBy: "demo-owner",
                                      approvedAt: new Date().toISOString(),
                                      approvedRevision: d.revision,
                                    }
                                  : d,
                              ),
                            }),
                            "approval.bulk",
                          );
                        else {
                          const r = await request<{
                            results: { ok: boolean; error?: string }[];
                          }>("/api/bulk-approve", workspace.csrf, "POST", {
                            items: items.map((d) => ({
                              id: d.id,
                              revision: d.revision,
                            })),
                          });
                          if (r.results.some((x) => !x.ok))
                            throw new Error(
                              r.results
                                .filter((x) => !x.ok)
                                .map((x) => x.error)
                                .join("; "),
                            );
                          await reload();
                        }
                        setSelected([]);
                        notify("Balasan komentar masuk antrean.");
                      })
                    }
                  >
                    <CheckCheck size={16} />
                    Setujui balasan terpilih
                  </button>
                </div>
              )}
              {shown.length ? (
                <div className="draft-grid">
                  {shown.map((d) => (
                    <article
                      className={`draft-card ${d.kind !== "post" ? "reply-card" : ""}`}
                      key={d.id}
                    >
                      <div className="draft-card-header">
                        <span
                          className={`platform-label ${account(d.accountId)?.platform}`}
                        >
                          <PlatformIcon
                            platform={
                              account(d.accountId)?.platform || "instagram"
                            }
                          />
                          {account(d.accountId)?.platform === "instagram"
                            ? "Instagram"
                            : "TikTok"}
                          <span>·</span>
                          {labels[d.kind]}
                        </span>
                        {d.kind === "comment_reply" ? (
                          <input
                            type="checkbox"
                            aria-label={`Pilih balasan ${d.id}`}
                            checked={selected.includes(d.id)}
                            onChange={(e) =>
                              setSelected((s) =>
                                e.target.checked
                                  ? [...s, d.id]
                                  : s.filter((x) => x !== d.id),
                              )
                            }
                          />
                        ) : (
                          <span className="revision">v{d.revision}</span>
                        )}
                      </div>
                      <PostPreview
                        draft={d}
                        account={account(d.accountId)}
                        media={media}
                      />
                      <div className="draft-meta">
                        <span>
                          <Clock size={13} />
                          {d.scheduledAt
                            ? date(d.scheduledAt)
                            : "Belum ada usulan jadwal"}
                        </span>
                        {d.crosspostId && (
                          <span className="crosspost-tag">Cross-post</span>
                        )}
                      </div>
                      <div className="draft-card-footer">
                        <button
                          className="button primary"
                          onClick={() => setApproval(d)}
                        >
                          <Check size={16} />
                          Tinjau & setujui
                        </button>
                        <button
                          className="icon-btn bordered"
                          title="Edit draft"
                          aria-label="Edit draft"
                          onClick={() => setEditor(d)}
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          className="icon-btn bordered"
                          title="Tolak draft"
                          aria-label="Tolak draft"
                          onClick={() => setReject(d)}
                        >
                          <X size={17} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty title="Inbox sudah bersih">
                  Draft dari klien MCP atau tombol Buat draft akan muncul di
                  sini.
                </Empty>
              )}
              <div className="approval-note">
                <ShieldCheck size={15} />
                <span>
                  AI menyiapkan. Kamu menyetujui. Tidak ada publish tanpa
                  approval.
                </span>
              </div>
            </>
          )}
          {view === "queue" && (
            <Queue
              drafts={filtered}
              ideas={workspace.ideas.filter(
                (i) => accountFilter === "all" || i.accountId === accountFilter,
              )}
              accounts={accounts}
              onCancel={cancelDraft}
              onEdit={setEditor}
              onApprove={setApproval}
              onIdea={() => setIdeaEditor(true)}
              onBrowserJob={setBrowserJobId}
            />
          )}
          {view === "analytics" && (
            <Analytics workspace={workspace} accountFilter={accountFilter} />
          )}
          {view === "accounts" && (
            <>
              <div className="connection-header">
                <div>
                  <h3>Koneksi platform</h3>
                  <p>
                    Token terenkripsi. Klien AI tidak pernah mendapat akses ke
                    token.
                  </p>
                </div>
                <button className="button" onClick={() => setMcpInfo(true)}>
                  <Link size={16} />
                  Koneksi MCP
                </button>
              </div>
              <div className="browser-toolbar">
                <p className="muted">
                  Koneksi API utama, browser sebagai opsi tambahan.
                </p>
                <button
                  className="button"
                  onClick={() => setBrowserCreate(true)}
                >
                  <Plus size={15} />
                  Tambah akun browser
                </button>
              </div>
              <div className="account-grid">
                {(["instagram", "tiktok"] as const).map((platform) => (
                  <section className="platform-card" key={platform}>
                    <div className="platform-card-top">
                      <span className={`platform-logo ${platform}`}>
                        <PlatformIcon platform={platform} size={26} />
                      </span>
                      <div>
                        <h3>
                          {platform === "instagram" ? "Instagram" : "TikTok"}
                        </h3>
                        <p>
                          {
                            accounts.filter((a) => a.platform === platform)
                              .length
                          }{" "}
                          / 10 akun terhubung
                        </p>
                      </div>
                      <button
                        className="button"
                        onClick={() =>
                          workspace.demo
                            ? notify(
                                "Koneksi OAuth tersedia pada instalasi nyata. Demo tidak mengakses akun.",
                              )
                            : location.assign(`/auth/${platform}/start`)
                        }
                      >
                        <Plus size={16} />
                        Connect
                      </button>
                    </div>
                    {accounts
                      .filter(
                        (a) =>
                          a.platform === platform &&
                          (accountFilter === "all" || a.id === accountFilter),
                      )
                      .map((a) => (
                        <div className="connected-account" key={a.id}>
                          <div className="account-row">
                            <span className="avatar">{a.label[0]}</span>
                            <div>
                              <strong>{a.label}</strong>
                              <p>@{a.username}</p>
                            </div>
                            <span
                              className={`connection-status ${a.platformId === "browser-only" && a.browser?.status === "ready" ? "connected" : a.status}`}
                            >
                              <span className="dot" />
                              {a.platformId === "browser-only"
                                ? a.browser?.status === "ready"
                                  ? "Browser siap"
                                  : "Periksa browser"
                                : a.status === "connected"
                                  ? "API aktif"
                                  : "API perlu koneksi ulang"}
                            </span>
                          </div>
                          <div className="token-meta">
                            <span>
                              {a.platformId === "browser-only"
                                ? "Koneksi"
                                : "Token berlaku sampai"}
                            </span>
                            <strong>
                              {a.platformId === "browser-only"
                                ? "Browser Use"
                                : date(a.expiresAt, { dateStyle: "medium" })}
                            </strong>
                          </div>
                          <div className="browser-account-status">
                            <span>
                              Browser Use ·{" "}
                              {a.browser?.enabled
                                ? a.browser.status
                                : "nonaktif"}
                            </span>
                            <button
                              className="text-button"
                              onClick={() => setBrowserSettingsId(a.id)}
                            >
                              Pengaturan browser <ArrowUpRight size={13} />
                            </button>
                          </div>
                          <div className="account-buttons">
                            <button
                              className="text-button"
                              onClick={() =>
                                setConfirm({
                                  title: "Ubah label akun",
                                  text: "Label membantu membedakan akun dalam workspace.",
                                  action: async () => {},
                                })
                              }
                            >
                              Detail
                            </button>
                            <button
                              className="text-button"
                              onClick={() =>
                                setConfirm({
                                  title: "Putuskan koneksi?",
                                  text: `Token ${a.label} akan dihapus. Akun dan riwayat tetap disimpan; jadwal tidak dapat dipublikasikan.`,
                                  action: async () => {
                                    if (workspace.demo)
                                      demoUpdate(
                                        (w) => ({
                                          ...w,
                                          accounts: w.accounts.map((x) =>
                                            x.id === a.id
                                              ? { ...x, status: "reconnect" }
                                              : x,
                                          ),
                                        }),
                                        "account.disconnect",
                                        a.id,
                                      );
                                    else {
                                      await request(
                                        `/api/accounts/${a.id}`,
                                        workspace.csrf,
                                        "DELETE",
                                      );
                                      await reload();
                                    }
                                    notify("Koneksi diputuskan.");
                                  },
                                })
                              }
                            >
                              Disconnect
                            </button>
                          </div>
                        </div>
                      ))}
                    <div className="platform-footnote">
                      <ShieldCheck size={15} />
                      {platform === "instagram" ? (
                        <>
                          Business / Creator{" "}
                          <button
                            className="text-button"
                            onClick={() =>
                              workspace.demo
                                ? notify(
                                    "Facebook Login untuk riset tersedia pada instalasi nyata.",
                                  )
                                : location.assign(
                                    "/auth/instagram-facebook/start",
                                  )
                            }
                          >
                            Facebook Login untuk riset{" "}
                            <ArrowUpRight size={12} />
                          </button>
                        </>
                      ) : (
                        "Display API · Direct Post mengikuti kelayakan app"
                      )}
                    </div>
                  </section>
                ))}
              </div>
              <div className="info-box">
                <AlertTriangle size={19} />
                <div>
                  <h4>Prasyarat platform</h4>
                  <p>
                    Instagram membutuhkan akun profesional dan izin app Meta.
                    TikTok Direct Post untuk alat privat pengelola akun sendiri
                    tidak memenuhi pedoman audit. Komentar TikTok API
                    dinonaktifkan; browser dapat membaca dan membuat draft
                    dengan target yang jelas. DM hanya Instagram.
                  </p>
                </div>
              </div>
            </>
          )}
          {view === "accounts" && (
            <BrowserJobs
              workspace={workspace}
              onNotify={notify}
              onInspect={setBrowserJobId}
            />
          )}
          {view === "media" && (
            <MediaLibrary
              media={media}
              busy={busy}
              onUpload={(file) =>
                run(async () => {
                  if (workspace.demo) {
                    const meta = await inspectFile(file);
                    if (file.size > 2 * 1024 * 1024)
                      throw new Error(
                        "Upload demo maksimal 2 MB karena disimpan di browser. File besar memakai R2 pada instalasi nyata.",
                      );
                    const previewUrl = await new Promise<string>(
                      (resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(String(reader.result));
                        reader.onerror = () =>
                          reject(new Error("File gagal dibaca."));
                        reader.readAsDataURL(file);
                      },
                    );
                    const m: Media = {
                      id: crypto.randomUUID(),
                      key: "demo/" + file.name,
                      filename: file.name,
                      mime: file.type,
                      size: file.size,
                      ...meta,
                      verified: true,
                      createdAt: new Date().toISOString(),
                      previewUrl,
                    };
                    demoUpdate(
                      (w) => ({ ...w, media: [m, ...w.media] }),
                      "media.upload",
                      undefined,
                      m.id,
                    );
                    notify("File disimpan di demo browser.");
                  } else {
                    await uploadFile(file, workspace.csrf!, (n) =>
                      notify(`Upload ${n}%`),
                    );
                    await reload();
                    notify("Media tervalidasi dan tersimpan di R2.");
                  }
                })
              }
              onDelete={(m) =>
                setConfirm({
                  title: "Hapus media?",
                  text: `${m.filename} akan dihapus. Media yang masih digunakan draft tidak dapat dihapus.`,
                  action: async () => {
                    if (workspace.demo) {
                      if (drafts.some((d) => d.mediaIds.includes(m.id)))
                        throw new Error("Media masih digunakan draft.");
                      demoUpdate(
                        (w) => ({
                          ...w,
                          media: w.media.filter((x) => x.id !== m.id),
                        }),
                        "media.delete",
                        undefined,
                        m.id,
                      );
                    } else {
                      await request(
                        `/api/media/${m.id}`,
                        workspace.csrf,
                        "DELETE",
                      );
                      await reload();
                    }
                    notify("Media dihapus.");
                  },
                })
              }
            />
          )}
          {view === "logs" && (
            <Logs
              logs={workspace.logs.filter(
                (l) => accountFilter === "all" || l.accountId === accountFilter,
              )}
              accounts={accounts}
              onDetail={setDetail}
              onLoad={async (day) => {
                if (workspace.demo)
                  return workspace.logs.filter(
                    (l) => l.at.slice(0, 10) === day,
                  );
                const r = await request<{ items: Activity[] }>(
                  "/api/list?kind=logs&date=" + day,
                  workspace.csrf,
                );
                return r.items;
              }}
            />
          )}
          {!workspace.demo &&
            (() => {
              const kind = (
                {
                  inbox: "drafts",
                  queue: "drafts",
                  analytics: "posts",
                  media: "media",
                  logs: "logs",
                } as const
              )[view as "inbox" | "queue" | "analytics" | "media" | "logs"];
              const cursor = kind ? workspace.cursors?.[kind] : undefined;
              return cursor ? (
                <div className="load-more">
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const p = new URLSearchParams({ kind, cursor });
                        if (kind === "logs")
                          p.set("date", new Date().toISOString().slice(0, 10));
                        const page = await request<{
                          items: unknown[];
                          cursor?: string;
                        }>("/api/list?" + p, workspace.csrf);
                        const listKey = kind;
                        setWorkspace((w) =>
                          w
                            ? ({
                                ...w,
                                [listKey]: [...w[listKey], ...page.items],
                                cursors: { ...w.cursors, [kind]: page.cursor },
                              } as Workspace)
                            : w,
                        );
                      })
                    }
                  >
                    Muat data berikutnya <ChevronDown size={15} />
                  </button>
                </div>
              ) : null;
            })()}
          <footer className="page-footer">
            <span>
              Social MCP <span>·</span> Your socials, your say.
            </span>
            <span>
              <span className="dot" />{" "}
              {workspace.demo ? "Simulasi lokal" : "Owner-only workspace"}{" "}
              <span>·</span> WIB
            </span>
          </footer>
        </main>
      </div>
      {browserSettingsId &&
        accounts.find((a) => a.id === browserSettingsId) && (
          <Modal
            title="Browser Use · koneksi akun"
            onClose={() => setBrowserSettingsId(null)}
          >
            <BrowserSettings
              account={accounts.find((a) => a.id === browserSettingsId)!}
              workspace={workspace}
              onNotify={notify}
              onChanged={reload}
              onDemoVerify={() => {
                demoUpdate(
                  (w) => ({
                    ...w,
                    accounts: w.accounts.map((a) =>
                      a.id === browserSettingsId && a.browser
                        ? {
                            ...a,
                            browser: {
                              ...a.browser,
                              status: "ready",
                              verifiedAt: new Date().toISOString(),
                            },
                          }
                        : a,
                    ),
                  }),
                  "browser.probe",
                  browserSettingsId,
                );
                notify(
                  "Demo: sesi browser ditandai siap. Tidak ada browser nyata dibuka.",
                );
              }}
              onSave={async (enabled, profileId, expectedUsername) => {
                if (workspace.demo) {
                  if (enabled && !profileId) throw new Error("Isi Profile ID.");
                  demoUpdate(
                    (w) => ({
                      ...w,
                      accounts: w.accounts.map((a) =>
                        a.id === browserSettingsId
                          ? {
                              ...a,
                              browser: {
                                enabled,
                                expectedUsername,
                                status: "unverified",
                                revision: (a.browser?.revision || 0) + 1,
                              },
                            }
                          : a,
                      ),
                    }),
                    "browser.settings",
                    browserSettingsId,
                  );
                } else {
                  await request(
                    `/api/browser/accounts/${browserSettingsId}`,
                    workspace.csrf,
                    "PATCH",
                    {
                      enabled,
                      profile_id: profileId,
                      expected_username: expectedUsername,
                    },
                  );
                  await reload();
                }
                notify(
                  "Pengaturan browser disimpan. Verifikasi identitas sebelum approval.",
                );
              }}
            />
          </Modal>
        )}
      {browserCreate && (
        <Modal
          title="Tambah akun browser"
          onClose={() => setBrowserCreate(false)}
        >
          <BrowserAccountForm
            busy={busy}
            onCreate={(input) =>
              run(async () => {
                if (workspace.demo) {
                  const id = crypto.randomUUID();
                  demoUpdate(
                    (w) => ({
                      ...w,
                      accounts: [
                        ...w.accounts,
                        {
                          id,
                          platform: input.platform as Account["platform"],
                          username: input.username,
                          label: input.label,
                          platformId: "browser-only",
                          status: "reconnect",
                          expiresAt: "1970-01-01T00:00:00.000Z",
                          scopes: [],
                          demo: true,
                          browser: {
                            enabled: true,
                            status: "unverified",
                            revision: 1,
                          },
                        },
                      ],
                    }),
                    "browser.account.create",
                  );
                } else {
                  await request(
                    "/api/browser/accounts",
                    workspace.csrf,
                    "POST",
                    input,
                  );
                  await reload();
                }
                setBrowserCreate(false);
                notify(
                  "Akun ditambahkan. Buka pengaturan browser untuk login dan verifikasi.",
                );
              })
            }
          />
        </Modal>
      )}
      {browserJobId && (
        <Modal
          title="Browser Use · detail job"
          onClose={() => setBrowserJobId(null)}
          wide
        >
          <BrowserJobInspector
            id={browserJobId}
            workspace={workspace}
            onChanged={reload}
            onNotify={notify}
            onDraft={(accountId, kind, target, text) => {
              const now = new Date().toISOString();
              setBrowserJobId(null);
              setEditor({
                id: "",
                accountId,
                kind,
                browserTarget: target,
                targetId: "browser-" + crypto.randomUUID(),
                caption: text,
                mediaIds: [],
                postType: "photo",
                commercial: "none",
                status: "draft",
                createdAt: now,
                updatedAt: now,
                revision: 0,
                attempts: 0,
              });
            }}
          />
        </Modal>
      )}
      {editor && (
        <DraftEditor
          draft={editor === "new" ? undefined : editor}
          accounts={accounts}
          media={media}
          busy={busy}
          onClose={() => setEditor(null)}
          onSave={(input, targets) =>
            run(async () => {
              const editing = editor !== "new" && editor.id ? editor : null;
              const draftKind = editor !== "new" ? editor.kind : "post";
              if (workspace.demo) {
                const now = new Date().toISOString(),
                  crosspostId =
                    targets.length > 1 ? crypto.randomUUID() : undefined;
                const created = targets.map(
                  (accountId) =>
                    ({
                      id: editing?.id || crypto.randomUUID(),
                      accountId,
                      kind: draftKind,
                      caption: String(input.caption),
                      mediaIds: input.media_ids as string[],
                      postType: input.post_type as Draft["postType"],
                      scheduledAt: input.scheduled_at as string | undefined,
                      targetId: input.target_id as string | undefined,
                      browserTarget: input.browser_target as
                        BrowserTarget | undefined,
                      moderation: input.moderation as Draft["moderation"],
                      privacy: input.privacy as Draft["privacy"],
                      commercial: input.commercial as Draft["commercial"],
                      disableComment: input.disable_comment as boolean,
                      disableDuet: input.disable_duet as boolean,
                      disableStitch: input.disable_stitch as boolean,
                      status: "draft" as const,
                      createdAt: editing?.createdAt || now,
                      updatedAt: now,
                      revision: (editing?.revision || 0) + 1,
                      attempts: 0,
                      crosspostId,
                    }) satisfies Draft,
                );
                demoUpdate(
                  (w) => ({
                    ...w,
                    drafts: editing
                      ? w.drafts.map((d) =>
                          d.id === editing.id ? created[0] : d,
                        )
                      : [...created, ...w.drafts],
                  }),
                  editing ? "draft.update" : "draft.create",
                  targets[0],
                  created[0].id,
                );
              } else {
                if (!editing && targets.length > 1)
                  await request("/api/crosspost", workspace.csrf, "POST", {
                    account_ids: targets,
                    input,
                  });
                else
                  for (const target of targets)
                    await request(
                      editing ? `/api/drafts/${editing.id}` : "/api/drafts",
                      workspace.csrf,
                      editing ? "PATCH" : "POST",
                      {
                        ...input,
                        account_id: target,
                        kind: draftKind,
                      },
                    );
                await reload();
              }
              setEditor(null);
              notify("Draft disimpan. Approval tetap diperlukan.");
            })
          }
        />
      )}
      {approval && (
        <ApprovalDialog
          draft={approval}
          account={account(approval.accountId)}
          media={media}
          busy={busy}
          demo={workspace.demo}
          csrf={workspace.csrf}
          onClose={() => setApproval(null)}
          onApprove={(at, method) => approveDraft(approval, at, method)}
        />
      )}
      {reject && (
        <RejectDialog
          draft={reject}
          busy={busy}
          onClose={() => setReject(null)}
          onReject={(note) =>
            run(async () => {
              if (workspace.demo)
                demoUpdate(
                  (w) => ({
                    ...w,
                    drafts: w.drafts.map((d) =>
                      d.id === reject.id
                        ? { ...d, status: "rejected", rejectionNote: note }
                        : d,
                    ),
                  }),
                  "approval.reject",
                  reject.accountId,
                  reject.id,
                );
              else {
                await request(
                  `/api/drafts/${reject.id}/reject`,
                  workspace.csrf,
                  "POST",
                  { note },
                );
                await reload();
              }
              setReject(null);
              notify("Draft ditolak. Catatan tersedia untuk klien AI.");
            })
          }
        />
      )}
      {confirm && (
        <Modal title={confirm.title} onClose={() => setConfirm(null)}>
          <p>{confirm.text}</p>
          {confirm.title === "Ubah label akun" ? (
            <AccountLabels
              accounts={scopedAccounts}
              busy={busy}
              onSave={(id, label) =>
                run(async () => {
                  if (workspace.demo)
                    demoUpdate(
                      (w) => ({
                        ...w,
                        accounts: w.accounts.map((a) =>
                          a.id === id ? { ...a, label } : a,
                        ),
                      }),
                      "account.label",
                      id,
                    );
                  else {
                    await request(
                      `/api/accounts/${id}`,
                      workspace.csrf,
                      "PATCH",
                      { label },
                    );
                    await reload();
                  }
                  setConfirm(null);
                  notify("Label akun disimpan.");
                })
              }
            />
          ) : (
            <div className="modal-actions">
              <button className="button" onClick={() => setConfirm(null)}>
                Batal
              </button>
              <button
                className="button danger"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await confirm.action();
                    setConfirm(null);
                  })
                }
              >
                {busy ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <Check size={16} />
                )}
                Lanjutkan
              </button>
            </div>
          )}
        </Modal>
      )}
      {detail && (
        <Modal title="Detail aktivitas" onClose={() => setDetail(null)}>
          <dl className="detail-list">
            <dt>Aksi</dt>
            <dd>{detail.action}</dd>
            <dt>Waktu</dt>
            <dd>{date(detail.at)}</dd>
            <dt>Akun</dt>
            <dd>{account(detail.accountId || "")?.label || "Workspace"}</dd>
            <dt>Status</dt>
            <dd>{detail.status}</dd>
            <dt>ID entitas</dt>
            <dd>{detail.entityId || "—"}</dd>
            <dt>Detail</dt>
            <dd>
              {detail.detail ||
                "Aktivitas dicatat tanpa token atau isi pesan pribadi."}
            </dd>
          </dl>
        </Modal>
      )}
      {mcpInfo && (
        <Modal title="Hubungkan klien MCP" onClose={() => setMcpInfo(false)}>
          <div className="mcp-intro">
            <span className="mcp-symbol">✳</span>
            <p>
              Satu endpoint untuk ChatGPT/Codex, Claude, dan klien yang
              mendukung remote MCP dengan OAuth.
            </p>
          </div>
          <label className="field">
            Endpoint MCP
            <div className="copy-field">
              <code>{location.origin}/mcp</code>
              <button
                className="icon-btn"
                aria-label="Salin endpoint"
                onClick={() =>
                  navigator.clipboard
                    .writeText(location.origin + "/mcp")
                    .then(() => notify("Endpoint disalin."))
                    .catch(() => notify("Clipboard tidak tersedia.", true))
                }
              >
                <Copy size={17} />
              </button>
            </div>
          </label>
          <ol className="steps">
            <li>Tambahkan remote MCP server pada pengaturan klien AI.</li>
            <li>Masukkan endpoint dari deployment Cloudflare milikmu.</li>
            <li>
              Setujui akses klien, lalu login sebagai pemilik dengan GitHub.
            </li>
          </ol>
          <div className="info-box">
            <ShieldCheck size={18} />
            <p>
              Tools dapat membaca data dan membuat draft. Persetujuan dan
              publish hanya di dashboard. Demo ini tidak menyediakan MCP nyata.
            </p>
          </div>
        </Modal>
      )}
      {ideaEditor && (
        <IdeaEditor
          accounts={accounts}
          busy={busy}
          onClose={() => setIdeaEditor(false)}
          onSave={(input) =>
            run(async () => {
              if (workspace.demo) {
                const idea: Idea = {
                  id: crypto.randomUUID(),
                  accountId: String(input.account_id),
                  title: String(input.title),
                  notes: String(input.notes),
                  proposedAt: input.proposed_at as string | undefined,
                  status: "idea",
                  createdAt: new Date().toISOString(),
                };
                demoUpdate(
                  (w) => ({ ...w, ideas: [idea, ...w.ideas] }),
                  "calendar.create",
                  idea.accountId,
                  idea.id,
                );
              } else {
                await request("/api/ideas", workspace.csrf, "POST", input);
                await reload();
              }
              setIdeaEditor(false);
              notify("Ide disimpan ke kalender.");
            })
          }
        />
      )}
      {pendingPages && (
        <PageSelection
          pages={pendingPages}
          busy={busy}
          onClose={() => setPendingPages(null)}
          onSave={(ids) =>
            run(async () => {
              const pendingId = new URLSearchParams(location.search).get(
                "connect",
              );
              await request(
                `/api/connect-pending/${pendingId}`,
                workspace.csrf,
                "POST",
                { page_ids: ids },
              );
              history.replaceState({}, "", "/?view=accounts");
              setPendingPages(null);
              await reload();
              notify("Akun Instagram dari Facebook Pages terhubung.");
            })
          }
        />
      )}
      {conversation && (
        <ConversationDialog
          workspace={workspace}
          onClose={() => setConversation(false)}
          busy={busy}
          onDraft={(accountId, kind, targetId, text) =>
            run(async () => {
              if (workspace.demo) {
                const d: Draft = {
                  id: crypto.randomUUID(),
                  accountId,
                  kind,
                  targetId,
                  caption: text,
                  mediaIds: [],
                  postType: "photo",
                  status: "draft",
                  commercial: "none",
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  revision: 1,
                  attempts: 0,
                };
                demoUpdate(
                  (w) => ({ ...w, drafts: [d, ...w.drafts] }),
                  "draft.create",
                  accountId,
                  d.id,
                );
              } else {
                await request("/api/drafts", workspace.csrf, "POST", {
                  account_id: accountId,
                  kind,
                  target_id: targetId,
                  caption: text,
                });
                await reload();
              }
              setConversation(false);
              notify("Draft balasan dibuat. Tinjau di inbox approval.");
            })
          }
        />
      )}
      {toast && (
        <div className={`toast ${toast.error ? "error" : ""}`} role="status">
          {toast.error ? <AlertTriangle size={18} /> : <Check size={18} />}
          <span>{toast.message}</span>
          <button aria-label="Tutup pesan" onClick={() => setToast(null)}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
function Summary({
  label,
  value,
  icon: Icon,
  note,
  attention = false,
}: {
  label: string;
  value: number;
  icon: typeof Inbox;
  note: string;
  attention?: boolean;
}) {
  return (
    <div className={`summary-card ${attention && value ? "attention" : ""}`}>
      <div>
        <span>{label}</span>
        <Icon size={18} />
      </div>
      <strong>{String(value).padStart(2, "0")}</strong>
      <p>{note}</p>
    </div>
  );
}
function DraftEditor({
  draft,
  accounts,
  media,
  busy,
  onClose,
  onSave,
}: {
  draft?: Draft;
  accounts: Account[];
  media: Media[];
  busy: boolean;
  onClose: () => void;
  onSave: (input: Record<string, unknown>, targets: string[]) => void;
}) {
  const [targets, setTargets] = useState<string[]>(
      draft ? [draft.accountId] : accounts.slice(0, 1).map((a) => a.id),
    ),
    [browserUrl, setBrowserUrl] = useState(draft?.browserTarget?.url || ""),
    [browserAuthor, setBrowserAuthor] = useState(
      draft?.browserTarget?.author || "",
    ),
    [browserText, setBrowserText] = useState(draft?.browserTarget?.text || ""),
    [browserRecipient, setBrowserRecipient] = useState(
      draft?.browserTarget?.recipient || "",
    ),
    [caption, setCaption] = useState(draft?.caption || ""),
    [ids, setIds] = useState(draft?.mediaIds || []),
    [type, setType] = useState<Draft["postType"]>(draft?.postType || "photo"),
    [time, setTime] = useState(localInput(draft?.scheduledAt)),
    [privacy, setPrivacy] = useState(draft?.privacy || ""),
    [commercial, setCommercial] = useState(draft?.commercial || "none"),
    [disableComment, setDisableComment] = useState(
      draft?.disableComment || false,
    ),
    [disableDuet, setDisableDuet] = useState(draft?.disableDuet || false),
    [disableStitch, setDisableStitch] = useState(draft?.disableStitch || false);
  const isPost = !draft || draft.kind === "post";
  return (
    <Modal
      title={draft?.id ? "Edit draft" : "Buat draft baru"}
      onClose={onClose}
      wide
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(
            {
              caption,
              media_ids: ids,
              post_type: type,
              scheduled_at: time ? inputISO(time) : undefined,
              target_id: draft?.targetId,
              browser_target: browserUrl
                ? {
                    url: browserUrl,
                    author: browserAuthor || undefined,
                    text: browserText || undefined,
                    recipient: browserRecipient || undefined,
                  }
                : undefined,
              moderation: draft?.moderation,
              privacy: privacy || undefined,
              commercial,
              disable_comment: disableComment,
              disable_duet: disableDuet,
              disable_stitch: disableStitch,
            },
            targets,
          );
        }}
      >
        <label className="field">
          Akun tujuan
          <span className="muted">
            Setiap akun menjadi varian yang disetujui terpisah.
          </span>
          <div className="target-list">
            {accounts.map((a) => (
              <label
                key={a.id}
                className={targets.includes(a.id) ? "selected" : ""}
              >
                <input
                  type="checkbox"
                  disabled={!!draft}
                  checked={targets.includes(a.id)}
                  onChange={(e) =>
                    setTargets((t) =>
                      e.target.checked
                        ? [...t, a.id]
                        : t.filter((x) => x !== a.id),
                    )
                  }
                />
                <PlatformIcon platform={a.platform} />
                {a.label}
                <small>{a.platform === "instagram" ? "IG" : "TikTok"}</small>
              </label>
            ))}
          </div>
        </label>
        {isPost && (
          <>
            <div className="two-fields">
              <label className="field">
                Jenis posting
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as Draft["postType"])}
                >
                  <option value="photo">Foto</option>
                  <option value="video">Video</option>
                  <option value="reel">Reel (Instagram)</option>
                  <option value="carousel">Carousel</option>
                </select>
              </label>
              <label className="field">
                Usulan jadwal (WIB)
                <input
                  type="datetime-local"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </label>
            </div>
            <label className="field">
              Media{" "}
              <span className="muted">
                Pilih dari pustaka; tidak ada perubahan rasio otomatis.
              </span>
              <div className="media-picker">
                {media.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={ids.includes(m.id) ? "selected" : ""}
                    onClick={() =>
                      setIds((s) =>
                        s.includes(m.id)
                          ? s.filter((id) => id !== m.id)
                          : type === "carousel"
                            ? [...s, m.id].slice(0, 10)
                            : [m.id],
                      )
                    }
                  >
                    {m.mime.startsWith("video/") ? (
                      <video src={m.previewUrl} preload="metadata" />
                    ) : (
                      <img src={m.previewUrl} alt={m.filename} />
                    )}
                    <span>
                      {ids.includes(m.id) ? (
                        <Check size={14} />
                      ) : (
                        <Plus size={14} />
                      )}
                    </span>
                    <small>{m.filename}</small>
                  </button>
                ))}
                {!media.length && (
                  <p className="muted">
                    Upload media di halaman Pustaka media terlebih dahulu.
                  </p>
                )}
              </div>
            </label>
          </>
        )}
        {!isPost && (
          <fieldset className="tiktok-options">
            <legend>Target Browser Use (opsional untuk jalur API)</legend>
            <label className="field">
              URL posting / thread tepat
              <input
                type="url"
                value={browserUrl}
                onChange={(e) => setBrowserUrl(e.target.value)}
              />
            </label>
            {draft?.kind === "dm_reply" ? (
              <label className="field">
                Username penerima
                <input
                  value={browserRecipient}
                  onChange={(e) => setBrowserRecipient(e.target.value)}
                />
              </label>
            ) : (
              <>
                <label className="field">
                  Author komentar
                  <input
                    value={browserAuthor}
                    onChange={(e) => setBrowserAuthor(e.target.value)}
                  />
                </label>
                <label className="field">
                  Teks komentar asli
                  <textarea
                    rows={2}
                    value={browserText}
                    onChange={(e) => setBrowserText(e.target.value)}
                    maxLength={2000}
                  />
                </label>
              </>
            )}
          </fieldset>
        )}
        <label className="field">
          {isPost ? "Caption" : "Isi balasan"}
          <textarea
            rows={5}
            maxLength={2200}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Tuliskan cerita atau balasanmu…"
          />
          <span className="char-count">{caption.length}/2200</span>
        </label>
        {targets.some(
          (id) => accounts.find((a) => a.id === id)?.platform === "tiktok",
        ) &&
          isPost && (
            <fieldset className="tiktok-options">
              <legend>Opsi TikTok</legend>
              <label className="field">
                Privasi (pilihan akan diverifikasi saat approve)
                <select
                  value={privacy}
                  onChange={(e) => setPrivacy(e.target.value as typeof privacy)}
                >
                  <option value="">Pilih privasi secara eksplisit</option>
                  <option value="SELF_ONLY">Hanya saya</option>
                  <option value="PUBLIC_TO_EVERYONE">Publik</option>
                  <option value="MUTUAL_FOLLOW_FRIENDS">Teman</option>
                  <option value="FOLLOWER_OF_CREATOR">Pengikut</option>
                </select>
              </label>
              <label className="field">
                Disclosure konten
                <select
                  value={commercial}
                  onChange={(e) =>
                    setCommercial(e.target.value as typeof commercial)
                  }
                >
                  <option value="none">Bukan konten komersial</option>
                  <option value="own_brand">Promosi bisnis sendiri</option>
                  <option value="paid_partnership">Paid partnership</option>
                </select>
              </label>
              <div className="check-options">
                <label>
                  <input
                    type="checkbox"
                    checked={disableComment}
                    onChange={(e) => setDisableComment(e.target.checked)}
                  />
                  Matikan komentar
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={disableDuet}
                    onChange={(e) => setDisableDuet(e.target.checked)}
                  />
                  Matikan duet
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={disableStitch}
                    onChange={(e) => setDisableStitch(e.target.checked)}
                  />
                  Matikan stitch
                </label>
              </div>
            </fieldset>
          )}
        <div className="modal-actions">
          <span className="muted">
            <ShieldCheck size={14} /> Belum akan dipublikasikan
          </span>
          <button
            className="button primary"
            disabled={busy || !targets.length}
            type="submit"
          >
            {busy ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Check size={16} />
            )}
            Simpan draft
          </button>
        </div>
      </form>
    </Modal>
  );
}
function ApprovalDialog({
  draft,
  account,
  media,
  busy,
  demo,
  csrf,
  onClose,
  onApprove,
}: {
  draft: Draft;
  account?: Account;
  media: Media[];
  busy: boolean;
  demo: boolean;
  csrf?: string;
  onClose: () => void;
  onApprove: (at?: string, method?: ExecutionMethod) => void;
}) {
  const [mode, setMode] = useState<"now" | "scheduled">(
      draft.scheduledAt ? "scheduled" : "now",
    ),
    [time, setTime] = useState(localInput(draft.scheduledAt)),
    [executionMethod, setExecutionMethod] = useState<ExecutionMethod>(
      account?.platformId === "browser-only" ? "browser" : "api",
    ),
    [creator, setCreator] = useState<Record<string, unknown> | null>(null),
    [error, setError] = useState(""),
    [consent, setConsent] = useState(false);
  useEffect(() => {
    if (account?.platform === "tiktok" && !demo && executionMethod === "api")
      request<Record<string, unknown>>(
        `/api/accounts/${account.id}/creator`,
        csrf,
      )
        .then(setCreator)
        .catch((e) => setError(e.message));
  }, [account, csrf, demo, executionMethod]);
  return (
    <Modal title="Tinjau & setujui" onClose={onClose} wide>
      <div className="approval-layout">
        <PostPreview draft={draft} account={account} media={media} />
        <div>
          <Badge status="draft" />
          <h3>{account?.label}</h3>
          <p className="muted">
            Revisi {draft.revision} · {labels[draft.kind]}
          </p>
          <p>
            Persetujuan berlaku untuk caption, media, dan akun pada revisi ini.
            Setiap perubahan membutuhkan persetujuan baru.
          </p>
          {account?.platform === "tiktok" && (
            <div className="info-box">
              <AlertTriangle size={17} />
              <div>
                <p>
                  Privasi: {draft.privacy || "Belum dipilih"} · Disclosure:{" "}
                  {draft.commercial}
                </p>
                {creator && (
                  <p>
                    Opsi creator: {String(creator.privacy_level_options)}.
                    Durasi maksimal:{" "}
                    {String(creator.max_video_post_duration_sec)} detik.
                  </p>
                )}
                {error && <p>{error}</p>}
                <p>
                  Konten menggunakan Music Usage Confirmation dan mengikuti
                  kebijakan TikTok.
                </p>
                <a
                  href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en"
                  target="_blank"
                  rel="noreferrer"
                >
                  Ketentuan musik <ExternalLink size={12} />
                </a>
              </div>
            </div>
          )}
          <label className="field">
            Jalur eksekusi
            <select
              aria-label="Jalur eksekusi"
              value={executionMethod}
              onChange={(e) => {
                setExecutionMethod(e.target.value as ExecutionMethod);
                setConsent(false);
              }}
            >
              <option
                value="api"
                disabled={account?.platformId === "browser-only"}
              >
                API resmi
              </option>
              <option value="browser" disabled={!account?.browser?.enabled}>
                Browser Use (opsi tambahan)
              </option>
            </select>
          </label>
          {executionMethod === "browser" && (
            <div className="info-box">
              <AlertTriangle size={18} />
              <p>
                Akun browser: @
                {account?.browser?.expectedUsername || account?.username}.
                Eksekusi memakai sesi Browser Use dan saldo layanan. Caption,
                media, dan target akan diproses di Browser Use Cloud. Status
                sesi: {account?.browser?.status || "belum terhubung"}. Hasil
                aksi akan memerlukan pemeriksaan pemilik; tidak ada retry publik
                otomatis.
              </p>
            </div>
          )}
          {executionMethod === "browser" && draft.browserTarget && (
            <div className="browser-target-review">
              <p className="eyebrow">TARGET YANG DISETUJUI</p>
              <p>URL: {draft.browserTarget.url}</p>
              {draft.browserTarget.recipient ? (
                <p>Penerima: @{draft.browserTarget.recipient}</p>
              ) : (
                <>
                  <p>Author: @{draft.browserTarget.author}</p>
                  <p>Komentar asli: {draft.browserTarget.text}</p>
                </>
              )}
            </div>
          )}
          <div className="radio-options">
            <label>
              <input
                type="radio"
                checked={mode === "now"}
                onChange={() => setMode("now")}
              />
              Approve & publish sekarang
            </label>
            <label>
              <input
                type="radio"
                checked={mode === "scheduled"}
                onChange={() => setMode("scheduled")}
              />
              Approve & jadwalkan
            </label>
          </div>
          {mode === "scheduled" && (
            <label className="field">
              Waktu publish (WIB)
              <input
                type="datetime-local"
                required
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </label>
          )}
          <label className="approval-consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              Saya telah meninjau konten dan menyetujui aksi ini pada akun
              tujuan.{" "}
              {executionMethod === "browser"
                ? " Saya menyetujui penggunaan Browser Use untuk aksi ini."
                : ""}
              {account?.platform === "tiktok"
                ? " Saya menerima ketentuan penggunaan musik TikTok."
                : ""}
            </span>
          </label>
          {demo && (
            <p className="muted">
              Simulasi saja. Tidak ada publish ke Instagram/TikTok.
            </p>
          )}
          <button
            className="button primary full"
            disabled={
              busy ||
              !consent ||
              (mode === "scheduled" && !time) ||
              (executionMethod === "browser" &&
                account?.browser?.status !== "ready")
            }
            onClick={() =>
              onApprove(
                mode === "scheduled" ? inputISO(time) : undefined,
                executionMethod,
              )
            }
          >
            {busy ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <Check size={17} />
            )}
            Setujui revisi {draft.revision}
          </button>
        </div>
      </div>
    </Modal>
  );
}
function RejectDialog({
  draft,
  busy,
  onClose,
  onReject,
}: {
  draft: Draft;
  busy: boolean;
  onClose: () => void;
  onReject: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <Modal title="Tolak draft" onClose={onClose}>
      <p>
        Catatanmu akan tersedia untuk klien AI agar draft berikutnya lebih
        sesuai.
      </p>
      <label className="field">
        Catatan revisi
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          maxLength={1000}
          placeholder="Apa yang perlu diperbaiki?"
        />
      </label>
      <div className="modal-actions">
        <span className="muted">Revisi {draft.revision}</span>
        <button
          className="button danger"
          disabled={busy}
          onClick={() => onReject(note)}
        >
          Tolak draft
        </button>
      </div>
    </Modal>
  );
}
function AccountLabels({
  accounts,
  busy,
  onSave,
}: {
  accounts: Account[];
  busy: boolean;
  onSave: (id: string, label: string) => void;
}) {
  const [id, setId] = useState(accounts[0]?.id || ""),
    [label, setLabel] = useState(accounts[0]?.label || "");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(id, label);
      }}
    >
      <label className="field">
        Akun
        <select
          value={id}
          onChange={(e) => {
            setId(e.target.value);
            setLabel(
              accounts.find((a) => a.id === e.target.value)?.label || "",
            );
          }}
        >
          {accounts.map((a) => (
            <option value={a.id} key={a.id}>
              {a.username}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Label
        <input
          required
          maxLength={80}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </label>
      <div className="modal-actions">
        <button className="button primary" disabled={busy} type="submit">
          Simpan label
        </button>
      </div>
    </form>
  );
}
function Queue({
  drafts,
  ideas,
  accounts,
  onCancel,
  onEdit,
  onApprove,
  onIdea,
  onBrowserJob,
}: {
  drafts: Draft[];
  ideas: Idea[];
  accounts: Account[];
  onCancel: (d: Draft) => void;
  onEdit: (d: Draft) => void;
  onApprove: (d: Draft) => void;
  onIdea: () => void;
  onBrowserJob: (id: string) => void;
}) {
  const [mode, setMode] = useState("list"),
    [status, setStatus] = useState("all"),
    [month, setMonth] = useState(new Date()),
    [day, setDay] = useState<number | null>(null);
  const items = drafts
    .filter((d) => status === "all" || d.status === status)
    .sort((a, b) =>
      (a.scheduledAt || a.createdAt).localeCompare(
        b.scheduledAt || b.createdAt,
      ),
    );
  const name = (id: string) => accounts.find((a) => a.id === id)?.label;
  const display =
    day !== null
      ? items.filter((d) => {
          const s = localInput(d.scheduledAt || d.createdAt);
          return s.startsWith(
            `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
          );
        })
      : items;
  return (
    <>
      <div className="section-bar">
        <div className="view-toggle">
          <button
            className={mode === "list" ? "active" : ""}
            onClick={() => {
              setMode("list");
              setDay(null);
            }}
          >
            Daftar
          </button>
          <button
            className={mode === "calendar" ? "active" : ""}
            onClick={() => setMode("calendar")}
          >
            Kalender
          </button>
        </div>
        <div className="section-controls">
          <select
            aria-label="Filter status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">Semua status</option>
            {Object.keys(labels)
              .filter((x) =>
                [
                  "draft",
                  "scheduled",
                  "publishing",
                  "published",
                  "failed",
                  "uncertain",
                  "rejected",
                ].includes(x),
              )
              .map((x) => (
                <option key={x} value={x}>
                  {labels[x]}
                </option>
              ))}
          </select>
          <button className="button" onClick={onIdea}>
            <Lightbulb size={16} />
            Tambah ide
          </button>
        </div>
      </div>
      {mode === "calendar" && (
        <div className="panel calendar">
          <div className="panel-heading">
            <h3>
              {month.toLocaleDateString("id-ID", {
                month: "long",
                year: "numeric",
              })}
            </h3>
            <div>
              <button
                className="icon-btn"
                aria-label="Bulan sebelumnya"
                onClick={() => {
                  setMonth(
                    new Date(month.getFullYear(), month.getMonth() - 1, 1),
                  );
                  setDay(null);
                }}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                className="icon-btn"
                aria-label="Bulan berikutnya"
                onClick={() => {
                  setMonth(
                    new Date(month.getFullYear(), month.getMonth() + 1, 1),
                  );
                  setDay(null);
                }}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
          <div className="calendar-grid">
            {["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"].map((d) => (
              <span className="calendar-week" key={d}>
                {d}
              </span>
            ))}
            {Array.from(
              {
                length: new Date(
                  month.getFullYear(),
                  month.getMonth(),
                  1,
                ).getDay(),
              },
              (_, i) => (
                <div className="calendar-day blank" key={"blank" + i} />
              ),
            )}
            {Array.from(
              {
                length: new Date(
                  month.getFullYear(),
                  month.getMonth() + 1,
                  0,
                ).getDate(),
              },
              (_, i) => {
                const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`,
                  inDay = items.filter((d) =>
                    localInput(d.scheduledAt || d.createdAt).startsWith(key),
                  );
                return (
                  <button
                    className={`calendar-day ${day === i + 1 ? "selected" : ""}`}
                    key={i}
                    onClick={() => setDay(day === i + 1 ? null : i + 1)}
                  >
                    <strong>{i + 1}</strong>
                    {inDay.slice(0, 2).map((d) => (
                      <span className={d.status} key={d.id}>
                        {d.caption.slice(0, 18) || labels[d.kind]}
                      </span>
                    ))}
                    {inDay.length > 2 && (
                      <small>+{inDay.length - 2} lainnya</small>
                    )}
                  </button>
                );
              },
            )}
          </div>
        </div>
      )}
      {display.length ? (
        <div className="panel table-panel">
          <table>
            <thead>
              <tr>
                <th>Konten</th>
                <th>Akun</th>
                <th>Jadwal (WIB)</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {display.map((d) => (
                <tr key={d.id}>
                  <td>
                    <strong>{d.caption.slice(0, 65) || labels[d.kind]}</strong>
                    <small>
                      {labels[d.kind]} · revisi {d.revision}
                    </small>
                    {d.error && <p className="table-error">{d.error}</p>}
                    {d.rejectionNote && (
                      <p className="table-error">Catatan: {d.rejectionNote}</p>
                    )}
                  </td>
                  <td>{name(d.accountId)}</td>
                  <td>
                    {d.scheduledAt ? date(d.scheduledAt) : "Belum dijadwalkan"}
                  </td>
                  <td>
                    <Badge status={d.status} />
                  </td>
                  <td>
                    {d.status === "scheduled" ? (
                      <button
                        className="text-button"
                        onClick={() => onCancel(d)}
                      >
                        Batalkan / ubah
                      </button>
                    ) : ["draft", "rejected"].includes(d.status) ? (
                      <div className="table-actions">
                        <button
                          className="icon-btn"
                          aria-label="Edit"
                          onClick={() => onEdit(d)}
                        >
                          <Edit3 size={16} />
                        </button>
                        {d.status === "draft" && (
                          <button
                            className="icon-btn"
                            aria-label="Approve"
                            onClick={() => onApprove(d)}
                          >
                            <Check size={17} />
                          </button>
                        )}
                      </div>
                    ) : d.browserJobId ? (
                      <button
                        className="text-button"
                        onClick={() => onBrowserJob(d.browserJobId!)}
                      >
                        Periksa browser
                      </button>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty icon={CalendarDays} title="Belum ada item di tampilan ini">
          Pilih status lain atau buat draft untuk merencanakan konten.
        </Empty>
      )}
      <div className="section-title">
        <h3>
          Ruang ide <span>{ideas.length}</span>
        </h3>
        <p>Usulan, belum menjadi jadwal final.</p>
      </div>
      <div className="idea-grid">
        {ideas.map((i) => (
          <article className="idea-card" key={i.id}>
            <Lightbulb size={18} />
            <span className="eyebrow">{name(i.accountId)}</span>
            <h3>{i.title}</h3>
            <p>{i.notes}</p>
            <small>
              {i.proposedAt ? date(i.proposedAt) : "Tanpa usulan tanggal"}
            </small>
            <button
              className="text-button"
              onClick={() =>
                onEdit({
                  id: "",
                  accountId: i.accountId,
                  kind: "post",
                  caption: i.notes,
                  mediaIds: [],
                  postType: "photo",
                  status: "draft",
                  commercial: "none",
                  createdAt: i.createdAt,
                  updatedAt: i.createdAt,
                  revision: 0,
                  attempts: 0,
                  scheduledAt: i.proposedAt,
                })
              }
            >
              Jadikan draft <ArrowUpRight size={14} />
            </button>
          </article>
        ))}
      </div>
    </>
  );
}
function Analytics({
  workspace,
  accountFilter,
}: {
  workspace: Workspace;
  accountFilter: string;
}) {
  const stats = workspace.stats.filter(
      (s) => accountFilter === "all" || s.accountId === accountFilter,
    ),
    posts = workspace.posts.filter(
      (p) => accountFilter === "all" || p.accountId === accountFilter,
    ),
    sum = (k: "followers" | "views" | "likes" | "comments" | "shares") =>
      stats.reduce((n, s) => n + s[k], 0),
    [history, setHistory] = useState<
      { capturedAt: string; followers: number }[]
    >([]);
  useEffect(() => {
    if (workspace.demo) {
      setHistory(
        Array.from({ length: 30 }, (_, i) => ({
          capturedAt: new Date(Date.now() - (29 - i) * 86400000).toISOString(),
          followers: Math.round(
            sum("followers") * (0.76 + i * 0.008 + Math.sin(i * 0.9) * 0.015),
          ),
        })),
      );
      return;
    }
    const selected = workspace.accounts.filter(
      (a) => accountFilter === "all" || a.id === accountFilter,
    );
    Promise.all(
      selected.map((a) =>
        request<{ items: { capturedAt: string; followers: number }[] }>(
          `/api/list?kind=stats&account_id=${a.id}`,
          workspace.csrf,
        ),
      ),
    )
      .then((results) => {
        const days = new Map<string, number>();
        for (const r of results)
          for (const s of r.items) {
            const day = s.capturedAt.slice(0, 10);
            days.set(day, (days.get(day) || 0) + s.followers);
          }
        setHistory(
          [...days]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([capturedAt, followers]) => ({ capturedAt, followers })),
        );
      })
      .catch(() => setHistory([]));
  }, [workspace, accountFilter]);
  const values = history.map((s) => s.followers),
    min = Math.min(...values) * 0.95,
    max = Math.max(...values) * 1.02;
  const points = values
    .map(
      (v, i) =>
        `${40 + (i / (values.length - 1 || 1)) * 720},${190 - ((v - min) / (max - min || 1)) * 160}`,
    )
    .join(" ");
  const heat = Array.from({ length: 7 }, () =>
    Array.from({ length: 12 }, () => ({ value: 0, n: 0 })),
  );
  for (const p of posts) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jakarta",
      weekday: "short",
      hour: "numeric",
      hourCycle: "h23",
    }).formatToParts(new Date(p.createdAt));
    const day = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(
        parts.find((x) => x.type === "weekday")!.value,
      ),
      hour = Math.floor(
        Number(parts.find((x) => x.type === "hour")!.value) / 2,
      );
    heat[day][hour].value += p.likes + p.comments + p.shares;
    heat[day][hour].n++;
  }
  const heatMax = Math.max(
    1,
    ...heat.flat().map((x) => (x.n ? x.value / x.n : 0)),
  );
  return (
    <>
      <div className="summary-grid">
        <Summary
          label="Total followers"
          value={sum("followers")}
          icon={Users}
          note="Snapshot terakhir"
        />
        <Summary
          label="Views tersedia"
          value={sum("views")}
          icon={Eye}
          note="Bergantung izin & platform"
        />
        <Summary
          label="Total likes"
          value={sum("likes")}
          icon={Heart}
          note="Metrik tersedia dari API"
        />
        <Summary
          label="Komentar & share"
          value={sum("comments") + sum("shares")}
          icon={MessageCircle}
          note="Interaksi dalam data tersimpan"
        />
      </div>
      <div className="analytics-grid">
        <section className="panel growth">
          <div className="panel-heading">
            <div>
              <h3>Pertumbuhan followers</h3>
              <p>
                Snapshot harian ·{" "}
                {workspace.demo ? "data contoh" : "data resmi"}
              </p>
            </div>
            <span className="chip">{history.length} snapshot</span>
          </div>
          {history.length ? (
            <>
              <div className="chart-total">
                {fmt.format(sum("followers"))}
                <small>followers</small>
              </div>
              <svg
                className="line-chart"
                viewBox="0 0 800 225"
                role="img"
                aria-label="Tren followers dari snapshot"
              >
                <defs>
                  <linearGradient id="area" x2="0" y2="1">
                    <stop stopColor="#8dbd8f" stopOpacity=".28" />
                    <stop offset="1" stopColor="#8dbd8f" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[35, 85, 135, 185].map((y) => (
                  <line
                    key={y}
                    x1="40"
                    y1={y}
                    x2="760"
                    y2={y}
                    stroke="currentColor"
                    opacity=".1"
                    strokeDasharray="3 5"
                  />
                ))}
                <polygon
                  points={`40,200 ${points} 760,200`}
                  fill="url(#area)"
                />
                <polyline
                  points={points}
                  fill="none"
                  stroke="#8dbd8f"
                  strokeWidth="3"
                  strokeLinejoin="round"
                />
                {values.map((v, i) => (
                  <circle
                    key={i}
                    cx={40 + (i / (values.length - 1 || 1)) * 720}
                    cy={190 - ((v - min) / (max - min || 1)) * 160}
                    r="4"
                    fill="#8dbd8f"
                  >
                    <title>
                      {date(history[i].capturedAt, { dateStyle: "medium" })}:{" "}
                      {fmt.format(v)}
                    </title>
                  </circle>
                ))}
              </svg>
              <div className="chart-axis">
                <span>
                  {date(history[0].capturedAt, { dateStyle: "medium" })}
                </span>
                <span>
                  {date(history[history.length - 1].capturedAt, {
                    dateStyle: "medium",
                  })}
                </span>
              </div>
            </>
          ) : (
            <Empty icon={ChartNoAxesCombined} title="Snapshot belum tersedia">
              Cron harian akan menyimpan riwayat analitik.
            </Empty>
          )}
        </section>
        <section className="panel account-performance">
          <div className="panel-heading">
            <h3>Performa per akun</h3>
            <ArrowUpRight size={18} />
          </div>
          {stats.map((s) => {
            const a = workspace.accounts.find((a) => a.id === s.accountId);
            return (
              <div className="performance-row" key={s.accountId}>
                <span className={`platform-logo small ${a?.platform}`}>
                  <PlatformIcon
                    platform={a?.platform || "instagram"}
                    size={17}
                  />
                </span>
                <div>
                  <strong>{a?.label}</strong>
                  <small>{a?.platform} · followers</small>
                </div>
                <b>{compact(s.followers)}</b>
              </div>
            );
          })}
          <p className="muted">
            {stats.length
              ? "Metrik yang tidak tersedia dari API tidak diestimasi."
              : "Hubungkan akun dan refresh data."}
          </p>
        </section>
      </div>
      <section className="panel heatmap">
        <div className="panel-heading">
          <div>
            <h3>Kapan kontenmu paling ramai?</h3>
            <p>Rata-rata engagement berdasarkan waktu posting historis · WIB</p>
          </div>
          <span className="chip">{posts.length} konten</span>
        </div>
        <div className="heatmap-grid">
          <span />
          {Array.from({ length: 12 }, (_, i) => (
            <small key={i}>{String(i * 2).padStart(2, "0")}</small>
          ))}
          {heat.map((row, day) => (
            <div className="heatmap-row" key={day}>
              <span>
                {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"][day]}
              </span>
              {row.map((c, h) => (
                <div
                  key={h}
                  style={{
                    background: c.n
                      ? `rgba(141,189,143,${0.18 + (c.value / c.n / heatMax) * 0.82})`
                      : undefined,
                  }}
                  title={`${["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"][day]}, ${h * 2}:00 WIB · ${c.n} konten · rata-rata ${c.n ? Math.round(c.value / c.n) : 0} engagement`}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="heatmap-note">
          <span>Waktu posting historis; bukan data aktivitas pengikut.</span>
          <span>
            Rendah <i />
            <i />
            <i />
            <i /> Tinggi
          </span>
        </div>
      </section>
      <div className="section-title">
        <h3>Konten dengan performa terbaik</h3>
        <p>Diurutkan berdasarkan likes + komentar + shares.</p>
      </div>
      {posts.length ? (
        <div className="panel table-panel">
          <table>
            <thead>
              <tr>
                <th>Konten</th>
                <th>Akun</th>
                <th>Views</th>
                <th>Likes</th>
                <th>Komentar</th>
                <th>Shares</th>
              </tr>
            </thead>
            <tbody>
              {[...posts]
                .sort(
                  (a, b) =>
                    b.likes +
                    b.comments +
                    b.shares -
                    (a.likes + a.comments + a.shares),
                )
                .slice(0, 10)
                .map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="content-cell">
                        {p.thumbnail && <img src={p.thumbnail} alt="" />}
                        <div>
                          <strong>{p.caption.slice(0, 65)}</strong>
                          <small>
                            {date(p.createdAt, { dateStyle: "medium" })}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td>
                      {
                        workspace.accounts.find((a) => a.id === p.accountId)
                          ?.label
                      }
                    </td>
                    <td>{compact(p.views)}</td>
                    <td>{compact(p.likes)}</td>
                    <td>{fmt.format(p.comments)}</td>
                    <td>{fmt.format(p.shares)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="Belum ada konten tersimpan">
          Refresh data untuk mengambil konten dari API resmi.
        </Empty>
      )}
    </>
  );
}
function MediaLibrary({
  media,
  busy,
  onUpload,
  onDelete,
}: {
  media: Media[];
  busy: boolean;
  onUpload: (f: File) => void;
  onDelete: (m: Media) => void;
}) {
  const [filter, setFilter] = useState("all"),
    [search, setSearch] = useState("");
  const items = media.filter(
    (m) =>
      (filter === "all" || m.mime.startsWith(filter)) &&
      m.filename.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <label
        className={`upload-zone ${busy ? "disabled" : ""}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (!busy && e.dataTransfer.files[0])
            onUpload(e.dataTransfer.files[0]);
        }}
      >
        <input
          type="file"
          disabled={busy}
          accept="image/jpeg,video/mp4,video/quicktime"
          onChange={(e) => {
            if (e.target.files?.[0]) onUpload(e.target.files[0]);
            e.target.value = "";
          }}
        />
        <span className="upload-icon">
          {busy ? (
            <LoaderCircle size={25} className="spin" />
          ) : (
            <Upload size={25} />
          )}
        </span>
        <h3>
          {busy
            ? "Mengupload & memvalidasi…"
            : "Letakkan media di sini, atau pilih file"}
        </h3>
        <p>JPEG sampai 8 MB · MP4/MOV sampai 1 GB · Upload langsung ke R2</p>
        <span className="button">
          Pilih file <Plus size={15} />
        </span>
      </label>
      <div className="section-bar">
        <div className="tabs">
          {[
            { id: "all", label: "Semua media" },
            { id: "image/", label: "Foto" },
            { id: "video/", label: "Video" },
          ].map((t) => (
            <button
              key={t.id}
              className={filter === t.id ? "active" : ""}
              onClick={() => setFilter(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <label className="search">
          <Search size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama file…"
          />
        </label>
      </div>
      <div className="media-grid">
        {items.map((m) => (
          <article className="media-card" key={m.id}>
            <div className="library-image">
              {m.mime.startsWith("video/") ? (
                <video src={m.previewUrl} controls preload="metadata" />
              ) : (
                <img src={m.previewUrl} alt={m.filename} />
              )}
              <span className="media-type">
                {m.mime.startsWith("video/") ? "VIDEO" : "JPEG"}
              </span>
            </div>
            <div className="library-meta">
              <strong>{m.filename}</strong>
              <button
                className="icon-btn"
                aria-label={`Hapus ${m.filename}`}
                onClick={() => onDelete(m)}
              >
                <Trash2 size={15} />
              </button>
              <p>
                {m.width} × {m.height} <span>·</span>{" "}
                {(m.size / 1024 / 1024).toFixed(1)} MB
                {m.duration ? ` · ${Math.round(m.duration)} detik` : ""}
              </p>
              <small>
                <ShieldCheck size={12} />
                {m.verified ? "Metadata tervalidasi" : "Belum tervalidasi"}
              </small>
            </div>
          </article>
        ))}
      </div>
      {!items.length && (
        <Empty icon={Images} title="Belum ada media">
          Upload file untuk mulai membuat draft.
        </Empty>
      )}
    </>
  );
}
function Logs({
  logs,
  accounts,
  onDetail,
  onLoad,
}: {
  logs: Activity[];
  accounts: Account[];
  onDetail: (l: Activity) => void;
  onLoad: (day: string) => Promise<Activity[]>;
}) {
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [day, setDay] = useState(""),
    [loaded, setLoaded] = useState<Activity[] | null>(null),
    [error, setError] = useState("");
  const items = (loaded || logs)
    .filter(
      (l) =>
        (status === "all" || l.status === status) &&
        (!search || l.action.toLowerCase().includes(search.toLowerCase())),
    )
    .sort((a, b) => b.at.localeCompare(a.at));
  return (
    <>
      <div className="section-bar">
        <div className="section-controls">
          <select
            aria-label="Filter status log"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">Semua status</option>
            <option value="success">Berhasil</option>
            <option value="error">Gagal</option>
            <option value="pending">Pending</option>
          </select>
          <input
            aria-label="Tanggal log"
            type="date"
            value={day}
            onChange={async (e) => {
              setDay(e.target.value);
              if (!e.target.value) {
                setLoaded(null);
                return;
              }
              try {
                setLoaded(await onLoad(e.target.value));
                setError("");
              } catch (e) {
                setError(e instanceof Error ? e.message : "Gagal memuat.");
              }
            }}
          />
        </div>
        <label className="search">
          <Search size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari tool atau aksi…"
          />
        </label>
      </div>
      {error && <div className="warning-banner">{error}</div>}
      {items.length ? (
        <div className="panel log-timeline">
          {items.map((l) => (
            <button
              className="log-entry"
              key={l.id}
              onClick={() => onDetail(l)}
            >
              <span className={`log-icon ${l.status}`}>
                {l.status === "success" ? (
                  <Check size={16} />
                ) : (
                  <AlertTriangle size={16} />
                )}
              </span>
              <div>
                <strong>{l.action}</strong>
                <p>
                  {accounts.find((a) => a.id === l.accountId)?.label ||
                    "Workspace"}
                  {l.entityId ? ` · ${l.entityId.slice(0, 16)}` : ""}
                </p>
              </div>
              <span className="log-date">{date(l.at)}</span>
              <ChevronRight size={16} />
            </button>
          ))}
        </div>
      ) : (
        <Empty icon={ScrollText} title="Belum ada aktivitas">
          Tool call dan persetujuan akan dicatat di sini.
        </Empty>
      )}
    </>
  );
}
function IdeaEditor({
  accounts,
  busy,
  onClose,
  onSave,
}: {
  accounts: Account[];
  busy: boolean;
  onClose: () => void;
  onSave: (input: Record<string, unknown>) => void;
}) {
  const [account, setAccount] = useState(accounts[0]?.id || ""),
    [title, setTitle] = useState(""),
    [notes, setNotes] = useState(""),
    [time, setTime] = useState("");
  return (
    <Modal title="Simpan ide konten" onClose={onClose}>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          onSave({
            account_id: account,
            title,
            notes,
            proposed_at: time ? inputISO(time) : undefined,
          });
        }}
      >
        <label className="field">
          Akun
          <select value={account} onChange={(e) => setAccount(e.target.value)}>
            {accounts.map((a) => (
              <option value={a.id} key={a.id}>
                {a.label} · {a.platform}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Judul ide
          <input
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Cerita berikutnya…"
          />
        </label>
        <label className="field">
          Catatan
          <textarea
            rows={4}
            maxLength={5000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <label className="field">
          Usulan waktu (WIB)
          <input
            type="datetime-local"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </label>
        <div className="modal-actions">
          <button
            type="submit"
            className="button primary"
            disabled={busy || !account}
          >
            Simpan ide
          </button>
        </div>
      </form>
    </Modal>
  );
}
function ConversationDialog({
  workspace,
  busy,
  onClose,
  onDraft,
}: {
  workspace: Workspace;
  busy: boolean;
  onClose: () => void;
  onDraft: (
    accountId: string,
    kind: "comment_reply" | "dm_reply",
    targetId: string,
    text: string,
  ) => void;
}) {
  const ig = workspace.accounts.filter((a) => a.platform === "instagram"),
    [account, setAccount] = useState(ig[0]?.id || ""),
    [mode, setMode] = useState<"comment_reply" | "dm_reply">("comment_reply"),
    [post, setPost] = useState(""),
    [items, setItems] = useState<{ id: string; text: string }[]>([]),
    [selected, setSelected] = useState(""),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  async function load() {
    setLoading(true);
    setError("");
    try {
      if (workspace.demo) {
        setItems(
          mode === "comment_reply"
            ? [
                { id: "comment-1", text: "Matcha-nya pakai jenis apa ya? 🍵" },
                {
                  id: "comment-2",
                  text: "Ini lokasinya di mana? Cantik banget!",
                },
              ]
            : [
                {
                  id: "conversation-1",
                  text: "Hai, mau tanya jam buka studio hari Sabtu.",
                },
              ],
        );
      } else {
        const r = await request<{
          data?: { id: string; text?: string; updated_time?: string }[];
        }>(
          mode === "comment_reply"
            ? `/api/accounts/${account}/comments?post_id=${post}`
            : `/api/accounts/${account}/conversations`,
          workspace.csrf,
        );
        setItems(
          (r.data || []).map((x) => ({
            id: x.id,
            text: x.text || `Percakapan · ${x.updated_time}`,
          })),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <Modal title="Komentar & DM Instagram" onClose={onClose} wide>
      <div className="two-fields">
        <label className="field">
          Akun
          <select value={account} onChange={(e) => setAccount(e.target.value)}>
            {ig.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Jenis
          <select
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as typeof mode);
              setItems([]);
              setSelected("");
            }}
          >
            <option value="comment_reply">Komentar</option>
            <option value="dm_reply">Direct messages</option>
          </select>
        </label>
      </div>
      {mode === "comment_reply" && (
        <label className="field">
          ID posting
          <input
            value={post}
            onChange={(e) => setPost(e.target.value)}
            placeholder={
              workspace.demo ? "Opsional untuk demo" : "ID konten Instagram"
            }
          />
        </label>
      )}
      <button
        className="button"
        disabled={
          loading ||
          !account ||
          (!workspace.demo && mode === "comment_reply" && !post)
        }
        onClick={load}
      >
        <RefreshCw size={15} className={loading ? "spin" : ""} />
        Muat {mode === "comment_reply" ? "komentar" : "percakapan"}
      </button>
      {error && <p className="table-error">{error}</p>}
      <div className="conversation-list">
        {items.map((i) => (
          <button
            key={i.id}
            className={selected === i.id ? "selected" : ""}
            onClick={async () => {
              setSelected(i.id);
              if (mode === "dm_reply" && !workspace.demo) {
                try {
                  const r = await request<{
                    messages?: {
                      data?: { message?: string; created_time?: string }[];
                    };
                  }>(
                    `/api/conversation?account_id=${account}&id=${i.id}`,
                    workspace.csrf,
                  );
                  const messages = (r.messages?.data || [])
                    .map((m) => `${m.created_time || ""}: ${m.message || ""}`)
                    .join("\n");
                  setItems((old) =>
                    old.map((x) =>
                      x.id === i.id
                        ? {
                            ...x,
                            text: messages || "Tidak ada pesan tersedia.",
                          }
                        : x,
                    ),
                  );
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Gagal memuat pesan.",
                  );
                }
              }
            }}
          >
            <MessageCircle size={17} />
            <span>{i.text}</span>
            <small>{i.id}</small>
          </button>
        ))}
      </div>
      <label className="field">
        Draft balasan
        <textarea
          rows={4}
          maxLength={mode === "dm_reply" ? 1000 : 2200}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Pesan ini baru akan dikirim setelah approval…"
        />
      </label>
      <div className="modal-actions">
        <span className="muted">DM mengikuti jendela balasan 24 jam.</span>
        <button
          className="button primary"
          disabled={busy || !selected || !text.trim()}
          onClick={() => onDraft(account, mode, selected, text)}
        >
          Buat draft balasan
        </button>
      </div>
    </Modal>
  );
}

function PageSelection({
  pages,
  busy,
  onClose,
  onSave,
}: {
  pages: { id: string; label: string; username?: string }[];
  busy: boolean;
  onClose: () => void;
  onSave: (ids: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <Modal title="Pilih akun Instagram" onClose={onClose}>
      <p>
        Pilih Facebook Pages yang terhubung ke akun profesional milikmu. Token
        disimpan terenkripsi setelah kamu memilih akun.
      </p>
      <div className="target-list">
        {pages.map((p) => (
          <label
            key={p.id}
            className={selected.includes(p.id) ? "selected" : ""}
          >
            <input
              type="checkbox"
              checked={selected.includes(p.id)}
              onChange={(e) =>
                setSelected((ids) =>
                  e.target.checked
                    ? [...ids, p.id]
                    : ids.filter((id) => id !== p.id),
                )
              }
            />
            {p.label}
            <small>@{p.username || p.id}</small>
          </label>
        ))}
      </div>
      <div className="modal-actions">
        <button
          className="button primary"
          disabled={busy || !selected.length}
          onClick={() => onSave(selected)}
        >
          Hubungkan {selected.length} akun
        </button>
      </div>
    </Modal>
  );
}
