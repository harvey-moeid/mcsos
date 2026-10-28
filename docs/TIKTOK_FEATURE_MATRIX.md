# Matriks kemampuan TikTok

| Fitur | Implementasi | Sumber / syarat |
| --- | --- | --- |
| Akun multi-handle, grup/label | Tersedia setelah flag studio aktif | Data internal pemilik, maksimal 10 TikTok |
| Mode browser pribadi | Tersedia | Handoff manusia; Worker tidak mengakses sesinya |
| Mode provider browser | Adapter tersedia, live NOT TESTED | Browser Use dikonfigurasi, biaya disetujui, profile per akun |
| Identitas akun | Konfirmasi manual, expiry 24 jam | Pemilik memeriksa username UI; bukan pembacaan independen |
| OTP/CAPTCHA/2FA | manual_action_required | Pemilik menyelesaikan sendiri; solver provider off |
| Recovery live URL | Adapter tersedia | Sesi provider masih active, metadata cocok; profil persisten mengikuti provider |
| Disconnect | Hapus referensi/token lokal | Remote logout/profile deletion tetap manual |
| Draft/revisi/duplikasi/hapus | Tersedia | Draft belum disetujui; expected_revision untuk update |
| AI 10 jenis tugas id/en | Adapter opsional, live NOT TESTED | OpenRouter/Gemini + model JSON; jika kosong editor manual |
| R2 media/multipart | Mekanisme existing dipertahankan | Signing S3 dan CORS; frontend multiple upload composer |
| PNG/WEBP/JPEG/MP4/MOV | Validasi tersedia | Tidak ada transcoding; platform memutuskan penerimaan file |
| Jadwal WIB | Tersedia | Pemilik memproses antrean, tanpa Cron |
| Kalender hari/minggu/bulan | Tersedia | Reschedule melalui edit+approval ulang; drag belum tersedia |
| Privacy/komentar/duet/stitch | Pilihan final manual di TikTok | Preferensi privasi/disclosure di draft tidak diterapkan otomatis |
| Approval | Revisi/fingerprint/account-bound | Dashboard owner + CSRF, tidak melalui MCP |
| Publikasi TikTok browser/API otomatis | unsupported | Diblokir dalam kode; flag reserved tidak mengubahnya |
| Publikasi manual | Handoff dan pencatatan tersedia | Owner mengunggah/menekan publish pada TikTok sendiri |
| Status published | Konfirmasi manual pemilik | URL cocok akun; tidak diklaim sebagai konfirmasi API |
| Analitik manual/import | Tersedia | source=manual, observedAt dan recordedAt; unknown=null |
| Analytics official/browser extraction | unsupported pada jalur ini | Enum provenance disiapkan, tidak ada fetch/scrape yang mengaku resmi |
| Komentar/DM/like/follow TikTok | unsupported | Tidak ada mutasi otomatis atau tools approval/publish |
| MCP | 35 tools total | 34 existing digunakan kembali, 1 generator konten TikTok baru |
| Instagram/GitHub OAuth | Dipertahankan | Tes regresi lokal; validasi live membutuhkan kredensial |

Tidak ada data contoh yang ditulis ke storage produksi. Seeder PNG/UI memakai Miniflare lokal terisolasi. Fitur berbiaya default nonaktif.
