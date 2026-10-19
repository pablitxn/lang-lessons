import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareProfilePhoto, profilePhotoDimensions, PROFILE_PHOTO_MAX_UPLOAD_BYTES, validateProfilePhotoFile } from '../src/features/accounts/profile-photo';

test('profile photo upload validation rejects unsupported formats and empty or oversized files', () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) assert.doesNotThrow(() => validateProfilePhotoFile({ type, size: 10 }));
  assert.doesNotThrow(() => validateProfilePhotoFile({ type: 'image/jpeg', size: PROFILE_PHOTO_MAX_UPLOAD_BYTES }));
  for (const type of ['image/svg+xml', 'text/html', 'image/gif', '']) assert.throws(() => validateProfilePhotoFile({ type, size: 10 }), /JPG, PNG or WebP/);
  for (const size of [0, -1, NaN, 1.5, PROFILE_PHOTO_MAX_UPLOAD_BYTES + 1]) assert.throws(() => validateProfilePhotoFile({ type: 'image/jpeg', size }), /10 MB/);
});

test('profile photo resizing preserves aspect ratio, limits the largest side and never enlarges a photo', () => {
  assert.deepEqual(profilePhotoDimensions(3000, 1500), { width: 512, height: 256 });
  assert.deepEqual(profilePhotoDimensions(1000, 4000), { width: 128, height: 512 });
  assert.deepEqual(profilePhotoDimensions(100, 80), { width: 100, height: 80 });
  assert.deepEqual(profilePhotoDimensions(1, 5000), { width: 1, height: 512 });
  for (const size of [[0, 30], [NaN, 30], [30, Infinity], [-1, 30]]) assert.throws(() => profilePhotoDimensions(size[0]!, size[1]!), /could not be opened/);
});

test('canceled photo preparation stops before allocating browser resources', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(prepareProfilePhoto(new File(['test'], 'fixture.png', { type: 'image/png' }), controller.signal), { name: 'AbortError' });
});
