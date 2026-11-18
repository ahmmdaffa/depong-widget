import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { createDemoAdminUsers, createInitialDemoMoments } from "@/lib/demoData";
import type { AdminUserSummary, Moment, Reply } from "@/lib/types";

export interface StoredAccount extends AdminUserSummary {
  password?: string;
}

export interface StoreShape {
  accounts: StoredAccount[];
  friendships: { user_id: string; friend_id: string; created_at: string }[];
  moments: Moment[];
  replies: Reply[];
  deletedIds: string[];
  deletedMomentIds?: string[];
  removedFriendKeys?: string[];
  updatedAt: number;
}

const STORE_FILE =
  process.env.VERCEL || process.env.NODE_ENV === "production"
    ? path.join("/tmp", "depong-store.json")
    : path.join(process.cwd(), ".depong-store.json");

function createDefaultStore(): StoreShape {
  const seedUsers = createDemoAdminUsers();
  const seedMoments = createInitialDemoMoments();
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

async function readStore(): Promise<StoreShape> {
  try {
    const raw = await fs.readFile(STORE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    if (Array.isArray(parsed.accounts) && Array.isArray(parsed.moments)) {
      return {
        accounts: parsed.accounts,
        friendships: parsed.friendships ?? [],
        moments: parsed.moments,
        replies: parsed.replies ?? [],
        deletedIds: parsed.deletedIds ?? [],
        deletedMomentIds: parsed.deletedMomentIds ?? [],
        removedFriendKeys: parsed.removedFriendKeys ?? [],
        updatedAt: parsed.updatedAt ?? Date.now(),
      };
    }
  } catch {
    // File belum ada, buat default
  }
  const initial = createDefaultStore();
  await writeStore(initial);
  return initial;
}

async function writeStore(store: StoreShape): Promise<void> {
  try {
    await fs.writeFile(STORE_FILE, JSON.stringify(store), "utf-8");
  } catch {
    // Abaikan jika filesystem read-only
  }
}

function friendPairKey(u1: string, u2: string): string {
  return u1 < u2 ? `${u1}:${u2}` : `${u2}:${u1}`;
}

function recomputeStats(store: StoreShape): StoreShape {
  const deleted = new Set(store.deletedIds);
  const deletedMoments = new Set(store.deletedMomentIds ?? []);
  const removedFriends = new Set(store.removedFriendKeys ?? []);

  store.accounts = store.accounts.filter((a) => !deleted.has(a.id));
  store.moments = store.moments.filter(
    (m) =>
      !deleted.has(m.user_id) &&
      !deletedMoments.has(m.id) &&
      !m.media_path.startsWith("blob:"),
  );
  store.friendships = store.friendships.filter(
    (f) =>
      !deleted.has(f.user_id) &&
      !deleted.has(f.friend_id) &&
      !removedFriends.has(friendPairKey(f.user_id, f.friend_id)),
  );

  for (const acc of store.accounts) {
    const userMoments = store.moments.filter((m) => m.user_id === acc.id);
    acc.moments_count = userMoments.length;
    acc.videos_count = userMoments.filter((m) => m.media_type === "video").length;
    const latest = userMoments
      .map((m) => m.created_at)
      .sort()
      .at(-1);
    if (latest && latest > acc.last_active_at) {
      acc.last_active_at = latest;
    }

    const friendSet = new Set(
      store.friendships.filter((f) => f.user_id === acc.id).map((f) => f.friend_id),
    );
    acc.friends_count = friendSet.size;
  }

  return store;
}

export async function GET() {
  const store = recomputeStats(await readStore());
  return NextResponse.json(store);
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    action: string;
    payload?: Record<string, unknown>;
    clientStore?: Partial<StoreShape>;
  };

  const store = await readStore();

  // Sinkronkan data dari client agar akun baru tidak pernah hilang di serverless
  if (body.clientStore) {
    const cs = body.clientStore;
    const deleted = new Set([...(store.deletedIds ?? []), ...(cs.deletedIds ?? [])]);
    store.deletedIds = [...deleted];

    const deletedMoments = new Set([
      ...(store.deletedMomentIds ?? []),
      ...(cs.deletedMomentIds ?? []),
    ]);
    store.deletedMomentIds = [...deletedMoments];

    const removedFriends = new Set([
      ...(store.removedFriendKeys ?? []),
      ...(cs.removedFriendKeys ?? []),
    ]);
    store.removedFriendKeys = [...removedFriends];

    if (Array.isArray(cs.accounts)) {
      const byId = new Map(store.accounts.map((a) => [a.id, a]));
      for (const acc of cs.accounts) {
        if (!deleted.has(acc.id)) {
          byId.set(acc.id, { ...byId.get(acc.id), ...acc });
        }
      }
      store.accounts = [...byId.values()];
    }

    if (Array.isArray(cs.moments)) {
      const byId = new Map(store.moments.map((m) => [m.id, m]));
      for (const m of cs.moments) {
        if (
          deleted.has(m.user_id) ||
          deletedMoments.has(m.id) ||
          m.media_path.startsWith("blob:")
        ) {
          continue;
        }
        const existing = byId.get(m.id);
        if (existing) {
          byId.set(m.id, {
            ...existing,
            ...m,
            media_path:
              m.media_path && m.media_path !== "__SERVER_CACHED__"
                ? m.media_path
                : existing.media_path,
            reactions:
              (m.reactions?.length ?? 0) >= (existing.reactions?.length ?? 0)
                ? m.reactions
                : existing.reactions,
          });
        } else if (m.media_path && m.media_path !== "__SERVER_CACHED__") {
          byId.set(m.id, m);
        }
      }
      store.moments = [...byId.values()]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 60);
    }

    if (Array.isArray(cs.friendships)) {
      const key = (f: { user_id: string; friend_id: string }) => `${f.user_id}:${f.friend_id}`;
      const byKey = new Map(store.friendships.map((f) => [key(f), f]));
      for (const f of cs.friendships) {
        if (
          !deleted.has(f.user_id) &&
          !deleted.has(f.friend_id) &&
          !removedFriends.has(friendPairKey(f.user_id, f.friend_id))
        ) {
          byKey.set(key(f), f);
        }
      }
      store.friendships = [...byKey.values()];
    }

    if (Array.isArray(cs.replies)) {
      const byId = new Map(store.replies.map((r) => [r.id, r]));
      for (const r of cs.replies) byId.set(r.id, r);
      store.replies = [...byId.values()];
    }
  }

  const p = body.payload ?? {};

  if (
    body.action === "add_friend" &&
    typeof p.userId === "string" &&
    typeof p.friendId === "string"
  ) {
    const pair = friendPairKey(p.userId, p.friendId);
    store.removedFriendKeys = (store.removedFriendKeys ?? []).filter((k) => k !== pair);
    const nowIso = new Date().toISOString();
    const has1 = store.friendships.some(
      (f) => f.user_id === p.userId && f.friend_id === p.friendId,
    );
    const has2 = store.friendships.some(
      (f) => f.user_id === p.friendId && f.friend_id === p.userId,
    );
    if (!has1) {
      store.friendships.push({ user_id: p.userId, friend_id: p.friendId, created_at: nowIso });
    }
    if (!has2) {
      store.friendships.push({ user_id: p.friendId, friend_id: p.userId, created_at: nowIso });
    }
  }

  if (
    body.action === "remove_friend" &&
    typeof p.userId === "string" &&
    typeof p.friendId === "string"
  ) {
    const pair = friendPairKey(p.userId, p.friendId);
    if (!store.removedFriendKeys) store.removedFriendKeys = [];
    if (!store.removedFriendKeys.includes(pair)) {
      store.removedFriendKeys.push(pair);
    }
    store.friendships = store.friendships.filter(
      (f) => friendPairKey(f.user_id, f.friend_id) !== pair,
    );
  }

  if (body.action === "create_moment" && p.moment && typeof p.moment === "object") {
    const incoming = p.moment as Moment;
    if (incoming.id && incoming.media_path && !incoming.media_path.startsWith("blob:")) {
      store.moments = [
        incoming,
        ...store.moments.filter((m) => m.id !== incoming.id),
      ].slice(0, 60);
    }
  }

  if (body.action === "delete_moment" && typeof p.momentId === "string") {
    if (!store.deletedMomentIds) store.deletedMomentIds = [];
    if (!store.deletedMomentIds.includes(p.momentId)) {
      store.deletedMomentIds.push(p.momentId);
    }
    store.moments = store.moments.filter((m) => m.id !== p.momentId);
  }

  if (body.action === "delete_user" && typeof p.userId === "string") {
    const uid = p.userId;
    if (!store.deletedIds.includes(uid)) store.deletedIds.push(uid);
  }

  store.updatedAt = Date.now();
  recomputeStats(store);
  await writeStore(store);

  return NextResponse.json(store);
}
