# Social MCP

Implementasi aplikasi pribadi untuk Instagram dan TikTok berdasarkan PRD v1.2. Klien MCP dapat berupa ChatGPT/Codex, Claude, atau klien lain yang mendukung remote MCP dan OAuth.

- Dashboard React + Vite: approval, kalender, analitik, akun, media, dan log.
- Worker: remote MCP Streamable HTTP, OAuth GitHub, API dashboard, Cron publisher.
- Storage: JSON per entitas di R2, OAuth di KV; tanpa D1.
- Browser Use Cloud V4 sebagai opsi tambahan per akun dan per approval.
- Token akun dienkripsi AES-GCM. Publish dan balasan selalu membutuhkan approval manusia.

Mulai demo: `npm ci` lalu `npm run dev`, buka `http://localhost:5173/?demo=1`.

Baca README utama untuk instalasi Worker, secrets, deployment, batas integrasi, dan hasil pengujian. Tidak ada akun sosial nyata yang telah dihubungkan dan tidak ada deployment produksi yang dilakukan.
