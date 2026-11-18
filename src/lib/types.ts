export type MediaType = "photo" | "video";

export interface PublicProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export interface Profile extends PublicProfile {
  invite_code: string;
  created_at: string;
}

export interface Reaction {
  id: string;
  moment_id?: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface Moment {
  id: string;
  user_id: string;
  media_path: string;
  media_type: MediaType;
  duration: number | null;
  caption: string | null;
  created_at: string;
  profile: PublicProfile | null;
  reactions: Reaction[];
}

export interface Reply {
  id: string;
  moment_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  sender: PublicProfile | null;
}

export type Tab = "camera" | "feed" | "memories";

/** "all" = semua, "me" = momen saya, selain itu = id sahabat */
export type FeedFilter = string;
