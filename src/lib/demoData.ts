import type { AdminUserSummary, Moment, Profile, PublicProfile } from "./types";

function svgSceneDataUrl(bg1: string, bg2: string, accent: string, emoji: string, label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="720" viewBox="0 0 720 720">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${bg1}"/>
        <stop offset="100%" stop-color="${bg2}"/>
      </linearGradient>
      <radialGradient id="glow" cx="50%" cy="42%" r="45%">
        <stop offset="0%" stop-color="${accent}" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="720" height="720" fill="url(#g)"/>
    <circle cx="360" cy="300" r="260" fill="url(#glow)"/>
    <circle cx="190" cy="180" r="64" fill="rgba(255,255,255,0.08)"/>
    <circle cx="540" cy="490" r="88" fill="rgba(245,196,81,0.12)"/>
    <circle cx="360" cy="320" r="110" fill="rgba(0,0,0,0.28)"/>
    <text x="360" y="348" font-size="108" text-anchor="middle">${emoji}</text>
    <text x="360" y="520" font-family="sans-serif" font-size="26" font-weight="700" fill="rgba(255,255,255,0.75)" text-anchor="middle">${label}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const DEFAULT_REF_MS = 1794980000000;

export const DEMO_PROFILE: Profile = {
  id: "demo-user-daffa",
  username: "daffa",
  display_name: "Daffa",
  avatar_url: null,
  invite_code: "daffa7s",
  created_at: new Date(DEFAULT_REF_MS).toISOString(),
};

export const DEMO_FRIENDS: PublicProfile[] = [
  { id: "friend-dina", username: "dina_s", display_name: "Dina", avatar_url: null },
  { id: "friend-raka", username: "raka_p", display_name: "Raka", avatar_url: null },
  { id: "friend-nadia", username: "nadia_k", display_name: "Nadia", avatar_url: null },
  { id: "friend-aris", username: "aris_m", display_name: "Aris", avatar_url: null },
];

export function createInitialDemoMoments(now = DEFAULT_REF_MS): Moment[] {
  return [
    {
      id: "demo-m-1",
      user_id: "friend-dina",
      media_path: svgSceneDataUrl("#c2652a", "#1e130d", "#f5c451", "☕", "Golden Hour Coffee"),
      media_type: "photo",
      duration: null,
      caption: "Kopi santai sore bareng sebelum lanjut kerja ☕✨",
      created_at: new Date(now - 13 * 60 * 1000).toISOString(),
      profile: DEMO_FRIENDS[0],
      reactions: [
        { id: "r-1", user_id: "friend-raka", emoji: "💛", created_at: new Date(now - 9 * 60 * 1000).toISOString() },
        { id: "r-2", user_id: "friend-nadia", emoji: "😍", created_at: new Date(now - 5 * 60 * 1000).toISOString() },
      ],
    },
    {
      id: "demo-m-2",
      user_id: "friend-nadia",
      media_path: svgSceneDataUrl("#7c3aed", "#0f172a", "#f472b6", "🐱", "Oyen Tidur Sore"),
      media_type: "photo",
      duration: null,
      caption: "Oyen ketiduran di meja belajar lol 🐱",
      created_at: new Date(now - 52 * 60 * 1000).toISOString(),
      profile: DEMO_FRIENDS[2],
      reactions: [
        { id: "r-3", user_id: "demo-user-daffa", emoji: "😍", created_at: new Date(now - 30 * 60 * 1000).toISOString() },
      ],
    },
    {
      id: "demo-m-3",
      user_id: "friend-raka",
      media_path: svgSceneDataUrl("#ea580c", "#1e293b", "#fde047", "🌅", "Sunset Pantai"),
      media_type: "photo",
      duration: null,
      caption: "Langit sore ini bagus banget!",
      created_at: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
      profile: DEMO_FRIENDS[1],
      reactions: [
        { id: "r-4", user_id: "friend-dina", emoji: "🔥", created_at: new Date(now - 22 * 60 * 60 * 1000).toISOString() },
      ],
    },
    {
      id: "demo-m-4",
      user_id: "demo-user-daffa",
      media_path: svgSceneDataUrl("#2563eb", "#09090b", "#f5c451", "🌃", "Night Drive"),
      media_type: "photo",
      duration: null,
      caption: "Pulang malem jalanan lengang 🌃",
      created_at: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
      profile: DEMO_PROFILE,
      reactions: [
        { id: "r-5", user_id: "friend-aris", emoji: "🔥", created_at: new Date(now - 46 * 60 * 60 * 1000).toISOString() },
      ],
    },
  ];
}

export function createDemoAdminUsers(now = DEFAULT_REF_MS): AdminUserSummary[] {
  const h = 3600 * 1000;
  const d = 24 * h;

  return [
    {
      id: "demo-user-daffa",
      username: "daffa_9f2a",
      display_name: "Daffa",
      email: "ahmmdaffa280904@gmail.com",
      avatar_url: null,
      invite_code: "daffa7s",
      created_at: new Date(now - 2 * h).toISOString(),
      moments_count: 14,
      videos_count: 6,
      friends_count: 4,
      last_active_at: new Date(now - 10 * 60 * 1000).toISOString(),
    },
    {
      id: "friend-dina",
      username: "dina_s81c",
      display_name: "Dina Safitri",
      email: "dina.safitri@gmail.com",
      avatar_url: null,
      invite_code: "dina8821",
      created_at: new Date(now - 18 * h).toISOString(),
      moments_count: 22,
      videos_count: 9,
      friends_count: 5,
      last_active_at: new Date(now - 13 * 60 * 1000).toISOString(),
    },
    {
      id: "friend-raka",
      username: "raka_p40e",
      display_name: "Raka Pratama",
      email: "rakapratama@outlook.com",
      avatar_url: null,
      invite_code: "raka409e",
      created_at: new Date(now - 1.4 * d).toISOString(),
      moments_count: 11,
      videos_count: 4,
      friends_count: 4,
      last_active_at: new Date(now - 3 * h).toISOString(),
    },
    {
      id: "friend-nadia",
      username: "nadia_k19b",
      display_name: "Nadia Kusuma",
      email: "nadiakusuma@gmail.com",
      avatar_url: null,
      invite_code: "nadia19b",
      created_at: new Date(now - 2.3 * d).toISOString(),
      moments_count: 19,
      videos_count: 8,
      friends_count: 6,
      last_active_at: new Date(now - 52 * 60 * 1000).toISOString(),
    },
    {
      id: "friend-aris",
      username: "aris_m77d",
      display_name: "Aris Maulana",
      email: "aris.maulana@yahoo.com",
      avatar_url: null,
      invite_code: "aris77dm",
      created_at: new Date(now - 3.6 * d).toISOString(),
      moments_count: 8,
      videos_count: 2,
      friends_count: 3,
      last_active_at: new Date(now - 1.1 * d).toISOString(),
    },
    {
      id: "friend-maya",
      username: "maya_l04a",
      display_name: "Maya Lestari",
      email: "mayalestari@gmail.com",
      avatar_url: null,
      invite_code: "maya04al",
      created_at: new Date(now - 5.2 * d).toISOString(),
      moments_count: 15,
      videos_count: 7,
      friends_count: 5,
      last_active_at: new Date(now - 6 * h).toISOString(),
    },
  ];
}
