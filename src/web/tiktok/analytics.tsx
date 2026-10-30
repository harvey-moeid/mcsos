import { useState, useEffect } from "react";
import type { Account } from "../../shared/model";
import type { MetricSnapshot } from "../../shared/tiktok";
import { request } from "../client";
import { Notice, wib, iso, pretty } from "./ui";
export function TikTokAnalytics({
  accounts,
  csrf,
  enabled,
  notify,
}: {
  accounts: Account[];
  csrf?: string;
  enabled: boolean;
  notify: (s: string, error?: boolean) => void;
}) {
  const [account, setAccount] = useState(accounts[0]?.id || ""),
    [rows, setRows] = useState<MetricSnapshot[]>([]),
    [cursor, setCursor] = useState<string | undefined>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function load(next?: string) {
    if (!account || !enabled) return;
    setBusy(true);
    setError("");
    try {
      const r = await request<{ items: MetricSnapshot[]; cursor?: string }>(
        `/api/tiktok/accounts/${account}/analytics${next ? `?cursor=${encodeURIComponent(next)}` : ""}`,
      );
      setRows((old) => (next ? [...old, ...r.items] : r.items));
      setCursor(r.cursor);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    setRows([]);
    setCursor(undefined);
    void load();
  }, [account, enabled]);
  const [comparison, setComparison] = useState<
    { label: string; latest?: MetricSnapshot }[]
  >([]);
  async function compare() {
    setBusy(true);
    try {
      const result = await Promise.all(
        accounts.map(async (a) => {
          const r = await request<{ items: MetricSnapshot[]; cursor?: string }>(
            `/api/tiktok/accounts/${a.id}/analytics`,
          );
          return {
            label: a.label,
            latest: r.items
              .filter((m) => !m.postId)
              .sort((x, y) => y.observedAt.localeCompare(x.observedAt))[0],
          };
        }),
      );
      setComparison(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const display = (value: number | null | undefined) =>
    value === null || value === undefined
      ? "Tidak tersedia"
      : new Intl.NumberFormat("id-ID").format(value);
  return (
    <div className="panel tt-form">
      <h2>Analitik TikTok · sumber nyata</h2>
      <Notice>
        Data diimpor atau dicatat pemilik. Tidak ada scraping otomatis. Nilai
        kosong adalah null; tidak dihitung sebagai nol. Tren berasal dari
        snapshot bertanggal. MCSOS tidak mengklaim data manual sebagai API
        resmi.
      </Notice>
      {!enabled && <p>Analitik belum diaktifkan.</p>}
      <label className="field">
        Akun analitik
        <select value={account} onChange={(e) => setAccount(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </label>
      <div className="tt-actions">
        <button
          className="button"
          disabled={busy || !enabled || !account}
          onClick={() => void load()}
        >
          Muat ulang metrik
        </button>
        <button
          className="button"
          disabled={busy || !enabled || accounts.length < 2}
          onClick={() => void compare()}
        >
          Bandingkan akun (100 observasi awal)
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {busy && <p aria-live="polite">Memuat data analitik…</p>}
      {!rows.length && !busy && (
        <p>Belum ada observasi metrik. Catat atau impor data berizin.</p>
      )}
      <div className="tt-table">
        <table>
          <thead>
            <tr>
              <th>Observasi WIB</th>
              <th>Sumber</th>
              <th>Views</th>
              <th>Likes</th>
              <th>Komentar</th>
              <th>Shares</th>
              <th>Followers</th>
              <th>Engagement / views</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td>
                  {pretty(m.observedAt)}
                  {m.postId && <small>Posting {m.postId}</small>}
                </td>
                <td>{m.source}</td>
                {[m.views, m.likes, m.comments, m.shares, m.followers].map(
                  (v, i) => (
                    <td key={i}>{display(v)}</td>
                  ),
                )}
                <td>
                  {m.views &&
                  m.likes !== null &&
                  m.comments !== null &&
                  m.shares !== null
                    ? (
                        ((m.likes + m.comments + m.shares) / m.views) *
                        100
                      ).toFixed(2) + "%"
                    : "Tidak tersedia"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cursor && (
        <button
          className="button"
          disabled={busy}
          onClick={() => void load(cursor)}
        >
          Muat observasi berikutnya
        </button>
      )}
      {comparison.length > 0 && (
        <div className="tt-table">
          <table>
            <thead>
              <tr>
                <th>Akun</th>
                <th>Terakhir pada halaman awal</th>
                <th>Followers</th>
                <th>Views</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((x) => (
                <tr key={x.label}>
                  <td>{x.label}</td>
                  <td>{pretty(x.latest?.observedAt)}</td>
                  <td>{display(x.latest?.followers)}</td>
                  <td>{display(x.latest?.views)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <details>
        <summary>Catat metrik / impor JSON</summary>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const metrics: Record<string, unknown> = {
              observed_at: iso(String(f.get("observed_at"))),
            };
            for (const k of [
              "views",
              "likes",
              "comments",
              "shares",
              "followers",
            ]) {
              const value = f.get(k);
              metrics[k] = value === "" ? null : Number(value);
            }
            setBusy(true);
            try {
              await request(
                `/api/tiktok/accounts/${account}/analytics`,
                csrf,
                "POST",
                { items: [metrics] },
              );
              await load();
              notify("Observasi manual disimpan.");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field">
            Waktu observasi WIB
            <input
              name="observed_at"
              type="datetime-local"
              required
              defaultValue={wib(new Date().toISOString())}
            />
          </label>
          <div className="two-fields">
            {["views", "likes", "comments", "shares", "followers"].map((k) => (
              <label className="field" key={k}>
                {k}
                <input
                  name={k}
                  type="number"
                  min={0}
                  step={1}
                  placeholder="Kosong = tidak tersedia"
                />
              </label>
            ))}
          </div>
          <button className="button" disabled={busy || !enabled || !account}>
            Simpan metrik manual
          </button>
        </form>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            try {
              const items = JSON.parse(String(f.get("json")));
              await request(
                `/api/tiktok/accounts/${account}/analytics`,
                csrf,
                "POST",
                { items },
              );
              await load();
              notify("Impor selesai.");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field">
            Array JSON observasi (maksimal 100)
            <textarea
              name="json"
              required
              rows={5}
              maxLength={80000}
              placeholder={
                '[{"observed_at":"2026-10-28T10:00:00+07:00","views":null}]'
              }
            />
          </label>
          <button className="button" disabled={busy || !enabled || !account}>
            Impor metrik manual
          </button>
        </form>
      </details>
    </div>
  );
}
