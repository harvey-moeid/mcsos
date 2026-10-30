# Browser Use Cloud

Adapter existing memakai HTTPS Cloud V4 dari Worker; Chromium berjalan di provider eksternal. `ConnectedSessionProvider` membatasi interface sesi manusia (`createLogin/browser/stopBrowser`), sehingga penyedia lain dapat diimplementasikan tanpa memindahkan browser persisten ke Worker. `BrowserCloud` juga mempertahankan operasi agent Instagram existing.

Panduan TikTok lengkap: [TIKTOK_SESSION_GUIDE.md](TIKTOK_SESSION_GUIDE.md). TikTok tidak menjalankan probe/read/action agent. Larangan ada pada entrypoint dan startJob/startAction, bukan hanya prompt. BROWSER_USE_ENABLED dan TIKTOK_SESSION_ENABLED default false; TIKTOK_BROWSER_PUBLISH_ENABLED tidak membuka publikasi browser.

## Konfigurasi dan endpoint

Secrets: BROWSER_USE_API_KEY, TOKEN_ENCRYPTION_KEY, SESSION_SECRET. Variables BROWSER_USE_ENABLED, BROWSER_USE_MAX_COST_USD, BROWSER_USE_MAX_RUNS_PER_DAY. Expected username wajib handle nyata. Satu profile hanya untuk satu akun, registry hash dengan conditional create dan lease operasi. Ciphertext profile/live URL disimpan R2, tidak dikirim melalui MCP. Settings/live-view hanya tersedia kepada pemilik melalui sesi/CSRF dan Cache-Control no-store.

Dokumentasi yang diperiksa 28 Oktober 2026:

- https://docs.browser-use.com/cloud/api-v4/browsers/create-browser-session
- https://docs.browser-use.com/cloud/api-v4/browsers/list-browser-sessions
- https://docs.browser-use.com/cloud/api-v4/runs/create-run
- https://docs.browser-use.com/cloud/guides/billing

API menggunakan `https://api.browser-use.com/api/v4/`, header X-Browser-Use-API-Key. Sesi manusia POST browsers dengan profileId, timeout 10 menit, metadata akun/local ID, enableRecording=false dan solveCaptchas=false. URL live harus HTTPS pada host browser-use.com tanpa username/password/port. Respons provider dibatasi ukuran dan divalidasi schema.

## Biaya

Provider opsional. Tarif/retensi/kuota mengikuti dashboard dan dokumentasi provider saat pemilik mengaktifkan, bukan janji dari MCSOS. Dokumentasi sesi yang dibaca menyebut biaya berbasis durasi; agent run dan proxy bisa memiliki komponen biaya lain. Batas biaya per run existing bukan hard cap tagihan browser manusia. Daily start budget mengurangi risiko penggunaan tak terduga; tidak ada retry otomatis sesi login atau dispatch ambigu. Jangan mengaktifkan provider tanpa persetujuan biaya.

## Instagram existing

API resmi tetap jalur utama; browser merupakan pilihan tambahan saat approval eksplisit. Login manual memakai profile masing-masing. Probe identitas dan read job Instagram memakai kontrak operasi tetap, schema output, intent hash dan task hash. Pemilik memberi consent atas konten dan biaya saat memilih browser. Batas media browser existing 50 MB/file; tidak ada fallback otomatis dari API ambigu ke browser.

Ledger job, lease, conditional poll claims dan recovery task hash mencegah dispatch ganda. Respons browser adalah data tidak tepercaya. Laporan action_reported tidak otomatis published; pemilik harus memeriksa hasil. Tidak ada bypass challenge; hentikan dan serahkan kepada pemilik.

## Recovery / penghapusan

Lihat panduan sesi untuk resume login active, close session yang ambiguous, dan penghapusan referensi lokal. Sesi lama yang masih hidup menahan lease; jangan hapus lock untuk memaksa dispatch baru. Browser Use remote logout/profile deletion dilakukan oleh pemilik pada provider. Metadata sesi terenkripsi yang diperlukan untuk recovery bertahan melintasi redeploy; cookie tidak pernah diminta atau disalin ke MCSOS.
