"use client";

import { mediaUrl } from "@/lib/supabase";
import type { Moment } from "@/lib/types";

/** Foto utama di kartu Feed. */
export function MomentMedia({ moment }: { moment: Moment }) {
  const url = mediaUrl(moment.media_path);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={moment.caption ?? "Foto Momen"}
      className="h-full w-full object-cover"
      loading="lazy"
    />
  );
}

/** Thumbnail kecil untuk grid Memories / kalender. */
export function MomentThumb({ moment, className = "" }: { moment: Moment; className?: string }) {
  const url = mediaUrl(moment.media_path);
  return (
    <span className={`relative block h-full w-full overflow-hidden bg-panel-3 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
    </span>
  );
}
