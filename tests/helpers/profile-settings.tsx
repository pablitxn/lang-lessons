import { createRoot, type Root } from 'react-dom/client';
import { ProfileSettings } from '../../src/features/accounts/ProfileSettings';
import type { CurrentUser } from '../../src/contracts';
import '../../src/app/global.css';

const user: CurrentUser = { id: 'profile-fixture', name: 'Student', image: null, role: 'student', capabilities: { granted: [] } };
const saves: { input: { name: string; image: string | null }; signal: AbortSignal }[] = [];
const updates: CurrentUser[] = [];
let finish: ((user: CurrentUser) => void) | null = null;
let fail: (() => void) | null = null;
let root: Root | null = null;
function mount(account = user) {
  root?.unmount(); root = createRoot(document.getElementById('fixture')!);
  root.render(<ProfileSettings user={account} onUpdated={updated => updates.push(updated)} onSave={(input, signal) => {
    saves.push({ input, signal }); return new Promise((resolve, reject) => { finish = resolve; fail = () => reject(new Error('Private server detail')); });
  }} />);
}
let holdImages = false;
const heldLoads: (() => void)[] = [];
const NativeImage = window.Image;
window.Image = function (width?: number, height?: number) {
  const image = new NativeImage(width, height); let loaded: ((event: Event) => unknown) | null = null;
  Object.defineProperty(image, 'onload', { get: () => loaded, set: (callback: typeof loaded) => { loaded = callback; } });
  image.addEventListener('load', () => { const invoke = () => loaded?.(new Event('load')); if (holdImages) heldLoads.push(invoke); else invoke(); });
  return image;
} as unknown as typeof Image;
Object.assign(window, { profileFixture: {
  saves, updates, mount,
  unmount: () => { root?.unmount(); root = null; },
  resolve: (override: Partial<CurrentUser> = {}) => { const input = saves.at(-1)!.input; finish?.({ ...user, ...input, ...override }); },
  reject: () => fail?.(),
  holdPhotos: () => { holdImages = true; },
  releasePhotos: () => { holdImages = false; for (const callback of heldLoads.splice(0)) callback(); },
  heldCount: () => heldLoads.length,
  photo: () => {
    const canvas = document.createElement('canvas'); canvas.width = 1400; canvas.height = 700;
    const context = canvas.getContext('2d')!; context.fillStyle = '#336699'; context.fillRect(0, 0, 1400, 700);
    return canvas.toDataURL('image/png').split(',')[1];
  },
} });
mount();
