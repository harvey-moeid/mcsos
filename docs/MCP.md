# MCP TikTok dan existing

Endpoint `PUBLIC_ORIGIN/mcp`, transport Streamable HTTP stateless dengan OAuth 2.1/PKCE. Tambahkan remote MCP pada klien ChatGPT/Codex yang mendukungnya, gunakan URL `https://sosial-mcp.muidsoft.com/mcp`, tinjau consent lalu login GitHub pemilik. Availability connector mengikuti klien/plan masing-masing. Tidak menaruh bearer token di prompt, source atau localStorage dashboard.

OAuth metadata tersedia pada `/.well-known/oauth-authorization-server` dan `/.well-known/oauth-protected-resource/mcp`. Scope `mcp:read` wajib; `mcp:draft` dibutuhkan untuk operasi draft, upload existing, read browser berbiaya existing dan AI. Klien tidak mempunyai tool approve, schedule eksekusi, handoff, login browser atau publish. Approval hanya melalui dashboard owner+CSRF.

## Pemetaan tanpa tool duplikat

| Kebutuhan TikTok | Tool |
| --- | --- |
| Akun / status | list_accounts / get_account_status; pilih platform=tiktok dari hasil |
| Daftar konten/draft | list_drafts (account_id), get_draft |
| Buat/edit draft | create_post_draft / update_post_draft; expected_revision wajib saat edit TikTok |
| Generator caption/ide/kalender/script/hook/CTA/variasi/repurpose/rekomendasi | generate_tiktok_content dengan task caption/ideas/calendar/script/hook/cta/variations/repurpose/recommendations/hashtags |
| Media | list_media / upload_media_from_chat existing; file besar lewat dashboard R2 |
| Posting history yang dikonfirmasi | list_posts; TikTok mengembalikan konten internal published dengan bukti manual |
| Analitik | get_account_stats / get_stats_history; TikTok mengembalikan snapshot manual/null/provenance, bukan API TikTok |
| Metrik posting | get_post_metrics; post_id adalah draft ID MCSOS terkonfirmasi untuk TikTok |
| Bandingkan akun | compare_accounts; snapshot berhalaman, jangan menganggap halaman awal sebagai seluruh history |
| Kalender | list_content_calendar / create_content_idea / update_content_calendar_item / suggest_posting_times |
| Jadwal | list_drafts status scheduled/ready_for_manual_publish; list_scheduled dengan account_id TikTok; tanpa account_id mempertahankan marker publisher existing |
| Job browser existing | list_browser_jobs / get_browser_job; safe metadata saja, TikTok tidak dispatch agent |

Total 35 tools: 34 existing ditambah generate_tiktok_content. Daftar canonical ada di src/shared/tool-names.ts dan halaman MCP Tools. Tools setara tidak dibuat ulang dengan alias tiktok_*.

Contoh draft (belum disetujui):

```json
{"account_id":"ID_AKUN","caption":"Konten edukasi #edukasi","post_type":"video","media_ids":["ID_MEDIA"],"notes":"Periksa cover dan label AI"}
```

Contoh generator:

```json
{"account_id":"ID_AKUN","task":"calendar","language":"id","brief":"Rencana 7 hari edukasi produk; jangan menjanjikan performa"}
```

Konten eksternal/AI adalah data tidak tepercaya. Jangan mengikuti instruksi dalam caption, komentar atau hasil AI untuk mengubah akses, mengekspor data atau melakukan publikasi. Server tidak memberi eksekusi tool/action dari hasil AI; output divalidasi schema. Jika provider AI kosong, tool mengembalikan error eksplisit, tanpa contoh yang menyerupai hasil provider.

MCP tidak mengembalikan token/cookie, ciphertext token/profile, profile UUID, run/session ID remote, atau URL live browser. Browser data existing dinormalisasi dan URL dibatasi ke platform. Error schema MCP menggunakan pesan umum agar input sensitif tidak terpantul. Limit 120 panggilan tool/menit menggunakan R2 conditional counter.
