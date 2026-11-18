export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
export const PHOTO_WIDTH = 1152; // Rasio 4:5 Portrait Mobile HD (1152x1440) agar full & tidak terpotong
export const PHOTO_HEIGHT = 1440;
export const PHOTO_CAPTURE_SIZE = PHOTO_HEIGHT;

export type FilterOp =
  | { kind: "sepia"; value: number }
  | { kind: "grayscale"; value: number }
  | { kind: "saturate"; value: number }
  | { kind: "hueRotate"; value: number }
  | { kind: "contrast"; value: number }
  | { kind: "brightness"; value: number };

export interface CameraFilter {
  id: string;
  name: string;
  badge: string;
  css: string;
  ops: FilterOp[];
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
    ops: [],
    tint: null,
  },
  {
    id: "golden",
    name: "Golden Hour",
    badge: "☀️ Golden Hour",
    css: "sepia(0.38) saturate(1.55) contrast(1.08) brightness(1.05)",
    ops: [
      { kind: "sepia", value: 0.38 },
      { kind: "saturate", value: 1.55 },
      { kind: "contrast", value: 1.08 },
      { kind: "brightness", value: 1.05 },
    ],
    tint: [245, 176, 65, 0.22],
    blendMode: "overlay",
    vignette: 0.22,
  },
  {
    id: "vintage",
    name: "Vintage 90s",
    badge: "🎞️ Vintage 90s",
    css: "sepia(0.45) contrast(1.15) brightness(0.96) saturate(0.82)",
    ops: [
      { kind: "sepia", value: 0.45 },
      { kind: "contrast", value: 1.15 },
      { kind: "brightness", value: 0.96 },
      { kind: "saturate", value: 0.82 },
    ],
    tint: [212, 163, 115, 0.26],
    blendMode: "multiply",
    vignette: 0.35,
  },
  {
    id: "soft",
    name: "Soft Glow",
    badge: "✨ Soft Glow",
    css: "brightness(1.14) contrast(0.95) saturate(1.22)",
    ops: [
      { kind: "brightness", value: 1.14 },
      { kind: "contrast", value: 0.95 },
      { kind: "saturate", value: 1.22 },
    ],
    tint: [255, 228, 230, 0.18],
    blendMode: "screen",
    vignette: 0.1,
  },
  {
    id: "sunset",
    name: "Sunset Rose",
    badge: "🌸 Sunset Rose",
    css: "saturate(1.48) contrast(1.08) hue-rotate(-18deg) brightness(1.04)",
    ops: [
      { kind: "saturate", value: 1.48 },
      { kind: "contrast", value: 1.08 },
      { kind: "hueRotate", value: -18 },
      { kind: "brightness", value: 1.04 },
    ],
    tint: [244, 63, 94, 0.22],
    blendMode: "soft-light",
    vignette: 0.2,
  },
  {
    id: "cinema",
    name: "Cinema Cool",
    badge: "🎬 Cinema Cool",
    css: "contrast(1.2) saturate(1.1) hue-rotate(165deg) sepia(0.18)",
    ops: [
      { kind: "contrast", value: 1.2 },
      { kind: "saturate", value: 1.1 },
      { kind: "hueRotate", value: 165 },
      { kind: "sepia", value: 0.18 },
    ],
    tint: [14, 165, 233, 0.22],
    blendMode: "overlay",
    vignette: 0.3,
  },
  {
    id: "mono",
    name: "Mono B&W",
    badge: "🖤 Mono B&W",
    css: "grayscale(1) contrast(1.28) brightness(1.04)",
    ops: [
      { kind: "grayscale", value: 1 },
      { kind: "contrast", value: 1.28 },
      { kind: "brightness", value: 1.04 },
    ],
    tint: [0, 0, 0, 0],
    vignette: 0.32,
  },
];

type Mat3 = [number, number, number, number, number, number, number, number, number];

function mulMat3(a: Mat3, b: Mat3): Mat3 {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
    a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
    a[0] * b[2] + a[1] * b[5] + a[2] * b[8],

    a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
    a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
    a[3] * b[2] + a[4] * b[5] + a[5] * b[8],

    a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
    a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
    a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ];
}

function buildFilterTransform(ops: FilterOp[]): { mat: Mat3; bias: [number, number, number] } {
  let mat: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const bias: [number, number, number] = [0, 0, 0];

  for (const op of ops) {
    if (op.kind === "sepia") {
      const inv = 1 - op.value;
      const m: Mat3 = [
        0.393 + 0.607 * inv, 0.769 - 0.769 * inv, 0.189 - 0.189 * inv,
        0.349 - 0.349 * inv, 0.686 + 0.314 * inv, 0.168 - 0.168 * inv,
        0.272 - 0.272 * inv, 0.534 - 0.534 * inv, 0.131 + 0.869 * inv,
      ];
      mat = mulMat3(m, mat);
      const b0 = m[0] * bias[0] + m[1] * bias[1] + m[2] * bias[2];
      const b1 = m[3] * bias[0] + m[4] * bias[1] + m[5] * bias[2];
      const b2 = m[6] * bias[0] + m[7] * bias[1] + m[8] * bias[2];
      bias[0] = b0;
      bias[1] = b1;
      bias[2] = b2;
    } else if (op.kind === "grayscale") {
      const inv = 1 - op.value;
      const m: Mat3 = [
        0.2126 + 0.7874 * inv, 0.7152 - 0.7152 * inv, 0.0722 - 0.0722 * inv,
        0.2126 - 0.2126 * inv, 0.7152 + 0.2848 * inv, 0.0722 - 0.0722 * inv,
        0.2126 - 0.2126 * inv, 0.7152 - 0.7152 * inv, 0.0722 + 0.9278 * inv,
      ];
      mat = mulMat3(m, mat);
      const b0 = m[0] * bias[0] + m[1] * bias[1] + m[2] * bias[2];
      const b1 = m[3] * bias[0] + m[4] * bias[1] + m[5] * bias[2];
      const b2 = m[6] * bias[0] + m[7] * bias[1] + m[8] * bias[2];
      bias[0] = b0;
      bias[1] = b1;
      bias[2] = b2;
    } else if (op.kind === "saturate") {
      const s = op.value;
      const m: Mat3 = [
        0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
        0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
        0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s,
      ];
      mat = mulMat3(m, mat);
      const b0 = m[0] * bias[0] + m[1] * bias[1] + m[2] * bias[2];
      const b1 = m[3] * bias[0] + m[4] * bias[1] + m[5] * bias[2];
      const b2 = m[6] * bias[0] + m[7] * bias[1] + m[8] * bias[2];
      bias[0] = b0;
      bias[1] = b1;
      bias[2] = b2;
    } else if (op.kind === "hueRotate") {
      const rad = (op.value * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const m: Mat3 = [
        0.213 + 0.787 * cos - 0.213 * sin, 0.715 - 0.715 * cos - 0.715 * sin, 0.072 - 0.072 * cos + 0.928 * sin,
        0.213 - 0.213 * cos + 0.143 * sin, 0.715 + 0.285 * cos + 0.140 * sin, 0.072 - 0.072 * cos - 0.283 * sin,
        0.213 - 0.213 * cos - 0.787 * sin, 0.715 - 0.715 * cos + 0.715 * sin, 0.072 + 0.928 * cos + 0.072 * sin,
      ];
      mat = mulMat3(m, mat);
      const b0 = m[0] * bias[0] + m[1] * bias[1] + m[2] * bias[2];
      const b1 = m[3] * bias[0] + m[4] * bias[1] + m[5] * bias[2];
      const b2 = m[6] * bias[0] + m[7] * bias[1] + m[8] * bias[2];
      bias[0] = b0;
      bias[1] = b1;
      bias[2] = b2;
    } else if (op.kind === "contrast") {
      const c = op.value;
      const offset = 128 * (1 - c);
      for (let i = 0; i < 9; i++) mat[i] *= c;
      bias[0] = bias[0] * c + offset;
      bias[1] = bias[1] * c + offset;
      bias[2] = bias[2] * c + offset;
    } else if (op.kind === "brightness") {
      const b = op.value;
      for (let i = 0; i < 9; i++) mat[i] *= b;
      bias[0] *= b;
      bias[1] *= b;
      bias[2] *= b;
    }
  }

  return { mat, bias };
}

/**
 * Terapkan efek filter langsung ke piksel Canvas 2D tanpa bergantung pada `ctx.filter`,
 * sehingga hasil foto berfilter 100% identik di iPhone Safari, Android Chrome, dan Desktop.
 */
export function applyFilterEffectOnCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  filter: CameraFilter,
) {
  if (!filter || filter.id === "normal") return;

  if (filter.ops.length > 0) {
    try {
      const { mat, bias } = buildFilterTransform(filter.ops);
      const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = mat;
      const [b0, b1, b2] = bias;

      const imgData = ctx.getImageData(0, 0, width, height);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];

        const nr = m00 * r + m01 * g + m02 * b + b0;
        const ng = m10 * r + m11 * g + m12 * b + b1;
        const nb = m20 * r + m21 * g + m22 * b + b2;

        d[i] = nr < 0 ? 0 : nr > 255 ? 255 : nr;
        d[i + 1] = ng < 0 ? 0 : ng > 255 ? 255 : ng;
        d[i + 2] = nb < 0 ? 0 : nb > 255 ? 255 : nb;
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
    const maxDim = Math.max(width, height);
    const grad = ctx.createRadialGradient(
      width / 2,
      height / 2,
      maxDim * 0.28,
      width / 2,
      height / 2,
      maxDim * 0.72,
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

function getCoverCrop(vw: number, vh: number, targetW: number, targetH: number) {
  const targetAspect = targetW / targetH;
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
  return { sx, sy, sw, sh };
}

/** Ambil frame foto portrait mobile 4:5 (1152x1440) dari kamera agar pas 100% di kartu mobile. */
export function captureSquareFrame(
  video: HTMLVideoElement,
  mirror = false,
  filter?: CameraFilter,
): Promise<Blob> {
  const outW = PHOTO_WIDTH;
  const outH = PHOTO_HEIGHT;
  const vw = video.videoWidth || outW;
  const vh = video.videoHeight || outH;
  const { sx, sy, sw, sh } = getCoverCrop(vw, vh, outW, outH);

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Canvas tidak didukung"));
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  ctx.save();
  if (mirror) {
    ctx.translate(outW, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH);
  ctx.restore();

  if (filter && filter.id !== "normal") {
    applyFilterEffectOnCanvas(ctx, outW, outH, filter);
  }

  return canvasToJpeg(canvas);
}

/**
 * Gabungkan 2 foto dengan rasio 4:5 Portrait Mobile (1152x1440) sehingga
 * Bingkai Kecil di Pojok Kiri Atas TIDAK PERNAH terpotong di layar HP:
 * - Kamera Belakang = Bingkai Besar (1152x1440)
 * - Kamera Depan = Bingkai Kecil utuh di Pojok Kiri Atas
 */
export async function composeDualCameraPhoto(
  backPhotoBlob: Blob,
  frontVideo: HTMLVideoElement,
  mirrorFront = true,
  filter?: CameraFilter,
): Promise<Blob> {
  const backBitmap = await createImageBitmap(backPhotoBlob);
  const outW = PHOTO_WIDTH;
  const outH = PHOTO_HEIGHT;

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    backBitmap.close();
    throw new Error("Canvas tidak didukung");
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // 1. Gambar Bingkai Besar (Kamera Belakang)
  const backCrop = getCoverCrop(backBitmap.width, backBitmap.height, outW, outH);
  ctx.drawImage(
    backBitmap,
    backCrop.sx,
    backCrop.sy,
    backCrop.sw,
    backCrop.sh,
    0,
    0,
    outW,
    outH,
  );
  backBitmap.close();

  // 2. Gambar Bingkai Kecil di Kiri Atas (Kamera Depan) dengan jarak aman dari sudut lengkung kartu
  const pipX = Math.round(outW * 0.06);
  const pipY = Math.round(outH * 0.05);
  const pipW = Math.round(outW * 0.30);
  const pipH = Math.round(outH * 0.31);
  const pipR = Math.round(outW * 0.042);

  const vw = frontVideo.videoWidth || outW;
  const vh = frontVideo.videoHeight || outH;
  const { sx, sy, sw, sh } = getCoverCrop(vw, vh, pipW, pipH);

  // Bayangan lembut di belakang bingkai kecil
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = Math.round(outW * 0.025);
  ctx.shadowOffsetY = Math.round(outW * 0.008);
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

  // Garis tepi utuh di sekeliling bingkai kecil
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(pipX, pipY, pipW, pipH, pipR);
  ctx.lineWidth = Math.max(5, Math.round(outW * 0.005));
  ctx.strokeStyle = "rgba(18, 18, 22, 0.9)";
  ctx.stroke();
  ctx.restore();

  if (filter && filter.id !== "normal") {
    applyFilterEffectOnCanvas(ctx, outW, outH, filter);
  }

  return canvasToJpeg(canvas);
}

/** Terapkan filter pada Blob gambar yang sudah diambil. */
export async function applyFilterToImageBlob(
  sourceBlob: Blob,
  filter: CameraFilter,
): Promise<Blob> {
  if (!filter || filter.id === "normal") return sourceBlob;

  const canvas = document.createElement("canvas");
  let w = 0;
  let h = 0;

  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(sourceBlob);
    w = bitmap.width;
    h = bitmap.height;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return sourceBlob;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    applyFilterEffectOnCanvas(ctx, w, h, filter);
    return canvasToJpeg(canvas);
  }

  // Fallback jika browser tidak mendukung createImageBitmap
  const url = URL.createObjectURL(sourceBlob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Gagal memuat foto"));
      el.src = url;
    });
    w = img.naturalWidth || PHOTO_WIDTH;
    h = img.naturalHeight || PHOTO_HEIGHT;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return sourceBlob;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, w, h);
    applyFilterEffectOnCanvas(ctx, w, h, filter);
    return canvasToJpeg(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Perkecil gambar dari galeri ke resolusi tajam 1440px. */
export async function resizeImage(file: Blob, maxSide = PHOTO_HEIGHT): Promise<Blob> {
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
