"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, uploadMoment } from "@/lib/api";
import {
  applyFilterEffectOnCanvas,
  applyFilterToImageBlob,
  baseMime,
  CAMERA_FILTERS,
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
  IconChevronLeft,
  IconChevronRight,
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
  bakedFilterId: string;
}

const RING_RADIUS = 36;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const HIGH_VIDEO_BITRATE = 6_000_000; // 6 Mbps agar video 7 detik tajam & tidak pecah
const HIGH_AUDIO_BITRATE = 128_000;

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
  const filterCanvasRafRef = useRef(0);
  const stopTimerRef = useRef<number | undefined>(undefined);
  const bannerTimerRef = useRef<number | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const capturedUrlRef = useRef<string | null>(null);
  const swipeStartXRef = useRef<number | null>(null);
  const swipeCurrentXRef = useRef<number | null>(null);

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

  // Filter kamera (index 0 = paling kiri = Normal)
  const [filterIdx, setFilterIdx] = useState(0);
  const [filterPulse, setFilterPulse] = useState(false);
  const activeFilter = CAMERA_FILTERS[filterIdx] ?? CAMERA_FILTERS[0];

  const selectFilterIndex = useCallback((nextIdx: number) => {
    const clamped = Math.max(0, Math.min(CAMERA_FILTERS.length - 1, nextIdx));
    setFilterIdx(clamped);
    setFilterPulse(true);
    window.clearTimeout(bannerTimerRef.current);
    bannerTimerRef.current = window.setTimeout(() => setFilterPulse(false), 350);
  }, []);

  // ---------- Kamera Resolusi Tinggi (Anti-Pecah) ----------
  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error(
            "Browser ini tidak mendukung akses kamera. Buka lewat HTTPS / browser terbaru.",
          );
        }

        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: facing,
              width: { ideal: 1920, min: 1280 },
              height: { ideal: 1080, min: 720 },
              frameRate: { ideal: 30, max: 60 },
            },
            audio: false,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: facing,
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
        }

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

    void startCamera();
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
      window.clearTimeout(bannerTimerRef.current);
      cancelAnimationFrame(rafRef.current);
      cancelAnimationFrame(filterCanvasRafRef.current);
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
      audioRef.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      audioRef.current = null;
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

  // ---------- Swipe Kanan / Kiri pada Tengah Gambar untuk Ganti Filter ----------
  function onSwipeStart(clientX: number) {
    swipeStartXRef.current = clientX;
    swipeCurrentXRef.current = clientX;
  }

  function onSwipeMove(clientX: number) {
    if (swipeStartXRef.current === null) return;
    swipeCurrentXRef.current = clientX;
  }

  function onSwipeEnd(clientX?: number) {
    if (swipeStartXRef.current === null) return;
    const endX = clientX ?? swipeCurrentXRef.current ?? swipeStartXRef.current;
    const deltaX = endX - swipeStartXRef.current;
    swipeStartXRef.current = null;
    swipeCurrentXRef.current = null;

    if (Math.abs(deltaX) < 30) return;

    if (deltaX < 0) {
      // Geser ke kiri -> maju ke filter berikutnya
      selectFilterIndex(filterIdx + 1);
    } else {
      // Geser ke kanan -> kembali ke arah paling kiri (Normal)
      selectFilterIndex(filterIdx - 1);
    }
  }

  // ---------- Foto Resolusi Tinggi ----------
  async function takePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    try {
      // Simpan frame dasar tanpa filter dulu supaya di layar preview user tetap bisa ganti-ganti filter!
      const rawBlob = await flashThen(() =>
        captureSquareFrame(video, 1440, facing === "user", CAMERA_FILTERS[0]),
      );
      showCaptured({
        blob: rawBlob,
        url: URL.createObjectURL(rawBlob),
        type: "photo",
        duration: null,
        mime: "image/jpeg",
        bakedFilterId: "normal",
      });
    } catch (err) {
      notify(errorMessage(err));
    }
  }

  // ---------- Video 7 Detik HD (Anti-Pecah + Mendukung Filter) ----------
  const stopRecording = useCallback(() => {
    window.clearTimeout(stopTimerRef.current);
    cancelAnimationFrame(rafRef.current);
    cancelAnimationFrame(filterCanvasRafRef.current);
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    recorderRef.current = null;
    setRecording(false);
    setProgress(0);
  }, []);

  async function startRecording() {
    const stream = streamRef.current;
    const videoEl = videoRef.current;
    if (!stream || !videoEl) return;
    if (typeof MediaRecorder === "undefined") {
      notify("Browser ini belum mendukung rekam video.");
      return;
    }

    const audio = await acquireAudio();
    let videoTracks = stream.getVideoTracks();
    const chosenFilter = activeFilter;

    if (
      videoEl.videoWidth > 0 &&
      typeof HTMLCanvasElement.prototype.captureStream === "function" &&
      chosenFilter.id !== "normal"
    ) {
      const vw = videoEl.videoWidth;
      const vh = videoEl.videoHeight;
      const side = Math.min(vw, vh);
      const sx = (vw - side) / 2;
      const sy = (vh - side) / 2;
      const outSide = Math.min(1080, Math.max(720, side));

      const recCanvas = document.createElement("canvas");
      recCanvas.width = outSide;
      recCanvas.height = outSide;
      const ctx = recCanvas.getContext("2d");

      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        const renderFrame = () => {
          ctx.save();
          if (chosenFilter.css !== "none") {
            ctx.filter = chosenFilter.css;
          }
          ctx.drawImage(videoEl, sx, sy, side, side, 0, 0, outSide, outSide);
          ctx.restore();

          if (chosenFilter.id !== "normal") {
            applyFilterEffectOnCanvas(ctx, outSide, outSide, chosenFilter);
          }
          filterCanvasRafRef.current = requestAnimationFrame(renderFrame);
        };
        renderFrame();
        const canvasStream = recCanvas.captureStream(30);
        if (canvasStream.getVideoTracks().length > 0) {
          videoTracks = canvasStream.getVideoTracks();
        }
      }
    }

    const mixed = new MediaStream([...videoTracks, ...(audio?.getAudioTracks() ?? [])]);
    const preferred = pickVideoMimeType();

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(mixed, {
        mimeType: preferred,
        videoBitsPerSecond: HIGH_VIDEO_BITRATE,
        audioBitsPerSecond: HIGH_AUDIO_BITRATE,
      });
    } catch {
      recorder = new MediaRecorder(mixed);
    }

    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      cancelAnimationFrame(filterCanvasRafRef.current);
      const elapsed = (performance.now() - recStartRef.current) / 1000;
      const mime = baseMime(recorder.mimeType || preferred || "video/webm");
      const blob = new Blob(chunksRef.current, { type: mime });
      chunksRef.current = [];
      if (elapsed < 1) {
        notify("Video terlalu singkat, rekam minimal 1 detik 🙂");
        return;
      }
      showCaptured({
        blob,
        url: URL.createObjectURL(blob),
        type: "video",
        duration: round1(Math.min(MAX_VIDEO_SECONDS, elapsed)),
        mime,
        bakedFilterId: chosenFilter.id,
      });
    };

    recorder.start(250);
    recorderRef.current = recorder;
    recStartRef.current = performance.now();
    setRecording(true);

    const tick = () => {
      const ratio = Math.min(
        1,
        (performance.now() - recStartRef.current) / (MAX_VIDEO_SECONDS * 1000),
      );
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
        showCaptured({
          blob,
          url: URL.createObjectURL(blob),
          type: "photo",
          duration: null,
          mime: "image/jpeg",
          bakedFilterId: "normal",
        });
      } else if (file.type.startsWith("video/")) {
        const duration = await getVideoDuration(file);
        if (!Number.isFinite(duration) || duration > MAX_VIDEO_SECONDS + 0.5) {
          notify(
            `Video maksimal ${MAX_VIDEO_SECONDS} detik (video ini ${duration.toFixed(1)} detik)`,
          );
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
          bakedFilterId: "normal",
        });
      } else {
        notify("Pilih foto atau video ya");
      }
    } catch (err) {
      notify(errorMessage(err));
    }
  }

  // ---------- Siapkan Blob Final (Bake Filter untuk Foto) ----------
  async function getFinalBlob(): Promise<Blob> {
    if (!captured) throw new Error("Tidak ada media");
    if (
      captured.type === "photo" &&
      activeFilter.id !== "normal" &&
      captured.bakedFilterId !== activeFilter.id
    ) {
      return applyFilterToImageBlob(captured.blob, activeFilter);
    }
    return captured.blob;
  }

  // ---------- Kirim ----------
  async function send() {
    if (!captured || sending) return;
    setSending(true);
    try {
      const finalBlob = await getFinalBlob();
      if (finalBlob.size > MAX_UPLOAD_BYTES) {
        notify("File terlalu besar (maks 10 MB)");
        return;
      }

      if (onLocalMoment) {
        const persistedUrl = URL.createObjectURL(finalBlob);
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
        blob: finalBlob,
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

  async function download() {
    if (!captured) return;
    const finalBlob = await getFinalBlob();
    const url = URL.createObjectURL(finalBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `depong-${Date.now()}.${extFromMime(captured.mime)}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const elapsedSec = Math.min(MAX_VIDEO_SECONDS, Math.floor(progress * MAX_VIDEO_SECONDS));
  const shouldApplyPreviewFilter =
    !captured || captured.bakedFilterId !== activeFilter.id;

  const isVideoMirror = facing === "user" && (!captured || captured.type === "video");
  const filterCssValue =
    shouldApplyPreviewFilter && activeFilter.css !== "none" ? activeFilter.css : undefined;

  const videoFilterStyle: React.CSSProperties = {
    filter: filterCssValue,
    WebkitFilter: filterCssValue,
    transform: isVideoMirror ? "scaleX(-1) translateZ(0)" : "translateZ(0)",
  };

  const photoFilterStyle: React.CSSProperties = {
    filter: filterCssValue,
    WebkitFilter: filterCssValue,
    transform: "translateZ(0)",
  };

  return (
    <div className="flex h-full flex-col items-center justify-between gap-4 px-4 pt-2 pb-28">
      {/* Viewfinder squircle (Mendukung Swipe Kanan/Kiri untuk Filter) */}
      <div
        onTouchStart={(e) => onSwipeStart(e.touches[0].clientX)}
        onTouchMove={(e) => onSwipeMove(e.touches[0].clientX)}
        onTouchEnd={(e) => onSwipeEnd(e.changedTouches[0]?.clientX)}
        onMouseDown={(e) => onSwipeStart(e.clientX)}
        onMouseMove={(e) => onSwipeMove(e.clientX)}
        onMouseUp={(e) => onSwipeEnd(e.clientX)}
        className="relative aspect-square w-full touch-pan-y overflow-hidden rounded-[44px] border border-white/10 bg-panel shadow-2xl select-none"
      >
        <video
          ref={videoRef}
          style={videoFilterStyle}
          className={`h-full w-full object-cover transition-[filter] duration-200 ${
            captured ? "invisible" : ""
          }`}
          playsInline
          muted
          autoPlay
        />

        {captured &&
          (captured.type === "photo" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={captured.url}
              alt="Pratinjau"
              style={photoFilterStyle}
              className="absolute inset-0 h-full w-full object-cover transition-[filter] duration-200"
            />
          ) : (
            <video
              src={captured.url}
              style={videoFilterStyle}
              className="absolute inset-0 h-full w-full object-cover transition-[filter] duration-200"
              playsInline
              autoPlay
              loop
              muted
            />
          ))}

        {/* Overlay Color-Grading Live (Menjamin filter 100% terlihat di iOS Safari & semua HP) */}
        {shouldApplyPreviewFilter && activeFilter.tint && activeFilter.tint[3] > 0 && (
          <div
            className="pointer-events-none absolute inset-0 transition-opacity duration-200"
            style={{
              backgroundColor: `rgba(${activeFilter.tint[0]}, ${activeFilter.tint[1]}, ${activeFilter.tint[2]}, ${activeFilter.tint[3]})`,
              mixBlendMode: (activeFilter.blendMode as React.CSSProperties["mixBlendMode"]) ?? "overlay",
            }}
          />
        )}

        {shouldApplyPreviewFilter && activeFilter.id === "mono" && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backdropFilter: "grayscale(1) contrast(1.25)",
              WebkitBackdropFilter: "grayscale(1) contrast(1.25)",
            }}
          />
        )}

        {shouldApplyPreviewFilter && activeFilter.vignette && activeFilter.vignette > 0 && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: `radial-gradient(circle, rgba(0,0,0,0) 42%, rgba(0,0,0,${activeFilter.vignette}) 100%)`,
            }}
          />
        )}

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
              <p className="text-sm text-muted">Membuka kamera HD…</p>
            )}
          </div>
        )}

        {/* Kontrol atas viewfinder */}
        {!captured && (
          <div className="absolute inset-x-4 top-4 z-10 flex items-center justify-between">
            <button
              onClick={() => setFlashOn((v) => !v)}
              className={`flex h-10 w-10 items-center justify-center rounded-full bg-black/45 backdrop-blur-md ${
                flashOn ? "text-gold" : "text-white"
              }`}
              aria-label="Flash"
            >
              <IconBolt size={18} fill={flashOn ? "currentColor" : "none"} />
            </button>

            {recording ? (
              <span className="flex items-center gap-1.5 rounded-full bg-black/65 px-3 py-1.5 text-xs font-semibold backdrop-blur-md">
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                0:0{elapsedSec} / 0:0{MAX_VIDEO_SECONDS}
              </span>
            ) : (
              <span className="rounded-full bg-black/45 px-3 py-1.5 text-xs font-semibold text-white/90 backdrop-blur-md">
                {mode === "video" ? `HD Video ${MAX_VIDEO_SECONDS}s` : "HD Foto"}
              </span>
            )}

            {filterIdx > 0 ? (
              <button
                type="button"
                onClick={() => selectFilterIndex(0)}
                className="rounded-full bg-gold px-3 py-1.5 text-xs font-extrabold text-black shadow-lg"
              >
                Normal
              </button>
            ) : (
              <span className="h-10 w-10" />
            )}
          </div>
        )}

        {/* Satu Kapsul Filter Tunggal yang Rapi (Berubah Teks Saat Gambar Di-Swipe Kiri/Kanan) */}
        {(cameraReady || captured) && !recording && (
          <div
            className={`absolute inset-x-0 z-10 flex flex-col items-center gap-1.5 ${
              captured ? "bottom-16" : "bottom-4"
            }`}
          >
            <div
              className={`inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/60 px-3 py-1.5 shadow-lg backdrop-blur-md transition-transform duration-200 ${
                filterPulse ? "scale-105 border-gold/50" : "scale-100"
              }`}
            >
              <button
                type="button"
                onClick={() => selectFilterIndex(filterIdx - 1)}
                disabled={filterIdx === 0}
                className="flex h-5 w-5 items-center justify-center rounded-full text-white/80 transition hover:text-white disabled:opacity-25"
                aria-label="Filter sebelumnya"
              >
                <IconChevronLeft size={14} />
              </button>

              <span
                className={`min-w-[124px] text-center text-xs font-extrabold tracking-wide transition-colors ${
                  filterIdx === 0 ? "text-white/90" : "text-gold"
                }`}
              >
                {activeFilter.badge}
              </span>

              <button
                type="button"
                onClick={() => selectFilterIndex(filterIdx + 1)}
                disabled={filterIdx === CAMERA_FILTERS.length - 1}
                className="flex h-5 w-5 items-center justify-center rounded-full text-white/80 transition hover:text-white disabled:opacity-25"
                aria-label="Filter berikutnya"
              >
                <IconChevronRight size={14} />
              </button>
            </div>

            {/* Indikator titik posisi swipe (Paling kiri = Normal) */}
            <div className="flex items-center gap-1">
              {CAMERA_FILTERS.map((f, idx) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => selectFilterIndex(idx)}
                  aria-label={f.name}
                  className={`h-1.5 rounded-full transition-all duration-200 ${
                    idx === filterIdx ? "w-4 bg-gold" : "w-1.5 bg-white/35"
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Caption ala Locket saat pratinjau */}
        {captured && (
          <div className="absolute inset-x-0 bottom-5 z-10 flex justify-center px-6">
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value.slice(0, 60))}
              placeholder="Tambah pesan…"
              maxLength={60}
              className="w-auto max-w-full min-w-[60%] rounded-full bg-black/60 px-4 py-2 text-center text-sm font-semibold text-white placeholder-white/60 outline-none backdrop-blur-md"
            />
          </div>
        )}

        {captured?.type === "video" && (
          <span className="absolute top-4 left-4 z-10 rounded-full bg-black/55 px-3 py-1.5 text-xs font-semibold backdrop-blur-md">
            🎥 HD {captured.duration?.toFixed(1)}s
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
              onClick={() => void download()}
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
                <circle
                  cx="40"
                  cy="40"
                  r={RING_RADIUS}
                  fill="none"
                  stroke="#f5c451"
                  strokeWidth="4"
                  opacity={recording ? 0.3 : 1}
                />
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

          <button
            onClick={onOpenHistory}
            className="flex flex-col items-center gap-0.5 text-xs font-semibold text-muted"
          >
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
