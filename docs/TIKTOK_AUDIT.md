# Audit dan peta implementasi v2

Tanggal 28 Oktober 2026, baseline `5712fd4`, branch `feat/tiktok-ai-studio-v2`.

Audit mencakup semua modul Worker/shared, React/App/BrowserPanels/client/demo/styles, enam kelompok konfigurasi/scripts/docs, workflow Checks, dan seluruh 119 tes existing. Tidak ada AGENTS.md tambahan. `npm ci` (262 paket), `npm run check` (119 tes, strict TypeScript, build), dan `npm run secrets:check` lulus sebelum perubahan. Runtime diperiksa terpisah; lihat laporan akhir untuk hasil aktual.

## Dependency map

- `index → auth/connections`: GitHub owner, consent MCP OAuth, Instagram Login/Facebook dan TikTok Login Kit profil. Dipertahankan.
- `index/mcp → SocialService → Store/R2 + Platforms + BrowserService`: draft, approval revisi, marker antrean, conditional ETag, recovery publisher Instagram. Dipakai kembali.
- `BrowserService → BrowserCloud`: Cloud V4, ciphertext AES-GCM profile/live URL, lease profile, intent hash, ledger run, uncertain/recovery dan konfirmasi manusia. Dipakai kembali dengan adapter dan penguncian kepemilikan profile.
- `media → S3 signed multipart + R2 inspection + signed GET/range`: dipertahankan; tambah asosiasi akun dan validasi gambar.
- `React App → client → owner API`: tema, sidebar/mobile, modal dengan keyboard, toast, pagination dan state demo eksplisit. Studio TikTok modular ditambahkan tanpa mengubah penyimpanan demo menjadi produksi.
- `mcp → StreamableHTTP SDK + OAuth`: 34 tools existing. Fungsi setara digunakan untuk TikTok; hanya tools AI/analitik baru yang ditambahkan.

## Temuan terverifikasi

Browser Use default nonaktif; `createDraft/updateDraft/approve` memblokir semua TikTok; profil TikTok saja melalui API. Approval terikat revisi dan binding browser. Cron serta scheduled handler tidak ada. R2/KV existing sesuai target, resource ID tidak perlu diganti. Cloudflare Builds ke main dinyatakan pada README; status live belum dapat diverifikasi (pemeriksaan akhir connector Worker/Builds terblokir autentikasi ulang). Tidak menambah deploy otomatis lain.

Risiko yang diperbaiki: persaingan pengikatan profile lintas akun (scan saja tidak atomik), CAPTCHA provider perlu dinonaktifkan eksplisit, semua aksi/ekstraksi TikTok agent harus diblokir secara struktural, output error MCP tidak boleh memantulkan input Zod, sesi owner perlu revocation saat logout, URL media perlu angka expiry finite. Deletion media bersamaan dengan penambahan referensi perlu penguncian bersama. Semua keterbatasan eksternal dilaporkan, bukan dianggap sukses.

## Referensi dan lisensi

Dibaca 28 Oktober 2026 dari README/package/license upstream. Tidak menyalin source atau menambah dependency referensi.

| Repository | Lisensi | Ide yang ditinjau / kompatibilitas |
| --- | --- | --- |
| trypostit/trypost | AGPL-3.0 (`LICENSE.md`) | Composer, kalender, approval; stack server berbeda, source tidak diimpor |
| postoncehq/tiktok-mcp | MIT | Kontrak tools, draft; layanan/API resmi bukan kemampuan browser |
| lanternrow/tiktok-organic-mcp | MIT | Pemisahan akun dan metrik; tidak mengadopsi akses data eksternal |
| StreamDockapp/tiktok-content-posting-api | MIT | Status upload dan error ambigu; API posting tidak diaktifkan |
| gitroomhq/postiz-app | AGPL-3.0 | Library media dan kalender; Next/Nest/Prisma tidak cocok untuk Worker ini |

Dokumentasi provider: https://docs.browser-use.com/cloud/api-v4/browsers/create-browser-session mengonfirmasi `/api/v4/browsers`, `profileId`, `liveUrl`, timeout dan `solveCaptchas`. Dokumentasi Cloudflare best practices dan tipe Wrangler terpasang digunakan untuk konfigurasi dan conditional R2. Akses ToS TikTok langsung tidak tersedia melalui retrieval; karena tidak ada izin ekstraksi/publikasi yang terverifikasi, jalur TikTok dibatasi ke login manusia, persiapan lokal, input metrik manual, dan handoff manusia. Tidak menjalankan task TikTok agent.
