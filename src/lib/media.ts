export const MAX_VIDEO_SECONDS = 7;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB (sama dengan limit bucket)

export interface CameraFilter {
  id: string;
  name: string;
  badge: string;
  css: string;
  /** Warna overlay (r, g, b, alpha) agar filter tetap terlihat jelas di iOS Safari & semua HP */
  tint: [number, number, number, number] | null;
  blendMode?: GlobalCompositeOperation;
  vignette?: number;
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
    badge: "Normal",
    css: "none",
    tint: null,
  },
  {
    id: "golden",
    name: "Golden Hour",
    badge: "☀️ Golden Hour",
    css: "sepia(0.38) saturate(1.55) contrast(1.08) brightness(1.05)",
    tint: [245, 176, 65, 0.22],
    blendMode: "overlay",
    vignette: 0.22,
  },
  {
    id: "vintage",
    name: "Vintage 90s",
    badge: "🎞️ Vintage 90s",
    css: "sepia(0.45) contrast(1.15) brightness(0.96) saturate(0.82)",
    tint: [212, 163, 115, 0.26],
    blendMode: "multiply",
    vignette: 0.35,
  },
  {
    id: "soft",
    name: "Soft Glow",
    badge: "✨ Soft Glow",
    css: "brightness(1.14) contrast(0.95) saturate(1.22)",
    tint: [255, 228, 230, 0.18],
    blendMode: "screen",
    vignette: 0.1,
  },
  {
    id: "sunset",
    name: "Sunset Rose",
    badge: "🌸 Sunset Rose",
    css: "saturate(1.48) contrast(1.08) hue-rotate(-18deg) brightness(1.04)",
    tint: [244, 63, 94, 0.22],
    blendMode: "soft-light",
    vignette: 0.2,
  },
  {
    id: "cinema",
    name: "Cinema Cool",
    badge: "🎬 Cinema Cool",
    css: "contrast(1.2) saturate(1.1) hue-rotate(165deg) sepia(0.18)",
    tint: [14, 165, 233, 0.22],
    blendMode: "overlay",
    vignette: 0.3,
  },
  {
    id: "mono",
    name: "Mono B&W",
    badge: "🖤 Mono B&W",
    css: "grayscale(1) contrast(1.28) brightness(1.04)",
    tint: [0, 0, 0, 0],
    vignette: 0.32,
  },
];

/**
 * Terapkan efek filter langsung ke permukaan Canvas 2D.
 * Mendukung browser yang tidak memiliki ctx.filter (seperti Safari iOS).
 */
export function applyFilterEffectOnCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  filter: CameraFilter,
) {
  if (!filter || filter.id === "normal") return;

  // Untuk Mono B&W, konversi piksel grayscale + kontras agar 100% bekerja di iOS Safari
  if (filter.id === "mono") {
    try {
      const imgData = ctx.getImageData(0, 0, width, height);
      const d = imgData.data;
      const contrast = 1.25;
      const intercept = 128 * (1 - contrast);
      for (let i = 0; i < d.length; i += 4) {
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const v = Math.max(0, Math.min(255, lum * contrast + intercept));
        d[i] = v;
        d[i + 1] = v;
        d[i + 2] = v;
      }
      ctx.putImageData(imgData, 0, 0);
    } catch {
      // Abaikan jika canvas tainted
    }
  }

  // Color tint grading layer
  if (filter.tint && filter.tint[3] > 0) {
    const [r, g, b, a] = filter.tint;
    ctx.save();
    if (filter.blendMode) {
      ctx.globalCompositeOperation = filter.blendMode;
    }
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  // Soft vignette untuk kedalaman visual
  if (filter.vignette && filter.vignette > 0) {
    ctx.save();
    const grad = ctx.createRadialGradient(
      width / 2,
      height / 2,
      width * 0.28,
      width / 2,
      height / 2,
      width * 0.72,
    );
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, `rgba(0,0,0,${filter.vignette})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
}

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

/** Ambil frame persegi beresolusi tinggi (crop tengah) dari video kamera. */
export function captureSquareFrame(
  video: HTMLVideoElement,
  size = 1440,
  mirror = false,
  filter?: CameraFilter,
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

  ctx.save();
  if (filter && filter.css !== "none") {
    ctx.filter = filter.css;
  }
  if (mirror) {
    ctx.translate(out, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, sx, sy, side, side, 0, 0, out, out);
  ctx.restore();

  if (filter && filter.id !== "normal") {
    applyFilterEffectOnCanvas(ctx, out, out, filter);
  }

  return canvasToJpeg(canvas, 0.92);
}

/**
 * Gabungkan 2 foto (Kamera Belakang = Bingkai Besar, Kamera Depan = Bingkai Kecil di Kiri Atas)
 * sesuai tata letak mockup Dual-Camera.
 */
export async function composeDualCameraPhoto(
  backPhotoBlob: Blob,
  frontVideo: HTMLVideoElement,
  size = 1080,
  mirrorFront = true,
  filter?: CameraFilter,
): Promise<Blob> {
  const backBitmap = await createImageBitmap(backPhotoBlob);
  const out = size;

  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    backBitmap.close();
    throw new Error("Canvas tidak didukung");
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // 1. Gambar Bingkai Besar (Kamera Belakang)
  ctx.drawImage(backBitmap, 0, 0, out, out);
  backBitmap.close();

  // 2. Gambar Bingkai Kecil di Kiri Atas (Kamera Depan) sesuai proporsi mockup
  const pipX = Math.round(out * 0.068);
  const pipY = Math.round(out * 0.068);
  const pipW = Math.round(out * 0.275);
  const pipH = Math.round(out * 0.345);
  const pipR = Math.round(out * 0.042);

  const vw = frontVideo.videoWidth || out;
  const vh = frontVideo.videoHeight || out;
  const targetAspect = pipW / pipH;
  const videoAspect = vw / vh;

  let sx = 0;
  let sy = 0;
  let sw = vw;
  let sh = vh;
  if (videoAspect > targetAspect) {
    sw = vh * targetAspect;
    sx = (vw - sw) / 2;
  } else {
    sh = vw / targetAspect;
    sy = (vh - sh) / 2;
  }

  // Bayangan lembut di belakang bingkai kecil
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
  ctx.shadowBlur = Math.round(out * 0.022);
  ctx.shadowOffsetY = Math.round(out * 0.008);
  ctx.beginPath();
  ctx.roundRect(pipX, pipY, pipW, pipH, pipR);
  ctx.fillStyle = "#161618";
  ctx.fill();
  ctx.restore();

  // Isi foto kamera depan di dalam bingkai kecil
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(pipX, pipY, pipW, pipH, pipR);
  ctx.clip();
  if (mirrorFront) {
    ctx.translate(pipX + pipW, pipY);
    ctx.scale(-1, 1);
    ctx.drawImage(frontVideo, sx, sy, sw, sh, 0, 0, pipW, pipH);
  } else {
    ctx.drawImage(frontVideo, sx, sy, sw, sh, pipX, pipY, pipW, pipH);
  }
  ctx.restore();

  // Garis tepi (border) halus pada bingkai kecil
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(pipX, pipY, pipW, pipH, pipR);
  ctx.lineWidth = Math.max(3, Math.round(out * 0.0045));
  ctx.strokeStyle = "rgba(15, 15, 18, 0.85)";
  ctx.stroke();
  ctx.restore();

  if (filter && filter.id !== "normal") {
    applyFilterEffectOnCanvas(ctx, out, out, filter);
  }

  return canvasToJpeg(canvas, 0.92);
}

/** Terapkan filter pada Blob gambar yang sudah diambil (misal saat user ganti filter di layar preview). */
export async function applyFilterToImageBlob(
  sourceBlob: Blob,
  filter: CameraFilter,
): Promise<Blob> {
  if (!filter || filter.id === "normal") return sourceBlob;
  const bitmap = await createImageBitmap(sourceBlob);
  const w = bitmap.width;
  const h = bitmap.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return sourceBlob;
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.save();
  if (filter.css !== "none") {
    ctx.filter = filter.css;
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  ctx.restore();
  bitmap.close();

  applyFilterEffectOnCanvas(ctx, w, h, filter);
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
