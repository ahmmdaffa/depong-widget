/**
 * Struktur data backend internal (dipakai bersama oleh server /api/store dan client).
 * Dipakai saat Supabase belum dikonfigurasi.
 */
import type { AdminUserSummary, Moment, Reply } from "./types";

export interface StoredAccount extends AdminUserSummary {
  password?: string;
}

export interface Friendship {
  user_id: string;
  friend_id: string;
  created_at: string;
}

export interface StoreShape {
  accounts: StoredAccount[];
  friendships: Friendship[];
  moments: Moment[];
  replies: Reply[];
  /** Akun yang dihapus admin (permanen). */
  deletedIds: string[];
  /** Momen yang dihapus (permanen). */
  deletedMomentIds: string[];
  /** Pasangan sahabat yang diputus → waktu pemutusan (ISO). Pertemanan baru setelahnya tetap berlaku. */
  removedFriends: Record<string, string>;
  updatedAt: number;
}

export interface SyncResponse extends StoreShape {
  /** Id momen yang file fotonya sudah tersimpan di server. */
  mediaIds: string[];
}

/** Penanda ringan agar foto (base64) yang sudah dimiliki tidak dikirim ulang. */
export const MEDIA_PLACEHOLDER = "__SERVER_CACHED__";
/** Viewer khusus Super Admin: menerima semua momen. */
export const ADMIN_VIEWER = "__admin__";

export function friendPairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function emptyStore(): StoreShape {
  return {
    accounts: [],
    friendships: [],
    moments: [],
    replies: [],
    deletedIds: [],
    deletedMomentIds: [],
    removedFriends: {},
    updatedAt: Date.now(),
  };
}

/** Normalisasi data lama (mis. format removedFriendKeys versi sebelumnya). */
export function coerceStore(raw: unknown): StoreShape | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<StoreShape> & { removedFriendKeys?: string[] };
  if (!Array.isArray(s.accounts) || !Array.isArray(s.moments)) return null;

  const removedFriends: Record<string, string> = { ...(s.removedFriends ?? {}) };
  if (Array.isArray(s.removedFriendKeys)) {
    const nowIso = new Date().toISOString();
    for (const key of s.removedFriendKeys) removedFriends[key] ??= nowIso;
  }

  return {
    accounts: s.accounts,
    friendships: s.friendships ?? [],
    moments: s.moments.filter((m) => typeof m.media_path === "string" && !m.media_path.startsWith("blob:")),
    replies: s.replies ?? [],
    deletedIds: s.deletedIds ?? [],
    deletedMomentIds: s.deletedMomentIds ?? [],
    removedFriends,
    updatedAt: s.updatedAt ?? Date.now(),
  };
}

/** Pertemanan berlaku jika dibuat setelah waktu pemutusan terakhir pasangan tersebut. */
export function isFriendshipActive(f: Friendship, removed: Record<string, string>): boolean {
  const removedAt = removed[friendPairKey(f.user_id, f.friend_id)];
  return !removedAt || f.created_at > removedAt;
}

export function friendIdsOf(store: StoreShape, userId: string): Set<string> {
  return new Set(
    store.friendships
      .filter((f) => f.user_id === userId && isFriendshipActive(f, store.removedFriends))
      .map((f) => f.friend_id),
  );
}
