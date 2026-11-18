import { getSupabase, MEDIA_BUCKET } from "./supabase";
import { baseMime, extFromMime } from "./media";
import type { MediaType, Moment, Profile, PublicProfile, Reply } from "./types";

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
