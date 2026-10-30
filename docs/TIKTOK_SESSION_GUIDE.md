# Panduan TikTok Session Engine

## Login dashboard

Buka origin aplikasi, pilih Login dengan GitHub pemilik. Hanya numeric owner ID konfigurasi yang diterima. Sesi menggunakan cookie HttpOnly/Secure pada HTTPS; kedaluwarsa 24 jam. Logout mencabut sesi server agar cookie lama tidak bisa diputar ulang. Jangan membagikan browser dashboard atau link media/live browser.

## Mode B — browser pribadi / handoff manual

1. Aktifkan TIKTOK_CONTENT_STUDIO_ENABLED. Mode ini tidak membutuhkan Browser Use atau TikTok Developer API.
2. Halaman Akun terhubung → Tambah akun TikTok. Masukkan nama/handle dan konfirmasi hak kelola. Gunakan handle, bukan display name.
3. Buka TikTok Web sendiri. Login dan selesaikan CAPTCHA/OTP/2FA sendiri. Periksa username melalui menu profil.
4. Pada kartu akun → Verifikasi identitas / health check → Browser pribadi. Ketik username yang terlihat dan konfirmasi pemeriksaan. Ini catatan manual pemilik, bukan deteksi otomatis. Berlaku 24 jam; login ulang/verifikasi saat expired.
5. Worker tidak memiliki atau mengakses sesi browser pribadi. Menekan Buka TikTok tidak menjamin akun tertentu sedang aktif; selalu periksa sebelum publikasi.

## Mode A — connected browser session

1. Setelah menyetujui biaya provider, set BROWSER_USE_ENABLED=true, BROWSER_USE_API_KEY serta TOKEN_ENCRYPTION_KEY, kemudian TIKTOK_SESSION_ENABLED=true. Default tetap false.
2. Buat **profile terpisah** pada Browser Use Cloud untuk setiap akun. Hubungkan profile UUID dari kartu akun → Login ulang / kelola profile browser. Ini referensi provider, bukan cookie TikTok. Jangan menyalin cookie/sessionid ke MCSOS.
3. Simpan binding dan expected username. Profile dienkripsi AES-GCM; registry kondisional mencegah pemakaian profile oleh akun lain, termasuk saat binding dilakukan bersamaan.
4. Buka sesi login. Hanya pemilik mendapat URL live. Login di TikTok secara manual, selesaikan tantangan sendiri. Perekaman dan CAPTCHA solver provider dinonaktifkan pada request sesi manusia.
5. Periksa username di UI TikTok, lalu Tutup sesi & simpan. Gunakan Verifikasi identitas / health check pada kartu akun, pilih browser provider. MCSOS mencatat **attestation pemilik**, tidak menjalankan agen ekstraksi TikTok. Status browser legacy tetap unverified untuk mencegah approval agent; status identitas manual tersimpan pada metadata TikTok.
6. Profile persisten berada pada provider sesuai fasilitas/retensinya. Tidak ada jaminan TikTok mempertahankan login; profile bisa berakhir atau meminta login ulang.

## Pemulihan

Setelah refresh/redeploy, pengaturan akun memuat daftar sesi lokal. Sesi active dapat memakai Pulihkan live browser: server memeriksa akun, revisi binding, metadata provider, status dan expiry, lalu membuka URL terenkripsi yang tersimpan. Tidak menciptakan sesi baru atau biaya baru secara otomatis. Sesi stopped/expired → login_required, lease dilepas setelah provider memastikan berakhir. Login ulang memakai profile yang sama jika provider mendukung persistensi.

Pembukaan sesi ambigu tanpa ID browser: periksa dashboard Browser Use, ambil ID **browser session** dan gunakan Hentikan sesi pada record recovery yang sesuai. Server mencocokkan metadata socialJob/socialAccount. Jangan membuka sesi kedua sebelum memastikan sesi lama berakhir. Run recovery existing Instagram memakai ID run dan task hash, bukan UUID browser.

Disconnect & hapus referensi sesi menghapus ciphertext/token lokal dan membatalkan identitas, setelah memastikan tidak ada lease aktif. **Logout TikTok dan penghapusan cookie/profile remote dilakukan di UI provider**. MCSOS tidak mengklaim telah menghapus sesi remote. Registry kepemilikan hash profile dipertahankan untuk mencegah reuse lintas akun secara tidak sengaja.

## Konten, media, approval dan publikasi

1. AI Content Studio: tulis brief/task/bahasa atau gunakan Buat konten manual. Provider kosong menampilkan tidak tersedia tanpa hasil palsu. Pilih template bila membantu.
2. Pilih akun di editor. Upload beberapa JPEG/PNG/WEBP/MP4/MOV ke R2 dengan progress, atau pilih media existing. Ukuran/dimensi server divalidasi; utamakan 9:16. Cover preview memakai media pertama; cover final ditentukan di TikTok. Tidak ada transcoding.
3. Isi caption/hashtag, catatan, jadwal WIB, preferensi privasi, disclosure dan label AI. Simpan; draft bertahan setelah refresh/redeploy.
4. Inbox approval → Minta approval → Detail. Periksa setiap media, akun/username, caption, jadwal dan revisi. Centang persetujuan spesifik lalu setujui. Masukkan ke antrean manual.
5. Pada Antrean & kalender, periksa jadwal jatuh tempo. Satu klik memproses 100 record; ulangi halaman berikutnya jika ada cursor. Tidak ada pemicu waktu latar belakang.
6. Ketika ready_for_manual_publish, konfirmasi akun aktif dan mulai handoff. Unduh media/salin caption. Buka TikTok Web, **periksa akun aktif kembali**, unggah sendiri, atur privasi/komentar/duet/stitch/cover/disclosure/label AI dan tekan publikasi sendiri.
7. Status tetap awaiting_verification. Periksa profil/posting pada TikTok. Catat username dan URL posting yang cocok; published berarti konfirmasi manual pemilik, bukan API resmi. Jika hasil tidak pasti, pilih uncertain dan jangan mengirim ulang. Jika dipastikan tidak terjadi, catat failed sebelum membuat revisi baru.
8. Untuk reschedule: kembali ke draft, edit waktu WIB, simpan dan approve ulang. Perubahan material membatalkan approval sebelumnya. Setelah handoff, rekonsiliasi hasil terlebih dahulu.
9. Analitik: masukkan observasi yang sah atau impor array JSON, beri timestamp. Field yang tidak tersedia dibiarkan kosong/null. Statistik tidak diambil dari TikTok secara otomatis.
