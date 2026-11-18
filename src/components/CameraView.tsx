"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, uploadMoment } from "@/lib/api";
import {
  baseMime,
  captureSquareFrame,
  extFromMime,
  getVideoDuration,
  MAX_UPLOAD_BYTES,
  MAX_VIDEO_SECONDS,
  pickVideoMimeType,
  resizeImage,
} from "@/lib/media";
import type { MediaType } from "@/lib/types";
import {
  IconBolt,
  IconChevronDown,
  IconDownload,
  IconFlip,
  IconImage,
  IconSend,
  IconX,
} from "./Icons";

interface Captured {
  blob: Blob;
  url: string;
  type: MediaType;
  duration: number | null;
  mime: string;
}

const RING_RADIUS = 36;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const round1 = (n: number) => Math.round(n * 10) / 10;

export default function CameraView({
  userId,
  friendCount,
  notify,
  onSent,
  onOpenHistory,
  onLocalMoment,
}: {
  userId: string;
  friendCount: number;
  notify: (msg: string) => void;
  onSent: () => void;
  onOpenHistory: () => void;
  onLocalMoment?: (input: {
    url: string;
    mediaType: MediaType;
    duration: number | null;
    caption: string;
  }) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recStartRef = useRef(0);
  const rafRef = useRef(0);
  const stopTimerRef = useRef<number | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const capturedUrlRef = useRef<string | null>(null);

  const [mode, setMode] = useState<MediaType>("photo");
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [captured, setCaptured] = useState<Captured | null>(null);
  const [caption, setCaption] = useState("");
  const [sending, setSending] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [flashVisible, setFlashVisible] = useState(false);

  // ---------- Kamera ----------
  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Browser ini tidak mendukung akses kamera. Buka lewat HTTPS / browser terbaru.");
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 1280 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
        setCameraError(null);
        setCameraReady(true);
      } catch (err) {
        if (cancelled) return;
        setCameraReady(false);
        const name = err instanceof DOMException ? err.name : "";
        setCameraError(
          name === "NotAllowedError"
            ? "Izin kamera ditolak. Aktifkan izin kamera di pengaturan browser lalu coba lagi."
            : name === "NotFoundError"
              ? "Kamera tidak ditemukan di perangkat ini."
              : errorMessage(err),
        );
      }
    }

    startCamera();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [facing, retryKey]);

  // Bersihkan semua resource saat komponen ditutup
  useEffect(() => {
    return () => {
      window.clearTimeout(stopTimerRef.current);
      cancelAnimationFrame(rafRef.current);
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") {
        rec.onstop = null;
        rec.stop();
      }
      audioRef.current?.getTracks().forEach((t) => t.stop());
      if (capturedUrlRef.current) URL.revokeObjectURL(capturedUrlRef.current);
    };
  }, []);

  const acquireAudio = useCallback(async () => {
    if (audioRef.current) return audioRef.current;
    try {
      audioRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      audioRef.current = null; // tetap bisa rekam tanpa suara
    }
    return audioRef.current;
  }, []);

  const showCaptured = useCallback((next: Captured) => {
    if (capturedUrlRef.current) URL.revokeObjectURL(capturedUrlRef.current);
    capturedUrlRef.current = next.url;
    setCaptured(next);
  }, []);

  const discard = useCallback(() => {
    if (capturedUrlRef.current) URL.revokeObjectURL(capturedUrlRef.current);
    capturedUrlRef.current = null;
    setCaptured(null);
    setCaption("");
  }, []);

  function selectMode(next: MediaType) {
    if (recording || captured) return;
    setMode(next);
    if (next === "video") void acquireAudio();
  }

  async function flashThen<T>(fn: () => Promise<T>): Promise<T> {
    if (flashOn) {
      setFlashVisible(true);
      await new Promise((r) => setTimeout(r, 180));
    }
    try {
      return await fn();
    } finally {
      setFlashVisible(false);
    }
  }

  // ---------- Foto ----------
  async function takePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    try {
      const blob = await flashThen(() => captureSquareFrame(video, 1080, facing === "user"));
      showCaptured({ blob, url: URL.createObjectURL(blob), type: "photo", duration: null, mime: "image/jpeg" });
    } catch (err) {
      notify(errorMessage(err));
    }
  }

  // ---------- Video 7 detik ----------
  const stopRecording = useCallback(() => {
    window.clearTimeout(stopTimerRef.current);
    cancelAnimationFrame(rafRef.current);
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    recorderRef.current = null;
    setRecording(false);
    setProgress(0);
  }, []);

  async function startRecording() {
    const stream = streamRef.current;
    if (!stream) return;
    if (typeof MediaRecorder === "undefined") {
      notify("Browser ini belum mendukung rekam video.");
      return;
    }

    const audio = await acquireAudio();
    const mixed = new MediaStream([...stream.getVideoTracks(), ...(audio?.getAudioTracks() ?? [])]);
    const preferred = pickVideoMimeType();

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(mixed, {
        mimeType: preferred,
        videoBitsPerSecond: 2_000_000,
        audioBitsPerSecond: 96_000,
      });
    } catch {
      recorder = new MediaRecorder(mixed);
    }

    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const elapsed = (performance.now() - recStartRef.current) / 1000;
      const mime = baseMime(recorder.mimeType || preferred || "video/webm");
      const blob = new Blob(chunksRef.current, { type: mime });
      chunksRef.current = [];
      if (elapsed < 1) {
        notify("Video terlalu singkat, tahan minimal 1 detik 🙂");
        return;
      }
      showCaptured({
        blob,
        url: URL.createObjectURL(blob),
        type: "video",
        duration: round1(Math.min(MAX_VIDEO_SECONDS, elapsed)),
        mime,
      });
    };

    recorder.start(250);
    recorderRef.current = recorder;
    recStartRef.current = performance.now();
    setRecording(true);

    const tick = () => {
      const ratio = Math.min(1, (performance.now() - recStartRef.current) / (MAX_VIDEO_SECONDS * 1000));
      setProgress(ratio);
      if (ratio < 1 && recorderRef.current?.state === "recording") {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    stopTimerRef.current = window.setTimeout(stopRecording, MAX_VIDEO_SECONDS * 1000);
  }

  function handleShutter() {
    if (captured || !cameraReady) return;
    if (mode === "photo") void takePhoto();
    else if (recording) stopRecording();
    else void startRecording();
  }

  // ---------- Galeri ----------
  async function handlePickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      if (file.type.startsWith("image/")) {
        const blob = await resizeImage(file);
        showCaptured({ blob, url: URL.createObjectURL(blob), type: "photo", duration: null, mime: "image/jpeg" });
      } else if (file.type.startsWith("video/")) {
        const duration = await getVideoDuration(file);
        if (!Number.isFinite(duration) || duration > MAX_VIDEO_SECONDS + 0.5) {
          notify(`Video maksimal ${MAX_VIDEO_SECONDS} detik (video ini ${duration.toFixed(1)} detik)`);
          return;
        }
        if (file.size > MAX_UPLOAD_BYTES) {
          notify("Ukuran video maksimal 10 MB");
          return;
        }
        showCaptured({
          blob: file,
          url: URL.createObjectURL(file),
          type: "video",
          duration: round1(duration),
          mime: file.type,
        });
      } else {
        notify("Pilih foto atau video ya");
      }
    } catch (err) {
      notify(errorMessage(err));
    }
  }

  // ---------- Kirim ----------
  async function send() {
    if (!captured || sending) return;
    if (captured.blob.size > MAX_UPLOAD_BYTES) {
      notify("File terlalu besar (maks 10 MB)");
      return;
    }
    setSending(true);
    try {
      if (onLocalMoment) {
        const persistedUrl = URL.createObjectURL(captured.blob);
        onLocalMoment({
          url: persistedUrl,
          mediaType: captured.type,
          duration: captured.duration,
          caption,
        });
        discard();
        notify("Momen ditambahkan ke Feed (Mode Demo) 💛");
        onSent();
        return;
      }
      await uploadMoment({
        userId,
        blob: captured.blob,
        mime: captured.mime,
        mediaType: captured.type,
        duration: captured.duration,
        caption,
      });
      discard();
      notify(friendCount > 0 ? `Terkirim ke ${friendCount} sahabat 💛` : "Momen tersimpan 💛");
      onSent();
    } catch (err) {
      notify(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  function download() {
    if (!captured) return;
    const a = document.createElement("a");
    a.href = captured.url;
    a.download = `depong-${Date.now()}.${extFromMime(captured.mime)}`;
    a.click();
  }

  const elapsedSec = Math.min(MAX_VIDEO_SECONDS, Math.floor(progress * MAX_VIDEO_SECONDS));

  return (
    <div className="flex h-full flex-col items-center justify-between gap-4 px-4 pt-2 pb-28">
      {/* Viewfinder squircle */}
      <div className="relative aspect-square w-full overflow-hidden rounded-[44px] border border-white/10 bg-panel shadow-2xl">
        <video
          ref={videoRef}
          className={`h-full w-full object-cover ${facing === "user" ? "-scale-x-100" : ""} ${
            captured ? "invisible" : ""
          }`}
          playsInline
          muted
          autoPlay
        />

        {captured &&
          (captured.type === "photo" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={captured.url} alt="Pratinjau" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <video
              src={captured.url}
              className="absolute inset-0 h-full w-full object-cover"
              playsInline
              autoPlay
              loop
              muted
            />
          ))}

        {flashVisible && <div className="absolute inset-0 bg-white" />}

        {!cameraReady && !captured && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8 text-center">
            {cameraError ? (
              <>
                <p className="text-sm text-white/80">{cameraError}</p>
                <button
                  onClick={() => setRetryKey((k) => k + 1)}
                  className="rounded-full bg-gold px-4 py-2 text-xs font-bold text-black"
                >
                  Coba lagi
                </button>
                <p className="text-xs text-muted">Atau pilih foto/video dari galeri ↓</p>
              </>
            ) : (
              <p className="text-sm text-muted">Membuka kamera…</p>
            )}
          </div>
        )}

        {/* Kontrol atas viewfinder */}
        {!captured && (
          <div className="absolute inset-x-4 top-4 flex items-center justify-between">
            <button
              onClick={() => setFlashOn((v) => !v)}
              className={`flex h-10 w-10 items-center justify-center rounded-full bg-black/40 backdrop-blur-md ${
                flashOn ? "text-gold" : "text-white"
              }`}
              aria-label="Flash"
            >
              <IconBolt size={18} fill={flashOn ? "currentColor" : "none"} />
            </button>

            {recording ? (
              <span className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold backdrop-blur-md">
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                0:0{elapsedSec} / 0:0{MAX_VIDEO_SECONDS}
              </span>
            ) : (
              <span className="rounded-full bg-black/40 px-3 py-1.5 text-xs font-semibold text-white/90 backdrop-blur-md">
                {mode === "video" ? `Video ${MAX_VIDEO_SECONDS}s` : "Foto"}
              </span>
            )}

            <span className="h-10 w-10" />
          </div>
        )}

        {/* Caption ala Locket */}
        {captured && (
          <div className="absolute inset-x-0 bottom-5 flex justify-center px-6">
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value.slice(0, 60))}
              placeholder="Tambah pesan…"
              maxLength={60}
              className="w-auto max-w-full min-w-[60%] rounded-full bg-black/55 px-4 py-2 text-center text-sm font-semibold text-white placeholder-white/60 outline-none backdrop-blur-md"
            />
          </div>
        )}

        {captured?.type === "video" && (
          <span className="absolute top-4 left-4 rounded-full bg-black/55 px-3 py-1.5 text-xs font-semibold backdrop-blur-md">
            🎥 {captured.duration?.toFixed(1)}s
          </span>
        )}
      </div>

      {/* Kontrol bawah */}
      {captured ? (
        <div className="flex w-full flex-col items-center gap-5">
          <div className="flex w-full items-center justify-around px-6">
            <button
              onClick={discard}
              disabled={sending}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-panel-2 text-white"
              aria-label="Batal"
            >
              <IconX size={22} />
            </button>
            <button
              onClick={send}
              disabled={sending}
              className="flex h-20 w-20 items-center justify-center rounded-full bg-gold text-black shadow-[0_0_40px_rgba(245,196,81,0.35)] transition active:scale-95 disabled:opacity-70"
              aria-label="Kirim"
            >
              {sending ? (
                <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-black/30 border-t-black" />
              ) : (
                <IconSend size={30} />
              )}
            </button>
            <button
              onClick={download}
              disabled={sending}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-panel-2 text-white"
              aria-label="Simpan ke perangkat"
            >
              <IconDownload size={20} />
            </button>
          </div>
          <p className="text-xs text-muted">
            Kirim ke {friendCount > 0 ? `${friendCount} sahabat` : "widget kamu"}
          </p>
        </div>
      ) : (
        <div className="flex w-full flex-col items-center gap-4">
          {/* Toggle FOTO / VIDEO 7s */}
          <div className="inline-flex rounded-full border border-white/10 bg-panel p-1">
            <button
              onClick={() => selectMode("photo")}
              disabled={recording}
              className={`rounded-full px-5 py-1.5 text-xs font-bold transition ${
                mode === "photo" ? "bg-gold text-black" : "text-muted"
              }`}
            >
              FOTO
            </button>
            <button
              onClick={() => selectMode("video")}
              disabled={recording}
              className={`flex items-center gap-1.5 rounded-full px-5 py-1.5 text-xs font-bold transition ${
                mode === "video" ? "bg-gold text-black" : "text-muted"
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-red-500" />
              VIDEO {MAX_VIDEO_SECONDS}s
            </button>
          </div>

          <div className="flex w-full items-center justify-around px-6">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={recording}
              className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-panel-2 text-white/90"
              aria-label="Galeri"
            >
              <IconImage size={22} />
            </button>

            {/* Shutter ring emas + progress 7 detik */}
            <button
              onClick={handleShutter}
              disabled={!cameraReady}
              className="relative flex h-20 w-20 items-center justify-center transition active:scale-95 disabled:opacity-50"
              aria-label={mode === "photo" ? "Ambil foto" : recording ? "Stop rekam" : "Mulai rekam"}
            >
              <svg className="absolute inset-0 -rotate-90" width="80" height="80" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r={RING_RADIUS} fill="none" stroke="#f5c451" strokeWidth="4" opacity={recording ? 0.3 : 1} />
                {recording && (
                  <circle
                    cx="40"
                    cy="40"
                    r={RING_RADIUS}
                    fill="none"
                    stroke="#f5c451"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={RING_CIRCUMFERENCE}
                    strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
                  />
                )}
              </svg>
              <span
                className={`flex items-center justify-center rounded-full transition-all duration-200 ${
                  recording ? "h-[62px] w-[62px] bg-white/15" : "h-[62px] w-[62px] bg-white"
                }`}
              >
                {recording ? (
                  <span className="h-6 w-6 rounded-md bg-red-500" />
                ) : (
                  mode === "video" && <span className="h-5 w-5 rounded-full bg-red-500" />
                )}
              </span>
            </button>

            <button
              onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
              disabled={recording}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-panel-2 text-white/90 transition active:rotate-180"
              aria-label="Ganti kamera"
            >
              <IconFlip size={22} />
            </button>
          </div>

          <button onClick={onOpenHistory} className="flex flex-col items-center gap-0.5 text-xs font-semibold text-muted">
            <span>History</span>
            <IconChevronDown size={16} />
          </button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={handlePickFile}
      />
    </div>
  );
}
