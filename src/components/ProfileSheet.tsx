"use client";

import { useState } from "react";
import { errorMessage, updateDisplayName } from "@/lib/api";
import type { Profile } from "@/lib/types";
import Avatar from "./Avatar";
import { IconLogout } from "./Icons";
import Sheet from "./Sheet";

export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function ProfileSheet({
  open,
  onClose,
  profile,
  email,
  installPrompt,
  onInstalled,
  notify,
  onChanged,
  onLogout,
}: {
  open: boolean;
  onClose: () => void;
  profile: Profile;
  email: string;
  installPrompt: InstallPromptEvent | null;
  onInstalled: () => void;
  notify: (msg: string) => void;
  onChanged: () => void;
  onLogout: () => void;
}) {
  const [name, setName] = useState(profile.display_name);
  const [saving, setSaving] = useState(false);

  const isIOS =
    typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

  async function save() {
    const value = name.trim();
    if (!value || value === profile.display_name) return;
    setSaving(true);
    try {
      await updateDisplayName(profile.id, value.slice(0, 40));
      notify("Nama diperbarui");
      onChanged();
    } catch (err) {
      notify(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") onInstalled();
  }

  return (
    <Sheet open={open} onClose={onClose} title="Profil">
      <div className="flex flex-col items-center gap-2 py-2">
        <Avatar profile={profile} size={80} ring />
        <div className="text-lg font-bold">{profile.display_name}</div>
        <div className="text-xs text-muted">
          @{profile.username} · {email}
        </div>
      </div>

      <label className="mt-4 block text-xs font-semibold text-muted">Nama tampilan</label>
      <div className="mt-1.5 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          className="min-w-0 flex-1 rounded-full border border-white/10 bg-panel-2 px-4 py-2.5 text-sm outline-none focus:border-gold"
        />
        <button
          onClick={save}
          disabled={saving || !name.trim() || name.trim() === profile.display_name}
          className="rounded-full bg-gold px-4 text-sm font-bold text-black disabled:opacity-40"
        >
          Simpan
        </button>
      </div>

      {/* Panduan install PWA */}
      <div className="mt-5 rounded-3xl border border-white/10 bg-ink p-4">
        <div className="text-sm font-bold">📲 Pasang di layar utama</div>
        {installPrompt ? (
          <>
            <p className="mt-1 text-xs text-muted">Install Depong seperti aplikasi biasa.</p>
            <button onClick={install} className="mt-3 w-full rounded-full bg-gold py-2.5 text-sm font-bold text-black">
              Install sekarang
            </button>
          </>
        ) : isIOS ? (
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-muted">
            <li>Buka Depong di Safari</li>
            <li>
              Tap tombol <b className="text-white">Share</b> (kotak dengan panah ke atas)
            </li>
            <li>
              Pilih <b className="text-white">Add to Home Screen</b>
            </li>
          </ol>
        ) : (
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-muted">
            <li>Buka Depong di Chrome</li>
            <li>
              Tap menu <b className="text-white">⋮</b> di kanan atas
            </li>
            <li>
              Pilih <b className="text-white">Install app / Tambahkan ke layar utama</b>
            </li>
          </ol>
        )}
      </div>

      <button
        onClick={onLogout}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-panel-2 py-3 text-sm font-semibold text-red-400"
      >
        <IconLogout size={16} /> Keluar / Ganti Akun
      </button>
    </Sheet>
  );
}
