export const PROFILE_PHOTO_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const PROFILE_PHOTO_MAX_BYTES = 128 * 1024;

export function validateProfilePhotoFile(file: Pick<File, 'type' | 'size'>): void {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG or WebP photo.');
  if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > PROFILE_PHOTO_MAX_UPLOAD_BYTES) throw new Error('Choose a photo smaller than 10 MB.');
}

export function profilePhotoDimensions(width: number, height: number, maximum = 512): { width: number; height: number } {
  if (![width, height, maximum].every(value => Number.isFinite(value) && value >= 1)) throw new Error('This photo could not be opened. Choose another file.');
  const scale = Math.min(1, maximum / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function canceled(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Photo selection canceled.', 'AbortError');
}

function decodePhoto(url: string, signal: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const clear = () => { image.onload = null; image.onerror = null; signal.removeEventListener('abort', abort); };
    const abort = () => { clear(); image.src = ''; reject(new DOMException('Photo selection canceled.', 'AbortError')); };
    image.onload = () => { clear(); resolve(image); };
    image.onerror = () => { clear(); reject(new Error('This photo could not be opened. Choose another file.')); };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { abort(); return; }
    image.src = url;
  });
}

/** Decode locally and save only a small re-encoded JPEG; original file metadata is not uploaded. */
export async function prepareProfilePhoto(file: File, signal: AbortSignal): Promise<string> {
  canceled(signal); validateProfilePhotoFile(file);
  const url = URL.createObjectURL(file);
  try {
    const image = await decodePhoto(url, signal);
    canceled(signal);
    const canvas = document.createElement('canvas'); const context = canvas.getContext('2d');
    if (!context) throw new Error('This photo could not be prepared. Please try another browser.');
    for (const maximum of [512, 384, 256]) {
      const size = profilePhotoDimensions(image.naturalWidth, image.naturalHeight, maximum);
      canvas.width = size.width; canvas.height = size.height;
      context.fillStyle = '#fff'; context.fillRect(0, 0, size.width, size.height);
      context.drawImage(image, 0, 0, size.width, size.height);
      for (const quality of [0.88, 0.72, 0.56]) {
        canceled(signal);
        const encoded = canvas.toDataURL('image/jpeg', quality);
        const payload = encoded.split(',')[1];
        if (!encoded.startsWith('data:image/jpeg;base64,') || !payload) throw new Error('This photo could not be prepared. Please try another browser.');
        const bytes = payload.length * 3 / 4 - (payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0);
        if (bytes <= PROFILE_PHOTO_MAX_BYTES) return encoded;
      }
    }
    throw new Error('This photo is too detailed to save. Choose a smaller photo.');
  } finally { URL.revokeObjectURL(url); }
}
