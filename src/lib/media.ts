export const MAX_VIDEO_SECONDS = 7;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB (sama dengan limit bucket)

/** Pilih format rekaman terbaik. MP4 diutamakan agar bisa diputar di iPhone & Android. */
export function pickVideoMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=avc1,mp4a",
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

function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.86): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Gagal memproses gambar"))),
      "image/jpeg",
      quality,
    );
  });
}

/** Ambil frame persegi (crop tengah) dari video kamera. */
export function captureSquareFrame(
  video: HTMLVideoElement,
  size = 1080,
  mirror = false,
): Promise<Blob> {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const side = Math.min(vw, vh);
  const sx = (vw - side) / 2;
  const sy = (vh - side) / 2;
  const out = Math.min(size, side);

  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Canvas tidak didukung"));
  if (mirror) {
    ctx.translate(out, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, sx, sy, side, side, 0, 0, out, out);
  return canvasToJpeg(canvas);
}

/** Perkecil gambar dari galeri agar hemat storage. */
export async function resizeImage(file: Blob, maxSide = 1440): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas tidak didukung");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvasToJpeg(canvas);
}
