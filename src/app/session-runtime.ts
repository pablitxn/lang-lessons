import type { ExerciseContext, VoiceAdapter, VoiceEvent, VoiceState } from '../contracts';

/** One memory-only session. Root UI holds and late subscribers share the same signals. */
export function createSessionRuntime(base: VoiceAdapter, sessionId: string) {
  const listeners = new Set<(event: VoiceEvent) => void>();
  const observers = new Set<() => void>();
  const holds = new Set<string>();
  const submittedUtterances = new Set<string>();
  let sequence = 0;
  let context: ExerciseContext | null = null;
  let abort: AbortController | null = null;
  let snapshot = { state: 'offline' as VoiceState, muted: true, learnerSpeaking: false, assistantSpeaking: false, error: '', contextReady: false };
  const eventBase = () => ({ sessionId, eventId: `root-${++sequence}` });
  function emit(event: VoiceEvent) {
    if (event.sessionId !== sessionId) return;
    if (event.type === 'state') snapshot = { ...snapshot, state: event.state, error: event.state === 'ready' ? '' : snapshot.error,
      ...(event.state === 'offline' || event.state === 'error' ? { muted: true, learnerSpeaking: false, assistantSpeaking: false } : {}) };
    if (event.type === 'microphone') snapshot = { ...snapshot, muted: event.muted };
    if (event.type === 'speech') snapshot = { ...snapshot, [event.speaker === 'learner' ? 'learnerSpeaking' : 'assistantSpeaking']: event.active };
    if (event.type === 'error') snapshot = { ...snapshot, error: event.message };
    for (const listener of listeners) listener(event);
    if (event.type === 'transcript' && event.final && base.mode === 'openai-realtime') {
      // Features allocate assessment refs synchronously in their transcript listener.
      // Keep natural questions available when no lesson obligations remain open.
      queueMicrotask(() => {
        if (snapshot.state !== 'ready' || submittedUtterances.has(event.utteranceId) || !context
          || context.exerciseId !== event.identity.exerciseId || context.generation !== event.identity.generation) return;
        void voice.submit({ ...event.identity, inputId: `conversation-${event.utteranceId}`, kind: 'utterance',
          utteranceId: event.utteranceId, text: event.text, attempts: [] }).catch(() => {
          emit({ ...eventBase(), type: 'error', code: 'provider', retryable: true, message: 'The spoken conversation could not be processed. Please retry.' });
        });
      });
    }
    for (const observer of observers) observer();
    if (event.type === 'intent' && (event.intent === 'stop' || event.intent === 'change-mode')) stop();
  }
  base.subscribe(emit);
  function stop() { abort?.abort(); abort = null; base.disconnect(); }
  const voice: VoiceAdapter = { ...base,
    async submit(input) {
      if (input.utteranceId) {
        submittedUtterances.add(input.utteranceId);
        if (submittedUtterances.size > 200) submittedUtterances.delete(submittedUtterances.values().next().value!);
      }
      await base.submit(input);
    },
    setContext(next) {
      context = next; base.setContext(next);
      if (!snapshot.contextReady) { snapshot = { ...snapshot, contextReady: true }; for (const observer of observers) observer(); }
    },
    async connect(options) {
      if (options.sessionId !== sessionId) throw new Error('Session identity mismatch.');
      await base.connect(options);
    },
    subscribe(listener) {
      listeners.add(listener);
      listener({ ...eventBase(), type: 'state', state: snapshot.state });
      for (const id of holds) listener({ ...eventBase(), type: 'presentation-hold', id, held: true });
      return () => { listeners.delete(listener); };
    },
  };
  return {
    voice, sessionId, getSnapshot: () => snapshot, getContext: () => context,
    subscribe(observer: () => void) { observers.add(observer); return () => { observers.delete(observer); }; },
    async start() {
      stop(); abort = new AbortController();
      emit({ ...eventBase(), type: 'intent', intent: 'practice' });
      await voice.connect({ sessionId, signal: abort.signal });
    },
    stop,
    hold(id: string, held: boolean) {
      if (holds.has(id) === held) return;
      if (held) holds.add(id); else holds.delete(id);
      emit({ ...eventBase(), type: 'presentation-hold', id, held });
    },
    resume() { emit({ ...eventBase(), type: 'intent', intent: 'practice' }); emit({ ...eventBase(), type: 'intent', intent: 'question-resolved' }); },
  };
}
