export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
export const PHOTO_CAPTURE_SIZE = 1440; // Resolusi foto tinggi (1440x1440) agar tajam & tidak kecil

export interface CameraFilter {
  id: string;
  name: string;
  badge: string;
  css: string;
  tint: [number, number, number, number] | null;
  blendMode?: GlobalCompositeOperation;
  vignette?: number;
}

/**
 * Daftar filter kamera.
 * Paling kiri (index 0) adalah Normal (tanpa filter).
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

export function applyFilterEffectOnCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  filter: CameraFilter,
) {
  if (!filter || filter.id === "normal") return;

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

function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.93): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Gagal memproses gambar"))),
      "image/jpeg",
      quality,
    );
  });
}

/** Ambil frame foto beresolusi tinggi (1440x1440) dari kamera. */
export function captureSquareFrame(
  video: HTMLVideoElement,
  size = PHOTO_CAPTURE_SIZE,
  mirror = false,
  filter?: CameraFilter,
): Promise<Blob> {
  const vw = video.videoWidth || size;
  const vh = video.videoHeight || size;
  const side = Math.min(vw, vh);
  const sx = (vw - side) / 2;
  const sy = (vh - side) / 2;
  const out = size;

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

  return canvasToJpeg(canvas);
}

/**
 * Gabungkan 2 foto beresolusi tinggi (1440x1440):
 * - Kamera Belakang = Bingkai Besar
 * - Kamera Depan = Bingkai Kecil di Pojok Kiri Atas
 */
export async function composeDualCameraPhoto(
  backPhotoBlob: Blob,
  frontVideo: HTMLVideoElement,
  size = PHOTO_CAPTURE_SIZE,
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

  // 2. Gambar Bingkai Kecil di Kiri Atas (Kamera Depan)
  const pipX = Math.round(out * 0.065);
  const pipY = Math.round(out * 0.065);
  const pipW = Math.round(out * 0.28);
  const pipH = Math.round(out * 0.35);
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

  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
  ctx.shadowBlur = Math.round(out * 0.022);
  ctx.shadowOffsetY = Math.round(out * 0.008);
  ctx.beginPath();
  ctx.roundRect(pipX, pipY, pipW, pipH, pipR);
  ctx.fillStyle = "#161618";
  ctx.fill();
  ctx.restore();

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

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(pipX, pipY, pipW, pipH, pipR);
  ctx.lineWidth = Math.max(4, Math.round(out * 0.0045));
  ctx.strokeStyle = "rgba(15, 15, 18, 0.85)";
  ctx.stroke();
  ctx.restore();

  if (filter && filter.id !== "normal") {
    applyFilterEffectOnCanvas(ctx, out, out, filter);
  }

  return canvasToJpeg(canvas);
}

/** Terapkan filter pada Blob gambar yang sudah diambil. */
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
  return canvasToJpeg(canvas);
}

/** Perkecil gambar dari galeri ke resolusi tajam 1440px. */
export async function resizeImage(file: Blob, maxSide = PHOTO_CAPTURE_SIZE): Promise<Blob> {
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
  return canvasToJpeg(canvas);
}
