import { RepositoryError } from './database';

/** Router seam: enforce bytes before JSON parsing; do not log rejected request content. */
export async function readBoundedJson(request: Request, maxBytes = 262_144): Promise<unknown> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new RepositoryError('invalid-input');
  const reader = request.body?.getReader();
  if (!reader) throw new RepositoryError('invalid-input');
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maxBytes) { await reader.cancel(); throw new RepositoryError('invalid-input'); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new RepositoryError('invalid-input'); }
}
