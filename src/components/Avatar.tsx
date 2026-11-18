import { avatarGradient, initials } from "@/lib/format";
import type { PublicProfile } from "@/lib/types";

export default function Avatar({
  profile,
  size = 36,
  ring = false,
}: {
  profile: Pick<PublicProfile, "id" | "display_name"> | null;
  size?: number;
  ring?: boolean;
}) {
  const name = profile?.display_name ?? "?";
  return (
    <span
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-bold text-black ${
        ring ? "ring-2 ring-gold ring-offset-2 ring-offset-ink" : ""
      }`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * 0.36)),
        background: profile ? avatarGradient(profile.id) : "#3f3f46",
      }}
      aria-label={name}
    >
      {initials(name)}
    </span>
  );
}
