import { createHash } from 'node:crypto';

/**
 * In-memory, content-addressed image store.
 *
 * Why not a database or an object store? Because nothing here needs to
 * outlive a lesson. Rooms are already ephemeral, so quiz artwork can be too -
 * which means no S3 bucket, no Cloudinary account, no Postgres blob column,
 * and no bill.
 *
 * Three properties make this safe to run in a 512 MB container:
 *
 *  - Content-addressed. The id is a hash of the bytes, so uploading the same
 *    picture twice costs nothing and the URL can be cached immutably forever.
 *  - Hard capped. A total byte ceiling with least-recently-used eviction, so
 *    the store cannot grow into the room state's memory.
 *  - Time limited. Entries expire, because a teacher who built a quiz last
 *    week is not coming back for those bytes.
 *
 * The tradeoff, stated plainly: a server restart loses every image, and a
 * quiz built today will have broken pictures next week. That is the price of
 * free, and it matches how rooms already behave.
 */

const MIME_BY_SIGNATURE = [
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    ext: 'png',
    test: (b) =>
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a,
  },
  {
    mime: 'image/webp',
    ext: 'webp',
    test: (b) =>
      b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP',
  },
  {
    mime: 'image/gif',
    ext: 'gif',
    test: (b) => b.slice(0, 6).toString('latin1').match(/^GIF8[79]a$/) !== null,
  },
];

/**
 * Detect the type from the bytes themselves, never from the filename or the
 * client's Content-Type.
 *
 * SVG is deliberately absent and unreachable here: it is a document format
 * that can carry scripts and external references, and serving one from our own
 * origin would hand an uploader a stored-XSS primitive. A picture of a diagram
 * is worth less than that risk.
 */
export function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  return MIME_BY_SIGNATURE.find((candidate) => candidate.test(buffer)) ?? null;
}

class ImageStore {
  constructor({ maxTotalBytes, maxEntryBytes, ttlMs }) {
    this.maxTotalBytes = maxTotalBytes;
    this.maxEntryBytes = maxEntryBytes;
    this.ttlMs = ttlMs;
    /** @type {Map<string, {id,mime,ext,bytes,buffer,createdAt,lastReadAt}>} */
    this.entries = new Map();
    this.totalBytes = 0;

    this.gcTimer = setInterval(() => this.collectGarbage(), 10 * 60_000);
    this.gcTimer.unref?.();
  }

  put(buffer) {
    const type = detectImageType(buffer);
    if (!type) {
      return { ok: false, reason: 'not_an_image' };
    }
    if (buffer.length > this.maxEntryBytes) {
      return { ok: false, reason: 'too_large', limit: this.maxEntryBytes };
    }

    // Content address: identical bytes reuse the same entry and URL.
    const id = createHash('sha256').update(buffer).digest('hex').slice(0, 32);
    const existing = this.entries.get(id);
    if (existing) {
      existing.lastReadAt = Date.now();
      return { ok: true, id, mime: existing.mime, bytes: existing.bytes, deduped: true };
    }

    this.evictUntilRoomFor(buffer.length);

    const entry = {
      id,
      mime: type.mime,
      ext: type.ext,
      bytes: buffer.length,
      buffer,
      createdAt: Date.now(),
      lastReadAt: Date.now(),
    };
    this.entries.set(id, entry);
    this.totalBytes += entry.bytes;

    return { ok: true, id, mime: entry.mime, bytes: entry.bytes, deduped: false };
  }

  get(id) {
    const entry = this.entries.get(id);
    if (!entry) return null;
    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.delete(id);
      return null;
    }
    entry.lastReadAt = Date.now();
    return entry;
  }

  delete(id) {
    const entry = this.entries.get(id);
    if (!entry) return false;
    this.totalBytes -= entry.bytes;
    return this.entries.delete(id);
  }

  /** Drop least-recently-read entries until `incoming` bytes will fit. */
  evictUntilRoomFor(incoming) {
    if (this.totalBytes + incoming <= this.maxTotalBytes) return;
    const byAge = [...this.entries.values()].sort((a, b) => a.lastReadAt - b.lastReadAt);
    for (const entry of byAge) {
      this.delete(entry.id);
      if (this.totalBytes + incoming <= this.maxTotalBytes) break;
    }
  }

  collectGarbage() {
    const cutoff = Date.now() - this.ttlMs;
    for (const entry of [...this.entries.values()]) {
      if (entry.createdAt < cutoff) this.delete(entry.id);
    }
  }

  get stats() {
    return {
      images: this.entries.size,
      imageBytes: this.totalBytes,
      imageMb: Math.round((this.totalBytes / 1048576) * 10) / 10,
    };
  }
}

export const imageStore = new ImageStore({
  // Sized to be irrelevant next to room state: ~64 MB of a 512 MB container.
  maxTotalBytes: Number(process.env.IMAGE_STORE_MAX_MB || 64) * 1048576,
  // The browser downscales before upload, so anything above this is a client
  // that skipped that step.
  maxEntryBytes: Number(process.env.IMAGE_MAX_KB || 500) * 1024,
  ttlMs: Number(process.env.IMAGE_TTL_HOURS || 12) * 3600_000,
});
