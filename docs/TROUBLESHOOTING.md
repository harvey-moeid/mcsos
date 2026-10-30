# Troubleshooting

| Gejala | Pemeriksaan / tindakan |
| --- | --- |
| 401 / sesi kedaluwarsa | Login ulang GitHub owner; logout lama mencabut cookie server |
| 403 CSRF | PUBLIC_ORIGIN, origin browser, cookie dan X-CSRF-Token harus cocok; jangan memakai host proxy berbeda |
| Fitur belum aktif | Periksa flag sesuai CONFIGURATION.md; default produksi semua fitur baru false |
| login_required | Login ulang secara manual dan catat verifikasi handle aktif; validity 24 jam |
| Username tidak cocok | Gunakan handle asli tanpa display name. Existing Login Kit display name perlu expected_username browser atau akun manual dengan handle tepat |
| Profile dipakai akun lain | Buat profile terpisah; ownership registry tidak dilepas otomatis setelah disconnect |
| Profile/sesi sibuk | Tutup sesi provider atau pulihkan session ambiguous. Jangan menimpa lease |
| Live URL tidak terbuka | Pulihkan sesi active; server memeriksa metadata/expiry. Jika expired, login ulang menggunakan profile bila didukung |
| Sesi opening/uncertain tanpa browser ID | Periksa dashboard provider, cocokkan metadata akun/local login ID, gunakan recovery Hentikan sesi |
| Approval invalid setelah perubahan | Reset ke draft, tinjau versi media/caption/identitas/jadwal, approve ulang |
| Handoff aktif | Periksa konten sebelumnya pada akun itu; uncertain harus direkonsiliasi sebelum handoff lain |
| Jadwal lewat tetapi tidak berubah | Klik Periksa jadwal jatuh tempo dan lanjutkan cursor. Tidak ada Cron |
| Edit draft terkunci | Kembali ke draft sebelum handoff, ubah dan approve ulang. Jangan reset uncertain sebelum memastikan hasil |
| AI tidak tersedia | Secret/model/provider/flag server belum diatur. Gunakan editor manual |
| AI schema tidak valid/terpotong | Ringkas brief atau pilih model JSON dengan batas token memadai. Tidak ada fallback hasil palsu |
| HTTP 429 | Tunggu reset limit menit/hari atau periksa quota provider. Jangan membypass limit |
| Upload CORS / ETag | Periksa origin tepat, PUT dan ExposeHeaders ETag pada bucket R2 sesuai environment |
| Video metadata tidak terbaca | Gunakan MP4/MOV dengan moov dalam 4 MB header/tail. Siapkan ulang video di alat lokal; Worker tidak mentranskode |
| Media masih direferensikan | Current draft atau history masih memakainya; jangan hapus R2 langsung untuk memaksa |
| Konflik / mutation-lock orphan | Pastikan tidak ada operasi berjalan, backup dan inspeksi lock + record terkait sebelum recovery operator |
| Wrangler tidak bisa menulis config home | Set XDG_CONFIG_HOME ke direktori writable dan npm cache ke /tmp pada managed sandbox |
| Node tidak mengenal cloudflare: pada unit tests | Import owner-api untuk tes Node; gunakan check:runtime/Miniflare untuk entrypoint Worker OAuth |

Jangan memasukkan cookie, secret, URL live, signed URL, provider UUID atau teks privat dalam tiket/debug log publik. Sertakan request path (tanpa query credential), status HTTP, local entity ID dan timestamp saja.
