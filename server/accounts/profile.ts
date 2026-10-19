import { exactKeys, RepositoryError } from '../data/database';

export const PROFILE_IMAGE_MAX_BYTES = 128 * 1024;
const MAX_IMAGE_DIMENSION = 2048;
export interface ProfileInput { readonly name: string; readonly image: string | null }

/** Legacy provisioning used the opaque account ID as a placeholder, never as a display name. */
export function publicProfileName(value: string, userId: string): string {
  if (value === userId) return '';
  return value.trim().replace(/[\u0000-\u001f\u007f]/gu, '').slice(0, 80).replace(/[\uD800-\uDBFF]$/u, '');
}

function imageDimensions(bytes: Buffer, mime: string): { width: number; height: number } | null {
  if (mime === 'png') {
    if (bytes.length < 45 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      || bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR'
      || bytes.toString('hex', bytes.length - 12) !== '0000000049454e44ae426082') return null;
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (mime === 'jpeg') {
    if (bytes.length < 12 || bytes.readUInt16BE(0) !== 0xffd8 || bytes.readUInt16BE(bytes.length - 2) !== 0xffd9) return null;
    let offset = 2;
    while (offset + 4 < bytes.length) {
      if (bytes[offset++] !== 0xff) return null;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === undefined || marker === 0xda || marker === 0xd9 || offset + 2 > bytes.length) return null;
      const size = bytes.readUInt16BE(offset);
      if (size < 2 || offset + size > bytes.length) return null;
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        if (size < 8) return null;
        return { width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3) };
      }
      offset += size;
    }
    return null;
  }
  if (bytes.length < 30 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP'
    || bytes.readUInt32LE(4) !== bytes.length - 8 || bytes.readUInt32LE(16) > bytes.length - 20) return null;
  const chunk = bytes.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    if (bytes.readUInt32LE(16) !== 10 || (bytes[20]! & 2)) return null;
    return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 };
  }
  if (chunk === 'VP8 ' && bytes.toString('hex', 23, 26) === '9d012a') return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8L' && bytes[20] === 0x2f) {
    const size = bytes.readUInt32LE(21);
    return { width: (size & 0x3fff) + 1, height: ((size >>> 14) & 0x3fff) + 1 };
  }
  return null;
}

/** Raster-only, bounded local image content; remote URLs and executable image formats are never accepted. */
export function validateProfileImage(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > Math.ceil(PROFILE_IMAGE_MAX_BYTES / 3) * 4 + 32) throw new RepositoryError('invalid-input');
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/u.exec(value);
  if (!match) throw new RepositoryError('invalid-input');
  const bytes = Buffer.from(match[2]!, 'base64');
  if (bytes.length > PROFILE_IMAGE_MAX_BYTES || bytes.toString('base64') !== match[2]) throw new RepositoryError('invalid-input');
  const dimensions = imageDimensions(bytes, match[1]!);
  if (!dimensions || dimensions.width < 1 || dimensions.height < 1 || dimensions.width > MAX_IMAGE_DIMENSION || dimensions.height > MAX_IMAGE_DIMENSION) throw new RepositoryError('invalid-input');
  return value;
}

/** Legacy external auth images are not exposed as unsolicited third-party browser requests. */
export function publicProfileImage(value: unknown): string | null {
  try { return validateProfileImage(value); } catch { return null; }
}

export function validateProfileInput(value: unknown): ProfileInput {
  exactKeys(value, ['name', 'image']);
  if (typeof value.name !== 'string') throw new RepositoryError('invalid-input');
  const name = value.name.trim();
  if (!name.length || name.length > 80 || /[\u0000-\u001f\u007f]/u.test(name)) throw new RepositoryError('invalid-input');
  return { name, image: validateProfileImage(value.image) };
}
