# Keamanan v2

## Boundary otorisasi

Dashboard: numeric GitHub owner allowlist, cookie HttpOnly + SameSite=Lax dan Secure/__Host pada HTTPS. Semua mutasi memeriksa Origin tepat dan X-CSRF-Token. Host harus sama PUBLIC_ORIGIN. Logout menulis digest revocation server; cookie yang diputar ulang ditolak. Sesi default 24 jam. OAuth state di R2 mempunyai expiry dan conditional one-use marker. MCP memeriksa owner props, scope dan Origin bila ada; tidak menyediakan approve/publish.

API memvalidasi JSON bounded 100 KB; MCP transport bounded existing 15 MB untuk chat upload. ID/username/URL divalidasi schema. Error provider tidak memantulkan body berisi credential. CSP, HSTS pada HTTPS, nosniff, DENY frame dan no-referrer dipertahankan. API owner response Cache-Control no-store. UI menggunakan React text escaping, tanpa dangerouslySetInnerHTML. Pemindaian pola secret melengkapi review, bukan bukti mutlak tidak adanya secret.

## Credential / sesi

AES-GCM dengan IV acak dan key 32 byte untuk token/provider profile dan live URL. Key tidak diganti saat deployment. Referensi provider hanya diperlukan server; UUID pengaturan dan live URL hanya untuk owner dashboard, tidak localStorage/MCP/log. Cookie TikTok tidak diminta/disalin. Data cookie sebenarnya ditangani provider atau browser pribadi, bukan Worker. Provider credential disimpan di Worker Secrets. Tidak ada API URL bebas dari prompt.

Sesi browser manusia menggunakan HTTPS allowlist host browser-use.com, tanpa userinfo/port, recording=false dan solveCaptchas=false. Tidak ada bypass challenge. Profile ownership registry memakai SHA-256 dan conditional create; operasi memakai lease yang tidak direbut otomatis. Penghapusan referensi lokal harus menunggu sesi aktif berhenti; logout/hapus profile remote dilakukan pemilik di provider. Setiap akun memiliki profile berbeda.

## Konten dan publikasi

TikTok agent probe/read/action dilarang di entrypoint serta dispatcher. Bahkan reserved publish flag true tidak membuka kode aksi. Sumber halaman browser tidak mengesahkan aksi. Handoff memerlukan akun/revisi, approval fingerprint dan konfirmasi akun aktif, tidak memanggil TikTok. Satu active handoff per akun, idempotency request UUID dan ETag draft. Outcome ambigu menunggu rekonsiliasi; tidak ada resend otomatis. Owner confirmation URL harus HTTPS TikTok, username sesuai dan path video/photo dengan ID numerik. published adalah konfirmasi manual berprovenance, tidak berpura-pura hasil API.

Approval mengikat draft/account/username/identity revision, revisi draft, ETag versi file/fingerprint metadata, caption/disclosure/privacy/label, metode manual, jadwal, actor/waktu. Reset/edit material menghapus approval; locked draft tidak dapat diedit MCP. Persaingan cancel/edit/handoff memakai conditional ETag. Konten diperiksa sebelum handoff. Keputusan publik terakhir tetap dilakukan pemilik di platform.

## Media dan konsistensi

R2 bucket private, URL HMAC berexpiry numerik finite maksimal 24 jam (24 jam existing dipertahankan untuk publisher Instagram). GET/HEAD dan range support; URL ini capability sensitif, jangan dibagikan sembarangan. Header MIME/nosniff dan signature per key. Upload S3 bertanda tangan 15 menit, multipart per part, bounded header/tail video inspection. JPEG/PNG/WEBP header divalidasi server, dimensi/ukuran dibatasi; tidak ada SVG/HTML. Tidak ada transcoding Worker.

Akun pada metadata media membatasi pemakaian lintas akun. Media legacy tanpa accountId merupakan library bersama satu owner dan tetap dapat dipakai; tidak ada migrasi yang menebak kepemilikan. Create/update draft, approval dan delete media menggunakan shared mutation lock untuk mencegah reference-delete race. Delete media memeriksa current draft dan revision history. Data historis dilindungi dari penghapusan diam-diam.

Mutation locks fail-closed setelah crash. Tidak ada auto-expire karena worker lama mungkin belum berhenti. Recovery operator: hentikan traffic/mutasi terkait, periksa log/draft/ledger dan pastikan eksekusi berakhir, backup record lock, lalu hapus hanya lock yang terbukti orphan. Jangan hapus lease browser atau active handoff hanya berdasarkan umur. Record terminal handoff yang tertinggal dapat dibersihkan setelah mencocokkan draft terminal; jangan mengirim ulang posting.

## AI, limit dan provenance

Endpoint AI tetap allowlisted (OpenRouter atau Google); redirect error, timeout 20 detik, response bounded dan strict JSON schema, max 10 items, 256–4096 token, 1–100 request/hari. Retry hanya definite throttling satu kali; network/5xx tidak diulang. Input disebut literal untrusted data; tidak ada tool execution dari output model. Manual editor tetap tersedia saat gagal. Tidak ada field metrik pada schema output. Human review tetap wajib karena schema tidak dapat menjamin kebenaran teks model.

Owner mutation dan MCP tool limit 120/menit via R2 ETag. Provider API rate limiting existing 20/akun/menit, browser daily start cap existing, AI daily shared budget. Penolakan limit ditampilkan eksplisit. Data metrik manual menolak source palsu, nilai hilang null, waktu observasi dibatasi; tidak ada ekstraksi TikTok otomatis.

## Batas jaminan

Tes lokal/mocks memeriksa kontrol kode, bukan audit pentest independen. Tidak menyatakan OAuth/live session/TikTok ToS/account behavior telah terverifikasi E2E. Tidak ada automated ToS permission grant. Sampai pemilik memverifikasi akses/aturan provider yang berlaku, jalur publik/ekstraksi tetap unsupported. Dependency audit hasil aktual ada pada laporan tes.
