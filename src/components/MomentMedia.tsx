"use client";

import { useEffect, useRef, useState } from "react";
import { mediaUrl } from "@/lib/supabase";
import type { Moment } from "@/lib/types";
import { IconPlay } from "./Icons";

/** Media utama di kartu feed. Video auto-play (loop) saat kartu aktif. */
export function MomentMedia({
  moment,
  active,
  muted,
  onProgress,
}: {
  moment: Moment;
  active: boolean;
  muted: boolean;
  onProgress?: (ratio: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const url = mediaUrl(moment.media_path);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active) {
      video.play().catch(() => {
        /* autoplay diblokir: biarkan user tap */
      });
    } else {
      video.pause();
    }
  }, [active]);

  if (moment.media_type === "photo") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={moment.caption ?? "Momen"} className="h-full w-full object-cover" loading="lazy" />
    );
  }

  return (
    <video
      ref={videoRef}
      src={url}
      className="h-full w-full -scale-x-100 object-cover"
      playsInline
      autoPlay={active}
      loop
      muted={muted}
      preload="auto"
      onLoadedData={(e) => {
        if (active) {
          e.currentTarget.play().catch(() => undefined);
        }
      }}
      onClick={(e) => {
        const v = e.currentTarget;
        if (v.paused) v.play().catch(() => undefined);
      }}
      onTimeUpdate={(e) => {
        const v = e.currentTarget;
        const total = moment.duration || (Number.isFinite(v.duration) ? v.duration : 7);
        onProgress?.(Math.min(1, v.currentTime / total));
      }}
    />
  );
}

/** Thumbnail kecil untuk grid Memories / kalender. */
export function MomentThumb({ moment, className = "" }: { moment: Moment; className?: string }) {
  const url = mediaUrl(moment.media_path);
  const [failed, setFailed] = useState(false);

  return (
    <span className={`relative block h-full w-full overflow-hidden bg-panel-3 ${className}`}>
      {moment.media_type === "photo" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : failed ? (
        <span className="flex h-full w-full items-center justify-center bg-linear-to-br from-panel-3 to-black" />
      ) : (
        <video
          src={`${url}#t=0.1`}
          className="pointer-events-none h-full w-full -scale-x-100 object-cover"
          muted
          playsInline
          preload="metadata"
          onError={() => setFailed(true)}
        />
      )}
      {moment.media_type === "video" && (
        <span className="absolute right-0.5 bottom-0.5 flex items-center rounded bg-black/60 px-0.5 text-white">
          <IconPlay size={9} />
        </span>
      )}
    </span>
  );
}
