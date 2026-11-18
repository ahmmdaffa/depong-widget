"use client";

import { useState } from "react";
import { errorMessage } from "@/lib/api";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

export default function AuthView({
  onEnterDemo,
  notify,
}: {
  onEnterDemo: () => void;
  notify: (msg: string) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isSupabaseConfigured) {
      notify("Supabase belum dikonfigurasi di .env.local — gunakan Mode Demo terlebih dahulu.");
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
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
      <div className="w-full max-w-sm space-y-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-[28px] border-2 border-gold bg-panel shadow-[0_0_40px_rgba(245,196,81,0.25)]">
            <span className="h-9 w-9 rounded-full bg-gold" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Depong</h1>
          <p className="mt-1.5 text-sm text-muted">
            Foto & video 7 detik langsung ke layar sahabat terdekatmu.
          </p>
        </div>

        {/* Tombol Mode Demo Instan */}
        <div className="rounded-3xl border border-gold/30 bg-panel p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold tracking-wider text-gold uppercase">
                Coba Tanpa Login
              </div>
              <p className="mt-0.5 text-xs text-muted">
                Tes kamera, rekam video 7 detik, feed & kalender langsung di browser.
              </p>
            </div>
            <button
              type="button"
              onClick={onEnterDemo}
              className="shrink-0 rounded-full bg-gold px-4 py-2 text-xs font-extrabold text-black transition active:scale-95"
            >
              Buka Demo
            </button>
          </div>
        </div>

        {/* Form Login / Register Supabase */}
        <div className="rounded-[32px] border border-white/10 bg-panel p-5">
          <div className="mb-4 grid grid-cols-2 rounded-full bg-panel-2 p-1 text-xs font-bold">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`rounded-full py-2 transition ${
                mode === "login" ? "bg-gold text-black" : "text-muted"
              }`}
            >
              Masuk
            </button>
            <button
              type="button"
              onClick={() => setMode("register")}
              className={`rounded-full py-2 transition ${
                mode === "register" ? "bg-gold text-black" : "text-muted"
              }`}
            >
              Daftar
            </button>
          </div>

          {!isSupabaseConfigured && (
            <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
              <b>Info Setup:</b> Variabel <code className="font-mono">.env.local</code> Supabase belum
              diisi. Kamu tetap bisa mencoba seluruh fitur sekarang lewat tombol{" "}
              <b>Buka Demo</b> di atas.
            </div>
          )}

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
              <label className="mb-1 block text-xs font-semibold text-muted">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@email.com"
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
              className="mt-2 w-full rounded-full bg-white py-3 text-sm font-extrabold text-black transition active:scale-98 disabled:opacity-50"
            >
              {busy ? "Memproses…" : mode === "login" ? "Masuk ke Depong" : "Buat Akun Baru"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
