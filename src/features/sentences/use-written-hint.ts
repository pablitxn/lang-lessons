import { useEffect, useRef, useState } from 'react';
import type { WrittenComparisonResult } from './written-comparison';

interface HintState { key: string; status: 'loading' | 'ready' | 'unavailable'; text: string }

/** Comparison is already debounced by the field; edits invalidate it immediately. */
export function useWrittenHint(sentenceId: string | undefined, result: WrittenComparisonResult | undefined, enabled: boolean, sessionId?: string) {
  const draft = result?.status === 'different' ? result.submittedText : '';
  const key = enabled && sentenceId && draft.trim() ? JSON.stringify([sessionId, sentenceId, draft]) : '';
  const [state, setState] = useState<HintState>();
  const cache = useRef(new Map<string, string>());
  useEffect(() => {
    if (!key || !sentenceId) return;
    const cached = cache.current.get(key);
    if (cached) { setState({ key, status: 'ready', text: cached }); return; }
    const controller = new AbortController();
    setState({ key, status: 'loading', text: '' });
    void (async () => {
      try {
        const response = await fetch('/api/realtime/sentence-hint', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
          body: JSON.stringify({ sentenceId, draft, helpEnabled: true, ...(sessionId ? { sessionId } : {}) }),
        });
        if (!response.ok) throw new Error('Hint unavailable');
        const data: unknown = await response.json();
        if (!data || typeof data !== 'object' || !('hint' in data) || typeof data.hint !== 'string'
          || !data.hint.trim() || data.hint.length > 180) throw new Error('Invalid hint');
        if (controller.signal.aborted) return;
        const text = data.hint.trim();
        cache.current.set(key, text);
        if (cache.current.size > 20) cache.current.delete(cache.current.keys().next().value!);
        setState({ key, status: 'ready', text });
      } catch {
        if (!controller.signal.aborted) setState({ key, status: 'unavailable', text: sentenceId.startsWith('fr-') ? 'La pista no está disponible en este momento.' : 'Hint unavailable right now.' });
      }
    })();
    return () => controller.abort();
  }, [key, sentenceId, draft, sessionId]);
  return key && state?.key === key ? state : undefined;
}
