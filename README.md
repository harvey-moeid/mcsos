# MCSOS TikTok AI Studio v2.0

Workspace pribadi Instagram + TikTok pada Cloudflare Workers, React/Vite dan TypeScript. AI menyiapkan, pemilik menyetujui, hasil platform diperiksa manusia. TikTok memakai **persiapan konten dan handoff manual**; login browser tidak membutuhkan TikTok Developer API.

Target produksi tetap Worker `social-mcp`, origin `https://sosial-mcp.muidsoft.com`, R2 `social-mcp-data`, serta dua namespace KV existing. Tidak ada Cron, D1, auto-publish TikTok, scraping TikTok, atau dependency layanan berbayar yang wajib. Cloudflare Builds ke main tercatat pada dokumentasi baseline; koneksi live harus diperiksa pemilik sebelum merge/deploy.

## Mulai lokal

Node >=24, npm dan Chromium untuk uji browser.

```sh
npm ci
npm run setup:local
npm run dev:worker
# terminal lain
npm run dev
```

Daftarkan callback GitHub `http://localhost:8787/auth/github/callback`, isi `.dev.vars` sesuai panduan konfigurasi. Untuk integrasi owner gunakan dashboard pada origin Worker dengan `dist` hasil build; Vite proxy hanya membantu pengembangan. Origin cookie/CSRF harus sama dengan PUBLIC_ORIGIN. `?demo=1` adalah demo Instagram eksplisit di browser, tidak menulis data produksi. Studio TikTok nyata membutuhkan login owner.

## Fitur

- Sepuluh halaman navigasi: Overview, AI Content Studio, Inbox approval, Antrean & kalender, Analitik, Akun terhubung, Pustaka media, Log aktivitas, MCP Tools, Pengaturan. Kalender dan antrean berbagi halaman; pengaturan dan log tersedia terpisah.
- Multiakun TikTok: handle, label/grup, identitas manual dengan batas 24 jam, profile provider terpisah, lock/lease, disconnect referensi sesi, recovery sesi provider yang masih aktif.
- Draft TikTok: caption/hashtag, video/foto/carousel, catatan, label AI, preferensi privasi dan disclosure manual, preview portrait, jadwal WIB, edit dengan expected revision, duplikasi/hapus, riwayat revisi.
- Approval menyimpan fingerprint versi objek R2, caption, akun/username, revisi identitas, metode dan waktu. Perubahan material membutuhkan tinjauan ulang.
- Jadwal hanya diproses ketika pemilik menekan tombol. Handoff mengunci satu pekerjaan per akun; ambiguous/uncertain tidak dikirim ulang. `published` memerlukan konfirmasi pemilik dengan URL posting yang cocok. Bukti ini **manual**, bukan verifikasi API independen.
- AI adapter OpenRouter/Gemini opsional; schema JSON, batas token/request, timeout dan error jujur. Editor manual tetap tersedia tanpa AI. Tidak ada tool AI yang dapat approve/publish.
- R2 direct/multipart existing, validasi JPEG/PNG/WEBP/MP4/MOV, multiple file dalam composer TikTok, progress, preview/signed URL, asosiasi akun dan deteksi referensi sebelum hapus. Tidak ada transcoding. Multipart berjalan per part; belum mendukung resume lintas refresh browser.
- Analitik TikTok manual/import JSON dengan null untuk data hilang, provenance dan waktu, engagement dari data lengkap, perbandingan akun dan tabel tren observasi. Tidak ada pengambilan metrik TikTok otomatis.
- Instagram Login, Facebook Login, publisher API/browser existing, GitHub owner OAuth dan Streamable HTTP MCP tetap dipertahankan. TikTok Login Kit profil existing bersifat opsional, bukan prasyarat sesi.

## Validasi

```sh
npm run typecheck
npm test
npm run check
npm run secrets:check
npm audit --audit-level=moderate
npm run check:runtime
npm run check:artifacts
npx playwright install --with-deps chromium
npm run test:ui
npx wrangler deploy --dry-run
npx wrangler deploy --config wrangler.staging.jsonc --dry-run
```

Dalam sandbox yang membatasi direktori home, pakai `XDG_CONFIG_HOME=/tmp/mcsos-config`, `npm --cache /tmp/mcsos-npm-cache` dan `WRANGLER_SEND_METRICS=false`. Chromium sistem dapat dipilih dengan `CHROMIUM_PATH=/usr/bin/chromium`. Uji UI memakai Workerd/R2 lokal dan provider mock; tidak login TikTok atau mempublikasikan konten nyata.

CI hanya memvalidasi dan mengunggah artifact. Tidak ada deployment workflow kedua. Production deploy tetap memerlukan validation gate, smoke staging, dan persetujuan pemilik.

## Dokumentasi

- [Audit & dependency map](docs/TIKTOK_AUDIT.md)
- [PRD v2](docs/PRD.md)
- [Panduan sesi dan pemakaian](docs/TIKTOK_SESSION_GUIDE.md)
- [Browser Use / recovery](docs/BROWSER-USE.md)
- [Matriks kemampuan](docs/TIKTOK_FEATURE_MATRIX.md)
- [Konfigurasi & secret](docs/CONFIGURATION.md)
- [MCP & pemetaan tools](docs/MCP.md)
- [Keamanan](docs/SECURITY.md)
- [Deployment & rollback](docs/TIKTOK_DEPLOYMENT.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Batasan](docs/TIKTOK_LIMITATIONS.md)
- [Laporan pengujian aktual](docs/TIKTOK_TEST_REPORT.md)

Kesiapan kode tidak membuktikan OAuth eksternal, login TikTok live, kompatibilitas sesi provider pada akun tertentu, atau posting nyata. Lihat status PASS/BLOCKED/NOT TESTED pada laporan pengujian.
