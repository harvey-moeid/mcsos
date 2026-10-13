import type { Workspace, Draft, Media } from "../shared/model";
export const DEMO_KEY = "social-mcp-demo-v1";
export function seedDemo(): Workspace {
  const now = new Date(),
    iso = (days: number, hour = 17) => {
      const d = new Date(now);
      d.setDate(d.getDate() + days);
      d.setHours(hour, 0, 0, 0);
      return d.toISOString();
    };
  const accounts = [
    {
      id: "ig-studio",
      platform: "instagram" as const,
      label: "Studio Rasa",
      username: "studiorasa.id",
      platformId: "demo-ig-1",
      status: "connected" as const,
      expiresAt: iso(45),
      scopes: [],
      demo: true,
    },
    {
      id: "tt-studio",
      platform: "tiktok" as const,
      label: "Studio Rasa",
      username: "studiorasa",
      platformId: "demo-tt-1",
      status: "connected" as const,
      expiresAt: iso(12),
      scopes: [],
      demo: true,
    },
    {
      id: "ig-journal",
      platform: "instagram" as const,
      label: "The Slow Journal",
      username: "theslowjournal",
      platformId: "demo-ig-2",
      status: "connected" as const,
      expiresAt: iso(30),
      scopes: [],
      demo: true,
    },
    {
      id: "tt-journal",
      platform: "tiktok" as const,
      label: "The Slow Journal",
      username: "theslowjournal",
      platformId: "demo-tt-2",
      status: "reconnect" as const,
      expiresAt: iso(-1),
      scopes: [],
      demo: true,
    },
  ];
  const media: Media[] = [
    {
      id: "matcha",
      key: "demo/matcha",
      filename: "ritual-matcha.jpg",
      mime: "image/jpeg",
      size: 840000,
      width: 1080,
      height: 1350,
      createdAt: iso(-2),
      verified: true,
      previewUrl: "/matcha.svg",
    },
    {
      id: "coast",
      key: "demo/coast",
      filename: "slow-sunday.jpg",
      mime: "image/jpeg",
      size: 1200000,
      width: 1080,
      height: 1350,
      createdAt: iso(-1),
      verified: true,
      previewUrl: "/coast.svg",
    },
    {
      id: "coffee",
      key: "demo/coffee",
      filename: "morning-coffee.jpg",
      mime: "image/jpeg",
      size: 740000,
      width: 1080,
      height: 1350,
      createdAt: iso(-3),
      verified: true,
      previewUrl: "/coffee.svg",
    },
  ];
  const base = {
    kind: "post" as const,
    postType: "photo" as const,
    status: "draft" as const,
    createdAt: iso(-1),
    updatedAt: iso(-1),
    revision: 1,
    attempts: 0,
    commercial: "none" as const,
  };
  const drafts: Draft[] = [
    {
      ...base,
      id: "draft-matcha",
      accountId: "ig-studio",
      caption:
        "Sedikit jeda, segelas matcha, dan ruang untuk bernapas. Ritual kecil yang bikin hari terasa lebih baik. 🍵\n\nApa ritual pagi kamu?\n\n#StudioRasa #SlowMorning #MatchaRitual",
      mediaIds: ["matcha"],
      scheduledAt: iso(1, 19),
    },
    {
      ...base,
      id: "draft-coast",
      accountId: "ig-journal",
      caption:
        "Tidak semua perjalanan perlu terburu-buru. Kadang, cukup duduk dan mendengarkan laut.\n\nSave untuk pengingat akhir pekanmu. 🌊\n#TheSlowJournal #SlowLiving",
      mediaIds: ["coast"],
      scheduledAt: iso(2, 17),
    },
    {
      ...base,
      id: "reply-1",
      kind: "comment_reply",
      accountId: "ig-studio",
      caption:
        "Hai! Matcha kami pakai ceremonial grade dari Uji. Bisa mampir untuk coba langsung 🍵",
      mediaIds: [],
      targetId: "comment-1",
    },
    {
      ...base,
      id: "reply-2",
      kind: "comment_reply",
      accountId: "ig-journal",
      caption:
        "Lokasinya di pesisir selatan Bali. Kami tulis panduan singkatnya di posting berikutnya 🌊",
      mediaIds: [],
      targetId: "comment-2",
    },
    {
      ...base,
      id: "scheduled-coffee",
      accountId: "ig-studio",
      caption: "First coffee, then everything else. ☕ #StudioRasa",
      mediaIds: ["coffee"],
      status: "scheduled",
      scheduledAt: iso(3, 9),
      approvedAt: iso(-1),
      approvedBy: "demo-owner",
      approvedRevision: 1,
    },
    {
      ...base,
      id: "failed-1",
      accountId: "tt-studio",
      postType: "video",
      caption: "Behind the bar: morning ritual.",
      mediaIds: [],
      status: "failed",
      error:
        "Simulasi: durasi video melebihi batas creator. Media perlu disiapkan ulang.",
    },
  ];
  const stats = accounts
    .filter((a) => a.status === "connected")
    .map((a, i) => ({
      accountId: a.id,
      capturedAt: iso(0),
      followers: [24850, 18620, 12340][i],
      views: [184200, 248300, 96200][i],
      likes: [8450, 12420, 4280][i],
      comments: [342, 680, 128][i],
      shares: [1260, 2680, 482][i],
      reach: [142800, 196400, 72800][i],
      source: "demo" as const,
    }));
  const posts = Array.from({ length: 18 }, (_, i) => ({
    id: "post-" + i,
    accountId: accounts[i % 3].id,
    caption: [
      "Morning ritual, made slowly.",
      "A little room to breathe.",
      "Cerita di balik secangkir kopi.",
    ][i % 3],
    createdAt: iso(-i - 2, 8 + (i % 4) * 3),
    type: i % 3 ? "REELS" : "IMAGE",
    thumbnail: media[i % 3].previewUrl,
    views: Math.round(14000 / (1 + i / 7)),
    likes: Math.round(1900 / (1 + i / 8)),
    comments: Math.round(140 / (1 + i / 10)),
    shares: Math.round(320 / (1 + i / 10)),
  }));
  return {
    accounts,
    drafts,
    media,
    stats,
    posts,
    logs: [
      {
        id: "log-1",
        at: iso(0),
        action: "mcp.create_post_draft",
        status: "success",
        accountId: "ig-studio",
        entityId: "draft-matcha",
      },
      {
        id: "log-2",
        at: iso(-1),
        action: "approval.approve",
        status: "success",
        accountId: "ig-studio",
        entityId: "scheduled-coffee",
      },
      {
        id: "log-3",
        at: iso(-1),
        action: "snapshot",
        status: "success",
        accountId: "ig-journal",
      },
      {
        id: "log-4",
        at: iso(-2),
        action: "publish.failed",
        status: "error",
        accountId: "tt-studio",
        entityId: "failed-1",
        detail: "Simulasi kegagalan validasi media.",
      },
    ],
    ideas: [
      {
        id: "idea-1",
        accountId: "ig-studio",
        title: "Behind the cup",
        notes:
          "Cerita asal bahan, dari kebun sampai bar. Carousel 3 foto dengan tone hangat.",
        status: "idea",
        proposedAt: iso(5),
        createdAt: iso(-1),
      },
      {
        id: "idea-2",
        accountId: "ig-journal",
        title: "A slower weekend",
        notes: "Rute jalan kaki singkat dan tempat untuk berhenti sejenak.",
        status: "idea",
        proposedAt: iso(7),
        createdAt: iso(-1),
      },
    ],
    demo: true,
    owner: "demo-owner",
  };
}
export function loadDemo() {
  try {
    const value = localStorage.getItem(DEMO_KEY);
    if (value) return JSON.parse(value) as Workspace;
  } catch {
    /* Start clean if browser storage is unavailable. */
  }
  return seedDemo();
}
export function saveDemo(value: Workspace) {
  try {
    localStorage.setItem(DEMO_KEY, JSON.stringify(value));
  } catch {
    /* Keep the current workspace usable when browser storage is full. */
  }
}
