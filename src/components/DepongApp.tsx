"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addFriendByCode,
  addReaction,
  errorMessage,
  fetchFriends,
  fetchMoments,
  fetchProfile,
  sendReply,
} from "@/lib/api";
import {
  getActiveSessionUserId,
  setActiveSessionUserId,
  subscribeStoreChanges,
} from "@/lib/backendStore";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import type {
  FeedFilter,
  Moment,
  Profile,
  PublicProfile,
  Tab,
} from "@/lib/types";
import ActivitySheet from "./ActivitySheet";
import AuthView from "./AuthView";
import Avatar from "./Avatar";
import CameraView from "./CameraView";
import FeedView from "./FeedView";
import FriendsSheet from "./FriendsSheet";
import {
  IconCamera,
  IconChevronDown,
  IconGrid,
  IconStack,
  IconUsers,
} from "./Icons";
import { FullPageLoader } from "./LoadingScreen";
import MemoriesView from "./MemoriesView";
import ProfileSheet, { type InstallPromptEvent } from "./ProfileSheet";

export default function DepongApp() {
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [friends, setFriends] = useState<PublicProfile[]>([]);
  const [moments, setMoments] = useState<Moment[]>([]);

  const [tab, setTab] = useState<Tab>("camera");
  const [feedFilter, setFeedFilter] = useState<FeedFilter>("all");
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [focusMomentId, setFocusMomentId] = useState<string | null>(null);

  const [friendsOpen, setFriendsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [activityMoment, setActivityMoment] = useState<Moment | null>(null);

  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | undefined>(undefined);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  // ---------- Tangkap event install PWA ----------
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // ---------- Load data profil, sahabat & momen ----------
  const reloadAll = useCallback(
    async (uid: string) => {
      try {
        const [prof, fr, mo] = await Promise.all([
          fetchProfile(uid),
          fetchFriends(uid),
          fetchMoments(uid),
        ]);
        if (prof) {
          setProfile(prof);
          setEmail(prof.email ?? "");
        } else {
          // Jika akun dihapus oleh Admin, keluarkan sesi
          setActiveSessionUserId(null);
          setUserId(null);
          setProfile(null);
        }
        setFriends(fr);
        setMoments(mo);
        setFeedFilter((prev) => {
          if (prev === "all" || prev === "me") return prev;
          return fr.some((f) => f.id === prev) ? prev : "all";
        });
      } catch (err) {
        notify(errorMessage(err));
      }
    },
    [notify],
  );

  // ---------- Inisialisasi Sesi (Backend Terintegrasi & Supabase) ----------
  useEffect(() => {
    if (!isSupabaseConfigured) {
      const savedId = getActiveSessionUserId();
      if (!savedId) {
        const t = window.setTimeout(() => setLoadingAuth(false), 0);
        return () => window.clearTimeout(t);
      }
      let active = true;
      fetchProfile(savedId)
        .then(async (prof) => {
          if (!active) return;
          if (prof) {
            setUserId(prof.id);
            setProfile(prof);
            setEmail(prof.email ?? "");
            const [fr, mo] = await Promise.all([
              fetchFriends(prof.id),
              fetchMoments(prof.id),
            ]);
            if (active) {
              setFriends(fr);
              setMoments(mo);
            }
          } else {
            setActiveSessionUserId(null);
          }
        })
        .finally(() => active && setLoadingAuth(false));

      const unsub = subscribeStoreChanges(() => {
        const currentId = getActiveSessionUserId();
        if (currentId) {
          void reloadAll(currentId);
        } else {
          setUserId(null);
          setProfile(null);
        }
      });

      return () => {
        active = false;
        unsub();
      };
    }

    const supabase = getSupabase();
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user ?? null;
      setUserId(u?.id ?? null);
      setEmail(u?.email ?? "");
      setLoadingAuth(false);
      if (u) void reloadAll(u.id);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUserId(u?.id ?? null);
      setEmail(u?.email ?? "");
      if (u) {
        void reloadAll(u.id);
      } else {
        setProfile(null);
        setFriends([]);
        setMoments([]);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, [reloadAll]);

  // ---------- Auto tambah sahabat lewat ?invite=KODE ----------
  useEffect(() => {
    if (!userId) return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("invite");
    if (!code) return;
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, "", cleanUrl);

    addFriendByCode(code, userId)
      .then((friend) => {
        notify(`${friend.display_name} ditambahkan sebagai sahabat 💛`);
        void reloadAll(userId);
      })
      .catch((err) => notify(errorMessage(err)));
  }, [userId, notify, reloadAll]);

  // ---------- Supabase Realtime subscription ----------
  useEffect(() => {
    if (!userId || !isSupabaseConfigured) return;
    const supabase = getSupabase();
    const channel = supabase
      .channel("depong-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "moments" }, () => {
        void reloadAll(userId);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "reactions" }, () => {
        void reloadAll(userId);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, reloadAll]);

  // ---------- Sinkronisasi berkala ringan agar foto dari sahabat langsung muncul ----------
  useEffect(() => {
    if (!userId) return;
    const timer = window.setInterval(() => {
      void reloadAll(userId);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [userId, reloadAll]);

  // ---------- Handler Login ----------
  async function handleAuthenticated(prof: Profile) {
    setUserId(prof.id);
    setProfile(prof);
    setEmail(prof.email ?? "");
    await reloadAll(prof.id);
    setTab("camera");
  }

  function handleLogout() {
    setProfileOpen(false);
    if (isSupabaseConfigured) {
      void getSupabase().auth.signOut();
    } else {
      setActiveSessionUserId(null);
      setUserId(null);
      setProfile(null);
      setFriends([]);
      setMoments([]);
      notify("Berhasil keluar akun");
    }
  }

  async function handleReact(moment: Moment, emoji: string) {
    if (!profile) return;
    try {
      await addReaction(moment.id, profile.id, emoji);
      await reloadAll(profile.id);
    } catch (err) {
      notify(errorMessage(err));
    }
  }

  async function handleReply(moment: Moment, body: string): Promise<boolean> {
    if (!profile) return false;
    try {
      await sendReply(moment.id, profile.id, body);
      notify(`Balasan terkirim ke ${moment.profile?.display_name ?? "Sahabat"} 💬`);
      return true;
    } catch (err) {
      notify(errorMessage(err));
      return false;
    }
  }

  // ---------- Peta profil untuk ActivitySheet ----------
  const peopleMap = useMemo(() => {
    const map = new Map<string, PublicProfile>();
    if (profile) map.set(profile.id, profile);
    for (const f of friends) map.set(f.id, f);
    for (const m of moments) {
      if (m.profile) map.set(m.profile.id, m.profile);
    }
    return map;
  }, [profile, friends, moments]);

  const filteredMoments = useMemo(() => {
    if (feedFilter === "all") return moments;
    if (feedFilter === "me") return moments.filter((m) => m.user_id === profile?.id);
    return moments.filter((m) => m.user_id === feedFilter);
  }, [moments, feedFilter, profile]);

  const currentFilterLabel = useMemo(() => {
    if (feedFilter === "all") return "Everyone";
    if (feedFilter === "me") return "Momenku";
    return friends.find((f) => f.id === feedFilter)?.display_name ?? "Everyone";
  }, [feedFilter, friends]);

  // ---------- Render Loading / Auth ----------
  if (loadingAuth) {
    return <FullPageLoader />;
  }

  if (!profile) {
    return (
      <>
        <AuthView
          onAuthenticated={(prof) => void handleAuthenticated(prof)}
          notify={notify}
        />
        {toast && (
          <div className="animate-toast-in fixed top-5 inset-x-0 z-50 mx-auto w-fit max-w-xs rounded-full bg-white px-4 py-2 text-center text-xs font-bold text-black shadow-xl">
            {toast}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="relative mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden bg-ink text-white select-none">
      {/* Top Bar (Dilengkapi ruang ekstra di atas agar ring avatar & tombol tidak pernah terpotong) */}
      <header className="pt-safe relative z-30 flex shrink-0 items-center justify-between px-5 pb-2.5">
        {/* Kiri: Sahabat */}
        <button
          onClick={() => setFriendsOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-panel-2 text-white/90 transition active:scale-95"
          aria-label="Daftar Sahabat"
        >
          <IconUsers size={18} />
        </button>

        {/* Tengah: Pill Kontekstual + Shortcut Admin */}
        <div className="flex items-center gap-2">
          {tab === "feed" ? (
            <div className="relative">
              <button
                onClick={() => setFilterMenuOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-full bg-panel-2 px-4 py-2 text-xs font-bold transition active:scale-95"
              >
                <span>{currentFilterLabel}</span>
                <IconChevronDown size={14} />
              </button>

              {filterMenuOpen && (
                <div
                  className="absolute top-full left-1/2 z-40 mt-2 w-48 -translate-x-1/2 rounded-2xl border border-white/10 bg-panel p-1.5 shadow-2xl"
                  onClick={() => setFilterMenuOpen(false)}
                >
                  <button
                    onClick={() => setFeedFilter("all")}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold ${
                      feedFilter === "all" ? "bg-gold text-black" : "hover:bg-panel-2"
                    }`}
                  >
                    <span>Everyone</span>
                    <span>{moments.length}</span>
                  </button>
                  <button
                    onClick={() => setFeedFilter("me")}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold ${
                      feedFilter === "me" ? "bg-gold text-black" : "hover:bg-panel-2"
                    }`}
                  >
                    <span>Momenku</span>
                  </button>
                  {friends.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setFeedFilter(f.id)}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold ${
                        feedFilter === f.id ? "bg-gold text-black" : "hover:bg-panel-2"
                      }`}
                    >
                      <span className="truncate">{f.display_name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => setFriendsOpen(true)}
              className="flex items-center gap-2 rounded-full bg-panel-2 px-4 py-2 text-xs font-bold transition active:scale-95"
            >
              <IconUsers size={15} className="text-gold" />
              <span>{friends.length} Friends</span>
            </button>
          )}
        </div>

        {/* Kanan: Profil (diberi p-1 supaya ring-offset tidak terpotong) */}
        <button
          onClick={() => setProfileOpen(true)}
          className="rounded-full p-1 transition active:scale-95"
          aria-label="Profil"
        >
          <Avatar profile={profile} size={36} ring />
        </button>
      </header>

      {/* Isi Layar Aktif */}
      <main className="relative min-h-0 flex-1">
        {tab === "camera" && (
          <CameraView
            userId={profile.id}
            friendCount={friends.length}
            notify={notify}
            onSent={() => {
              void reloadAll(profile.id);
              setTab("feed");
            }}
            onOpenHistory={() => setTab("feed")}
          />
        )}

        {tab === "feed" && (
          <FeedView
            moments={filteredMoments}
            userId={profile.id}
            focusId={focusMomentId}
            onFocusHandled={() => setFocusMomentId(null)}
            onReact={handleReact}
            onReply={handleReply}
            onOpenActivity={(m) => setActivityMoment(m)}
            onOpenCamera={() => setTab("camera")}
            onOpenFriends={() => setFriendsOpen(true)}
          />
        )}

        {tab === "memories" && (
          <MemoriesView
            moments={moments}
            userId={profile.id}
            onOpenMoment={(id) => {
              setFeedFilter("all");
              setFocusMomentId(id);
              setTab("feed");
            }}
          />
        )}
      </main>

      {/* Floating Bottom Navigation Pill */}
      <nav
        aria-label="Navigasi utama"
        className="pb-safe pointer-events-none fixed inset-x-0 bottom-3 z-30 flex justify-center"
      >
        <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-white/15 bg-black/80 px-4 py-2 shadow-2xl backdrop-blur-xl">
          <button
            onClick={() => setTab("memories")}
            className={`flex h-10 w-10 items-center justify-center rounded-full transition ${
              tab === "memories" ? "bg-panel-2 text-gold" : "text-muted hover:text-white"
            }`}
            aria-label="Memories & Kalender"
          >
            <IconGrid size={20} />
          </button>

          <button
            onClick={() => setTab("camera")}
            className={`flex h-12 w-12 items-center justify-center rounded-full border-2 transition ${
              tab === "camera"
                ? "border-gold bg-gold text-black"
                : "border-gold/70 bg-panel-2 text-white"
            }`}
            aria-label="Kamera"
          >
            <IconCamera size={22} />
          </button>

          <button
            onClick={() => setTab("feed")}
            className={`relative flex h-10 w-10 items-center justify-center rounded-full transition ${
              tab === "feed" ? "bg-panel-2 text-gold" : "text-muted hover:text-white"
            }`}
            aria-label="Feed Momen"
          >
            <IconStack size={20} />
            {moments.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-extrabold text-black">
                {moments.length}
              </span>
            )}
          </button>
        </div>
      </nav>

      {/* Bottom Sheets Terintegrasi */}
      <FriendsSheet
        open={friendsOpen}
        onClose={() => setFriendsOpen(false)}
        profile={profile}
        friends={friends}
        notify={notify}
        onChanged={() => void reloadAll(profile.id)}
      />
      <ProfileSheet
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        profile={profile}
        email={email}
        installPrompt={installPrompt}
        onInstalled={() => setInstallPrompt(null)}
        notify={notify}
        onChanged={() => void reloadAll(profile.id)}
        onLogout={handleLogout}
      />
      <ActivitySheet
        moment={activityMoment}
        people={peopleMap}
        onClose={() => setActivityMoment(null)}
        notify={notify}
        onDeleted={() => void reloadAll(profile.id)}
      />

      {/* Toast */}
      {toast && (
        <div className="animate-toast-in pointer-events-none fixed top-16 inset-x-0 z-50 mx-auto w-fit max-w-xs rounded-full bg-white px-4 py-2 text-center text-xs font-bold text-black shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
