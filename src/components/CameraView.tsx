"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, uploadMoment } from "@/lib/api";
import {
  applyFilterToImageBlob,
  CAMERA_FILTERS,
  captureSquareFrame,
  composeDualCameraPhoto,
  MAX_UPLOAD_BYTES,
  PHOTO_CAPTURE_SIZE,
  resizeImage,
} from "@/lib/media";
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

interface CapturedPhoto {
  blob: Blob;
  url: string;
  bakedFilterId: string;
}

interface BackShot {
  blob: Blob;
  url: string;
}

const RING_RADIUS = 38;

export default function CameraView({
  userId,
  friendCount,
  notify,
  onSent,
  onOpenHistory,
}: {
  userId: string;
  friendCount: number;
  notify: (msg: string) => void;
  onSent: () => void;
  onOpenHistory: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const bannerTimerRef = useRef<number | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const capturedUrlRef = useRef<string | null>(null);
  const backShotUrlRef = useRef<string | null>(null);
  const swipeStartXRef = useRef<number | null>(null);
  const swipeCurrentXRef = useRef<number | null>(null);

  // Sesi foto 2 bagian dimulai dari kamera belakang ("environment"), lalu otomatis ke depan ("user")
  const [facing, setFacing] = useState<"user" | "environment">("environment");
  const [backShot, setBackShot] = useState<BackShot | null>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [captured, setCaptured] = useState<CapturedPhoto | null>(null);
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

  const clearBackShot = useCallback(() => {
    if (backShotUrlRef.current) URL.revokeObjectURL(backShotUrlRef.current);
    backShotUrlRef.current = null;
    setBackShot(null);
  }, []);

  // ---------- Kamera Resolusi Tinggi ----------
  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error(
            "Browser ini tidak mendukung akses kamera. Buka lewat HTTPS / browser terbaru.",
          );
        }

        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: facing },
              width: { ideal: 1920, min: 1280 },
              height: { ideal: 1080, min: 720 },
            },
            audio: false,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: facing } },
            audio: false,
          });
        }

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
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

  useEffect(() => {
    return () => {
      window.clearTimeout(bannerTimerRef.current);
      if (capturedUrlRef.current) URL.revokeObjectURL(capturedUrlRef.current);
      if (backShotUrlRef.current) URL.revokeObjectURL(backShotUrlRef.current);
    };
  }, []);

  const showCaptured = useCallback((next: CapturedPhoto) => {
    if (capturedUrlRef.current) URL.revokeObjectURL(capturedUrlRef.current);
    capturedUrlRef.current = next.url;
    setCaptured(next);
  }, []);

  const discard = useCallback(() => {
    if (capturedUrlRef.current) URL.revokeObjectURL(capturedUrlRef.current);
    capturedUrlRef.current = null;
    setCaptured(null);
    setCaption("");
    clearBackShot();
    setFacing("environment");
  }, [clearBackShot]);

  async function flashThen<T>(fn: () => Promise<T>): Promise<T> {
    if (flashOn) {
      setFlashVisible(true);
      await new Promise((r) => setTimeout(r, 160));
    }
    try {
      return await fn();
    } finally {
      setFlashVisible(false);
    }
  }

  // ---------- Swipe Kanan / Kiri pada Gambar untuk Ganti Filter ----------
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
    if (deltaX < 0) selectFilterIndex(filterIdx + 1);
    else selectFilterIndex(filterIdx - 1);
  }

  // ---------- Sesi Foto 2 Bagian (1. Belakang Bingkai Besar -> 2. Depan Bingkai Kecil) ----------
  async function takePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || captured) return;
    try {
      if (!backShot) {
        const firstBlob = await flashThen(() =>
          captureSquareFrame(video, facing === "user", CAMERA_FILTERS[0]),
        );
        if (backShotUrlRef.current) URL.revokeObjectURL(backShotUrlRef.current);
        const url = URL.createObjectURL(firstBlob);
        backShotUrlRef.current = url;
        setBackShot({ blob: firstBlob, url });
        setFacing("user");
        notify("Foto belakang tersimpan! Sekarang ambil foto kamera depan 📸");
        return;
      }

      const combinedBlob = await flashThen(() =>
        composeDualCameraPhoto(
          backShot.blob,
          video,
          facing === "user",
          CAMERA_FILTERS[0],
        ),
      );
      clearBackShot();
      showCaptured({
        blob: combinedBlob,
        url: URL.createObjectURL(combinedBlob),
        bakedFilterId: "normal",
      });
    } catch (err) {
      notify(errorMessage(err));
    }
  }

  // ---------- Galeri ----------
  async function handlePickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      clearBackShot();
      if (!file.type.startsWith("image/")) {
        notify("Pilih file foto dari galeri ya 📸");
        return;
      }
      const blob = await resizeImage(file, PHOTO_CAPTURE_SIZE);
      showCaptured({
        blob,
        url: URL.createObjectURL(blob),
        bakedFilterId: "normal",
      });
    } catch (err) {
      notify(errorMessage(err));
    }
  }

  async function getFinalBlob(): Promise<Blob> {
    if (!captured) throw new Error("Tidak ada foto");
    if (activeFilter.id !== "normal" && captured.bakedFilterId !== activeFilter.id) {
      return applyFilterToImageBlob(captured.blob, activeFilter);
    }
    return captured.blob;
  }

  async function send() {
    if (!captured || sending) return;
    setSending(true);
    try {
      const finalBlob = await getFinalBlob();
      if (finalBlob.size > MAX_UPLOAD_BYTES) {
        notify("Ukuran foto terlalu besar (maks 10 MB)");
        return;
      }
      await uploadMoment({
        userId,
        blob: finalBlob,
        caption,
      });
      discard();
      notify(friendCount > 0 ? `Terkirim ke ${friendCount} sahabat 💛` : "Foto tersimpan 💛");
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
    a.download = `depong-${Date.now()}.jpg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const shouldApplyPreviewFilter =
    !captured || captured.bakedFilterId !== activeFilter.id;

  const filterCssValue =
    shouldApplyPreviewFilter && activeFilter.css !== "none" ? activeFilter.css : undefined;

  const liveVideoStyle: React.CSSProperties = {
    filter: filterCssValue,
    WebkitFilter: filterCssValue,
    transform: !captured && facing === "user" ? "scaleX(-1) translateZ(0)" : "translateZ(0)",
  };

  const photoFilterStyle: React.CSSProperties = {
    filter: filterCssValue,
    WebkitFilter: filterCssValue,
    transform: "translateZ(0)",
  };

  return (
    <div className="flex h-full flex-col items-center justify-between gap-2.5 px-3 pt-1 pb-24">
      {/* Bingkai Kamera 4:5 Portrait Mobile (Sama persis dengan rasio hasil foto 1152x1440 agar tidak ada sisi yang terpotong) */}
      <div
        onTouchStart={(e) => onSwipeStart(e.touches[0].clientX)}
        onTouchMove={(e) => onSwipeMove(e.touches[0].clientX)}
        onTouchEnd={(e) => onSwipeEnd(e.changedTouches[0]?.clientX)}
        onMouseDown={(e) => onSwipeStart(e.clientX)}
        onMouseMove={(e) => onSwipeMove(e.clientX)}
        onMouseUp={(e) => onSwipeEnd(e.clientX)}
        className="relative aspect-[4/5] w-full max-h-[64dvh] touch-pan-y overflow-hidden rounded-[40px] border border-white/10 bg-panel shadow-2xl select-none"
      >
        {backShot && !captured && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={backShot.url}
            alt="Foto Kamera Belakang"
            style={photoFilterStyle}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}

        <div
          className={`transition-all duration-300 ${
            backShot && !captured
              ? "absolute z-10 overflow-hidden border-[3px] border-ink/90 bg-panel shadow-2xl"
              : "h-full w-full"
          } ${captured ? "invisible" : ""}`}
          style={
            backShot && !captured
              ? {
                  left: "6%",
                  top: "5%",
                  width: "30%",
                  height: "31%",
                  borderRadius: "18px",
                }
              : undefined
          }
        >
          <video
            ref={videoRef}
            style={liveVideoStyle}
            className="h-full w-full object-cover transition-[filter] duration-200"
            playsInline
            muted
            autoPlay
          />
        </div>

        {captured && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={captured.url}
            alt="Pratinjau Hasil Foto"
            style={photoFilterStyle}
            className="absolute inset-0 h-full w-full object-cover transition-[filter] duration-200"
          />
        )}

        {/* Overlay Color-Grading Live */}
        {shouldApplyPreviewFilter && activeFilter.tint && activeFilter.tint[3] > 0 && (
          <div
            className="pointer-events-none absolute inset-0 transition-opacity duration-200"
            style={{
              backgroundColor: `rgba(${activeFilter.tint[0]}, ${activeFilter.tint[1]}, ${activeFilter.tint[2]}, ${activeFilter.tint[3]})`,
              mixBlendMode:
                (activeFilter.blendMode as React.CSSProperties["mixBlendMode"]) ?? "overlay",
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
                <p className="text-xs text-muted">Atau pilih foto dari galeri ↓</p>
              </>
            ) : (
              <p className="text-sm text-muted">Membuka kamera…</p>
            )}
          </div>
        )}

        {/* Kontrol Atas Viewfinder */}
        {!captured && (
          <div className="absolute inset-x-4 top-4 z-10 flex items-center justify-between">
            {!backShot ? (
              <button
                onClick={() => setFlashOn((v) => !v)}
                className={`flex h-10 w-10 items-center justify-center rounded-full bg-black/45 backdrop-blur-md ${
                  flashOn ? "text-gold" : "text-white"
                }`}
                aria-label="Flash"
              >
                <IconBolt size={18} fill={flashOn ? "currentColor" : "none"} />
              </button>
            ) : (
              <span className="h-10 w-10" />
            )}

            <span className="rounded-full bg-black/55 px-3.5 py-1.5 text-xs font-bold text-gold backdrop-blur-md">
              {!backShot ? "1/2 • Foto Belakang" : "2/2 • Foto Depan"}
            </span>

            {backShot ? (
              <button
                type="button"
                onClick={() => {
                  clearBackShot();
                  setFacing("environment");
                }}
                className="rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-md"
              >
                Ulang 1/2
              </button>
            ) : filterIdx > 0 ? (
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

        {/* Satu Kapsul Filter Tunggal yang Rapi */}
        {(cameraReady || captured) && (
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

        {/* Caption saat pratinjau hasil foto */}
        {captured && (
          <div className="absolute inset-x-0 bottom-4 z-10 flex justify-center px-6">
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value.slice(0, 60))}
              placeholder="Tambah pesan…"
              maxLength={60}
              className="w-auto max-w-full min-w-[60%] rounded-full bg-black/60 px-4 py-2 text-center text-sm font-semibold text-white placeholder-white/60 outline-none backdrop-blur-md"
            />
          </div>
        )}
      </div>

      {/* Kontrol Bawah (Tanpa Tab Pemilih Foto/Video) */}
      {captured ? (
        <div className="flex w-full shrink-0 flex-col items-center gap-2">
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
              aria-label="Simpan foto"
            >
              <IconDownload size={20} />
            </button>
          </div>
          <p className="text-xs text-muted">
            Kirim ke {friendCount > 0 ? `${friendCount} sahabat` : "widget kamu"}
          </p>
        </div>
      ) : (
        <div className="flex w-full shrink-0 flex-col items-center gap-2">
          <div className="flex w-full items-center justify-around px-6">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-panel-2 text-white/90"
              aria-label="Galeri"
            >
              <IconImage size={22} />
            </button>

            <button
              onClick={() => void takePhoto()}
              disabled={!cameraReady}
              className="relative flex h-21 w-21 items-center justify-center transition active:scale-95 disabled:opacity-50"
              aria-label={!backShot ? "Ambil foto belakang (1/2)" : "Ambil foto depan (2/2)"}
            >
              <svg className="absolute inset-0 -rotate-90" width="84" height="84" viewBox="0 0 84 84">
                <circle
                  cx="42"
                  cy="42"
                  r={RING_RADIUS}
                  fill="none"
                  stroke="#f5c451"
                  strokeWidth="4.5"
                />
              </svg>
              <span className="h-[66px] w-[66px] rounded-full bg-white transition-all duration-200" />
            </button>

            <button
              onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
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
        accept="image/*"
        className="hidden"
        onChange={handlePickFile}
      />
    </div>
  );
}
