import type { StoredAccount, StoreShape } from "@/app/api/store/route";
import { createDemoAdminUsers, createInitialDemoMoments } from "./demoData";
import type {
  AdminUserSummary,
  MediaType,
  Moment,
  Profile,
  PublicProfile,
} from "./types";

const STORAGE_KEY = "depong_integrated_store_v1";
const SESSION_KEY = "depong_active_user_id_v1";
const SUPER_ADMIN_KEY = "depong_super_admin_session_v1";
const CHANNEL_NAME = "depong_live_channel_v1";

let memoryStore: StoreShape | null = null;
const serverSyncedMomentIds = new Set<string>();

export const SUPER_ADMIN_EMAIL = "admin123@gmail.com";
export const SUPER_ADMIN_PASSWORD = "admin123";

export function isSuperAdminAuthenticated(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SUPER_ADMIN_KEY) === SUPER_ADMIN_EMAIL;
}

export function setSuperAdminAuthenticated(active: boolean): void {
  if (typeof window === "undefined") return;
  if (active) {
    window.localStorage.setItem(SUPER_ADMIN_KEY, SUPER_ADMIN_EMAIL);
  } else {
    window.localStorage.removeItem(SUPER_ADMIN_KEY);
  }
}

export function verifySuperAdminCredentials(email: string, password: string): boolean {
  return (
    email.trim().toLowerCase() === SUPER_ADMIN_EMAIL &&
    password === SUPER_ADMIN_PASSWORD
  );
}

function createInitialLocalStore(): StoreShape {
  const seedUsers = createDemoAdminUsers(Date.now());
  const seedMoments = createInitialDemoMoments(Date.now());
  const nowIso = new Date().toISOString();

  const friendships: { user_id: string; friend_id: string; created_at: string }[] = [];
  const mainId = seedUsers[0]?.id ?? "demo-user-daffa";
  for (const u of seedUsers.slice(1, 5)) {
    friendships.push({ user_id: mainId, friend_id: u.id, created_at: nowIso });
    friendships.push({ user_id: u.id, friend_id: mainId, created_at: nowIso });
  }

  return {
    accounts: seedUsers,
    friendships,
    moments: seedMoments,
    replies: [],
    deletedIds: [],
    updatedAt: Date.now(),
  };
}

export function loadLocalStore(): StoreShape {
  if (typeof window === "undefined") return createInitialLocalStore();
  if (memoryStore) return memoryStore;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoreShape>;
      if (Array.isArray(parsed.accounts) && Array.isArray(parsed.moments)) {
        memoryStore = {
          accounts: parsed.accounts,
          friendships: parsed.friendships ?? [],
          moments: parsed.moments.filter((m) => !m.media_path.startsWith("blob:")),
          replies: parsed.replies ?? [],
          deletedIds: parsed.deletedIds ?? [],
          deletedMomentIds: parsed.deletedMomentIds ?? [],
          removedFriendKeys: parsed.removedFriendKeys ?? [],
          updatedAt: parsed.updatedAt ?? Date.now(),
        };
        return memoryStore;
      }
    }
  } catch {
    // Fallback
  }
  const init = createInitialLocalStore();
  memoryStore = init;
  saveLocalStore(init, false);
  return init;
}

export function saveLocalStore(store: StoreShape, broadcast = true): void {
  memoryStore = store;
  if (typeof window === "undefined") return;

  // Untuk penyimpanan lokal browser user, bersihkan foto/video dari orang yang bukan sahabat aktif
  const activeUid = window.localStorage.getItem(SESSION_KEY);
  let forLocalStorage = store;
  if (activeUid) {
    const activeFriendIds = new Set(
      store.friendships.filter((f) => f.user_id === activeUid).map((f) => f.friend_id),
    );
    forLocalStorage = {
      ...store,
      moments: store.moments.filter(
        (m) => m.user_id === activeUid || activeFriendIds.has(m.user_id),
      ),
    };
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(forLocalStorage));
  } catch {
    try {
      const trimmed: StoreShape = {
        ...forLocalStorage,
        moments: forLocalStorage.moments.slice(0, 4),
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      try {
        const accountsOnly: StoreShape = {
          ...forLocalStorage,
          moments: [],
        };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(accountsOnly));
      } catch {
        // Abaikan
      }
    }
  }
  if (broadcast && typeof BroadcastChannel !== "undefined") {
    try {
      const bc = new BroadcastChannel(CHANNEL_NAME);
      bc.postMessage({ type: "store_updated", updatedAt: store.updatedAt });
      bc.close();
    } catch {
      // Abaikan
    }
  }
}

export function subscribeStoreChanges(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;

  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === SESSION_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);

  let bc: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== "undefined") {
    try {
      bc = new BroadcastChannel(CHANNEL_NAME);
      bc.onmessage = () => onChange();
    } catch {
      bc = null;
    }
  }

  return () => {
    window.removeEventListener("storage", onStorage);
    bc?.close();
  };
}

export async function syncWithServerStore(
  action = "sync",
  payload?: Record<string, unknown>,
): Promise<StoreShape> {
  const local = loadLocalStore();
  try {
    // Agar request ringan & cepat, momen yang sudah pernah ter-upload ke server tidak perlu dikirim ulang base64-nya
    const lightClientStore: Partial<StoreShape> = {
      ...local,
      moments: local.moments
        .filter((m) => !m.media_path.startsWith("blob:"))
        .map((m) =>
          serverSyncedMomentIds.has(m.id) && m.media_path.length > 2048
            ? { ...m, media_path: "__SERVER_CACHED__" }
            : m,
        ),
    };

    const res = await fetch("/api/store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        payload,
        clientStore: lightClientStore,
      }),
    });
    if (res.ok) {
      const remote = (await res.json()) as StoreShape;
      for (const m of remote.moments) {
        if (m.media_path && m.media_path !== "__SERVER_CACHED__") {
          serverSyncedMomentIds.add(m.id);
        }
      }
      saveLocalStore(remote, false);
      return remote;
    }
  } catch {
    // Jika offline, gunakan local store
  }
  return local;
}

export function getActiveSessionUserId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(SESSION_KEY);
}

export function setActiveSessionUserId(userId: string | null): void {
  if (typeof window === "undefined") return;
  if (userId) {
    window.localStorage.setItem(SESSION_KEY, userId);
  } else {
    window.localStorage.removeItem(SESSION_KEY);
  }
  if (typeof BroadcastChannel !== "undefined") {
    try {
      const bc = new BroadcastChannel(CHANNEL_NAME);
      bc.postMessage({ type: "session_changed", userId });
      bc.close();
    } catch {
      // Abaikan
    }
  }
}

export function toProfile(acc: StoredAccount): Profile {
  return {
    id: acc.id,
    username: acc.username,
    display_name: acc.display_name,
    email: acc.email,
    avatar_url: acc.avatar_url,
    invite_code: acc.invite_code,
    created_at: acc.created_at,
  };
}

export function toPublicProfile(acc: StoredAccount): PublicProfile {
  return {
    id: acc.id,
    username: acc.username,
    display_name: acc.display_name,
    avatar_url: acc.avatar_url,
  };
}

export async function registerLocalAccount(input: {
  displayName: string;
  username: string;
  email: string;
  password?: string;
}): Promise<Profile> {
  const store = await syncWithServerStore();
  const cleanEmail = input.email.trim().toLowerCase();
  const baseUser =
    input.username
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "") ||
    cleanEmail.split("@")[0].replace(/[^a-z0-9_]/g, "") ||
    "user";

  const existingEmail = store.accounts.find(
    (a) => a.email?.toLowerCase() === cleanEmail,
  );
  if (existingEmail) {
    throw new Error("Email sudah terdaftar, silakan masuk melalui tab Masuk.");
  }

  let finalUsername = baseUser;
  if (store.accounts.some((a) => a.username.toLowerCase() === finalUsername)) {
    finalUsername = `${baseUser}_${Math.floor(10 + Math.random() * 89)}`;
  }

  const inviteCode = Math.random().toString(36).slice(2, 10);
  const nowIso = new Date().toISOString();
  const id = `usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const newAcc: StoredAccount = {
    id,
    username: finalUsername,
    display_name: input.displayName.trim() || finalUsername,
    email: cleanEmail,
    avatar_url: null,
    invite_code: inviteCode,
    created_at: nowIso,
    moments_count: 0,
    videos_count: 0,
    friends_count: 0,
    last_active_at: nowIso,
    password: input.password,
  };

  store.accounts.unshift(newAcc);
  store.updatedAt = Date.now();
  setActiveSessionUserId(newAcc.id);
  saveLocalStore(store, true);
  await syncWithServerStore("register_user");
  return toProfile(newAcc);
}

export async function loginLocalAccount(input: {
  emailOrUsername: string;
  password?: string;
}): Promise<Profile> {
  const store = await syncWithServerStore();
  const q = input.emailOrUsername.trim().toLowerCase().replace(/^@/, "");
  const found = store.accounts.find(
    (a) =>
      a.email?.toLowerCase() === q ||
      a.username.toLowerCase() === q ||
      a.display_name.toLowerCase() === q,
  );

  if (!found) {
    throw new Error("Akun belum ditemukan. Silakan daftar akun baru terlebih dahulu.");
  }
  if (found.password && input.password && found.password !== input.password) {
    throw new Error("Password yang dimasukkan salah.");
  }

  found.last_active_at = new Date().toISOString();
  store.updatedAt = Date.now();
  saveLocalStore(store, true);
  await syncWithServerStore("login_user");
  setActiveSessionUserId(found.id);
  return toProfile(found);
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Gagal membaca file media"));
    };
    reader.onerror = () => reject(new Error("Gagal membaca file media"));
    reader.readAsDataURL(blob);
  });
}

export async function createLocalMomentRecord(input: {
  userId: string;
  blob: Blob;
  mediaType: MediaType;
  duration: number | null;
  caption: string;
}): Promise<Moment> {
  const store = loadLocalStore();
  const author = store.accounts.find((a) => a.id === input.userId);
  // Selalu konversi ke dataURL (bukan blob: lokal) agar pengguna lain di perangkat berbeda bisa melihat video/foto
  const mediaPath = await blobToDataUrl(input.blob);

  const nowIso = new Date().toISOString();
  const moment: Moment = {
    id: `mom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    user_id: input.userId,
    media_path: mediaPath,
    media_type: input.mediaType,
    duration: input.duration,
    caption: input.caption.trim() || null,
    created_at: nowIso,
    profile: author ? toPublicProfile(author) : null,
    reactions: [],
  };

  store.moments.unshift(moment);
  if (author) {
    author.moments_count = (author.moments_count ?? 0) + 1;
    if (input.mediaType === "video") {
      author.videos_count = (author.videos_count ?? 0) + 1;
    }
    author.last_active_at = nowIso;
  }
  store.updatedAt = Date.now();
  saveLocalStore(store, true);
  await syncWithServerStore("create_moment", { moment });
  return moment;
}

export async function deleteLocalAccount(userId: string): Promise<AdminUserSummary[]> {
  const store = loadLocalStore();
  if (!store.deletedIds.includes(userId)) {
    store.deletedIds.push(userId);
  }
  store.accounts = store.accounts.filter((a) => a.id !== userId);
  store.moments = store.moments.filter((m) => m.user_id !== userId);
  store.friendships = store.friendships.filter(
    (f) => f.user_id !== userId && f.friend_id !== userId,
  );
  if (getActiveSessionUserId() === userId) {
    setActiveSessionUserId(null);
  }
  store.updatedAt = Date.now();
  saveLocalStore(store, true);
  const synced = await syncWithServerStore("delete_user", { userId });
  return synced.accounts;
}
