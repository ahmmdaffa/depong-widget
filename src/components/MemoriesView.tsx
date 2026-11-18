"use client";

import { useMemo, useState } from "react";
import { computeStreak, dayKey } from "@/lib/format";
import type { Moment } from "@/lib/types";
import { IconChevronLeft, IconChevronRight } from "./Icons";
import { MomentThumb } from "./MomentMedia";

const WEEKDAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

export default function MemoriesView({
  moments,
  userId,
  onOpenMoment,
}: {
  moments: Moment[];
  userId: string;
  onOpenMoment: (id: string) => void;
}) {
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const mine = useMemo(() => moments.filter((m) => m.user_id === userId), [moments, userId]);
  const scoped = scope === "mine" ? mine : moments;

  // Momen terbaru per tanggal (moments sudah urut terbaru → terlama)
  const byDay = useMemo(() => {
    const map = new Map<string, Moment>();
    for (const m of scoped) {
      const key = dayKey(new Date(m.created_at));
      if (!map.has(key)) map.set(key, m);
    }
    return map;
  }, [scoped]);

  const streak = useMemo(() => computeStreak(mine.map((m) => m.created_at)), [mine]);
  const videoCount = useMemo(() => mine.filter((m) => m.media_type === "video").length, [mine]);

  const cells = useMemo(() => {
    const first = new Date(month);
    const offset = (first.getDay() + 6) % 7; // Senin = 0
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const out: (Date | null)[] = Array.from({ length: offset }, () => null);
    for (let d = 1; d <= daysInMonth; d++) out.push(new Date(month.getFullYear(), month.getMonth(), d));
    return out;
  }, [month]);

  const todayKey = dayKey(new Date());
  const activeDays = cells.filter((c) => c && byDay.has(dayKey(c))).length;
  const monthLabel = month.toLocaleDateString("id-ID", { month: "long", year: "numeric" });

  function shiftMonth(delta: number) {
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  }

  return (
    <div className="h-full overflow-y-auto px-4 pt-2 pb-32 no-scrollbar">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Memories</h1>
        <div className="inline-flex rounded-full bg-panel p-1 text-xs font-bold">
          <button
            onClick={() => setScope("mine")}
            className={`rounded-full px-3 py-1 ${scope === "mine" ? "bg-gold text-black" : "text-muted"}`}
          >
            Punyaku
          </button>
          <button
            onClick={() => setScope("all")}
            className={`rounded-full px-3 py-1 ${scope === "all" ? "bg-gold text-black" : "text-muted"}`}
          >
            Semua
          </button>
        </div>
      </div>

      {/* Kolase terbaru */}
      <div className="rounded-[28px] border border-white/10 bg-panel p-2.5">
        {scoped.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">Belum ada momen di sini.</p>
        ) : (
          <div className="grid grid-cols-6 gap-1.5">
            {scoped.slice(0, 24).map((m) => (
              <button
                key={m.id}
                onClick={() => onOpenMoment(m.id)}
                className="aspect-square overflow-hidden rounded-lg transition active:scale-95"
              >
                <MomentThumb moment={m} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Kalender bulanan */}
      <div className="mt-4 rounded-[28px] border border-white/10 bg-panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-base font-bold capitalize">{monthLabel}</div>
            <div className="text-xs text-muted">{activeDays} hari aktif</div>
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => shiftMonth(-1)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-panel-2"
              aria-label="Bulan sebelumnya"
            >
              <IconChevronLeft size={16} />
            </button>
            <button
              onClick={() => shiftMonth(1)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-panel-2"
              aria-label="Bulan berikutnya"
            >
              <IconChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="mb-1.5 grid grid-cols-7 gap-1.5 text-center text-xs font-semibold text-muted">
          {WEEKDAYS.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {cells.map((date, i) => {
            if (!date) return <span key={`empty-${i}`} />;
            const key = dayKey(date);
            const m = byDay.get(key);
            const isToday = key === todayKey;
            return m ? (
              <button
                key={key}
                onClick={() => onOpenMoment(m.id)}
                className={`relative aspect-square overflow-hidden rounded-xl transition active:scale-95 ${
                  isToday ? "ring-2 ring-gold" : ""
                }`}
              >
                <MomentThumb moment={m} />
                <span className="absolute top-0.5 left-1 text-[10px] font-bold text-white drop-shadow">
                  {date.getDate()}
                </span>
              </button>
            ) : (
              <span
                key={key}
                className={`flex aspect-square items-center justify-center rounded-xl bg-panel-2 text-xs ${
                  isToday ? "font-bold text-gold ring-2 ring-gold/60" : "text-muted"
                }`}
              >
                {date.getDate()}
              </span>
            );
          })}
        </div>
      </div>

      {/* Statistik */}
      <div className="mt-4 flex justify-center">
        <div className="flex items-center gap-3 rounded-full border border-white/10 bg-panel-2 px-4 py-2 text-xs font-semibold">
          <span>💛 {mine.length} momen</span>
          <span className="opacity-30">•</span>
          <span>🎥 {videoCount} video</span>
          <span className="opacity-30">•</span>
          <span>🔥 {streak} hari streak</span>
        </div>
      </div>
    </div>
  );
}
