import {
  coerceStore,
  emptyStore,
  friendIdsOf,
  MEDIA_PLACEHOLDER,
  type StoredAccount,
  type StoreShape,
} from "./storeTypes";
import type {
  AdminUserSummary,
  Moment,
  Profile,
  PublicProfile,
} from "./types";

const STORAGE_KEY = "depong_photo_store_v2";
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

export function loadLocalStore(): StoreShape {
  if (typeof window === "undefined") return emptyStore();
  if (memoryStore) return memoryStore;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = coerceStore(JSON.parse(raw));
      if (parsed) {
        parsed.moments = parsed.moments.filter((m) => !m.media_path.startsWith("data:video/"));
        memoryStore = parsed;
        return memoryStore;
      }
    }
  } catch {
    // Fallback
  }
  const init = emptyStore();
  memoryStore = init;
  saveLocalStore(init, false);
  return init;
}

export function saveLocalStore(store: StoreShape, broadcast = true): void {
  memoryStore = store;
  if (typeof window === "undefined") return;

  const activeUid = window.localStorage.getItem(SESSION_KEY);
  let forLocalStorage = store;
  if (activeUid) {
    const activeFriends = friendIdsOf(store, activeUid);
    forLocalStorage = {
      ...store,
      moments: store.moments.filter(
        (m) => m.user_id === activeUid || activeFriends.has(m.user_id),
      ),
    };
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(forLocalStorage));
  } catch {
    try {
      const trimmed: StoreShape = {
        ...forLocalStorage,
        moments: forLocalStorage.moments.slice(0, 12),
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // Abaikan bila storage penuh
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
    const lightClientStore: Partial<StoreShape> = {
      ...local,
      moments: local.moments
        .filter((m) => !m.media_path.startsWith("blob:") && !m.media_path.startsWith("data:video/"))
        .map((m) =>
          serverSyncedMomentIds.has(m.id) && m.media_path.length > 2048
            ? { ...m, media_path: MEDIA_PLACEHOLDER }
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
      const remote = coerceStore(await res.json());
      if (remote) {
        for (const m of remote.moments) {
          if (m.media_path && m.media_path !== MEDIA_PLACEHOLDER) {
            serverSyncedMomentIds.add(m.id);
          }
        }
        saveLocalStore(remote, false);
        return remote;
      }
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
  setActiveSessionUserId(found.id);
  saveLocalStore(store, true);
  await syncWithServerStore("login_user");
  return toProfile(found);
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Gagal membaca file foto"));
    };
    reader.onerror = () => reject(new Error("Gagal membaca file foto"));
    reader.readAsDataURL(blob);
  });
}

export async function createLocalMomentRecord(input: {
  userId: string;
  blob: Blob;
  caption: string;
}): Promise<Moment> {
  const store = loadLocalStore();
  const author = store.accounts.find((a) => a.id === input.userId);
  const mediaPath = await blobToDataUrl(input.blob);

  const nowIso = new Date().toISOString();
  const moment: Moment = {
    id: `mom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    user_id: input.userId,
    media_path: mediaPath,
    caption: input.caption.trim() || null,
    created_at: nowIso,
    profile: author ? toPublicProfile(author) : null,
    reactions: [],
  };

  store.moments.unshift(moment);
  if (author) {
    author.moments_count = (author.moments_count ?? 0) + 1;
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
