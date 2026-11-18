"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { clockTime, timeAgo } from "@/lib/format";
import type { Moment, PublicProfile } from "@/lib/types";
import Avatar from "./Avatar";
import { IconSend } from "./Icons";
import { MomentMedia } from "./MomentMedia";

const QUICK_EMOJIS = ["💛", "🔥", "😍"];

interface FloatingEmoji {
  id: number;
  emoji: string;
  left: number;
  delay: number;
}

export default function FeedView({
  moments,
  userId,
  focusId,
  onFocusHandled,
  onReact,
  onReply,
  onOpenActivity,
  onOpenCamera,
  onOpenFriends,
}: {
  moments: Moment[];
  userId: string;
  focusId: string | null;
  onFocusHandled: () => void;
  onReact: (moment: Moment, emoji: string) => void;
  onReply: (moment: Moment, body: string) => Promise<boolean>;
  onOpenActivity: (moment: Moment) => void;
  onOpenCamera: () => void;
  onOpenFriends: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focusId) return;
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-id="${focusId}"]`);
    el?.scrollIntoView({ behavior: "instant" as ScrollBehavior, block: "start" });
    onFocusHandled();
  }, [focusId, onFocusHandled]);

  if (moments.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-8 pb-28 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-[28px] bg-panel-2 text-4xl">
          📭
        </div>
        <div>
          <h2 className="text-lg font-bold">Belum ada foto</h2>
          <p className="mt-1 text-sm text-muted">
            Tambah sahabat lewat kode undangan, lalu kirim foto pertamamu.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onOpenFriends}
            className="rounded-full bg-panel-2 px-4 py-2 text-sm font-semibold"
          >
            Tambah sahabat
          </button>
          <button
            onClick={onOpenCamera}
            className="rounded-full bg-gold px-4 py-2 text-sm font-bold text-black"
          >
            Buka kamera
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="h-full snap-y snap-mandatory overflow-y-auto no-scrollbar">
      {moments.map((m) => (
        <FeedItem
          key={m.id}
          moment={m}
          isOwn={m.user_id === userId}
          onReact={onReact}
          onReply={onReply}
          onOpenActivity={onOpenActivity}
        />
      ))}
    </div>
  );
}

function FeedItem({
  moment,
  isOwn,
  onReact,
  onReply,
  onOpenActivity,
}: {
  moment: Moment;
  isOwn: boolean;
  onReact: (moment: Moment, emoji: string) => void;
  onReply: (moment: Moment, body: string) => Promise<boolean>;
  onOpenActivity: (moment: Moment) => void;
}) {
  const [floating, setFloating] = useState<FloatingEmoji[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const counter = useRef(0);

  const reactionSummary = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of moment.reactions) map.set(r.emoji, (map.get(r.emoji) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [moment.reactions]);

  function burst(emoji: string) {
    const batch: FloatingEmoji[] = Array.from({ length: 6 }, (_, i) => ({
      id: ++counter.current,
      emoji,
      left: 10 + Math.random() * 80,
      delay: i * 0.07,
    }));
    setFloating((prev) => [...prev, ...batch]);
    const ids = new Set(batch.map((b) => b.id));
    setTimeout(() => setFloating((prev) => prev.filter((f) => !ids.has(f.id))), 2100);
  }

  function react(emoji: string) {
    burst(emoji);
    onReact(moment, emoji);
  }

  async function submitReply() {
    const body = reply.trim();
    if (!body || sending) return;
    setSending(true);
    const ok = await onReply(moment, body);
    setSending(false);
    if (ok) {
      setReply("");
      burst("💬");
    }
  }

  const author: PublicProfile | null = moment.profile;

  return (
    <section
      data-id={moment.id}
      className="flex h-full snap-start flex-col justify-between gap-2.5 px-3 pt-1 pb-24"
    >
      <div className="relative w-full flex-1 min-h-[370px] max-h-[540px] overflow-hidden rounded-[44px] border border-white/10 bg-panel shadow-2xl">
        <MomentMedia moment={moment} />

        {/* Emoji melayang */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {floating.map((f) => (
            <span
              key={f.id}
              className="animate-float-emoji absolute bottom-12 text-4xl"
              style={{ left: `${f.left}%`, animationDelay: `${f.delay}s` }}
            >
              {f.emoji}
            </span>
          ))}
        </div>

        <div className="absolute inset-x-0 bottom-5 flex flex-col items-center gap-1.5 px-6">
          {moment.caption && (
            <span className="max-w-full truncate rounded-full bg-black/55 px-4 py-2 text-sm font-semibold backdrop-blur-md">
              {moment.caption}
            </span>
          )}
        </div>

        {!isOwn && reactionSummary.length > 0 && (
          <span className="absolute right-4 bottom-5 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold backdrop-blur-md">
            {reactionSummary[0][0]} {moment.reactions.length}
          </span>
        )}
      </div>

      {/* Pengirim */}
      <div className="flex shrink-0 items-center justify-center gap-2">
        <Avatar profile={author} size={26} />
        <span className="text-sm font-bold">
          {isOwn ? "Kamu" : (author?.display_name ?? "Sahabat")}
        </span>
        <span className="text-sm text-muted">{timeAgo(moment.created_at)}</span>
        <span className="rounded-full bg-panel-2 px-2 py-0.5 text-xs text-muted">
          {clockTime(moment.created_at)}
        </span>
      </div>

      {/* Balas / Aktivitas */}
      {isOwn ? (
        <button
          onClick={() => onOpenActivity(moment)}
          className="mx-auto flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-panel-2 px-4 py-2.5 text-sm"
        >
          <span className="font-semibold">Aktivitas</span>
          {reactionSummary.length === 0 ? (
            <span className="text-muted">Belum ada reaksi</span>
          ) : (
            <span className="flex items-center gap-1.5">
              {reactionSummary.slice(0, 4).map(([emoji, count]) => (
                <span key={emoji}>
                  {emoji}
                  <span className="ml-0.5 text-xs text-muted">{count}</span>
                </span>
              ))}
            </span>
          )}
        </button>
      ) : (
        <div className="flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-panel-2 py-1.5 pr-1.5 pl-4">
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value.slice(0, 200))}
            onKeyDown={(e) => e.key === "Enter" && void submitReply()}
            placeholder={`Balas ${author?.display_name ?? ""}…`}
            className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder-white/40 outline-none"
          />
          {reply.trim() ? (
            <button
              onClick={() => void submitReply()}
              disabled={sending}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-gold text-black"
              aria-label="Kirim balasan"
            >
              <IconSend size={16} />
            </button>
          ) : (
            <div className="flex items-center gap-1">
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => react(emoji)}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-xl transition hover:scale-125 active:scale-90"
                  aria-label={`Reaksi ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
