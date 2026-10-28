# Batasan dan ketergantungan eksternal

- TikTok login/posting live, GitHub/Meta OAuth live, Browser Use account session, direct R2 S3 produksi, dan AI live belum diuji tanpa kredensial. Tidak ada klaim live E2E PASS.
- Browser provider adalah opsional dan berbiaya. Profile persistence serta retensi mengikuti provider; TikTok dapat meminta login ulang. Identitas diverifikasi **manual oleh pemilik**, bukan pembacaan UI oleh Worker. Browser pribadi tidak dapat diakses/dipulihkan Worker.
- Tidak ada publikasi TikTok otomatis melalui API/browser, probing/ekstraksi agent, scraping analitik, komentar, DM, like/follow. TIKTOK_BROWSER_PUBLISH_ENABLED hanya reserved dan tidak membuka blokir.
- Media/caption harus dipindahkan pemilik ke TikTok Web. Pilihan akun aktif, privacy/duet/stitch/comment/cover/disclosure/label AI final dilakukan di TikTok. Preferensi draft bukan janji penerapan otomatis.
- published berarti pemilik menyatakan telah memeriksa URL yang cocok, dengan provenance manual. MCSOS tidak mengakses posting untuk memverifikasi kebenarannya secara independen.
- Jadwal tanpa Cron tidak berjalan ketika dashboard ditutup. Tombol manual menyapu 100 draft/halaman; cursor harus diteruskan. Instagram publisher existing tetap maksimal lima eksekusi per putaran dengan polling manual.
- Kalender mendukung hari/minggu/bulan. Drag belum diimplementasikan; reschedule memakai reset/edit waktu dan approve ulang.
- AI opsional, model harus mendukung JSON. Tidak ada estimasi performa atau angka engagement otomatis. Schema tidak menjamin kebenaran konten; tinjau fakta/hak cipta/disclosure. Model/biaya/kebijakan provider harus dipilih pemilik.
- Analitik TikTok hanya manual/import JSON. Perbandingan UI memakai maksimal 100 observasi awal per akun dan menyatakan batas itu. Tabel tren berhalaman mempertahankan timestamp; jangan menjumlahkan snapshot akun/posting. Unknown=null.
- Multipart R2 existing belum mendukung resume lintas refresh frontend. Progress pada upload kecil mencatat tahap, multipart menunjukkan progres per part. Tidak ada transcoding, pemrosesan video besar, thumbnail hasil render server atau format otomatis.
- Media legacy tanpa accountId adalah library bersama satu pemilik. Media baru composer berasosiasi akun. Revisi lama yang mereferensikan media menahan penghapusan; tidak ada purge history destruktif otomatis.
- Mutation locks tidak kedaluwarsa otomatis setelah crash; recovery operator memerlukan pemeriksaan record dan traffic. Ini mengutamakan konsistensi saat failure. Profile ownership registry dipertahankan setelah disconnect.
- Hapus referensi sesi MCSOS tidak menghapus cookie remote. Pemilik logout/hapus profile melalui provider. Login session active yang masih valid dapat dipulihkan; session opening ambiguous perlu pemeriksaan provider dan close recovery.
- Staging dan production belum dideploy selama pekerjaan ini. Konfigurasi staging tidak menggunakan bucket/KV produksi. Cloudflare Builds existing ke main dinyatakan pada baseline, status koneksi live belum diperiksa tanpa akses Cloudflare.
