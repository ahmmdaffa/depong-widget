"use client";

import Link from "next/link";
import { useState } from "react";
import { errorMessage } from "@/lib/api";
import { loginLocalAccount, registerLocalAccount } from "@/lib/backendStore";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

export default function AuthView({
  onEnterDemo,
  onAuthenticated,
  notify,
}: {
  onEnterDemo: () => void;
  onAuthenticated: (profile: Profile) => void;
  notify: (msg: string) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      // Gunakan backend terintegrasi apabila Supabase eksternal belum dipasang
      if (!isSupabaseConfigured) {
        if (mode === "login") {
          const prof = await loginLocalAccount({
            emailOrUsername: email,
            password,
          });
          notify(`Selamat datang kembali, ${prof.display_name} 💛`);
          onAuthenticated(prof);
        } else {
          const prof = await registerLocalAccount({
            displayName,
            username,
            email,
            password,
          });
          notify(`Akun @${prof.username} berhasil dibuat & terhubung ke Admin 💛`);
          onAuthenticated(prof);
        }
        return;
      }

      const supabase = getSupabase();
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        notify("Selamat datang kembali 💛");
      } else {
        const cleanUser = username
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9_]/g, "");
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              display_name: displayName.trim() || cleanUser || "Sahabat",
              username: cleanUser || undefined,
            },
          },
        });
        if (error) throw error;
        if (data.session) {
          notify("Akun berhasil dibuat 💛");
        } else {
          notify("Cek inbox email kamu untuk verifikasi akun!");
        }
      }
    } catch (err) {
      notify(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-ink px-6 py-10 text-white">
      <div className="w-full max-w-sm space-y-5">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center">
          <div className="mb-3.5 flex h-20 w-20 items-center justify-center rounded-[28px] border-2 border-gold bg-panel shadow-[0_0_40px_rgba(245,196,81,0.25)]">
            <span className="h-9 w-9 rounded-full bg-gold" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Depong</h1>
          <p className="mt-1 text-sm text-muted">
            Foto & video 7 detik langsung ke layar sahabat terdekatmu.
          </p>
        </div>

        {/* Form Buat Akun / Masuk */}
        <div className="rounded-[32px] border border-white/10 bg-panel p-5 shadow-2xl">
          <div className="mb-4 grid grid-cols-2 rounded-full bg-panel-2 p-1 text-xs font-bold">
            <button
              type="button"
              onClick={() => setMode("register")}
              className={`rounded-full py-2 transition ${
                mode === "register" ? "bg-gold text-black" : "text-muted"
              }`}
            >
              Buat Akun Baru
            </button>
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`rounded-full py-2 transition ${
                mode === "login" ? "bg-gold text-black" : "text-muted"
              }`}
            >
              Masuk
            </button>
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === "register" && (
              <>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted">
                    Nama Panggilan
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={40}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Contoh: Daffa"
                    className="w-full rounded-2xl border border-white/10 bg-panel-2 px-4 py-2.5 text-sm text-white placeholder-white/35 outline-none focus:border-gold"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted">Username</label>
                  <input
                    type="text"
                    required
                    maxLength={24}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="daffa"
                    autoCapitalize="none"
                    autoCorrect="off"
                    className="w-full rounded-2xl border border-white/10 bg-panel-2 px-4 py-2.5 font-mono text-sm text-white placeholder-white/35 outline-none focus:border-gold"
                  />
                </div>
              </>
            )}

            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">
                {mode === "login" ? "Email atau Username" : "Email"}
              </label>
              <input
                type={mode === "login" ? "text" : "email"}
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={mode === "login" ? "nama@email.com atau @username" : "nama@email.com"}
                className="w-full rounded-2xl border border-white/10 bg-panel-2 px-4 py-2.5 text-sm text-white placeholder-white/35 outline-none focus:border-gold"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimal 6 karakter"
                className="w-full rounded-2xl border border-white/10 bg-panel-2 px-4 py-2.5 text-sm text-white placeholder-white/35 outline-none focus:border-gold"
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="mt-2 w-full rounded-full bg-gold py-3 text-sm font-extrabold text-black transition active:scale-98 disabled:opacity-50"
            >
              {busy ? "Memproses…" : mode === "login" ? "Masuk ke Depong" : "Daftar & Masuk"}
            </button>
          </form>
        </div>

        {/* Shortcut Masuk Instan & Dashboard Admin */}
        <div className="flex items-center justify-between gap-2.5 rounded-3xl border border-white/10 bg-panel px-4 py-3">
          <button
            type="button"
            onClick={onEnterDemo}
            className="text-xs font-bold text-white/85 underline decoration-gold/60 underline-offset-4 hover:text-gold"
          >
            Masuk Cepat (Akun Daffa)
          </button>

          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 rounded-full bg-gold/15 px-3.5 py-1.5 text-xs font-extrabold text-gold transition hover:bg-gold hover:text-black"
          >
            <span>🛡️ Dashboard Admin</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
