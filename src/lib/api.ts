import { getSupabase, MEDIA_BUCKET } from "./supabase";
import { baseMime, extFromMime } from "./media";
import type {
  AdminUserSummary,
  MediaType,
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
  const { data, error } = await getSupabase()
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export async function updateDisplayName(userId: string, displayName: string) {
  const { error } = await getSupabase()
    .from("profiles")
    .update({ display_name: displayName })
    .eq("id", userId);
  if (error) throw error;
}

export async function fetchFriends(userId: string): Promise<PublicProfile[]> {
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

export async function addFriendByCode(code: string): Promise<PublicProfile> {
  const { data, error } = await getSupabase().rpc("add_friend_by_code", { code });
  if (error) throw error;
  return data as PublicProfile;
}

export async function removeFriend(friendId: string) {
  const { error } = await getSupabase().rpc("remove_friend", { target: friendId });
  if (error) throw error;
}

/** Ambil momen milik sendiri + sahabat (difilter otomatis oleh RLS). */
export async function fetchMoments(): Promise<Moment[]> {
  const { data, error } = await getSupabase()
    .from("moments")
    .select(
      `id,user_id,media_path,media_type,duration,caption,created_at,
       profile:profiles(${PROFILE_FIELDS}),
       reactions(id,user_id,emoji,created_at)`,
    )
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data ?? []) as unknown as Moment[];
}

export async function uploadMoment(input: {
  userId: string;
  blob: Blob;
  mime: string;
  mediaType: MediaType;
  duration: number | null;
  caption: string;
}) {
  const supabase = getSupabase();
  const contentType = baseMime(input.mime || input.blob.type || "image/jpeg");
  const path = `${input.userId}/${crypto.randomUUID()}.${extFromMime(contentType)}`;

  const { error: uploadError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, input.blob, { contentType, cacheControl: "31536000", upsert: false });
  if (uploadError) throw uploadError;

  const { error } = await supabase.from("moments").insert({
    user_id: input.userId,
    media_path: path,
    media_type: input.mediaType,
    duration: input.duration,
    caption: input.caption.trim() || null,
  });
  if (error) {
    await supabase.storage.from(MEDIA_BUCKET).remove([path]);
    throw error;
  }
}

export async function deleteMoment(moment: Pick<Moment, "id" | "media_path">) {
  const supabase = getSupabase();
  const { error } = await supabase.from("moments").delete().eq("id", moment.id);
  if (error) throw error;
  await supabase.storage.from(MEDIA_BUCKET).remove([moment.media_path]);
}

export async function addReaction(momentId: string, userId: string, emoji: string) {
  const { error } = await getSupabase()
    .from("reactions")
    .insert({ moment_id: momentId, user_id: userId, emoji });
  if (error) throw error;
}

export async function sendReply(momentId: string, senderId: string, body: string) {
  const { error } = await getSupabase()
    .from("replies")
    .insert({ moment_id: momentId, sender_id: senderId, body: body.trim() });
  if (error) throw error;
}

export async function fetchReplies(momentId: string): Promise<Reply[]> {
  const { data, error } = await getSupabase()
    .from("replies")
    .select(`*, sender:profiles!replies_sender_id_fkey(${PROFILE_FIELDS})`)
    .eq("moment_id", momentId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Reply[];
}

/** Ambil daftar seluruh user yang membuat akun untuk halaman Admin. */
export async function fetchAdminUsers(): Promise<AdminUserSummary[]> {
  const supabase = getSupabase();

  // Coba panggil RPC admin_list_users terlebih dahulu (lengkap dengan statistik)
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
      videos_count: Number(row.videos_count ?? 0),
      friends_count: Number(row.friends_count ?? 0),
      last_active_at: String(row.last_active_at ?? row.created_at),
    }));
  }

  // Fallback langsung ke tabel profiles jika fungsi RPC belum dijalankan
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
    videos_count: 0,
    friends_count: 0,
    last_active_at: p.created_at,
  }));
}
