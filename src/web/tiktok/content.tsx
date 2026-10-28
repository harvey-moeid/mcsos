import { useState, type FormEvent } from "react";
import type { Account, Draft, Media } from "../../shared/model";
import type { AIOutput } from "../../shared/tiktok";
import { request } from "../client";
import { Notice, Dialog, wib, iso, templates } from "./ui";
export function AIStudio({
  accounts,
  csrf,
  configured,
  onError,
  onUse,
}: {
  accounts: Account[];
  csrf?: string;
  configured: boolean;
  onError: (s: string) => void;
  onUse: (s: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [output, setOutput] = useState<AIOutput | null>(null);
  async function generate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setOutput(null);
    try {
      setOutput(
        await request<AIOutput>(
          "/api/tiktok/ai",
          csrf,
          "POST",
          Object.fromEntries(f),
        ),
      );
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="panel tt-form">
      <h2>AI Content Studio</h2>
      <p>
        Script, hook, caption, hashtag dan rencana konten dengan pemeriksaan
        manusia.
      </p>
      {!configured && (
        <Notice>
          AI tidak tersedia: provider server belum dikonfigurasi. Gunakan editor
          manual di bawah.
        </Notice>
      )}
      <form onSubmit={generate}>
        <div className="two-fields">
          <label className="field">
            Akun
            <select name="account_id" required>
              {accounts.map((a) => (
                <option value={a.id} key={a.id}>
                  {a.label} · @{a.username}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Bahasa
            <select name="language">
              <option value="id">Indonesia</option>
              <option value="en">English</option>
            </select>
          </label>
        </div>
        <label className="field">
          Tugas
          <select name="task">
            {Object.entries({
              script: "Script video",
              hook: "Hook pembuka",
              caption: "Caption",
              hashtags: "Asisten hashtag",
              ideas: "Ide konten",
              repurpose: "Olah ulang konten",
              calendar: "Rencana kalender",
              variations: "Variasi caption",
              cta: "Call to action",
              recommendations: "Rekomendasi dari data yang diberikan",
            }).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Brief / konten sumber / metrik nyata
          <textarea
            name="brief"
            required
            minLength={3}
            maxLength={6000}
            rows={5}
          />
        </label>
        <button
          className="button primary"
          disabled={busy || !configured || !accounts.length}
        >
          {busy ? "Menyiapkan konten…" : "Buat dengan AI"}
        </button>
      </form>
      {output && (
        <div aria-live="polite">
          <Notice>{output.notice}</Notice>
          {output.items.map((item, i) => (
            <article className="tt-ai-result" key={i}>
              <h3>
                {item.day ? `Hari ${item.day} · ` : ""}
                {item.title}
              </h3>
              <p className="preserve-lines">{item.text}</p>
              <p>{item.hashtags.join(" ")}</p>
              <button
                className="button"
                onClick={() =>
                  onUse(`${item.text}\n${item.hashtags.join(" ")}`)
                }
              >
                Gunakan di editor draft
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
export function DraftComposer({
  draft,
  accounts,
  media,
  csrf,
  busy,
  close,
  save,
  upload,
}: {
  draft?: Draft;
  accounts: Account[];
  media: Media[];
  csrf?: string;
  busy: boolean;
  close: () => void;
  save: (p: Record<string, unknown>) => void;
  upload: (f: File[], a: string, p: (n: number) => void) => Promise<void>;
}) {
  const [account, setAccount] = useState(
      draft?.accountId || accounts[0]?.id || "",
    ),
    [caption, setCaption] = useState(draft?.caption || ""),
    [ids, setIds] = useState(draft?.mediaIds || []),
    [type, setType] = useState(draft?.postType || "video"),
    [progress, setProgress] = useState<number | null>(null),
    [err, setErr] = useState("");
  const selectedMedia = media.filter((m) => ids.includes(m.id));
  return (
    <Dialog
      title={draft?.id ? "Edit konten TikTok" : "Buat konten TikTok"}
      close={close}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          save({
            account_id: account,
            caption,
            media_ids: ids,
            post_type: type,
            scheduled_at: iso(String(f.get("scheduled_at") || "")),
            notes: f.get("notes"),
            privacy: f.get("privacy") || undefined,
            ai_generated: f.get("ai_generated") === "on",
            commercial: f.get("commercial"),
          });
        }}
      >
        <div className="tt-composer-grid">
          <div>
            <label className="field">
              Akun TikTok aktif
              <select
                value={account}
                disabled={!!draft?.id}
                onChange={(e) => {
                  setAccount(e.target.value);
                  setIds([]);
                }}
                required
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label} · @{a.username}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Template konten
              <select
                defaultValue=""
                onChange={(e) => {
                  const value =
                    templates[e.target.value as keyof typeof templates];
                  if (value) setCaption(value);
                }}
              >
                <option value="">Pilih template (mengganti caption)</option>
                {Object.keys(templates).map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Jenis konten
              <select
                value={type}
                onChange={(e) => {
                  setType(e.target.value as Draft["postType"]);
                  setIds([]);
                }}
              >
                <option value="video">Video</option>
                <option value="photo">Foto</option>
                <option value="carousel">Carousel foto</option>
              </select>
            </label>
            <label className="field">
              Caption & hashtag
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                maxLength={2200}
                rows={6}
              />
              <small>{caption.length}/2200</small>
            </label>
            <label className="field">
              Usulan jadwal WIB
              <input
                name="scheduled_at"
                type="datetime-local"
                defaultValue={wib(draft?.scheduledAt)}
              />
            </label>
            <label className="field">
              Preferensi privasi (dipilih ulang di TikTok)
              <select name="privacy" defaultValue={draft?.privacy || ""}>
                <option value="">Tentukan saat publikasi manual</option>
                <option value="PUBLIC_TO_EVERYONE">Publik</option>
                <option value="MUTUAL_FOLLOW_FRIENDS">Teman</option>
                <option value="SELF_ONLY">Hanya saya</option>
              </select>
            </label>
            <label className="field">
              Catatan draft
              <textarea
                name="notes"
                maxLength={5000}
                defaultValue={draft?.notes}
              />
            </label>
            <label className="field">
              Disclosure komersial (preferensi manual)
              <select
                name="commercial"
                defaultValue={draft?.commercial || "none"}
              >
                <option value="none">Tidak ada</option>
                <option value="own_brand">Brand sendiri</option>
                <option value="paid_partnership">Kemitraan berbayar</option>
              </select>
            </label>
            <label className="approval-consent">
              <input
                type="checkbox"
                name="ai_generated"
                defaultChecked={draft?.aiGenerated}
              />
              Konten dibuat atau dimodifikasi dengan AI; periksa kebutuhan label
              di TikTok.
            </label>
            <Notice>
              Privasi, komentar, duet, stitch dan cover final dipilih langsung
              di TikTok Web. Preview ini tidak menerapkan preferensi di
              platform. Utamakan rasio 9:16; tidak ada transcoding otomatis.
            </Notice>
          </div>
          <div>
            <div className="tt-portrait" aria-label="Preview portrait TikTok">
              {selectedMedia[0] ? (
                selectedMedia[0].mime.startsWith("video/") ? (
                  <video controls src={selectedMedia[0].previewUrl} />
                ) : (
                  <img
                    src={selectedMedia[0].previewUrl}
                    alt="Pratinjau cover media pertama"
                  />
                )
              ) : (
                <span>Preview media 9:16</span>
              )}
              <p className="preserve-lines">{caption}</p>
            </div>
            <label className="field">
              Upload beberapa media
              <input
                type="file"
                accept="image/jpeg,image/webp,image/png,video/mp4,video/quicktime"
                multiple
                disabled={progress !== null || !csrf}
                onChange={async (e) => {
                  const files = Array.from(e.target.files || []);
                  if (!files.length) return;
                  setProgress(0);
                  setErr("");
                  try {
                    await upload(files, account, setProgress);
                  } catch (e) {
                    setErr((e as Error).message);
                  } finally {
                    setProgress(null);
                    e.target.value = "";
                  }
                }}
              />
            </label>
            {progress !== null && (
              <progress
                aria-label="Progres upload"
                value={progress}
                max={100}
              />
            )}
            <p role="alert">{err}</p>
            <div className="tt-media-picker">
              {media
                .filter(
                  (m) =>
                    (!m.accountId || m.accountId === account) &&
                    (type === "video"
                      ? m.mime.startsWith("video/")
                      : m.mime.startsWith("image/")),
                )
                .map((m) => (
                  <label key={m.id}>
                    <input
                      type="checkbox"
                      checked={ids.includes(m.id)}
                      onChange={(e) =>
                        setIds((current) =>
                          e.target.checked
                            ? type === "carousel"
                              ? [...current, m.id].slice(0, 10)
                              : [m.id]
                            : current.filter((id) => id !== m.id),
                        )
                      }
                    />
                    {m.filename} · {m.width}×{m.height}
                  </label>
                ))}
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="button" onClick={close}>
            Tutup
          </button>
          <button
            className="button primary"
            disabled={busy || progress !== null || !account}
          >
            {busy ? "Menyimpan…" : "Simpan draft TikTok"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
