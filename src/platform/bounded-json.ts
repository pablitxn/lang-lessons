/** Best-effort diagnostics must not hold a failed call open or consume an unbounded body. */
export async function readBoundedJsonResponse(response: Response): Promise<unknown> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try { reader = response.body?.getReader(); } catch { return null; }
  if (!reader) return null;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  const timeout = Symbol('diagnostic-timeout');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<typeof timeout>(resolve => { timer = setTimeout(() => resolve(timeout), 1000); });
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const chunk = await Promise.race([reader.read(), deadline]);
      if (chunk === timeout) { cancel(); return null; }
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 4096) { cancel(); return null; }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch { cancel(); return null; }
  finally { if (timer !== undefined) clearTimeout(timer); }
}
