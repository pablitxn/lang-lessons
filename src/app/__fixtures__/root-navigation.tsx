import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createExitCoordinator } from '../../foundation/exit-coordinator';
import { App } from '../App';
import { useRootExitRegistration } from '../navigation-context';
import type { ConfirmCloseRequest } from '../../contracts';
const fixture = {
  calls: [] as string[], closes: [] as ConfirmCloseRequest[], mounts: 0, unmounts: 0,
  decision: null as null | ((decision: 'cancel' | 'confirm') => void),
  flush: null as null | (() => void), close: null as null | (() => void),
  failClose: false, register: true,
};
Object.assign(window, { rootFixture: fixture });
function Lesson() {
  const register = useRootExitRegistration(); const [id] = useState(() => crypto.randomUUID());
  useEffect(() => {
    fixture.mounts++;
    let alive = true; let approved: string | null = null;
    const coordinator = createExitCoordinator<string>({
      operationId: () => crypto.randomUUID(), isCurrent: () => alive, navigate: target => { approved = target; },
      exit: { sessionId: id,
        requestExit: () => { fixture.calls.push('decision'); return new Promise(resolve => { fixture.decision = resolve; }); },
        freezeWrites: () => { fixture.calls.push('freeze'); }, releasePreparation: () => { fixture.calls.push('release'); } },
      progress: { flush: async () => { fixture.calls.push('flush'); await new Promise<void>(resolve => { fixture.flush = resolve; }); return { sessionId: id, journalRevision: 3 }; } },
      sessions: { read: async () => { fixture.calls.push('read'); return { sessionId: id, revision: 2, mode: 'verb-image', status: 'open' }; },
        confirmClose: async input => { fixture.calls.push('close'); fixture.closes.push(input);
          if (fixture.failClose) { fixture.failClose = false; throw new Error('Mock ambiguous close'); }
          await new Promise<void>(resolve => { fixture.close = resolve; });
          return { sessionId: id, operationId: input.operationId, revision: 3, status: 'closed', feedback: 'insufficient-evidence' }; } },
    });
    const cleanup = fixture.register ? register?.(async target => {
      return await coordinator.request(target) === 'closed' ? approved : null;
    }) : undefined;
    return () => { alive = false; fixture.unmounts++; cleanup?.(); };
  }, [id, register]);
  return <><label>Draft<input aria-label="Draft" /></label><p data-mount={id}>Lesson fixture</p></>;
}
createRoot(document.getElementById('root')!).render(<App requireExitRegistration renderLesson={() => <Lesson />} />);
