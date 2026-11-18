import {
  createLocalMomentRecord,
  deleteLocalAccount,
  loadLocalStore,
  saveLocalStore,
  syncWithServerStore,
  toProfile,
  toPublicProfile,
} from "./backendStore";
import { friendIdsOf, friendPairKey } from "./storeTypes";
import { getSupabase, isSupabaseConfigured, MEDIA_BUCKET } from "./supabase";
import type {
  AdminUserSummary,
  Moment,
  Profile,
  PublicProfile,
  Reply,
} from "./types";

const PROFILE_FIELDS = "id,username,display_name,avatar_url";

export function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    const msg = String((err as { message: unknown }).message);
    if (msg.includes("Invalid login credentials")) return "Email atau password salah";
    if (msg.includes("User already registered")) return "Email sudah terdaftar, silakan masuk";
    if (msg.includes("Email not confirmed")) return "Email belum dikonfirmasi, cek inbox kamu";
    return msg;
  }
  return "Terjadi kesalahan, coba lagi";
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  if (!isSupabaseConfigured) {
    const store = await syncWithServerStore();
    const acc = store.accounts.find((a) => a.id === userId);
    return acc ? toProfile(acc) : null;
  }
  const { data, error } = await getSupabase()
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export async function updateDisplayName(userId: string, displayName: string) {
  if (!isSupabaseConfigured) {
    const store = loadLocalStore();
    const acc = store.accounts.find((a) => a.id === userId);
    if (acc) {
      acc.display_name = displayName;
      acc.last_active_at = new Date().toISOString();
      store.updatedAt = Date.now();
      saveLocalStore(store, true);
      await syncWithServerStore("update_profile");
    }
    return;
  }
  const { error } = await getSupabase()
    .from("profiles")
    .update({ display_name: displayName })
    .eq("id", userId);
  if (error) throw error;
}

export async function fetchFriends(userId: string): Promise<PublicProfile[]> {
  if (!isSupabaseConfigured) {
    const store = loadLocalStore();
    const friendIds = friendIdsOf(store, userId);
    return store.accounts.filter((a) => friendIds.has(a.id)).map(toPublicProfile);
  }
  const { data, error } = await getSupabase()
    .from("friendships")
    .select(`created_at, friend:profiles!friendships_friend_id_fkey(${PROFILE_FIELDS})`)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? [])
    .map((row) => (row as unknown as { friend: PublicProfile | null }).friend)
    .filter((f): f is PublicProfile => Boolean(f));
}

export async function addFriendByCode(code: string, currentUserId?: string): Promise<PublicProfile> {
  if (!isSupabaseConfigured) {
    const store = await syncWithServerStore();
    const clean = code.trim().toLowerCase();
    const target = store.accounts.find(
      (a) => a.invite_code.toLowerCase() === clean || a.username.toLowerCase() === clean,
    );
    if (!target) {
      throw new Error("Kode undangan tidak ditemukan");
    }
    const uid = currentUserId;
    if (!uid) throw new Error("Silakan masuk terlebih dahulu");
    if (target.id === uid) {
      throw new Error("Itu kode undangan kamu sendiri");
    }
    const pair = friendPairKey(uid, target.id);
    delete store.removedFriends[pair];

    const exists = store.friendships.some(
      (f) => f.user_id === uid && f.friend_id === target.id,
    );
    if (!exists) {
      const nowIso = new Date().toISOString();
      store.friendships.push({ user_id: uid, friend_id: target.id, created_at: nowIso });
      store.friendships.push({ user_id: target.id, friend_id: uid, created_at: nowIso });
      store.updatedAt = Date.now();
      saveLocalStore(store, true);
      await syncWithServerStore("add_friend", { userId: uid, friendId: target.id });
    }
    return toPublicProfile(target);
  }
  const { data, error } = await getSupabase().rpc("add_friend_by_code", { code });
  if (error) throw error;
  return data as PublicProfile;
}

export async function removeFriend(friendId: string, currentUserId?: string) {
  if (!isSupabaseConfigured) {
    const store = loadLocalStore();
    const uid = currentUserId;
    if (uid) {
      const pair = friendPairKey(uid, friendId);
      store.removedFriends[pair] = new Date().toISOString();
      store.friendships = store.friendships.filter(
        (f) => friendPairKey(f.user_id, f.friend_id) !== pair,
      );
      store.updatedAt = Date.now();
      saveLocalStore(store, true);
      await syncWithServerStore("remove_friend", { userId: uid, friendId });
    }
    return;
  }
  const { error } = await getSupabase().rpc("remove_friend", { target: friendId });
  if (error) throw error;
}

/** Ambil foto milik sendiri + sahabat yang sudah saling invite pertemanan saja. */
export async function fetchMoments(currentUserId?: string): Promise<Moment[]> {
  if (!isSupabaseConfigured) {
    const store = await syncWithServerStore();
    if (!currentUserId) return [];
    const accMap = new Map(store.accounts.map((a) => [a.id, toPublicProfile(a)]));
    const activeFriends = friendIdsOf(store, currentUserId);
    saveLocalStore(store, false);

    return store.moments
      .filter((m) => m.user_id === currentUserId || activeFriends.has(m.user_id))
      .map((m) => ({
        ...m,
        profile: m.profile ?? accMap.get(m.user_id) ?? null,
      }));
  }
  const { data, error } = await getSupabase()
    .from("moments")
    .select(
      `id,user_id,media_path,caption,created_at,
       profile:profiles(${PROFILE_FIELDS}),
       reactions(id,user_id,emoji,created_at)`,
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as unknown as Moment[];
}

export async function uploadMoment(input: {
  userId: string;
  blob: Blob;
  caption: string;
}) {
  if (!isSupabaseConfigured) {
    await createLocalMomentRecord(input);
    return;
  }
  const supabase = getSupabase();
  const path = `${input.userId}/${crypto.randomUUID()}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, input.blob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
  if (uploadError) throw uploadError;

  const { error } = await supabase.from("moments").insert({
    user_id: input.userId,
    media_path: path,
    media_type: "photo",
    caption: input.caption.trim() || null,
  });
  if (error) {
    await supabase.storage.from(MEDIA_BUCKET).remove([path]);
    throw error;
  }
}

export async function deleteMoment(moment: Pick<Moment, "id" | "media_path">) {
  if (!isSupabaseConfigured) {
    const store = loadLocalStore();
    if (!store.deletedMomentIds.includes(moment.id)) {
      store.deletedMomentIds.push(moment.id);
    }
    store.moments = store.moments.filter((m) => m.id !== moment.id);
    store.updatedAt = Date.now();
    saveLocalStore(store, true);
    await syncWithServerStore("delete_moment", { momentId: moment.id });
    return;
  }
  const supabase = getSupabase();
  const { error } = await supabase.from("moments").delete().eq("id", moment.id);
  if (error) throw error;
  await supabase.storage.from(MEDIA_BUCKET).remove([moment.media_path]);
}

export async function addReaction(momentId: string, userId: string, emoji: string) {
  if (!isSupabaseConfigured) {
    const store = loadLocalStore();
    const target = store.moments.find((m) => m.id === momentId);
    if (target) {
      target.reactions.push({
        id: `rct-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        moment_id: momentId,
        user_id: userId,
        emoji,
        created_at: new Date().toISOString(),
      });
      store.updatedAt = Date.now();
      saveLocalStore(store, true);
      void syncWithServerStore("add_reaction");
    }
    return;
  }
  const { error } = await getSupabase()
    .from("reactions")
    .insert({ moment_id: momentId, user_id: userId, emoji });
  if (error) throw error;
}

export async function sendReply(momentId: string, senderId: string, body: string) {
  if (!isSupabaseConfigured) {
    const store = loadLocalStore();
    const sender = store.accounts.find((a) => a.id === senderId);
    store.replies.push({
      id: `rep-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      moment_id: momentId,
      sender_id: senderId,
      body: body.trim(),
      created_at: new Date().toISOString(),
      sender: sender ? toPublicProfile(sender) : null,
    });
    store.updatedAt = Date.now();
    saveLocalStore(store, true);
    void syncWithServerStore("send_reply");
    return;
  }
  const { error } = await getSupabase()
    .from("replies")
    .insert({ moment_id: momentId, sender_id: senderId, body: body.trim() });
  if (error) throw error;
}

export async function fetchReplies(momentId: string): Promise<Reply[]> {
  if (!isSupabaseConfigured) {
    const store = loadLocalStore();
    return store.replies.filter((r) => r.moment_id === momentId);
  }
  const { data, error } = await getSupabase()
    .from("replies")
    .select(`*, sender:profiles!replies_sender_id_fkey(${PROFILE_FIELDS})`)
    .eq("moment_id", momentId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Reply[];
}

/** Ambil daftar seluruh user yang membuat akun untuk halaman Super Admin. */
export async function fetchAdminUsers(): Promise<AdminUserSummary[]> {
  if (!isSupabaseConfigured) {
    const store = await syncWithServerStore();
    return store.accounts;
  }

  const supabase = getSupabase();
  const rpcRes = await supabase.rpc("admin_list_users");
  if (!rpcRes.error && Array.isArray(rpcRes.data)) {
    return rpcRes.data.map((row) => ({
      id: String(row.id),
      username: String(row.username),
      display_name: String(row.display_name),
      email: row.email ? String(row.email) : null,
      avatar_url: row.avatar_url ? String(row.avatar_url) : null,
      invite_code: String(row.invite_code),
      created_at: String(row.created_at),
      moments_count: Number(row.moments_count ?? 0),
      friends_count: Number(row.friends_count ?? 0),
      last_active_at: String(row.last_active_at ?? row.created_at),
    }));
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;

  return ((data ?? []) as Profile[]).map((p) => ({
    id: p.id,
    username: p.username,
    display_name: p.display_name,
    email: p.email ?? null,
    avatar_url: p.avatar_url,
    invite_code: p.invite_code,
    created_at: p.created_at,
    moments_count: 0,
    friends_count: 0,
    last_active_at: p.created_at,
  }));
}

/** Ambil seluruh foto yang diunggah semua pengguna untuk Galeri Super Admin. */
export async function fetchAdminMoments(): Promise<Moment[]> {
  if (!isSupabaseConfigured) {
    const store = await syncWithServerStore();
    const accMap = new Map(store.accounts.map((a) => [a.id, toPublicProfile(a)]));
    return store.moments.map((m) => ({
      ...m,
      profile: m.profile ?? accMap.get(m.user_id) ?? null,
    }));
  }

  const { data, error } = await getSupabase()
    .from("moments")
    .select(
      `id,user_id,media_path,caption,created_at,
       profile:profiles(${PROFILE_FIELDS}),
       reactions(id,user_id,emoji,created_at)`,
    )
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data ?? []) as unknown as Moment[];
}

/** Ambil daftar akun + galeri foto dalam satu request tunggal untuk Dashboard Super Admin. */
export async function fetchAdminSnapshot(): Promise<{
  users: AdminUserSummary[];
  moments: Moment[];
}> {
  if (!isSupabaseConfigured) {
    const store = await syncWithServerStore();
    const accMap = new Map(store.accounts.map((a) => [a.id, toPublicProfile(a)]));
    return {
      users: store.accounts,
      moments: store.moments.map((m) => ({
        ...m,
        profile: m.profile ?? accMap.get(m.user_id) ?? null,
      })),
    };
  }
  const [users, moments] = await Promise.all([fetchAdminUsers(), fetchAdminMoments()]);
  return { users, moments };
}

/** Hapus akun pengguna dari Dashboard Super Admin. */
export async function deleteAdminUser(userId: string): Promise<void> {
  if (!isSupabaseConfigured) {
    await deleteLocalAccount(userId);
    return;
  }
  const supabase = getSupabase();
  const rpcRes = await supabase.rpc("admin_delete_user", { target_user_id: userId });
  if (!rpcRes.error) return;

  const { error } = await supabase.from("profiles").delete().eq("id", userId);
  if (error) throw error;
}
