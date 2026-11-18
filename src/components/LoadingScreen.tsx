export function FullPageLoader({ label = "Menyiapkan Depong" }: { label?: string }) {
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-ink px-6 text-white select-none"
      role="status"
      aria-live="polite"
    >
      <div className="relative flex items-center justify-center">
        {/* Halo emas berdenyut lembut */}
        <span className="absolute h-24 w-24 animate-ping rounded-[32px] bg-gold/15 [animation-duration:2s]" />

        {/* Cincin berputar tipis */}
        <span className="absolute h-24 w-24 animate-spin rounded-[32px] border-2 border-transparent border-t-gold/80 [animation-duration:1.4s]" />

        {/* Ikon Depong */}
        <div className="relative flex h-20 w-20 items-center justify-center rounded-[28px] border-2 border-gold/90 bg-panel shadow-[0_0_40px_rgba(245,196,81,0.22)]">
          <span className="h-8 w-8 animate-pulse rounded-full bg-gold" />
        </div>
      </div>

      <div className="flex flex-col items-center gap-2">
        <span className="text-base font-extrabold tracking-tight text-white">Depong</span>
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gold [animation-delay:0ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gold [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gold [animation-delay:300ms]" />
        </div>
        <span className="text-xs font-medium text-muted">{label}</span>
      </div>
    </div>
  );
}

export function InlineLoader({ label }: { label?: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 py-8 text-center"
      role="status"
      aria-live="polite"
    >
      <div className="relative flex h-10 w-10 items-center justify-center">
        <span className="h-10 w-10 animate-spin rounded-full border-[3px] border-gold/20 border-t-gold" />
        <span className="absolute h-2.5 w-2.5 animate-pulse rounded-full bg-gold" />
      </div>
      {label && <span className="text-xs font-semibold text-muted">{label}</span>}
    </div>
  );
}
