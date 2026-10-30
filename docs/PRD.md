# PRD MCSOS TikTok AI Studio v2.0

Tanggal 28 Oktober 2026. Dokumen ini menggantikan rencana v1 yang menyebut Cron dan API posting TikTok; keduanya tidak diaktifkan.

## Tujuan dan batas produk

Workspace satu pemilik terverifikasi GitHub, untuk akun Instagram dan TikTok milik sendiri atau yang sah dikelola. TikTok Developer API tidak diperlukan untuk Mode A (sesi manusia di provider) maupun Mode B (browser pribadi). Browser pribadi tidak dapat diakses Worker. Tidak melakukan bypass OTP, CAPTCHA, 2FA atau fingerprint, scraping otomatis, maupun publikasi TikTok otomatis.

## Arsitektur

`index` menangani boundary keamanan, OAuth dan asset. `owner-api` mengotorisasi semua endpoint dashboard menggunakan sesi HttpOnly dan CSRF. `SocialService` mempertahankan draft dan publisher Instagram; `TikTokService` menangani akun, approval, handoff, jadwal dan analitik manual. `AIService` memanggil endpoint provider tetap. `BrowserService` memelihara lease/recovery existing, dengan `ConnectedSessionProvider` sebagai interface sesi manusia. `BrowserCloud` implementasi Cloud V4. React TikTokWorkspace modular menggunakan backend yang sama dengan UI existing.

R2 menyimpan JSON per entitas, media, revision history, audit log, budget dan conditional locks; KV existing untuk OAuth/cache. Tidak ada penggantian resource produksi, migrasi destruktif, D1, worker Chromium persisten, cron atau penambahan layanan wajib berbayar.

## Alur konten

1. Pemilik menambahkan akun dan mengonfirmasi hak kelola.
2. Login manual di browser pribadi/provider; pemilik memeriksa username, mencatat sumber manual dan waktu.
3. Tulis sendiri atau siapkan AI melalui adapter opsional. Upload media langsung/multipart R2, pilih konten dan waktu WIB.
4. Simpan draft atau minta approval. Pemilik meninjau konten/revisi, akun, media, disclosure, preferensi manual dan jadwal.
5. Server mencatat approval immutable untuk revisi itu (akun, username, revisi identitas, fingerprint media/caption, metode, jadwal, actor/waktu).
6. Masukkan ke antrean. Waktu masa depan → scheduled; waktu sekarang/tanpa waktu → ready_for_manual_publish. Pemilik memeriksa jatuh tempo secara manual, berhalaman.
7. Mulai handoff, unduh media/salin caption, pilih akun aktif di TikTok Web, isi kontrol platform dan publikasikan sendiri.
8. MCSOS tetap awaiting_verification. Pemilik memeriksa hasil; URL harus cocok dengan username. Outcome uncertain menahan antrean akun sampai direkonsiliasi, tanpa resend.
9. Masukkan/impor metrik berizin; tampilkan null jika tak tersedia, provenance manual dan timestamp observasi/pencatatan.

## State machine

`draft → pending_approval → approved → scheduled → ready_for_manual_publish → awaiting_verification → published | uncertain | failed`.

Approval langsung dari draft dapat dilakukan setelah tinjauan pemilik. Tanpa waktu, approved langsung menuju ready_for_manual_publish saat pemilik memasukkan antrean. Pembatalan sebelum handoff dapat menuju cancelled; kembali ke draft menaikkan revisi dan membuang approval. Tidak ada reset dari awaiting_verification/uncertain untuk mencegah kirim ulang ambigu. Failed dapat kembali ke draft setelah pemilik memastikan hasil. Publishing dan unsupported tersedia dalam model lintas platform, tetapi jalur TikTok manual tidak mengirim aksi publishing.

## Konsistensi dan recovery

Draft conditional ETag, expected_revision pada edit TikTok, lock bersama referensi media untuk create/update/approval/delete media, registry profile dengan conditional create, lease operasi browser, dan satu handoff aktif per akun. Locks mutation fail-closed setelah crash; recovery operator hanya setelah memastikan request/pekerjaan berhenti. Tidak ada auto-expire yang memungkinkan dua operasi publik berjalan bersamaan. Record aktif handoff tersisa setelah commit parsial dapat direkonsiliasi operator berdasarkan draft terminal, tanpa memanggil TikTok.

## UI dan aksesibilitas

Mobile-first navy/blue/cyan, tema terang/gelap/sistem, sidebar desktop dan bottom navigation mobile, dialog dengan focus trap/Escape, keyboard, reduced motion, status/error/loading/empty, konfirmasi destructive, server pagination dan pagination lokal 12 konten. Kalender harian/mingguan/bulanan; reschedule melalui kembali ke draft, edit waktu, review/approve ulang. Drag belum tersedia. Semua tombol produksi memiliki fungsi backend atau handoff eksplisit.

## Acceptance dan bukti

Regresi Instagram, MCP initialize/tools/list/call, auth/CSRF, state transitions, fingerprint invalidation, isolation/concurrency, media, AI schema/errors, browser recovery, runtime Workerd dan viewport Chromium diuji. Status aktual, kendala kredensial, deployment dan dependency audit ada pada TIKTOK_TEST_REPORT.md. Tidak menyamakan hasil lokal/mock dengan E2E layanan live.
