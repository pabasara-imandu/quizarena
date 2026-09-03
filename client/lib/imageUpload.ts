import { serverUrl } from '@/lib/serverUrl';

/**
 * Pick an image from the device, shrink it in the browser, upload it.
 *
 * The shrinking is not an optimisation, it is the whole feature. A photo from
 * a modern phone is 3-8 MB; 300 students each fetching that is gigabytes of
 * traffic and a server that falls over. Re-encoding to ~1600px WebP puts a
 * classroom-quality picture in roughly 60-150 KB, which every student can
 * fetch once and cache.
 *
 * Doing it client-side also means the server never needs an image library -
 * no sharp, no ImageMagick, nothing to install or keep patched.
 */

const MAX_EDGE = 1600;
const TARGET_BYTES = 180 * 1024;
const HARD_LIMIT_BYTES = 480 * 1024;

export interface UploadedImage {
  url: string;
  bytes: number;
  width: number;
  height: number;
}

export const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp,image/gif';

/** Does this browser encode WebP from a canvas? Safari lagged for years. */
function canEncodeWebp(): boolean {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    return c.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    return false;
  }
}

function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    // Decodes off the main thread, so a big photo does not freeze the editor.
    return createImageBitmap(file);
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be read as an image.'));
    };
    img.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
}

/**
 * Re-encode to fit the target, stepping quality down and then dimensions.
 * Animated GIFs are passed through untouched - a canvas would flatten them to
 * a single frame, which is worse than a slightly larger file.
 */
async function compress(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  if (file.type === 'image/gif') {
    if (file.size > HARD_LIMIT_BYTES) {
      throw new Error(
        'That GIF is ' +
          Math.round(file.size / 1024) +
          ' KB. Animated images cannot be shrunk automatically - please use one under ' +
          Math.round(HARD_LIMIT_BYTES / 1024) +
          ' KB.'
      );
    }
    return { blob: file, width: 0, height: 0 };
  }

  const source = await loadBitmap(file);
  const sourceW = 'width' in source ? source.width : 0;
  const sourceH = 'height' in source ? source.height : 0;
  if (!sourceW || !sourceH) throw new Error('That image has no readable dimensions.');

  const mime = canEncodeWebp() ? 'image/webp' : 'image/jpeg';
  let scale = Math.min(1, MAX_EDGE / Math.max(sourceW, sourceH));

  for (let attempt = 0; attempt < 6; attempt++) {
    const w = Math.max(1, Math.round(sourceW * scale));
    const h = Math.max(1, Math.round(sourceH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot process images.');
    ctx.imageSmoothingQuality = 'high';
    // Flatten transparency onto white: a PNG logo re-encoded to JPEG would
    // otherwise get a black background.
    if (mime === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(source as CanvasImageSource, 0, 0, w, h);

    const quality = [0.82, 0.72, 0.62, 0.55, 0.5, 0.45][attempt];
    const blob = await toBlob(canvas, mime, quality);
    if (!blob) throw new Error('This browser could not re-encode that image.');

    if (blob.size <= TARGET_BYTES || attempt === 5) {
      if (blob.size > HARD_LIMIT_BYTES) {
        throw new Error('That image is too detailed to shrink enough. Try a smaller crop.');
      }
      if ('close' in source) source.close();
      return { blob, width: w, height: h };
    }
    // Still too big: drop the resolution as well as the quality.
    scale *= 0.8;
  }

  throw new Error('That image could not be shrunk enough to upload.');
}

/** Compress and upload one file. Returns the absolute URL to store in the quiz. */
export async function uploadImage(file: File): Promise<UploadedImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Pick an image file (JPEG, PNG, WebP or GIF).');
  }

  const { blob, width, height } = await compress(file);

  const body = new FormData();
  // The server sniffs the real type from the bytes; the name is cosmetic.
  body.append('file', blob, 'upload');

  const res = await fetch(serverUrl() + '/api/images', { method: 'POST', body });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || 'The upload failed. Check your connection and try again.');
  }
  return { url: data.url, bytes: data.bytes, width, height };
}
