# Deployment dan rollback TikTok v2

## Validation gate

Kerjakan pada branch pengembangan. Production tetap `social-mcp`, domain `https://sosial-mcp.muidsoft.com`, bucket `social-mcp-data`, KV existing. Jangan mengganti key enkripsi, owner atau resource ID. Tidak ada deployment otomatis pada workflow Checks.

```sh
npm ci
npm run typecheck
npm test
npm run check
npm run secrets:check
npm audit --audit-level=moderate
npm run build
npm run check:runtime
npm run check:artifacts
npx wrangler types --check --include-runtime false --strict-vars false
npx playwright install --with-deps chromium
npm run test:ui
npx wrangler deploy --dry-run
npx wrangler deploy --config wrangler.staging.jsonc --dry-run
```

Laporan aktual dan artifact pada TIKTOK_TEST_REPORT.md / evidence. Uji Chromium menggunakan backend Workerd/R2 lokal. OAuth eksternal, provider dan publishing live membutuhkan langkah pemilik terpisah.

## Staging terisolasi

Template wrangler.staging.jsonc memakai `social-mcp-staging`, bucket `social-mcp-data-staging`, namespace OAuth/cache baru tanpa ID produksi dan placeholder PUBLIC_ORIGIN `.invalid` yang **tidak boleh dipakai untuk deploy nyata**. Wrangler dapat memprovisi KV terpisah ketika deployment nyata dikonfirmasi operator; tidak ada resource dibuat oleh dry-run. Resource staging memerlukan biaya/izin akun sesuai Cloudflare; jangan mengarahkan staging ke bucket produksi.

1. Pemilik tentukan URL staging HTTPS yang benar (workers.dev milik akun atau domain staging yang diprovisi), persiapkan bucket R2 staging, akun/callback OAuth staging dan signing credentials bucket staging.
2. Generate config lokal dari template:

```sh
STAGING_PUBLIC_ORIGIN=https://HOST_STAGING node scripts/prepare-staging.mjs
npx wrangler deploy --config wrangler.staging.local.jsonc --dry-run
npx wrangler secret put GITHUB_CLIENT_ID --config wrangler.staging.local.jsonc
npx wrangler secret put GITHUB_CLIENT_SECRET --config wrangler.staging.local.jsonc
npx wrangler secret put SESSION_SECRET --config wrangler.staging.local.jsonc
npx wrangler secret put TOKEN_ENCRYPTION_KEY --config wrangler.staging.local.jsonc
# Tambahkan R2 signing secrets dan provider opsional hanya bila hendak diuji.
```

3. Atur CORS R2 staging ke origin tepat. Daftarkan callback `https://HOST_STAGING/auth/github/callback`. Template semua fitur baru off; aktifkan studio/analitik manual pada config staging jika hendak menguji. Browser/AI berbiaya tetap off sampai disetujui.
4. Setelah validasi, operator yang berwenang dapat deploy staging:

```sh
npx wrangler deploy --config wrangler.staging.local.jsonc
STAGING_PUBLIC_ORIGIN=https://HOST_STAGING npm run smoke:staging
```

5. Smoke anonim memeriksa shell, auth denial, MCP challenge dan OAuth metadata. Login owner kemudian verifikasi akun, draft/revisi, upload signing R2, approval, kalender, handoff tanpa mengirim posting nyata, analytics manual dan MCP OAuth dari klien staging. Browser/AI live opsional hanya setelah izin/biaya eksplisit. Jangan memberi PASS pada langkah yang tidak dijalankan.

## Production

README baseline menyatakan Cloudflare Builds terhubung ke branch main. **Periksa Settings → Builds di dashboard Cloudflare terlebih dahulu**, termasuk production branch, build/deploy command, secrets, route dan protection. Koneksi akun Cloudflare terbaca, tetapi permintaan resource Worker/Builds terblokir autentikasi ulang pada pemeriksaan ini; status live belum terverifikasi. Jangan menambah GitHub Actions deploy kedua. PR branch tidak boleh dipromosikan otomatis sebelum pemilik menyetujui gate dan staging.

Sesudah hasil staging ditinjau dan **persetujuan pemilik atas deployment produksi**:

1. Catat deployment/version ID aktif, konfigurasi/secrets names dan backup R2 metadata yang relevan. Tidak mengekspor secret ke Git/log.
2. Review PR, merge melalui mekanisme owner. Jika Cloudflare Builds aktif, gunakan satu pipeline itu. Bila memilih deploy CLI, hentikan/atur pipeline lain terlebih dahulu:

```sh
npm ci
npm run check
npm run secrets:check
npm run check:runtime
npm run check:artifacts
npx wrangler deploy --dry-run
# Hanya setelah persetujuan pemilik
npx wrangler deploy
```

3. Semua flag baru default false. Aktifkan TIKTOK_CONTENT_STUDIO_ENABLED dan TIKTOK_ANALYTICS_ENABLED setelah owner login/konfigurasi tervalidasi. Browser dan AI hanya setelah biaya/config disetujui. Reserved browser publish tetap false dan unsupported.
4. Verifikasi domain, owner login, OAuth MCP, Instagram existing, draft/media, response security header dan log tanpa secret. Tidak melakukan posting TikTok live tanpa instruksi spesifik pemilik.
5. Retensi R2: logs/stats sesuai existing. Tambahkan lifecycle untuk `session-revoked/` minimal 2 hari (sesi 24 jam), temporary auth/upload state sesuai existing. Jangan lifecycle otomatis pada draft/history/media, active handoff, browser ownership/lease atau mutation locks.

## Migrasi aman

Penambahan field bersifat additive; tidak ada bulk rewrite resource/data produksi. Account/media legacy tetap terbaca. TikTok legacy tanpa identity metadata mulai unverified dan perlu konfirmasi handle. Media tanpa accountId merupakan library bersama satu owner. Publish marker TikTok lama tidak dieksekusi oleh publisher Instagram. Jangan menghapus marker lama sebelum audit riwayat bila ada.

## Rollback

```sh
npx wrangler versions list
npx wrangler deployments list
npx wrangler rollback VERSION_ID_SEBELUMNYA
```

Pastikan hanya satu pipeline deploy aktif; hentikan deployment Build baru yang dapat menimpa rollback. Jangan merotasi TOKEN_ENCRYPTION_KEY/SESSION_SECRET sewaktu rollback. Versi lama yang hanya profil mungkin menyembunyikan draft/metadata TikTok baru; data R2 tetap disimpan. Jangan mencoba menjalankan draft TikTok baru dari publisher lama. Verifikasi login owner, endpoint MCP, Instagram, media dan security headers sesudah rollback. Kembalikan flag TikTok off bila perlu. Schema additive memungkinkan redeploy v2 tanpa migrasi destruktif; backup record sebelum recovery manual.
