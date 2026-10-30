# Konfigurasi

Semua secret berada di Worker Secrets, tanpa nilai pada Git, browser localStorage, log atau MCP. Jalankan `npx wrangler secret put NAMA` melalui prompt interaktif. Untuk staging tambahkan `--config wrangler.staging.local.jsonc`. Jangan memasukkan nilai pada argv, PR atau issue.

## Variables nonsecret

| Nama | Default produksi / kegunaan |
| --- | --- |
| PUBLIC_ORIGIN | https://sosial-mcp.muidsoft.com; harus tepat origin dashboard/OAuth |
| OWNER_GITHUB_ID | numeric ID existing 222858980; jangan diganti tanpa migrasi akses |
| META_API_VERSION | v25.0; pertahankan konfigurasi existing |
| R2_BUCKET_NAME | social-mcp-data |
| ENVIRONMENT | production / staging |
| SCRAPING_ENABLED | false; TikTok tetap diblokir secara struktural meskipun flag diubah |
| BROWSER_USE_ENABLED | false; provider opsional dan berbiaya |
| BROWSER_USE_MAX_COST_USD | 0.50 per agent run existing; bukan jaminan batas biaya sesi manusia |
| BROWSER_USE_MAX_RUNS_PER_DAY | 20; mencakup pembukaan sesi dan job |
| TIKTOK_SESSION_ENABLED | false; aktifkan hanya setelah Browser Use dikonfigurasi/disetujui |
| TIKTOK_CONTENT_STUDIO_ENABLED | false; ubah true untuk akun/draft/approval manual |
| TIKTOK_ANALYTICS_ENABLED | false; ubah true untuk observasi manual/import |
| TIKTOK_BROWSER_PUBLISH_ENABLED | false; flag cadangan, belum mempunyai implementasi publikasi; true tidak membuka blokir |
| AI_CONTENT_ENABLED | false; opsional setelah provider dan biaya disetujui |
| AI_PROVIDER | none / openrouter / gemini |
| AI_MODEL | kosong; model provider yang mendukung output JSON, diverifikasi pemilik |
| AI_MAX_REQUESTS_PER_DAY | 20; rentang 1–100, global workspace |
| AI_MAX_OUTPUT_TOKENS | 2048; rentang 256–4096 |

## Secrets

| Nama | Diperlukan untuk |
| --- | --- |
| GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET | Login pemilik dan upstream OAuth MCP |
| SESSION_SECRET | HMAC sesi/media; gunakan secret kuat minimal 32 byte |
| TOKEN_ENCRYPTION_KEY | Base64 tepat 32 byte, AES-GCM token dan referensi profile/live URL; pertahankan key existing |
| META_CLIENT_ID, META_CLIENT_SECRET | Instagram Login existing |
| META_FB_CLIENT_ID, META_FB_CLIENT_SECRET | Facebook Login opsional; existing fallback ke Meta app |
| TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET | Login Kit profil existing opsional; **bukan** syarat login browser |
| R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY | Upload S3 bertanda tangan; batasi key ke bucket yang tepat |
| BROWSER_USE_API_KEY | Provider browser opsional; jangan mengisi sebelum menyetujui biaya |
| OPENROUTER_API_KEY | Hanya jika AI_PROVIDER=openrouter |
| GEMINI_API_KEY | Hanya jika AI_PROVIDER=gemini |
| CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID | CLI operator bila deployment di luar Cloudflare Builds; tidak diperlukan di frontend/Worker aplikasi |

Tidak ada secret yang diwajibkan untuk AI/browser bila editor manual dipakai. R2/KV binding dan namespace ID existing berada di wrangler.jsonc. Jangan membagikan bucket/KV produksi ke staging.

Callback GitHub: `PUBLIC_ORIGIN/auth/github/callback`; Instagram: `/auth/instagram/callback`; Facebook: `/auth/instagram-facebook/callback`; TikTok Login Kit opsional: `/auth/tiktok/callback`. Gunakan app/callback staging terpisah bila penyedia membatasinya.

CORS R2 harus mengizinkan origin dashboard yang tepat, PUT, GET/HEAD yang diperlukan, header Content-Type dan expose ETag. Gunakan docs/r2-cors.json untuk produksi; buat salinan dengan origin staging ketika mengonfigurasi bucket staging. Jangan memakai wildcard origin untuk credential dashboard.

Provider AI: https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion dan https://ai.google.dev/api/generate-content. Tidak mengirim secret sebagai bagian prompt. Brief dikirim ke provider terpilih; pemilik harus menyetujui kebijakan data/biaya model. Retry hanya sekali untuk HTTP 429 dengan Retry-After ≤1 detik; timeout/5xx tidak diulang karena biaya bisa ambigu.
