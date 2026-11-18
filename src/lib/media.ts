export const MAX_VIDEO_SECONDS = 7;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB (sama dengan limit bucket)

export interface CameraFilter {
  id: string;
  name: string;
  badge: string;
  css: string;
}

/**
 * Daftar filter kamera.
 * Urutan paling kiri (index 0) adalah Normal (tanpa filter) —
 * swipe ke kanan/kiri untuk mengganti filter, dan swipe ke paling kiri untuk kembali Normal.
 */
export const CAMERA_FILTERS: CameraFilter[] = [
  {
    id: "normal",
    name: "Normal",
    badge: "Normal (Asli)",
    css: "none",
  },
  {
    id: "golden",
    name: "Golden Hour",
    badge: "☀️ Golden Hour",
    css: "sepia(0.26) saturate(1.38) contrast(1.06) brightness(1.04)",
  },
  {
    id: "vintage",
    name: "Vintage 90s",
    badge: "🎞️ Vintage 90s",
    css: "contrast(1.12) brightness(0.98) saturate(0.84) sepia(0.22)",
  },
  {
    id: "soft",
    name: "Soft Glow",
    badge: "✨ Soft Glow",
    css: "brightness(1.09) contrast(0.97) saturate(1.14)",
  },
  {
    id: "cinema",
    name: "Cinema Cool",
    badge: "🎬 Cinema Cool",
    css: "contrast(1.16) saturate(0.92) hue-rotate(-10deg)",
  },
  {
    id: "sunset",
    name: "Sunset Rose",
    badge: "🌸 Sunset Rose",
    css: "saturate(1.32) contrast(1.05) hue-rotate(-14deg) brightness(1.03)",
  },
  {
    id: "mono",
    name: "Mono B&W",
    badge: "🖤 Mono B&W",
    css: "grayscale(1) contrast(1.22) brightness(1.03)",
  },
];

/** Pilih format rekaman terbaik. MP4/VP9 diutamakan agar tajam di iPhone & Android. */
export function pickVideoMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "video/mp4;codecs=avc1.640028,mp4a.40.2",
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

export function baseMime(mime: string): string {
  return mime.split(";")[0].trim().toLowerCase();
}

export function extFromMime(mime: string): string {
  const m = baseMime(mime);
  if (m === "video/mp4") return "mp4";
  if (m === "video/webm") return "webm";
  if (m === "video/quicktime") return "mov";
  if (m === "image/png") return "png";
  if (m === "image/webp") return "webp";
  return "jpg";
}

export function getVideoDuration(file: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => {
      const d = video.duration;
      URL.revokeObjectURL(url);
      resolve(d);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Video tidak bisa dibaca"));
    };
    video.src = url;
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.94): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Gagal memproses gambar"))),
      "image/jpeg",
      quality,
    );
  });
}

/** Ambil frame persegi beresolusi tinggi (crop tengah) dari video kamera beserta filter aktif. */
export function captureSquareFrame(
  video: HTMLVideoElement,
  size = 1440,
  mirror = false,
  filterCss = "none",
): Promise<Blob> {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const side = Math.min(vw, vh);
  const sx = (vw - side) / 2;
  const sy = (vh - side) / 2;
  const out = Math.min(size, Math.max(side, 1080));

  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Canvas tidak didukung"));
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (filterCss && filterCss !== "none") {
    ctx.filter = filterCss;
  }
  if (mirror) {
    ctx.translate(out, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, sx, sy, side, side, 0, 0, out, out);
  return canvasToJpeg(canvas, 0.94);
}

/** Perkecil gambar dari galeri dengan tetap menjaga ketajaman tinggi. */
export async function resizeImage(file: Blob, maxSide = 1600): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas tidak didukung");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvasToJpeg(canvas, 0.94);
}
