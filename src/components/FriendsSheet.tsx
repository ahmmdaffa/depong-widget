"use client";

import { useState } from "react";
import { addFriendByCode, errorMessage, removeFriend } from "@/lib/api";
import type { Profile, PublicProfile } from "@/lib/types";
import Avatar from "./Avatar";
import { IconCopy, IconShare, IconTrash } from "./Icons";
import Sheet from "./Sheet";

export const MAX_FRIENDS = 20;

export default function FriendsSheet({
  open,
  onClose,
  profile,
  friends,
  notify,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  profile: Profile;
  friends: PublicProfile[];
  notify: (msg: string) => void;
  onChanged: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const inviteLink =
    typeof window !== "undefined" ? `${window.location.origin}/?invite=${profile.invite_code}` : "";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      notify("Link undangan disalin 📋");
    } catch {
      notify(inviteLink);
    }
  }

  async function shareLink() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Depong",
          text: `Yuk jadi sahabatku di Depong! Kode: ${profile.invite_code}`,
          url: inviteLink,
        });
      } catch {
        /* dibatalkan */
      }
    } else {
      void copyLink();
    }
  }

  async function addFriend() {
    const value = code.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      const friend = await addFriendByCode(value, profile.id);
      notify(`${friend.display_name} sekarang sahabatmu 💛`);
      setCode("");
      onChanged();
    } catch (err) {
      notify(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(friend: PublicProfile) {
    if (!window.confirm(`Hapus ${friend.display_name} dari sahabat?`)) return;
    try {
      await removeFriend(friend.id, profile.id);
      notify(`${friend.display_name} dihapus`);
      onChanged();
    } catch (err) {
      notify(errorMessage(err));
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Sahabat (${friends.length}/${MAX_FRIENDS})`}
      subtitle="Momenmu langsung muncul di layar mereka"
    >
      {/* Kode undangan saya */}
      <div className="rounded-3xl border border-white/10 bg-ink p-4">
        <div className="text-xs text-muted">Kode undangan kamu</div>
        <div className="mt-1 font-mono text-2xl font-bold tracking-[0.2em] text-gold">{profile.invite_code}</div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={copyLink}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-panel-2 py-2 text-sm font-semibold"
          >
            <IconCopy size={16} /> Salin link
          </button>
          <button
            onClick={shareLink}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-gold py-2 text-sm font-bold text-black"
          >
            <IconShare size={16} /> Bagikan
          </button>
        </div>
      </div>

      {/* Tambah lewat kode */}
      <div className="mt-4 flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addFriend()}
          placeholder="Masukkan kode sahabat"
          className="min-w-0 flex-1 rounded-full border border-white/10 bg-panel-2 px-4 py-2.5 font-mono text-sm outline-none focus:border-gold"
          autoCapitalize="none"
          autoCorrect="off"
        />
        <button
          onClick={addFriend}
          disabled={busy || !code.trim()}
          className="rounded-full bg-white px-4 text-sm font-bold text-black disabled:opacity-40"
        >
          {busy ? "…" : "Tambah"}
        </button>
      </div>

      {/* Daftar sahabat */}
      <div className="mt-5 space-y-2">
        {friends.length === 0 ? (
          <p className="rounded-2xl bg-panel-2 p-4 text-center text-sm text-muted">
            Belum ada sahabat. Bagikan kode undanganmu ke teman dekat!
          </p>
        ) : (
          friends.map((f) => (
            <div key={f.id} className="flex items-center gap-3 rounded-2xl bg-panel-2 p-2.5">
              <Avatar profile={f} size={38} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{f.display_name}</div>
                <div className="truncate text-xs text-muted">@{f.username}</div>
              </div>
              <button
                onClick={() => remove(f)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:text-red-400"
                aria-label={`Hapus ${f.display_name}`}
              >
                <IconTrash size={16} />
              </button>
            </div>
          ))
        )}
      </div>
    </Sheet>
  );
}
