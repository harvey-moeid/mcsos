# PRD: Social MCP (TikTok + Instagram) di Cloudflare

Status: Final v1.2 | Tanggal: 13 Oktober 2026 | Pemilik: personal (single user)

Anggaran: **Cloudflare free plan** (upgrade $5 hanya jika terbentur batas). Arsitektur dirancang agar upgrade tidak mengubah desain.

## 1. Ringkasan

Remote MCP server yang berjalan di Cloudflare Workers, menghubungkan Claude ke beberapa akun TikTok dan Instagram milik satu pemilik. Lewat MCP, Claude dapat membaca analitik, membuat draft posting, membaca/membalas komentar dan DM (IG), serta melakukan riset tren dan kompetitor. Dashboard web (satu deployment dengan MCP) dipakai untuk melihat analitik, mengelola koneksi akun, menyetujui draft dan antrean jadwal, serta melihat log aktivitas.

Prinsip utama: **Claude menyiapkan, pemilik menyetujui.** Semua aksi yang tampil ke publik (publish, balas komentar, kirim DM) dibuat sebagai draft dan baru dieksekusi setelah di-approve di dashboard.

## 2. Tujuan dan non-tujuan

### Tujuan
- Satu MCP endpoint untuk mengelola 2-10 akun per platform (TikTok dan Instagram).
- Analitik performa akun dan konten, dengan riwayat snapshot 1 tahun.
- Posting dan penjadwalan konten (foto, video, Reels, carousel) dengan alur draft → approve → publish.
- Pengelolaan komentar (TikTok dan IG) dan DM (IG saja).
- Riset tren dan kompetitor dari API resmi plus scraping halaman publik.
- Dashboard untuk analitik, koneksi akun, antrean/jadwal, dan log aktivitas MCP.
- Biaya operasional minimal: R2 + KV + Workers, tanpa database relasional.

### Non-tujuan
- Bukan produk multi-tenant/SaaS; hanya satu pemilik.
- Tidak ada notifikasi (email/push/chat). Semua status dilihat di dashboard.
- Tidak mengirim DM TikTok (tidak ada API resmi).
- Tidak ada auto-publish tanpa persetujuan pemilik.
- Tidak mendukung platform lain (YouTube, X, dll.) di versi ini.

## 3. Pengguna dan skenario

Pengguna tunggal: pemilik akun. Skenario contoh:
1. "Bandingkan performa 10 Reels terakhir di akun A dan B, lalu beri saran jam posting." → tool analitik.
2. "Buat draft posting video ini untuk TikTok akun C, jadwalkan Jumat 19:00." → draft muncul di dashboard, pemilik approve.
3. "Ringkas komentar baru yang belum dibalas dan buat draft balasan." → draft balasan menunggu approval.
4. "Hashtag apa yang sedang naik di niche kuliner dan apa yang dipakai kompetitor X?" → riset tren.

## 4. Lingkup fitur

### 4.1 Manajemen akun dan koneksi
- Hubungkan/putuskan akun via OAuth dari dashboard (bukan lewat chat). Alur: tombol **Connect** per platform → halaman OAuth platform → kembali ke dashboard → isi label akun. Disconnect menghapus token tersimpan.
- Tiap akun punya `account_id` internal, label, platform, status token, dan tanggal kedaluwarsa.
- Refresh token otomatis oleh Cron; status "perlu koneksi ulang" ditampilkan di dashboard.
- Semua tool MCP menerima parameter `account_id`; ada tool `list_accounts` untuk menemukannya.

### 4.2 Analitik
- Profil dan statistik akun: followers, reach/impressions (IG), views, likes, comments, shares.
- Daftar konten dan metrik per konten.
- Snapshot harian (Cron) disimpan ke R2 untuk tren historis; retensi 1 tahun.
- Perbandingan antar akun dan antar periode.

### 4.3 Posting dan penjadwalan
- Draft konten: caption, media, jenis (foto/video/Reels/carousel), akun target, waktu jadwal opsional.
- Status draft: `draft` → `approved` → `scheduled` → `publishing` → `published` | `failed`.
- Media berasal dari (a) upload lewat dashboard langsung ke R2 (presigned/multipart, tanpa melewati Worker), atau (b) file lokal yang dikirim lewat Claude (dengan batas ukuran, lihat 7).
- **Tanpa transcoding.** Media divalidasi (format, rasio, durasi, ukuran) terhadap aturan tiap platform; yang tidak sesuai ditolak dengan pesan jelas agar pemilik menyiapkan file yang benar.
- Publish video memakai **pull dari URL**: IG menarik file dari URL media, TikTok memakai `PULL_FROM_URL`. Worker tidak mengunggah chunk. TikTok mensyaratkan domain/URL prefix terverifikasi, sehingga media disajikan dari custom domain di zone Cloudflare pemilik (bucket R2 dengan custom domain atau rute Worker bertoken berumur pendek).
- Cron Trigger tiap menit memeriksa antrean dan mem-publish item `scheduled` yang jatuh tempo.
- Retry terbatas dengan backoff; kegagalan tercatat di log dan status item.

### 4.4 Komentar dan DM
- TikTok: baca dan balas komentar **hanya jika API tersedia untuk akun/app yang dipakai**. Jika tidak tersedia, fitur komentar TikTok **dihapus dari v1** (IG tetap lengkap; TikTok fokus analitik dan posting).
- Instagram: baca/balas komentar dan baca/balas DM (butuh izin Messaging yang sesuai).
- Balasan dibuat sebagai draft dan dieksekusi setelah approve di dashboard.
- Moderasi dasar: sembunyikan/hapus komentar (IG) sebagai aksi yang juga lewat approval.

### 4.5 Riset tren dan kompetitor
- API resmi: data akun/konten publik yang diizinkan (mis. hashtag dan business discovery di IG bila tersedia).
- Scraping halaman publik lewat `fetch` langsung dari Worker, sebagai modul terpisah dengan feature flag. Hasil di-cache di R2 dengan TTL.
- Output ke Claude berupa data terstruktur plus sumber (resmi vs scrape) dan tanggal ambil.

### 4.6 Cross-post
- Satu draft dapat menargetkan beberapa akun IG dan TikTok sekaligus.
- Sistem membuat varian per platform (rasio/durasi media, panjang caption, hashtag) yang bisa diedit terpisah sebelum approve.
- Tiap varian punya status sendiri; kegagalan di satu platform tidak membatalkan yang lain.

### 4.7 Ide dan kalender konten
- Claude menyusun ide konten dan rencana jadwal dari data analitik dan riset tren, disimpan sebagai item kalender berstatus `idea`/`draft`.
- Saran jam posting berasal dari analisis engagement historis; **Claude hanya menyarankan, pemilik yang menentukan jadwal.**
- Item kalender dapat diubah menjadi draft posting lalu mengikuti alur approval biasa.

### 4.8 Dashboard
Aplikasi React + Vite, dark/light mode (mengikuti sistem), responsif untuk HP, gaya minimalis padat data.

**Navigasi global:** filter akun di header (semua akun sekaligus atau satu akun terpilih); seluruh halaman memakai tampilan gabungan secara default.

- **Inbox approval (beranda):** semua draft (posting, balasan komentar, moderasi, balasan DM) yang menunggu persetujuan. Kartu menampilkan pratinjau visual seperti tampilan asli IG/TikTok. Aksi per kartu: *approve & jadwalkan*, *approve & publish sekarang*, *edit caption/media inline*, *reject + catatan untuk Claude*. Approve massal (bulk) hanya untuk balasan komentar; posting selalu satu per satu.
- **Antrean & jadwal:** tampilan kalender dan daftar yang dapat dialihkan; menampilkan draft, jadwal, riwayat publish, dan item gagal; mendukung jadwal ulang.
- **Analitik:** tren followers, performa per konten (urut terbaik), dan heatmap jam/hari posting dengan engagement tertinggi.
- **Akun:** daftar koneksi, status dan kedaluwarsa token, connect/disconnect.
- **Media:** upload ke R2 dan pustaka media.
- **Log:** timeline aktivitas dengan filter per akun, tool, status, dan tanggal; entri dapat dibuka untuk melihat detail.

Karena tidak ada notifikasi, inbox approval dan banner status token adalah satu-satunya penanda pekerjaan yang menunggu; keduanya harus terlihat jelas di halaman pertama.

## 5. Daftar MCP tools (usulan)

| Kategori | Tool | Sifat |
|---|---|---|
| Akun | `list_accounts`, `get_account_status` | baca |
| Analitik | `get_account_stats`, `list_posts`, `get_post_metrics`, `compare_accounts`, `get_stats_history` | baca |
| Posting | `create_post_draft`, `update_post_draft`, `list_drafts`, `get_draft`, `delete_draft`, `list_scheduled` | tulis ke draft saja |
| Media | `upload_media_from_chat`, `list_media` | tulis ke R2 |
| Komentar | `list_comments`, `create_comment_reply_draft`, `create_comment_moderation_draft` | baca / draft |
| DM (IG) | `list_conversations`, `get_conversation`, `create_dm_reply_draft` | baca / draft |
| Riset | `search_hashtag`, `get_public_profile`, `get_trending`, `analyze_competitor` | baca |
| Cross-post | `create_crosspost_draft` (satu draft → varian per akun/platform) | tulis ke draft saja |
| Kalender | `suggest_posting_times`, `create_content_idea`, `list_content_calendar`, `update_content_calendar_item` | baca / tulis ke kalender (bukan publish) |
| Sistem | `get_activity_log` | baca |

Catatan penting: **tidak ada tool MCP yang mem-publish langsung.** Eksekusi hanya terjadi lewat aksi approve di dashboard (atau Cron untuk item yang sudah approved dan terjadwal).

## 6. Arsitektur

### 6.1 Komponen Cloudflare
- **Worker utama:** endpoint MCP (Streamable HTTP, path `/mcp`), API dashboard (`/api/*`), dan penyajian static assets React + Vite.
- **Auth ke Claude:** OAuth untuk remote MCP (Cloudflare `workers-oauth-provider` dengan GitHub sebagai identity provider), dibatasi ke satu akun GitHub pemilik (allowlist).
- **Auth dashboard:** Cloudflare Access (GitHub IdP) atau sesi OAuth yang sama; hanya identitas pemilik yang lolos.
- **Cron Trigger:** tiap menit (publisher), harian (snapshot analitik + refresh token + pembersihan retensi).
- **R2:** penyimpanan utama data JSON dan media.
- **KV:** cache token akses jangka pendek dan cache hasil riset saja. Jumlah tulis KV di free plan sangat terbatas per hari, sehingga **tidak dipakai untuk penghitung yang sering berubah** (rate limit ada di R2).
- **Domain:** custom domain di zone Cloudflare pemilik, **satu host dengan path berbeda** (dashboard di `/`, MCP di `/mcp`, API dashboard di `/api/*`, media di host/rute terverifikasi untuk pull TikTok).

### 6.2 Tata letak data di R2 (JSON)

Karena R2 tidak punya query dan transaksi, data dipecah **satu objek per entitas** untuk menghindari read-modify-write pada file besar.

```
accounts/{account_id}.json              # metadata akun (token terenkripsi)
drafts/{draft_id}.json                  # draft + status
queue/scheduled/{yyyymmddHHmm}_{draft_id}.json   # penanda jadwal (untuk list by prefix)
queue/locks/{draft_id}.lock             # klaim eksekusi (conditional put)
stats/{account_id}/{yyyy}/{mm}/{dd}.json         # snapshot harian
posts/{account_id}/{post_id}.json       # cache konten + metrik terakhir
comments/{account_id}/{post_id}.json    # cache komentar
research/{kind}/{hash}.json             # cache riset + expires_at
logs/{yyyy}/{mm}/{dd}/{ts}_{id}.json    # log aktivitas
media/{media_id}/{filename}             # file media
```

Aturan konsistensi:
- Klaim eksekusi publish memakai **conditional put** R2 pada `queue/locks/{draft_id}.lock` (hanya berhasil jika belum ada) untuk mencegah double-publish saat Cron tumpang tindih.
- Update status draft memakai ETag (`If-Match`) agar tidak saling menimpa antara dashboard dan Cron.
- Cron memproses `queue/scheduled/` berdasarkan prefix waktu (list dengan batas), bukan memindai semua draft.
- Log dan snapshot ditulis append-only per hari; pembersihan retensi menghapus prefix yang lebih tua dari 1 tahun.
- Jika kebutuhan query tumbuh (filter kompleks, ribuan item), migrasi ke D1 dicatat sebagai opsi masa depan.

### 6.3 Keamanan token
- Token akses/refresh dienkripsi (AES-GCM) dengan kunci di Worker Secret sebelum disimpan di R2.
- Client secret TikTok dan app secret Meta hanya di Worker Secrets, tidak pernah di repo atau R2.
- Token tidak pernah dikembalikan ke Claude maupun ke respons dashboard.
- Log tidak boleh memuat token, isi DM penuh, atau data pribadi yang tidak perlu (DM ditampilkan di dashboard, log hanya menyimpan metadata).

## 7. Persyaratan non-fungsional

- **Keamanan:** hanya satu identitas yang diizinkan; semua endpoint di belakang auth; CSRF dan CORS ketat untuk dashboard; secret scanning di repo.
- **Keandalan:** retry dengan exponential backoff untuk error sementara; idempotency key untuk publish; status akhir selalu tercatat.
- **Rate limit platform:** pembungkus API yang menghormati batas Meta dan TikTok. Penghitung disimpan sebagai objek counter di R2 (per akun per jendela waktu) dan dikoreksi dari header/respons API; tool mengembalikan pesan jelas saat limit tercapai.
- **Batas ukuran:** upload media lewat Claude dibatasi (usulan ≤ 50 MB per file; video besar lewat dashboard dengan upload multipart ke R2).
- **Observabilitas:** log aktivitas di R2 plus Workers Logs; halaman log di dashboard.
- **Retensi:** snapshot analitik dan log 1 tahun; media dan draft mengikuti keputusan pemilik (default: tidak dihapus otomatis).
- **Performa:** respons tool baca dari cache R2/KV bila data lebih baru dari TTL (usulan 15 menit untuk statistik, 1 jam untuk riset).
- **Biaya:** target **free plan**. Hal yang dijaga: CPU per invocation yang kecil (hindari pemrosesan berat di Worker), jumlah subrequest per invocation, operasi list/tulis R2 dari Cron per menit, dan tulis KV minimal. R2 umumnya tetap membutuhkan metode pembayaran terdaftar walau pemakaian di kuota gratis. Batas aktual diverifikasi ke dokumentasi Cloudflare saat implementasi; jalur upgrade ke paket $5 disiapkan bila perlu.
- **Retensi media dan draft:** tidak dihapus otomatis; dihapus manual dari dashboard. (Snapshot analitik dan log tetap 1 tahun.)

## 8. Integrasi eksternal dan prasyarat

### Instagram (Meta)
- Akun harus **Business atau Creator** (saat ini masih personal → perlu dikonversi), umumnya tertaut ke Facebook Page tergantung jalur API yang dipilih. Jalur login (Instagram Login atau Facebook Login + Page) **diputuskan saat implementasi** setelah dokumentasi terbaru dicek.
- Perlu app Meta (mode Development untuk akun milik sendiri; mode Live + App Review bila izin tertentu diperlukan).
- Izin yang diperkirakan: baca profil/insight, publish konten, kelola komentar, pesan (Messaging) untuk DM.
- Token jangka panjang memiliki masa berlaku terbatas dan harus di-refresh sebelum kedaluwarsa.
- Publish memakai alur buat container media lalu publish; media harus dapat diakses lewat URL (URL publik/presigned dari R2).

### TikTok
- Daftar di TikTok for Developers dan buat app (**belum ada**; perlu proses review).
- Produk yang diperkirakan: Login Kit, Display API (profil/video), Content Posting API.
- Content Posting API pada app yang belum diaudit umumnya membatasi hasil posting (mis. hanya privat); audit diperlukan untuk posting publik.
- Token akses berumur pendek; refresh token lebih panjang dan harus diputar.
- Ketersediaan API komentar untuk akun biasa harus dipastikan; bila tidak ada, fitur komentar TikTok dihapus dari v1 (lihat 4.4).

> Detail izin, batas, dan syarat review dapat berubah; verifikasi ke dokumentasi resmi Meta dan TikTok pada tahap implementasi.

## 9. Risiko dan mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Scraping dari Worker diblokir (IP Cloudflare, login wall, anti-bot) | Fitur riset tidak stabil | Modul terpisah dengan feature flag, cache panjang, fallback API resmi, pesan error jelas; siapkan opsi proxy/layanan pihak ketiga di kemudian hari |
| Scraping melanggar ToS platform | Risiko pembatasan akun/IP | Hanya data publik, laju rendah, tanpa login, tidak memakai akun yang dikelola untuk scraping; pemilik menerima risiko ini secara sadar |
| Review/audit TikTok lama atau ditolak | Posting publik TikTok tertunda | Mulai pendaftaran lebih awal; sementara pakai mode privat/draft; fitur lain tidak terblokir |
| Akun IG personal belum Business/Creator | Publish/insight/DM tidak bisa | Konversi akun dan tautkan Page sebelum implementasi (prasyarat) |
| Izin DM IG butuh App Review | DM tertunda | Uji dengan akun sendiri di mode Development; ajukan review saat siap |
| Token kedaluwarsa tanpa notifikasi | Posting gagal diam-diam | Refresh otomatis, banner status di dashboard, pemeriksaan token tiap Cron harian |
| Race condition di R2 (tanpa transaksi) | Double-publish / status ganda | Conditional put untuk lock, ETag untuk update, satu objek per entitas |
| Prompt injection lewat komentar/DM/bio yang dibaca Claude | Aksi tak diinginkan | Konten pihak ketiga ditandai sebagai data; tidak ada tool publish langsung; semua aksi tulis butuh approval pemilik |
| Rilis semua fitur sekaligus | Jadwal panjang, banyak titik gagal | Urutan build internal dan feature flag per modul (lihat 10) |
| Kebocoran secret/token | Akun diambil alih | Enkripsi token, Worker Secrets, tidak ada token di log/respons |
| Batas free plan (CPU per invocation, subrequest, tulis KV, operasi R2) terlampaui | Cron/publish gagal atau terhenti | Pull dari URL (Worker tidak mengunggah chunk), tanpa KV untuk penghitung, Cron ringan dengan batas item per run, jalur upgrade $5 siap |
| Domain media belum terverifikasi di TikTok | `PULL_FROM_URL` ditolak | Verifikasi domain/URL prefix di tahap koneksi TikTok sebelum uji publish |
| Media tidak sesuai aturan platform dan tidak ada transcoding | Publish ditolak | Validasi di dashboard dan saat `upload_media_from_chat` dengan pesan jelas |

## 10. Rencana rilis

Target rilis: **semua fitur sekaligus** (satu rilis v1). Agar tetap terkendali, urutan pengerjaan internal:

1. Fondasi: repo, Worker, auth OAuth/Access, custom domain, struktur R2/KV, logging.
2. Koneksi akun: OAuth IG dan TikTok, penyimpanan token terenkripsi, refresh Cron.
3. Analitik: tool baca, snapshot harian, halaman dashboard analitik.
4. Draft dan approval: model draft, antrean, halaman dashboard, upload media.
5. Publisher: Cron per menit, lock, retry, publish IG dan TikTok.
6. Komentar dan DM: tool baca, draft balasan, eksekusi setelah approve.
7. Riset: API resmi, modul scraping dengan feature flag, cache.
8. Hardening: rate limit, uji keamanan, retensi, dokumentasi, uji end-to-end dengan akun sendiri.

Prasyarat sebelum langkah 2: konversi IG ke Business/Creator, app Meta dibuat, app TikTok didaftarkan (proses review berjalan paralel).

## 11. Kriteria penerimaan (v1)

- Claude (via claude.ai/Claude Code) dapat terhubung ke `/mcp` hanya setelah login OAuth sebagai pemilik; identitas lain ditolak.
- Minimal 2 akun IG dan 2 akun TikTok dapat dihubungkan, dan tool memilih akun lewat `account_id`.
- Analitik: statistik akun dan metrik per konten tampil di Claude dan dashboard; snapshot harian tersimpan.
- Draft dibuat via Claude, muncul di dashboard, dapat diedit/di-approve/ditolak; tidak ada jalur publish tanpa approval.
- Item terjadwal ter-publish dalam ≤ 2 menit dari waktunya, tanpa duplikasi, walau Cron tumpang tindih.
- Balasan komentar (IG dan TikTok bila API tersedia) dan DM (IG) hanya terkirim setelah approve.
- Cross-post: satu draft menghasilkan varian per platform yang diedit/di-approve terpisah; kegagalan satu platform tidak membatalkan yang lain.
- Kalender konten: Claude dapat membuat ide dan saran jam posting dari data analitik, tetapi tidak dapat menetapkan jadwal final tanpa approval pemilik.
- Dashboard terbuka di inbox approval, dapat dipakai nyaman di HP, mendukung dark/light mode, dan bulk approve hanya aktif untuk balasan komentar.
- Riset mengembalikan data dengan label sumber dan waktu; kegagalan scraping tidak merusak tool lain.
- Token tidak muncul di log, respons MCP, maupun respons dashboard.
- Data lebih dari 1 tahun terhapus otomatis oleh Cron pembersihan.
- Log dashboard menampilkan setiap tool call dan aksi approval beserta hasilnya.

## 12. Keputusan dan sisa pertanyaan

### Keputusan yang sudah diambil
- Pengguna tunggal; 2-10 akun per platform; semua aksi publik wajib approve (tanpa auto-approve).
- Auth: OAuth (Cloudflare Access/GitHub), satu identitas diizinkan.
- Storage: R2 (JSON per entitas) + KV terbatas; tanpa D1.
- Scheduler: Cron Trigger tiap menit; dashboard React + Vite di Worker yang sama.
- Rilis: semua fitur sekaligus; tanpa notifikasi.
- Media: upload dashboard direct ke R2 + file lokal via Claude; tanpa transcoding; publish via pull URL.
- Satu host dengan path berbeda; custom domain di Cloudflare.
- Anggaran: free plan; upgrade $5 hanya jika terbentur batas.
- Retensi: snapshot dan log 1 tahun; media dan draft dihapus manual.
- Komentar TikTok dihapus dari v1 bila API tidak tersedia.
- Jalur login Instagram diputuskan saat implementasi.
- Riset: API resmi + scraping `fetch` langsung dari Worker (modul terpisah dengan feature flag).

### Sisa pertanyaan (diselesaikan saat implementasi)
1. Ketersediaan API komentar TikTok untuk app/akun yang dipakai (validasi di dokumentasi dan sandbox).
2. Jalur login Instagram (Instagram Login vs Facebook Login + Page) dan cakupan izin yang tersedia.
3. Batas free plan Cloudflare yang berlaku saat implementasi, dan apakah Cron per menit plus R2 muat di dalamnya.
4. Perlukah opsi layanan scraping pihak ketiga bila `fetch` langsung terbukti diblokir.
