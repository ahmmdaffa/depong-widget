"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteAdminUser,
  deleteMoment,
  errorMessage,
  fetchAdminSnapshot,
} from "@/lib/api";
import {
  isSuperAdminAuthenticated,
  registerLocalAccount,
  setSuperAdminAuthenticated,
  subscribeStoreChanges,
  SUPER_ADMIN_EMAIL,
  verifySuperAdminCredentials,
} from "@/lib/backendStore";
import { clockTime, dayKey, timeAgo } from "@/lib/format";
import { getSupabase, isSupabaseConfigured, mediaUrl } from "@/lib/supabase";
import type { AdminUserSummary, Moment } from "@/lib/types";
import Avatar from "./Avatar";
import {
  IconCamera,
  IconCopy,
  IconDownload,
  IconImage,
  IconLogout,
  IconTrash,
  IconUsers,
  IconX,
} from "./Icons";
import { InlineLoader } from "./LoadingScreen";

type AdminSection = "accounts" | "photos";
type FilterPeriod = "all" | "today" | "week";
type SortBy = "newest" | "oldest" | "most_moments" | "name";

export default function AdminDashboard() {
  const [unlocked, setUnlocked] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  const [section, setSection] = useState<AdminSection>("accounts");
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [photos, setPhotos] = useState<Moment[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter daftar akun
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<FilterPeriod>("all");
  const [sortBy, setSortBy] = useState<SortBy>("newest");

  // Filter galeri foto pengguna
  const [photoSearch, setPhotoSearch] = useState("");
  const [photoUserFilter, setPhotoUserFilter] = useState<string>("all");
  const [previewPhoto, setPreviewPhoto] = useState<Moment | null>(null);

  // Modal detail & hapus akun
  const [selectedUser, setSelectedUser] = useState<AdminUserSummary | null>(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<AdminUserSummary | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Modal tambah akun baru
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

  const refreshAdminData = useCallback(async () => {
    try {
      const { users: userList, moments: photoList } = await fetchAdminSnapshot();
      setUsers(userList);
      setPhotos(photoList);
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
    fetchAdminSnapshot()
      .then(({ users: userList, moments: photoList }) => {
        if (!active) return;
        setUsers(userList);
        setPhotos(photoList);
        setNowMs(Date.now());
      })
      .catch((err) => active && notify(errorMessage(err)))
      .finally(() => active && setLoading(false));

    const unsubLocal = subscribeStoreChanges(() => {
      void refreshAdminData();
    });

    const interval = window.setInterval(() => {
      void refreshAdminData();
    }, 8000);

    return () => {
      active = false;
      unsubLocal();
      window.clearInterval(interval);
    };
  }, [unlocked, notify, refreshAdminData]);

  useEffect(() => {
    if (!unlocked || !isSupabaseConfigured) return;
    const supabase = getSupabase();
    const channel = supabase
      .channel("depong-admin-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        void refreshAdminData();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "moments" }, () => {
        void refreshAdminData();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [unlocked, refreshAdminData]);

  // ---------- Statistik Ringkasan ----------
  const stats = useMemo(() => {
    const dayMs = 24 * 3600 * 1000;
    const todayCount = users.filter(
      (u) => nowMs - new Date(u.created_at).getTime() <= dayMs,
    ).length;
    const weekCount = users.filter(
      (u) => nowMs - new Date(u.created_at).getTime() <= 7 * dayMs,
    ).length;
    const activeToday = users.filter(
      (u) => nowMs - new Date(u.last_active_at).getTime() <= dayMs,
    ).length;

    return {
      totalUsers: users.length,
      todayCount,
      weekCount,
      totalPhotos: photos.length,
      activeToday,
    };
  }, [users, photos.length, nowMs]);

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

  // ---------- Filter & Sortir Akun ----------
  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const dayMs = 24 * 3600 * 1000;

    return users
      .filter((u) => {
        if (period === "today" && nowMs - new Date(u.created_at).getTime() > dayMs) return false;
        if (period === "week" && nowMs - new Date(u.created_at).getTime() > 7 * dayMs) return false;
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

  // ---------- Filter Galeri Foto Pengguna ----------
  const filteredPhotos = useMemo(() => {
    const q = photoSearch.trim().toLowerCase();
    return photos.filter((m) => {
      if (photoUserFilter !== "all" && m.user_id !== photoUserFilter) return false;
      if (!q) return true;
      const senderName = m.profile?.display_name?.toLowerCase() ?? "";
      const senderUser = m.profile?.username?.toLowerCase() ?? "";
      const cap = m.caption?.toLowerCase() ?? "";
      return senderName.includes(q) || senderUser.includes(q) || cap.includes(q);
    });
  }, [photos, photoSearch, photoUserFilter]);

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
      "Total Foto",
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
      await refreshAdminData();
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
      setPhotos((prev) => prev.filter((m) => m.user_id !== target.id));
      if (selectedUser?.id === target.id) setSelectedUser(null);
      setConfirmDeleteUser(null);
      notify(`Akun ${target.display_name} (@${target.username}) berhasil dihapus`);
    } catch (err) {
      notify(errorMessage(err));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDeletePhoto(moment: Moment) {
    if (!window.confirm("Hapus foto ini dari aplikasi?")) return;
    try {
      await deleteMoment(moment);
      setPhotos((prev) => prev.filter((m) => m.id !== moment.id));
      if (previewPhoto?.id === moment.id) setPreviewPhoto(null);
      void refreshAdminData();
      notify("Foto berhasil dihapus");
    } catch (err) {
      notify(errorMessage(err));
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
    <div className="flex min-h-dvh flex-col bg-ink text-white md:flex-row">
      {/* ==================== SIDEBAR NAVIGASI KIRI ==================== */}
      <aside className="flex w-full shrink-0 flex-col justify-between border-b border-white/10 bg-panel p-5 md:sticky md:top-0 md:h-dvh md:w-72 md:border-r md:border-b-0">
        <div className="space-y-6">
          {/* Brand Title */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border-2 border-gold bg-ink">
              <span className="h-4 w-4 rounded-full bg-gold" />
            </div>
            <div>
              <h1 className="text-base font-extrabold tracking-tight">Depong Admin</h1>
              <span className="text-[11px] font-semibold text-gold">Panel Super Admin</span>
            </div>
          </div>

          {/* Kartu Informasi Akun Super Admin */}
          <div className="rounded-2xl border border-white/10 bg-ink p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-wider text-muted uppercase">
                Akun Aktif
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-extrabold text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                ONLINE
              </span>
            </div>
            <div className="truncate font-mono text-xs font-bold text-white">
              {SUPER_ADMIN_EMAIL}
            </div>
            <div className="flex items-center justify-between pt-1 text-[11px] text-muted border-t border-white/5">
              <span>Total Pengguna: <b className="text-white">{stats.totalUsers}</b></span>
              <span>Total Foto: <b className="text-gold">{stats.totalPhotos}</b></span>
            </div>
          </div>

          {/* Menu Navigasi Utama */}
          <nav className="space-y-1.5">
            <div className="px-2 pb-1 text-[11px] font-bold tracking-wider text-muted uppercase">
              Menu Utama
            </div>

            <button
              type="button"
              onClick={() => setSection("accounts")}
              className={`flex w-full items-center justify-between rounded-2xl px-3.5 py-3 text-left text-xs font-bold transition ${
                section === "accounts"
                  ? "bg-gold text-black shadow-lg"
                  : "text-white/80 hover:bg-panel-2 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <IconUsers size={17} />
                <span>Daftar Akun Pengguna</span>
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${
                  section === "accounts" ? "bg-black/15 text-black" : "bg-panel-2 text-muted"
                }`}
              >
                {stats.totalUsers}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSection("photos")}
              className={`flex w-full items-center justify-between rounded-2xl px-3.5 py-3 text-left text-xs font-bold transition ${
                section === "photos"
                  ? "bg-gold text-black shadow-lg"
                  : "text-white/80 hover:bg-panel-2 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <IconImage size={17} />
                <span>Galeri Foto Pengguna</span>
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${
                  section === "photos" ? "bg-black/15 text-black" : "bg-panel-2 text-gold"
                }`}
              >
                {stats.totalPhotos}
              </span>
            </button>
          </nav>

          {/* Aksi Cepat Akun */}
          <div className="space-y-1.5 pt-2 border-t border-white/10">
            <div className="px-2 pb-1 text-[11px] font-bold tracking-wider text-muted uppercase">
              Tindakan Cepat
            </div>

            <button
              type="button"
              onClick={() => setCreateModalOpen(true)}
              className="flex w-full items-center gap-2.5 rounded-2xl border border-gold/35 bg-gold/10 px-3.5 py-2.5 text-xs font-bold text-gold transition hover:bg-gold/20"
            >
              <span>+ Tambah Akun Baru</span>
            </button>

            <button
              type="button"
              onClick={exportCsv}
              className="flex w-full items-center gap-2.5 rounded-2xl bg-panel-2 px-3.5 py-2.5 text-xs font-semibold text-white/90 transition hover:bg-panel-3"
            >
              <IconDownload size={15} />
              <span>Export Data Akun (CSV)</span>
            </button>

            <button
              type="button"
              onClick={() => void refreshAdminData()}
              className="flex w-full items-center gap-2.5 rounded-2xl bg-panel-2 px-3.5 py-2.5 text-xs font-semibold text-white/90 transition hover:bg-panel-3"
            >
              <span>↻ Muat Ulang Data</span>
            </button>
          </div>
        </div>

        {/* Footer Sidebar */}
        <div className="mt-6 flex flex-col gap-2 pt-4 border-t border-white/10">
          <Link
            href="/"
            className="flex items-center justify-center gap-2 rounded-2xl bg-panel-2 py-2.5 text-xs font-bold text-white transition hover:bg-panel-3"
          >
            <IconCamera size={15} />
            <span>Buka Kamera Aplikasi</span>
          </Link>

          <button
            type="button"
            onClick={() => {
              setSuperAdminAuthenticated(false);
              setUnlocked(false);
              setAdminPassword("");
            }}
            className="flex items-center justify-center gap-2 rounded-2xl border border-red-500/25 bg-red-500/10 py-2.5 text-xs font-bold text-red-400 transition hover:bg-red-500 hover:text-white"
          >
            <IconLogout size={15} />
            <span>Keluar Super Admin</span>
          </button>
        </div>
      </aside>

      {/* ==================== KONTEN UTAMA KANAN ==================== */}
      <main className="min-w-0 flex-1 space-y-6 p-4 md:p-7">
        {/* Ringkasan Statistik Atas */}
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
              <span>Total Foto Diunggah</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gold/15 text-gold">
                <IconImage size={16} />
              </span>
            </div>
            <div className="mt-2 text-3xl font-extrabold text-gold">{stats.totalPhotos}</div>
            <div className="mt-1 text-xs text-muted">Dari seluruh pengguna terdaftar</div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-panel p-4">
            <div className="flex items-center justify-between text-xs font-semibold text-muted">
              <span>Pendaftar Minggu Ini</span>
              <span className="rounded-full bg-panel-2 px-2 py-0.5 font-bold text-white">7 Hari</span>
            </div>
            <div className="mt-2 text-3xl font-extrabold">+{stats.weekCount}</div>
            <div className="mt-1 text-xs text-muted">Pertumbuhan akun baru</div>
          </div>
        </section>

        {/* ==================== MENU 1: DAFTAR AKUN PENGGUNA ==================== */}
        {section === "accounts" && (
          <>
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

            {/* Tabel Daftar Akun */}
            <section className="rounded-[32px] border border-white/10 bg-panel p-5">
              <div className="flex flex-col justify-between gap-3 border-b border-white/10 pb-4 lg:flex-row lg:items-center">
                <div>
                  <h2 className="text-base font-bold">
                    Daftar Akun Pengguna ({filteredUsers.length})
                  </h2>
                  <p className="text-xs text-muted">
                    Klik pada pengguna untuk melihat rincian profil atau melihat foto yang diunggahnya
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex rounded-full bg-panel-2 p-1 text-xs font-bold">
                    {(
                      [
                        ["all", "Semua"],
                        ["today", "Hari Ini"],
                        ["week", "Minggu Ini"],
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
                    <option value="most_moments">Foto Terbanyak</option>
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
                <InlineLoader label="Memuat data akun…" />
              ) : filteredUsers.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted">
                  Belum ada akun terdaftar yang cocok dengan pencarian.
                </div>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-xs font-bold tracking-wider text-muted uppercase">
                        <th className="py-3 pr-4 pl-2">Pengguna</th>
                        <th className="px-4 py-3">Email</th>
                        <th className="px-4 py-3">Kode Undangan</th>
                        <th className="px-4 py-3 text-center">Foto Diunggah</th>
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
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPhotoUserFilter(u.id);
                                setSection("photos");
                              }}
                              className="inline-flex items-center gap-1 rounded-full bg-panel-2 px-3 py-1 text-xs font-bold text-white hover:bg-gold hover:text-black"
                              title="Lihat foto pengguna ini"
                            >
                              <span>📸 {u.moments_count}</span>
                            </button>
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
          </>
        )}

        {/* ==================== MENU 2: GALERI FOTO PENGGUNA ==================== */}
        {section === "photos" && (
          <section className="rounded-[32px] border border-white/10 bg-panel p-5 space-y-5">
            <div className="flex flex-col justify-between gap-3 border-b border-white/10 pb-4 lg:flex-row lg:items-center">
              <div>
                <h2 className="text-base font-bold">
                  Galeri Seluruh Foto Pengguna ({filteredPhotos.length})
                </h2>
                <p className="text-xs text-muted">
                  Pantau semua foto yang telah diunggah oleh pengguna aplikasi
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={photoUserFilter}
                  onChange={(e) => setPhotoUserFilter(e.target.value)}
                  className="rounded-full border border-white/10 bg-panel-2 px-3.5 py-2 text-xs font-bold text-white outline-none focus:border-gold"
                >
                  <option value="all">Semua Pengguna ({photos.length} Foto)</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.display_name} (@{u.username})
                    </option>
                  ))}
                </select>

                {photoUserFilter !== "all" && (
                  <button
                    type="button"
                    onClick={() => setPhotoUserFilter("all")}
                    className="rounded-full bg-gold px-3 py-1.5 text-xs font-extrabold text-black"
                  >
                    Tampilkan Semua
                  </button>
                )}
              </div>
            </div>

            <input
              type="search"
              value={photoSearch}
              onChange={(e) => setPhotoSearch(e.target.value)}
              placeholder="Cari foto berdasarkan nama pengirim, @username, atau isi pesan caption..."
              className="w-full rounded-2xl border border-white/10 bg-panel-2 px-4 py-2.5 text-sm text-white placeholder-white/40 outline-none focus:border-gold"
            />

            {loading ? (
              <InlineLoader label="Memuat galeri foto…" />
            ) : filteredPhotos.length === 0 ? (
              <div className="py-16 text-center space-y-2">
                <div className="text-3xl">🖼️</div>
                <div className="text-sm font-bold">Belum ada foto yang diunggah</div>
                <p className="text-xs text-muted">
                  Setiap foto yang dikirim pengguna akan langsung tampil di galeri ini.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredPhotos.map((m) => {
                  const url = mediaUrl(m.media_path);
                  return (
                    <div
                      key={m.id}
                      className="group flex flex-col overflow-hidden rounded-[28px] border border-white/10 bg-ink transition hover:border-gold/40"
                    >
                      <button
                        type="button"
                        onClick={() => setPreviewPhoto(m)}
                        className="relative aspect-square w-full overflow-hidden bg-panel-2 text-left"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={m.caption ?? "Foto pengguna"}
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-103"
                          loading="lazy"
                        />
                        {m.caption && (
                          <span className="absolute inset-x-3 bottom-3 truncate rounded-full bg-black/65 px-3 py-1.5 text-center text-xs font-semibold text-white backdrop-blur-md">
                            {m.caption}
                          </span>
                        )}
                      </button>

                      <div className="flex items-center justify-between gap-2 p-3.5">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <Avatar profile={m.profile} size={34} />
                          <div className="min-w-0">
                            <div className="truncate text-xs font-bold text-white">
                              {m.profile?.display_name ?? "Pengguna"}
                            </div>
                            <div className="truncate font-mono text-[11px] text-muted">
                              @{m.profile?.username ?? "user"} · {timeAgo(m.created_at)}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => void handleDeletePhoto(m)}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-red-500/25 bg-red-500/10 text-red-400 transition hover:bg-red-500 hover:text-white"
                          title="Hapus foto ini"
                          aria-label="Hapus foto ini"
                        >
                          <IconTrash size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </main>

      {/* Modal Pratinjau Foto Ukuran Penuh */}
      {previewPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          onClick={() => setPreviewPhoto(null)}
        >
          <div
            className="animate-sheet-up w-full max-w-md overflow-hidden rounded-[36px] border border-white/15 bg-panel shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative aspect-[4/5] w-full bg-ink">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mediaUrl(previewPhoto.media_path)}
                alt={previewPhoto.caption ?? "Pratinjau Foto"}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => setPreviewPhoto(null)}
                className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md"
                aria-label="Tutup"
              >
                <IconX size={18} />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Avatar profile={previewPhoto.profile} size={40} ring />
                  <div>
                    <div className="text-sm font-extrabold">
                      {previewPhoto.profile?.display_name ?? "Pengguna"}
                    </div>
                    <div className="font-mono text-xs text-muted">
                      @{previewPhoto.profile?.username ?? "user"} ·{" "}
                      {new Date(previewPhoto.created_at).toLocaleString("id-ID")}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void handleDeletePhoto(previewPhoto)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/15 px-3.5 py-2 text-xs font-bold text-red-400 transition hover:bg-red-500 hover:text-white"
                >
                  <IconTrash size={14} />
                  <span>Hapus Foto</span>
                </button>
              </div>

              {previewPhoto.caption && (
                <p className="rounded-2xl bg-panel-2 p-3 text-xs text-white/90">
                  “{previewPhoto.caption}”
                </p>
              )}
            </div>
          </div>
        </div>
      )}

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

            <div className="grid grid-cols-2 gap-2.5 text-center">
              <div className="rounded-2xl bg-panel-2 p-3">
                <div className="text-xl font-extrabold text-gold">
                  {selectedUser.moments_count}
                </div>
                <div className="text-[11px] text-muted">Total Foto Diunggah</div>
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

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  const uid = selectedUser.id;
                  setSelectedUser(null);
                  setPhotoUserFilter(uid);
                  setSection("photos");
                }}
                className="flex-1 rounded-full bg-gold py-2.5 text-xs font-extrabold text-black"
              >
                Lihat Foto Pengguna
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
                beserta seluruh foto miliknya akan dihapus secara permanen.
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
