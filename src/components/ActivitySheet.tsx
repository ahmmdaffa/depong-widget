"use client";

import { useEffect, useMemo, useState } from "react";
import { deleteMoment, errorMessage, fetchReplies } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import type { Moment, PublicProfile, Reply } from "@/lib/types";
import Avatar from "./Avatar";
import { IconTrash } from "./Icons";
import { InlineLoader } from "./LoadingScreen";
import Sheet from "./Sheet";

export default function ActivitySheet({
  moment,
  people,
  onClose,
  notify,
  onDeleted,
}: {
  moment: Moment | null;
  people: Map<string, PublicProfile>;
  onClose: () => void;
  notify: (msg: string) => void;
  onDeleted: () => void;
}) {
  const [replies, setReplies] = useState<Reply[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const momentId = moment?.id;

  useEffect(() => {
    if (!momentId) return;
    let active = true;
    fetchReplies(momentId)
      .then((data) => active && setReplies(data))
      .catch((err) => active && notify(errorMessage(err)));
    return () => {
      active = false;
      setReplies(null);
    };
  }, [momentId, notify]);

  const reactions = useMemo(
    () => [...(moment?.reactions ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [moment],
  );

  async function remove() {
    if (!moment || !window.confirm("Hapus momen ini untuk semua sahabat?")) return;
    setDeleting(true);
    try {
      await deleteMoment(moment);
      notify("Momen dihapus");
      onDeleted();
      onClose();
    } catch (err) {
      notify(errorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Sheet open={Boolean(moment)} onClose={onClose} title="Aktivitas" subtitle="Reaksi & balasan dari sahabat">
      <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">Reaksi ({reactions.length})</h3>
      {reactions.length === 0 ? (
        <p className="rounded-2xl bg-panel-2 p-3 text-sm text-muted">Belum ada reaksi.</p>
      ) : (
        <div className="space-y-1.5">
          {reactions.map((r) => {
            const who = people.get(r.user_id) ?? null;
            return (
              <div key={r.id} className="flex items-center gap-3 rounded-2xl bg-panel-2 p-2">
                <Avatar profile={who} size={30} />
                <span className="flex-1 text-sm font-semibold">{who?.display_name ?? "Sahabat"}</span>
                <span className="text-xl">{r.emoji}</span>
                <span className="w-10 text-right text-xs text-muted">{timeAgo(r.created_at)}</span>
              </div>
            );
          })}
        </div>
      )}

      <h3 className="mt-5 mb-2 text-xs font-semibold tracking-wider text-muted uppercase">
        Balasan ({replies?.length ?? "…"})
      </h3>
      {replies === null ? (
        <InlineLoader label="Memuat balasan…" />
      ) : replies.length === 0 ? (
        <p className="rounded-2xl bg-panel-2 p-3 text-sm text-muted">Belum ada balasan.</p>
      ) : (
        <div className="space-y-1.5">
          {replies.map((r) => (
            <div key={r.id} className="flex items-start gap-3 rounded-2xl bg-panel-2 p-2.5">
              <Avatar profile={r.sender} size={30} />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold">
                  {r.sender?.display_name ?? "Sahabat"}{" "}
                  <span className="font-normal text-muted">· {timeAgo(r.created_at)}</span>
                </div>
                <p className="text-sm break-words">{r.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={remove}
        disabled={deleting}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-panel-2 py-3 text-sm font-semibold text-red-400 disabled:opacity-50"
      >
        <IconTrash size={16} /> Hapus momen
      </button>
    </Sheet>
  );
}
