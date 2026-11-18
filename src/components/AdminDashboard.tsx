"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { deleteAdminUser, errorMessage, fetchAdminUsers } from "@/lib/api";
import {
  isSuperAdminAuthenticated,
  registerLocalAccount,
  setSuperAdminAuthenticated,
  subscribeStoreChanges,
  SUPER_ADMIN_EMAIL,
  verifySuperAdminCredentials,
} from "@/lib/backendStore";
import { createDemoAdminUsers } from "@/lib/demoData";
import { clockTime, dayKey, timeAgo } from "@/lib/format";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import type { AdminUserSummary } from "@/lib/types";
import Avatar from "./Avatar";
import {
  IconCamera,
  IconChevronLeft,
  IconCopy,
  IconDownload,
  IconLogout,
  IconTrash,
  IconUsers,
  IconX,
} from "./Icons";

type FilterPeriod = "all" | "today" | "week" | "with_video";
type SortBy = "newest" | "oldest" | "most_moments" | "name";

export default function AdminDashboard() {
  const [unlocked, setUnlocked] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  const [users, setUsers] = useState<AdminUserSummary[]>(() => createDemoAdminUsers());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<FilterPeriod>("all");
  const [sortBy, setSortBy] = useState<SortBy>("newest");
  const [selectedUser, setSelectedUser] = useState<AdminUserSummary | null>(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<AdminUserSummary | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Modal tambah akun baru langsung dari Admin
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [creatingUser, setCreatingUser] = useState(false);

  const [toast, setToast] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(1794980000000);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2400);
  }, []);

  const refreshUsers = useCallback(async () => {
    try {
      const list = await fetchAdminUsers();
      setUsers(list);
      setNowMs(Date.now());
    } catch (err) {
      notify(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (isSuperAdminAuthenticated()) {
        setUnlocked(true);
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    let active = true;
    fetchAdminUsers()
      .then((list) => {
        if (!active) return;
        setUsers(list);
        setNowMs(Date.now());
      })
      .catch((err) => active && notify(errorMessage(err)))
      .finally(() => active && setLoading(false));

    const unsubLocal = subscribeStoreChanges(() => {
      void refreshUsers();
    });

    return () => {
      active = false;
      unsubLocal();
    };
  }, [unlocked, notify, refreshUsers]);

  // Realtime update ketika ada user baru mendaftar di Supabase
  useEffect(() => {
    if (!unlocked || !isSupabaseConfigured) return;
    const supabase = getSupabase();
    const channel = supabase
      .channel("depong-admin-profiles")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        void refreshUsers();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [unlocked, refreshUsers]);

  // ---------- Statistik Ringkasan ----------
  const stats = useMemo(() => {
    const dayMs = 24 * 3600 * 1000;
    const todayCount = users.filter(
      (u) => nowMs - new Date(u.created_at).getTime() <= dayMs,
    ).length;
    const weekCount = users.filter(
      (u) => nowMs - new Date(u.created_at).getTime() <= 7 * dayMs,
    ).length;
    const totalMoments = users.reduce((acc, u) => acc + u.moments_count, 0);
    const totalVideos = users.reduce((acc, u) => acc + u.videos_count, 0);
    const activeToday = users.filter(
      (u) => nowMs - new Date(u.last_active_at).getTime() <= dayMs,
    ).length;

    return {
      totalUsers: users.length,
      todayCount,
      weekCount,
      totalMoments,
      totalVideos,
      totalPhotos: Math.max(0, totalMoments - totalVideos),
      activeToday,
    };
  }, [users, nowMs]);

  // ---------- Grafik Pendaftaran 7 Hari Terakhir ----------
  const dailyChart = useMemo(() => {
    const days: { key: string; label: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(nowMs - i * 24 * 3600 * 1000);
      const k = dayKey(d);
      const label = d.toLocaleDateString("id-ID", { weekday: "short", day: "numeric" });
      days.push({ key: k, label, count: 0 });
    }
    const map = new Map(days.map((d) => [d.key, d]));
    for (const u of users) {
      const k = dayKey(new Date(u.created_at));
      const item = map.get(k);
      if (item) item.count += 1;
    }
    const max = Math.max(1, ...days.map((d) => d.count));
    return days.map((d) => ({ ...d, pct: Math.round((d.count / max) * 100) }));
  }, [users, nowMs]);

  // ---------- Filter & Sortir ----------
  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const dayMs = 24 * 3600 * 1000;

    return users
      .filter((u) => {
        if (period === "today" && nowMs - new Date(u.created_at).getTime() > dayMs) return false;
        if (period === "week" && nowMs - new Date(u.created_at).getTime() > 7 * dayMs) return false;
        if (period === "with_video" && u.videos_count <= 0) return false;
        if (!q) return true;
        return (
          u.display_name.toLowerCase().includes(q) ||
          u.username.toLowerCase().includes(q) ||
          (u.email?.toLowerCase().includes(q) ?? false) ||
          u.invite_code.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (sortBy === "newest") return b.created_at.localeCompare(a.created_at);
        if (sortBy === "oldest") return a.created_at.localeCompare(b.created_at);
        if (sortBy === "most_moments") return b.moments_count - a.moments_count;
        return a.display_name.localeCompare(b.display_name);
      });
  }, [users, search, period, sortBy, nowMs]);

  function copyText(text: string, label: string) {
    navigator.clipboard
      .writeText(text)
      .then(() => notify(`${label} disalin 📋`))
      .catch(() => notify(text));
  }

  function exportCsv() {
    const header = [
      "ID",
      "Nama Tampilan",
      "Username",
      "Email",
      "Kode Undangan",
      "Total Momen",
      "Video 7s",
      "Jumlah Sahabat",
      "Waktu Daftar",
    ];
    const rows = filteredUsers.map((u) => [
      u.id,
      `"${u.display_name.replace(/"/g, '""')}"`,
      u.username,
      u.email ?? "-",
      u.invite_code,
      u.moments_count,
      u.videos_count,
      u.friends_count,
      new Date(u.created_at).toLocaleString("id-ID"),
    ]);
    const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `depong-users-${dayKey(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify("Data akun di-export ke CSV 📊");
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    if (creatingUser) return;
    setCreatingUser(true);
    try {
      const prof = await registerLocalAccount({
        displayName: newName,
        username: newUsername,
        email: newEmail,
        password: newPassword,
      });
      await refreshUsers();
      setCreateModalOpen(false);
      setNewName("");
      setNewUsername("");
      setNewEmail("");
      setNewPassword("");
      notify(`Akun ${prof.display_name} (@${prof.username}) berhasil dibuat 💛`);
    } catch (err) {
      notify(errorMessage(err));
    } finally {
      setCreatingUser(false);
    }
  }

  async function handleConfirmDelete() {
    if (!confirmDeleteUser || deletingId) return;
    const target = confirmDeleteUser;
    setDeletingId(target.id);
    try {
      await deleteAdminUser(target.id);
      setUsers((prev) => prev.filter((u) => u.id !== target.id));
      if (selectedUser?.id === target.id) setSelectedUser(null);
      setConfirmDeleteUser(null);
      notify(`Akun ${target.display_name} (@${target.username}) berhasil dihapus`);
    } catch (err) {
      notify(errorMessage(err));
    } finally {
      setDeletingId(null);
    }
  }

  // ---------- Layar Login Khusus Super Admin ----------
  if (!unlocked) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-ink px-6 text-white">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (verifySuperAdminCredentials(adminEmail, adminPassword)) {
              setSuperAdminAuthenticated(true);
              setUnlocked(true);
              setAuthError(null);
            } else {
              setAuthError(
                "Akses ditolak. Hanya akun Super Admin yang diizinkan membuka Dashboard Admin.",
              );
            }
          }}
          className="w-full max-w-sm space-y-4 rounded-[32px] border border-white/10 bg-panel p-6 text-center shadow-2xl"
        >
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-gold bg-panel-2 text-gold">
            <IconUsers size={24} />
          </div>
          <div>
            <h1 className="text-xl font-extrabold">Super Admin Depong</h1>
            <p className="mt-1 text-xs text-muted">
              Halaman ini hanya dapat diakses oleh akun Super Admin
            </p>
          </div>

          <div className="space-y-3 text-left">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">
                Email Super Admin
              </label>
              <input
                type="email"
                required
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="Email Super Admin"
                className="w-full rounded-2xl border border-white/10 bg-panel-2 px-4 py-2.5 text-sm text-white outline-none focus:border-gold"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Password</label>
              <input
                type="password"
                required
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Password Super Admin"
                className="w-full rounded-2xl border border-white/10 bg-panel-2 px-4 py-2.5 text-sm text-white outline-none focus:border-gold"
              />
            </div>
          </div>

          {authError && (
            <p className="rounded-2xl border border-red-500/30 bg-red-500/10 p-2.5 text-xs font-semibold text-red-400">
              {authError}
            </p>
          )}

          <button
            type="submit"
            className="w-full rounded-full bg-gold py-3 text-sm font-extrabold text-black transition active:scale-98"
          >
            Masuk sebagai Super Admin
          </button>
          <Link href="/" className="block text-xs text-muted hover:text-white">
            ← Kembali ke Halaman Utama
          </Link>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-ink text-white">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-ink/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3.5 md:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-panel-2 text-white/90 transition hover:bg-panel-3"
              aria-label="Kembali ke Aplikasi"
            >
              <IconChevronLeft size={18} />
            </Link>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border-2 border-gold bg-panel">
              <span className="h-4 w-4 rounded-full bg-gold" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-extrabold tracking-tight">Depong Super Admin</h1>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-extrabold text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {SUPER_ADMIN_EMAIL}
                </span>
              </div>
              <p className="text-xs text-muted">
                Pantau & kelola seluruh pengguna yang membuat akun beserta statistik foto/video 7s
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setCreateModalOpen(true)}
              className="rounded-full border border-gold/40 bg-panel-2 px-3.5 py-2 text-xs font-bold text-gold transition hover:bg-panel-3"
            >
              + Tambah Akun Baru
            </button>

            <button
              onClick={() => void refreshUsers()}
              className="rounded-full bg-panel-2 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-panel-3"
            >
              Muat Ulang
            </button>

            <button
              onClick={exportCsv}
              className="flex items-center gap-1.5 rounded-full bg-panel-2 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-panel-3"
            >
              <IconDownload size={15} />
              <span>Export CSV</span>
            </button>

            <Link
              href="/"
              className="flex items-center gap-1.5 rounded-full bg-gold px-4 py-2 text-xs font-extrabold text-black transition active:scale-95"
            >
              <IconCamera size={15} />
              <span>Buka App</span>
            </Link>

            <button
              onClick={() => {
                setSuperAdminAuthenticated(false);
                setUnlocked(false);
                setAdminPassword("");
              }}
              className="flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-3.5 py-2 text-xs font-bold text-red-400 transition hover:bg-red-500 hover:text-white"
              title="Keluar dari Super Admin"
            >
              <IconLogout size={15} />
              <span>Keluar</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-6">
        {/* 4 Kartu Statistik Utama */}
        <section className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          <div className="rounded-[28px] border border-white/10 bg-panel p-4">
            <div className="flex items-center justify-between text-xs font-semibold text-muted">
              <span>Total Akun Terdaftar</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gold/15 text-gold">
                <IconUsers size={16} />
              </span>
            </div>
            <div className="mt-2 text-3xl font-extrabold">{stats.totalUsers}</div>
            <div className="mt-1 flex items-center gap-2 text-xs">
              <span className="rounded-full bg-gold/20 px-2 py-0.5 font-bold text-gold">
                +{stats.todayCount} hari ini
              </span>
              <span className="text-muted">{stats.weekCount} minggu ini</span>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-panel p-4">
            <div className="flex items-center justify-between text-xs font-semibold text-muted">
              <span>Aktif 24 Jam Terakhir</span>
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_12px_#34d399]" />
            </div>
            <div className="mt-2 text-3xl font-extrabold">{stats.activeToday}</div>
            <div className="mt-1 text-xs text-muted">
              {stats.totalUsers > 0
                ? `${Math.round((stats.activeToday / stats.totalUsers) * 100)}% dari seluruh pengguna`
                : "Belum ada aktivitas"}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-panel p-4">
            <div className="flex items-center justify-between text-xs font-semibold text-muted">
              <span>Total Momen Diunggah</span>
              <span className="rounded-full bg-panel-2 px-2 py-0.5 font-bold text-white">
                Foto & Video
              </span>
            </div>
            <div className="mt-2 text-3xl font-extrabold">{stats.totalMoments}</div>
            <div className="mt-1 text-xs text-muted">
              📸 {stats.totalPhotos} Foto · 🎥 {stats.totalVideos} Video 7s
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-panel p-4">
            <div className="flex items-center justify-between text-xs font-semibold text-muted">
              <span>Klip Video 7 Detik</span>
              <span className="rounded-full bg-red-500/20 px-2 py-0.5 font-bold text-red-400">
                7s REC
              </span>
            </div>
            <div className="mt-2 text-3xl font-extrabold text-gold">{stats.totalVideos}</div>
            <div className="mt-1 text-xs text-muted">
              {stats.totalMoments > 0
                ? `${Math.round((stats.totalVideos / stats.totalMoments) * 100)}% momen berupa video 7s`
                : "Belum ada video"}
            </div>
          </div>
        </section>

        {/* Grafik Pendaftaran 7 Hari Terakhir */}
        <section className="rounded-[32px] border border-white/10 bg-panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold">Pendaftaran Akun 7 Hari Terakhir</h2>
              <p className="text-xs text-muted">Jumlah pengguna baru per hari</p>
            </div>
            <span className="rounded-full bg-panel-2 px-3 py-1 text-xs font-semibold text-gold">
              Total +{stats.weekCount} akun
            </span>
          </div>

          <div className="grid grid-cols-7 items-end gap-2.5 pt-2">
            {dailyChart.map((d) => (
              <div key={d.key} className="flex flex-col items-center gap-2">
                <span className="font-mono text-xs font-bold text-gold">{d.count}</span>
                <div className="flex h-24 w-full items-end rounded-2xl bg-panel-2 p-1.5">
                  <div
                    className="w-full rounded-xl bg-gold transition-all duration-300"
                    style={{ height: `${Math.max(12, d.pct)}%`, opacity: d.count > 0 ? 1 : 0.2 }}
                  />
                </div>
                <span className="text-[11px] font-medium text-muted">{d.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Filter, Search, & Tabel Daftar Akun */}
        <section className="rounded-[32px] border border-white/10 bg-panel p-5">
          <div className="flex flex-col justify-between gap-3 border-b border-white/10 pb-4 lg:flex-row lg:items-center">
            <div>
              <h2 className="text-base font-bold">
                Daftar Akun Pengguna ({filteredUsers.length})
              </h2>
              <p className="text-xs text-muted">
                Setiap akun baru yang didaftarkan di aplikasi langsung muncul di tabel ini
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-full bg-panel-2 p-1 text-xs font-bold">
                {(
                  [
                    ["all", "Semua"],
                    ["today", "Hari Ini"],
                    ["week", "Minggu Ini"],
                    ["with_video", "Punya Video 7s"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setPeriod(key)}
                    className={`rounded-full px-3 py-1 transition ${
                      period === key ? "bg-gold text-black" : "text-muted hover:text-white"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
                className="rounded-full border border-white/10 bg-panel-2 px-3.5 py-1.5 text-xs font-bold text-white outline-none focus:border-gold"
              >
                <option value="newest">Terbaru Daftar</option>
                <option value="oldest">Terlama Daftar</option>
                <option value="most_moments">Momen Terbanyak</option>
                <option value="name">Nama (A–Z)</option>
              </select>
            </div>
          </div>

          <div className="mt-4">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama tampilan, @username, email, atau kode undangan..."
              className="w-full rounded-2xl border border-white/10 bg-panel-2 px-4 py-2.5 text-sm text-white placeholder-white/40 outline-none focus:border-gold"
            />
          </div>

          {loading ? (
            <div className="py-12 text-center text-sm text-muted">Memuat data akun…</div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted">
              Tidak ada akun yang cocok dengan filter pencarian.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs font-bold tracking-wider text-muted uppercase">
                    <th className="py-3 pr-4 pl-2">Pengguna</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Kode Undangan</th>
                    <th className="px-4 py-3 text-center">Momen (Video 7s)</th>
                    <th className="px-4 py-3 text-center">Sahabat</th>
                    <th className="px-4 py-3">Terakhir Aktif</th>
                    <th className="px-4 py-3 text-right">Waktu Buat Akun</th>
                    <th className="py-3 pr-2 pl-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredUsers.map((u) => (
                    <tr
                      key={u.id}
                      onClick={() => setSelectedUser(u)}
                      className="cursor-pointer transition hover:bg-panel-2/80"
                    >
                      <td className="py-3.5 pr-4 pl-2">
                        <div className="flex items-center gap-3">
                          <Avatar profile={u} size={40} />
                          <div className="min-w-0">
                            <div className="truncate font-bold text-white">{u.display_name}</div>
                            <div className="truncate font-mono text-xs text-muted">
                              @{u.username}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-xs text-white/80">
                        {u.email ?? <span className="text-muted">—</span>}
                      </td>

                      <td className="px-4 py-3.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyText(u.invite_code, `Kode ${u.invite_code}`);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 font-mono text-xs font-bold text-gold hover:bg-gold/20"
                        >
                          <span>{u.invite_code}</span>
                          <IconCopy size={12} />
                        </button>
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        <span className="font-bold">{u.moments_count}</span>
                        {u.videos_count > 0 && (
                          <span className="ml-1.5 rounded-full bg-panel-3 px-2 py-0.5 text-[11px] font-semibold text-gold">
                            🎥 {u.videos_count}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-center font-semibold">
                        {u.friends_count}
                      </td>

                      <td className="px-4 py-3.5 text-xs text-muted">
                        {timeAgo(u.last_active_at)}
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <div className="text-xs font-semibold text-white">
                          {new Date(u.created_at).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </div>
                        <div className="text-[11px] text-muted">
                          {clockTime(u.created_at)} · {timeAgo(u.created_at)}
                        </div>
                      </td>

                      <td className="py-3.5 pr-2 pl-4 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteUser(u);
                          }}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-red-500/25 bg-red-500/10 text-red-400 transition hover:bg-red-500 hover:text-white"
                          title={`Hapus akun ${u.display_name}`}
                          aria-label={`Hapus akun ${u.display_name}`}
                        >
                          <IconTrash size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {/* Modal Tambah Akun Baru dari Admin */}
      {createModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => !creatingUser && setCreateModalOpen(false)}
        >
          <form
            onSubmit={handleCreateUser}
            className="animate-sheet-up w-full max-w-sm rounded-[32px] border border-white/15 bg-panel p-6 space-y-3.5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold">Buat Akun Pengguna Baru</h3>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-panel-2 text-white/80"
              >
                <IconX size={16} />
              </button>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Nama Tampilan</label>
              <input
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Contoh: Bima Arya"
                className="w-full rounded-2xl border border-white/10 bg-panel-2 px-4 py-2.5 text-sm text-white outline-none focus:border-gold"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Username</label>
              <input
                type="text"
                required
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="bima_arya"
                className="w-full rounded-2xl border border-white/10 bg-panel-2 px-4 py-2.5 font-mono text-sm text-white outline-none focus:border-gold"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Email</label>
              <input
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="bima@email.com"
                className="w-full rounded-2xl border border-white/10 bg-panel-2 px-4 py-2.5 text-sm text-white outline-none focus:border-gold"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimal 6 karakter"
                className="w-full rounded-2xl border border-white/10 bg-panel-2 px-4 py-2.5 text-sm text-white outline-none focus:border-gold"
              />
            </div>

            <button
              type="submit"
              disabled={creatingUser}
              className="mt-2 w-full rounded-full bg-gold py-3 text-xs font-extrabold text-black disabled:opacity-50"
            >
              {creatingUser ? "Menyimpan…" : "Simpan & Buat Akun"}
            </button>
          </form>
        </div>
      )}

      {/* Modal Detail Akun */}
      {selectedUser && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => setSelectedUser(null)}
        >
          <div
            className="animate-sheet-up w-full max-w-md rounded-[32px] border border-white/15 bg-panel p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3.5">
                <Avatar profile={selectedUser} size={56} ring />
                <div>
                  <h3 className="text-lg font-extrabold">{selectedUser.display_name}</h3>
                  <p className="font-mono text-xs text-muted">@{selectedUser.username}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-panel-2 text-white/80"
                aria-label="Tutup"
              >
                <IconX size={16} />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2.5 text-center">
              <div className="rounded-2xl bg-panel-2 p-3">
                <div className="text-xl font-extrabold text-gold">
                  {selectedUser.moments_count}
                </div>
                <div className="text-[11px] text-muted">Total Momen</div>
              </div>
              <div className="rounded-2xl bg-panel-2 p-3">
                <div className="text-xl font-extrabold">{selectedUser.videos_count}</div>
                <div className="text-[11px] text-muted">Video 7s</div>
              </div>
              <div className="rounded-2xl bg-panel-2 p-3">
                <div className="text-xl font-extrabold">{selectedUser.friends_count}</div>
                <div className="text-[11px] text-muted">Sahabat</div>
              </div>
            </div>

            <div className="space-y-2.5 rounded-2xl border border-white/10 bg-ink p-4 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted">User ID</span>
                <span className="truncate font-mono text-white/90">{selectedUser.id}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted">Email</span>
                <span className="font-semibold text-white">
                  {selectedUser.email ?? "Tidak tersedia"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted">Kode Undangan</span>
                <button
                  onClick={() =>
                    copyText(selectedUser.invite_code, `Kode ${selectedUser.invite_code}`)
                  }
                  className="font-mono font-bold text-gold underline"
                >
                  {selectedUser.invite_code}
                </button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted">Waktu Daftar</span>
                <span className="font-semibold text-white">
                  {new Date(selectedUser.created_at).toLocaleString("id-ID")}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted">Terakhir Aktif</span>
                <span className="font-semibold text-white">
                  {timeAgo(selectedUser.last_active_at)}
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  const url = `${window.location.origin}/?invite=${selectedUser.invite_code}`;
                  copyText(url, "Link undangan user");
                }}
                className="flex-1 rounded-full bg-gold py-2.5 text-xs font-extrabold text-black"
              >
                Salin Link Undangan
              </button>
              <button
                onClick={() => setConfirmDeleteUser(selectedUser)}
                className="flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/15 px-4 py-2.5 text-xs font-bold text-red-400 transition hover:bg-red-500 hover:text-white"
              >
                <IconTrash size={14} />
                <span>Hapus Akun</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Hapus Akun */}
      {confirmDeleteUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => !deletingId && setConfirmDeleteUser(null)}
        >
          <div
            className="animate-sheet-up w-full max-w-sm rounded-[32px] border border-red-500/30 bg-panel p-6 text-center space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-500/15 text-red-400">
              <IconTrash size={24} />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">
                Hapus Akun {confirmDeleteUser.display_name}?
              </h3>
              <p className="mt-1 text-xs text-muted">
                Akun <span className="font-mono text-white">@{confirmDeleteUser.username}</span>{" "}
                beserta {confirmDeleteUser.moments_count} momen foto/video 7s miliknya akan dihapus
                secara permanen.
              </p>
            </div>
            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                disabled={Boolean(deletingId)}
                onClick={() => setConfirmDeleteUser(null)}
                className="flex-1 rounded-full bg-panel-2 py-2.5 text-xs font-bold text-white"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={Boolean(deletingId)}
                onClick={() => void handleConfirmDelete()}
                className="flex-1 rounded-full bg-red-500 py-2.5 text-xs font-extrabold text-white transition hover:bg-red-600 disabled:opacity-50"
              >
                {deletingId ? "Menghapus…" : "Ya, Hapus"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="animate-toast-in fixed top-16 inset-x-0 z-50 mx-auto w-fit max-w-xs rounded-full bg-white px-4 py-2 text-center text-xs font-bold text-black shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
