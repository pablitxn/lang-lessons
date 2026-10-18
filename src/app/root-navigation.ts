import { modeHref, resolveLessonRoute } from './routes';

const normalized = (hash: string) => { const mode = resolveLessonRoute(hash); return mode ? modeHref(mode) : '#/'; };
/** Owns only in-document navigation. Reload/unload policy belongs to the separate lifecycle contract. */
export function createRootNavigator(browser: Window, commitView: (hash: string) => void,
  authorize: (hash: string) => Promise<string | null>, reportError: () => void) {
  const owner = browser.crypto.randomUUID(); const field = '__langLessonsNavigation';
  let current = { hash: normalized(browser.location.hash), index: 0 }; let disposed = false;
  let pending: Promise<boolean> | null = null;
  let restoring: Promise<void> | null = null; let restored: (() => void) | null = null;
  let arrival: { hash: string; index: number; resolve: () => void } | null = null;
  let lastObserved = '';
  const stamp = (index: number) => ({ ...(browser.history.state && typeof browser.history.state === 'object' ? browser.history.state : {}), [field]: { owner, index } });
  browser.history.replaceState(stamp(0), '', current.hash);
  function read() {
    const state: unknown = browser.history.state?.[field];
    const index = state && typeof state === 'object' && 'owner' in state && state.owner === owner
      && 'index' in state && Number.isSafeInteger(state.index) ? state.index as number : null;
    return { hash: normalized(browser.location.hash), index };
  }
  function restore(target: ReturnType<typeof read>): Promise<void> {
    if (restoring) return restoring;
    if (target.index === null || target.index === current.index) {
      browser.history.replaceState(stamp(current.index), '', current.hash); return Promise.resolve();
    }
    restoring = new Promise<void>(resolve => { restored = resolve; });
    browser.history.go(current.index - target.index);
    return restoring;
  }
  function commit(hash: string, index: number) {
    current = { hash, index }; lastObserved = ''; commitView(hash);
  }
  function request(hash: string, travel: ReturnType<typeof read> | null = null) {
    if (pending) return pending;
    const target = normalized(hash);
    if (disposed || target === current.hash) return Promise.resolve(false);
    pending = (async () => {
      if (travel) await restore(travel);
      if (disposed) return false;
      const approved = await authorize(target);
      if (restoring) await restoring;
      if (disposed || !approved) return false;
      const next = normalized(approved);
      if (travel && travel.index !== null && travel.index !== current.index && next === target) {
        await new Promise<void>(resolve => {
          arrival = { hash: next, index: travel.index!, resolve };
          browser.history.go(travel.index! - current.index);
        });
      } else {
        const index = current.index + 1;
        browser.history.pushState(stamp(index), '', next); commit(next, index);
      }
      return true;
    })().catch(() => { if (!disposed) reportError(); return false; }).finally(() => { pending = null; });
    return pending;
  }
  function changed() {
    if (disposed) return;
    let target = read();
    const observed = JSON.stringify(target);
    if (observed === lastObserved) return;
    lastObserved = observed;
    if (arrival && target.hash === arrival.hash && target.index === arrival.index) {
      const done = arrival.resolve; const currentArrivalIndex = arrival.index; arrival = null; commit(target.hash, currentArrivalIndex); done(); return;
    }
    if (restoring && target.hash === current.hash && target.index === current.index) {
      const done = restored; restored = null; restoring = null; done?.(); return;
    }
    if (target.hash === current.hash) return;
    // A direct location.hash assignment copies the previous state into a new entry.
    if (target.index === current.index && !pending) {
      target = { ...target, index: current.index + 1 };
      browser.history.replaceState(stamp(current.index + 1), '', target.hash);
    }
    if (pending) { void restore(target); return; }
    void request(target.hash, target);
  }
  browser.addEventListener('popstate', changed); browser.addEventListener('hashchange', changed);
  return {
    request: (hash: string) => request(hash),
    dispose() {
      disposed = true; browser.removeEventListener('popstate', changed); browser.removeEventListener('hashchange', changed);
      restored?.(); arrival?.resolve(); restored = null; arrival = null; restoring = null;
    },
  };
}
