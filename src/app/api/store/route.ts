import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import {
  coerceStore,
  emptyStore,
  friendPairKey,
  isFriendshipActive,
  MEDIA_PLACEHOLDER,
  type StoreShape,
} from "@/lib/storeTypes";
import type { Moment } from "@/lib/types";

const STORE_FILE =
  process.env.VERCEL || process.env.NODE_ENV === "production"
    ? path.join("/tmp", "depong-store.json")
    : path.join(process.cwd(), ".depong-store.json");

async function readStore(): Promise<StoreShape> {
  try {
    const raw = await fs.readFile(STORE_FILE, "utf-8");
    const parsed = coerceStore(JSON.parse(raw));
    if (parsed) return parsed;
  } catch {
    // Buat store baru bila belum ada
  }
  const initial = emptyStore();
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

function recomputeStats(store: StoreShape): StoreShape {
  const deleted = new Set(store.deletedIds);
  const deletedMoments = new Set(store.deletedMomentIds);

  store.accounts = store.accounts.filter((a) => !deleted.has(a.id));
  store.moments = store.moments.filter(
    (m) =>
      !deleted.has(m.user_id) &&
      !deletedMoments.has(m.id) &&
      typeof m.media_path === "string" &&
      !m.media_path.startsWith("blob:") &&
      !m.media_path.startsWith("data:video/"),
  );
  store.friendships = store.friendships.filter(
    (f) =>
      !deleted.has(f.user_id) &&
      !deleted.has(f.friend_id) &&
      isFriendshipActive(f, store.removedFriends),
  );

  for (const acc of store.accounts) {
    const userMoments = store.moments.filter((m) => m.user_id === acc.id);
    acc.moments_count = userMoments.length;
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

  if (body.clientStore) {
    const cs = body.clientStore;
    const deleted = new Set([...store.deletedIds, ...(cs.deletedIds ?? [])]);
    store.deletedIds = [...deleted];

    const deletedMoments = new Set([
      ...store.deletedMomentIds,
      ...(cs.deletedMomentIds ?? []),
    ]);
    store.deletedMomentIds = [...deletedMoments];

    if (cs.removedFriends && typeof cs.removedFriends === "object") {
      for (const [k, v] of Object.entries(cs.removedFriends)) {
        const cur = store.removedFriends[k];
        if (!cur || v > cur) store.removedFriends[k] = v;
      }
    }

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
          !m.media_path ||
          m.media_path.startsWith("blob:") ||
          m.media_path.startsWith("data:video/")
        ) {
          continue;
        }
        const existing = byId.get(m.id);
        if (existing) {
          byId.set(m.id, {
            ...existing,
            ...m,
            media_path:
              m.media_path !== MEDIA_PLACEHOLDER ? m.media_path : existing.media_path,
            reactions:
              (m.reactions?.length ?? 0) >= (existing.reactions?.length ?? 0)
                ? m.reactions
                : existing.reactions,
          });
        } else if (m.media_path !== MEDIA_PLACEHOLDER) {
          byId.set(m.id, m);
        }
      }
      store.moments = [...byId.values()]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 120);
    }

    if (Array.isArray(cs.friendships)) {
      const key = (f: { user_id: string; friend_id: string }) => `${f.user_id}:${f.friend_id}`;
      const byKey = new Map(store.friendships.map((f) => [key(f), f]));
      for (const f of cs.friendships) {
        if (
          !deleted.has(f.user_id) &&
          !deleted.has(f.friend_id) &&
          isFriendshipActive(f, store.removedFriends)
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
    delete store.removedFriends[pair];
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
    store.removedFriends[pair] = new Date().toISOString();
    store.friendships = store.friendships.filter(
      (f) => friendPairKey(f.user_id, f.friend_id) !== pair,
    );
  }

  if (body.action === "create_moment" && p.moment && typeof p.moment === "object") {
    const incoming = p.moment as Moment;
    if (
      incoming.id &&
      incoming.media_path &&
      !incoming.media_path.startsWith("blob:") &&
      !incoming.media_path.startsWith("data:video/")
    ) {
      store.moments = [
        incoming,
        ...store.moments.filter((m) => m.id !== incoming.id),
      ].slice(0, 120);
    }
  }

  if (body.action === "delete_moment" && typeof p.momentId === "string") {
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
