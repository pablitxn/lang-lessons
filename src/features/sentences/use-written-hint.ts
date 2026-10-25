import { useEffect, useRef, useState } from 'react';
import { parseWrittenTranslationReview, type ExerciseIdentity, type LearningLanguage, type WrittenTranslationReview } from '../../contracts';
import type { WrittenComparisonResult } from './written-comparison';

export interface WrittenHintState { key: string; status: 'loading' | 'ready' | 'unavailable'; text: string; review?: WrittenTranslationReview }

/** Only fixed messages are displayed; provider and broker error text stays untrusted. */
export function sentenceHintFailureMessage(status: number, reason?: unknown): string {
  if (status === 401 || status === 403) return 'Esta práctica ya no está activa. Volvé a abrir Sentence para pedir una pista.';
  if (status === 429) return 'Hay muchas solicitudes de pistas. Esperá un minuto y volvé a intentarlo.';
  if (status === 408 || status === 504) return 'La pista tardó demasiado. Podés volver a intentarlo.';
  if (status === 503 && reason === 'not-configured') return 'El servicio de pistas necesita configuración. Avisale a quien administra la aplicación.';
  if (status === 502 && reason === 'invalid-response') return 'No se pudo generar una pista válida. Podés volver a intentarlo.';
  if ([400, 405, 413, 415].includes(status)) return 'No se pudo pedir la pista para este texto. Revisá la frase y volvé a intentarlo.';
  if (status === 0) return 'No se pudo conectar con el servicio de pistas. Revisá tu conexión y volvé a intentarlo.';
  return 'El servicio de pistas no está disponible ahora. Podés volver a intentarlo.';
}

async function boundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.body) throw new Error('Missing hint response');
  const maximum = 8192;
  if (Number(response.headers.get('content-length') ?? 0) > maximum) {
    void response.body.cancel().catch(() => {}); throw new Error('Oversized hint response');
  }
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  const aborted = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', aborted, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      length += value.byteLength;
      if (length > maximum) { void reader.cancel().catch(() => {}); throw new Error('Oversized hint response'); }
      chunks.push(value);
    }
  } finally { signal.removeEventListener('abort', aborted); reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

/** Comparison is already debounced by the field; edits invalidate it immediately. */
export function useWrittenHint(sentenceId: string | undefined, result: WrittenComparisonResult | undefined, enabled: boolean, sessionId?: string, identity?: ExerciseIdentity, language: LearningLanguage = 'en') {
  const draft = result?.status === 'different' ? result.submittedText : '';
  const key = enabled && sentenceId && draft.trim() ? JSON.stringify([sessionId, identity?.exerciseId, identity?.generation, language, sentenceId, draft]) : '';
  const [state, setState] = useState<WrittenHintState>();
  const cache = useRef(new Map<string, WrittenTranslationReview>());
  useEffect(() => {
    if (!key || !sentenceId) return;
    const cached = cache.current.get(key);
    if (cached) { setState({ key, status: 'ready', text: reviewHint(cached), review: cached }); return; }
    const controller = new AbortController();
    const deadline = AbortSignal.timeout(16000);
    const signal = AbortSignal.any([controller.signal, deadline]);
    setState({ key, status: 'loading', text: '' });
    void (async () => {
      let failure = sentenceHintFailureMessage(0);
      try {
        const response = await fetch('/api/realtime/sentence-hint', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
          signal,
          body: JSON.stringify({ sentenceId, draft, helpEnabled: true, ...(sessionId ? { sessionId } : {}) }),
        });
        if (!response.ok) {
          let reason: unknown;
          try {
            const error = await boundedJson(response, signal);
            if (error && typeof error === 'object' && 'reason' in error) reason = error.reason;
          } catch { /* Status alone still identifies authorization, rate and timeout failures. */ }
          failure = sentenceHintFailureMessage(response.status, reason);
          throw new Error('Hint unavailable');
        }
        failure = sentenceHintFailureMessage(502, 'invalid-response');
        const data = await boundedJson(response, signal);
        const review = parseWrittenTranslationReview(data, draft, language);
        if (!review) throw new Error('Invalid review');
        if (controller.signal.aborted) return;
        deadline.throwIfAborted();
        cache.current.set(key, review);
        if (cache.current.size > 20) cache.current.delete(cache.current.keys().next().value!);
        setState({ key, status: 'ready', text: reviewHint(review), review });
      } catch {
        if (!controller.signal.aborted) setState({ key, status: 'unavailable', text: deadline.aborted ? sentenceHintFailureMessage(504) : failure });
      }
    })();
    return () => controller.abort();
  }, [key, sentenceId, draft, sessionId, language]);
  return key && state?.key === key ? state : undefined;
}

function reviewHint(review: WrittenTranslationReview): string {
  return review.status === 'accepted' ? 'Tu traducción es válida. Ahora podés identificar su tiempo verbal.'
    : review.status === 'needs-revision' ? review.issues[0]!.hint : review.hint;
}
