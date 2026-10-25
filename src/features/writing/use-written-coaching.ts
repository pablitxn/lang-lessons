import { useEffect, useRef, useState } from 'react';
import { MAX_WRITTEN_COACHING_LENGTH, parseWrittenCoachingFeedback, type ExerciseIdentity, type WrittenCoachingFeedback } from '../../contracts';

type WritingState = { status: 'idle' } | { status: 'pending'; draft: string }
  | { status: 'ready'; draft: string; feedback: WrittenCoachingFeedback }
  | { status: 'error'; message: string };

const messageFor = (status: number) => status === 429
  ? 'Esperá un momento antes de pedir otra corrección.'
  : status === 401 || status === 403
    ? 'La práctica ya no está disponible en esta sesión. Volvé a abrir el ejercicio para continuar.'
    : 'No se pudo corregir la frase. Tu texto sigue acá; podés volver a intentarlo.';

/** One explicit request per draft. Changing the draft invalidates even uncancellable responses. */
export function useWrittenCoaching(endpoint: '/api/realtime/verb-writing' | '/api/realtime/sentence-rewrite', context: { identity: ExerciseIdentity; verbId?: string; sentenceId?: string }) {
  const { identity } = context;
  const [state, setState] = useState<WritingState>({ status: 'idle' });
  const request = useRef<AbortController | undefined>(undefined);
  const revision = useRef(0);
  const cache = useRef(new Map<string, WrittenCoachingFeedback>());

  function cancel() {
    revision.current++;
    request.current?.abort();
    request.current = undefined;
  }

  useEffect(() => () => cancel(), []);

  function reset() {
    cancel();
    setState({ status: 'idle' });
  }

  async function submit(draft: string) {
    if (request.current || !draft.trim() || draft.length > MAX_WRITTEN_COACHING_LENGTH) return;
    const cached = cache.current.get(draft);
    if (cached) { setState({ status: 'ready', draft, feedback: cached }); return; }
    const controller = new AbortController();
    const currentRevision = ++revision.current;
    request.current = controller;
    setState({ status: 'pending', draft });
    const payload = { identity: { sessionId: identity.sessionId, exerciseId: identity.exerciseId, generation: identity.generation }, ...(context.verbId ? { verbId: context.verbId } : { sentenceId: context.sentenceId }), draft };
    let failure = messageFor(0);
    try {
      const response = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
        body: JSON.stringify(payload),
      });
      if (!response.ok) { failure = messageFor(response.status); throw new Error('Written coaching unavailable'); }
      const feedback = parseWrittenCoachingFeedback(await response.json());
      if (!feedback || endpoint === '/api/realtime/sentence-rewrite' && feedback.status === 'off-topic'
        || feedback.status === 'needs-revision' && feedback.correctedSentence!.normalize('NFC').trim() === draft.normalize('NFC').trim()) {
        throw new Error('Invalid written coaching');
      }
      if (controller.signal.aborted || currentRevision !== revision.current) return;
      cache.current.set(draft, feedback);
      if (cache.current.size > 12) cache.current.delete(cache.current.keys().next().value!);
      setState({ status: 'ready', draft, feedback });
    } catch {
      if (!controller.signal.aborted && currentRevision === revision.current) setState({ status: 'error', message: failure });
    } finally {
      if (request.current === controller) request.current = undefined;
    }
  }

  return { state, reset, submit };
}
