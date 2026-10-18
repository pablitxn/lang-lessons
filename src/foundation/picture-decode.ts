import type { NextPicture } from '../contracts/dictionary';

/** One running decode, one replaceable queued target. Invalidation never claims cancellation. */
export function createPictureDecodeQueue(decode: (src: string) => Promise<void>, ready: (picture: NextPicture) => void) {
  let generation = 0; let running = false; let disposed = false;
  let queued: { picture: NextPicture; generation: number } | null = null;
  async function drain() {
    if (running || !queued || disposed) return;
    const job = queued; queued = null; running = true;
    try {
      await decode(job.picture.src);
      if (!disposed && generation === job.generation) ready(job.picture);
    } catch { /* Decode is optional; the normal image load remains the fallback. */ }
    finally { running = false; void drain(); }
  }
  return {
    setNext(picture: NextPicture | null) {
      generation++; queued = null;
      if (disposed || !picture || !/^\/images\/verbs\/[a-z]+-[0-9]+\.jpg$/u.test(picture.src)) return;
      queued = { picture: { ...picture }, generation }; void drain();
    },
    dispose() { disposed = true; generation++; queued = null; },
  };
}
