import type { ExerciseContext, VoiceAdapter, VoiceEvent, VoiceState } from '../contracts';

/** Check configuration before requesting microphone access or starting a call. */
export async function checkVoiceAvailability(signal: AbortSignal, request: typeof fetch = fetch): Promise<void> {
  let response: Response;
  try {
    response = await request('/api/realtime/status', { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]), credentials: 'same-origin' });
  } catch {
    signal.throwIfAborted();
    throw new Error('Voice is unavailable. Check your connection and try again.');
  }
  signal.throwIfAborted();
  if (!response.ok) throw new Error('Voice is unavailable. Check your connection and try again.');
  let status: unknown;
  try { status = await response.json(); } catch { throw new Error('Voice is unavailable. Please try again.'); }
  signal.throwIfAborted();
  if (!status || typeof status !== 'object' || !('enabled' in status) || typeof status.enabled !== 'boolean') {
    throw new Error('Voice is unavailable. Please try again.');
  }
  if (!status.enabled) {
    const reason = 'reason' in status ? status.reason : undefined;
    if (reason === 'disabled') throw new Error('Voice calls are turned off. Enable the voice service, then retry.');
    if (reason === 'missing-credentials') throw new Error('Voice setup is incomplete. Configure the voice service API key, then retry.');
    throw new Error('Voice service is not ready. Complete voice setup, then retry.');
  }
}

/** One memory-only session. Root UI holds and late subscribers share the same signals. */
export function createSessionRuntime(base: VoiceAdapter, sessionId: string, options: {
  prepareConnection?: (signal: AbortSignal) => Promise<void>;
} = {}) {
  const listeners = new Set<(event: VoiceEvent) => void>();
  const observers = new Set<() => void>();
  const holds = new Set<string>();
  const submittedUtterances = new Set<string>();
  let sequence = 0;
  let connectionEpoch = 0;
  let context: ExerciseContext | null = null;
  let abort: AbortController | null = null;
  let starting: Promise<void> | null = null;
  let snapshot = { state: 'offline' as VoiceState, muted: true, learnerSpeaking: false, assistantSpeaking: false, error: '', contextReady: false, paused: false };
  const eventBase = () => ({ sessionId, eventId: `root-${++sequence}` });
  function claimUtterance(utteranceId: string) {
    submittedUtterances.add(utteranceId);
    if (submittedUtterances.size > 200) submittedUtterances.delete(submittedUtterances.values().next().value!);
  }
  function emit(event: VoiceEvent) {
    if (event.sessionId !== sessionId) return;
    if (event.type === 'state') snapshot = { ...snapshot, state: event.state, error: event.state === 'ready' || event.state === 'connecting' ? '' : snapshot.error,
      ...(event.state === 'offline' || event.state === 'error' ? { muted: true, learnerSpeaking: false, assistantSpeaking: false } : {}) };
    if (event.type === 'microphone') snapshot = { ...snapshot, muted: event.muted };
    if (event.type === 'speech') snapshot = { ...snapshot, [event.speaker === 'learner' ? 'learnerSpeaking' : 'assistantSpeaking']: event.active };
    if (event.type === 'error') snapshot = { ...snapshot, error: event.message };
    if (event.type === 'intent' && ['pause', 'stop', 'change-mode', 'practice'].includes(event.intent)) {
      snapshot = { ...snapshot, paused: event.intent !== 'practice' };
    }
    for (const listener of listeners) listener(event);
    if (event.type === 'transcript' && event.final && base.mode === 'openai-realtime') {
      // A feature can reserve audio synchronously while its assessment waits in a queue.
      // Keep unclaimed natural questions available after the lesson checklist.
      const epoch = connectionEpoch;
      queueMicrotask(() => {
        if (epoch !== connectionEpoch || snapshot.state !== 'ready' || submittedUtterances.has(event.utteranceId) || !context
          || context.exerciseId !== event.identity.exerciseId || context.generation !== event.identity.generation) return;
        void voice.submit({ ...event.identity, inputId: `conversation-${event.utteranceId}`, kind: 'utterance',
          utteranceId: event.utteranceId, text: event.text, attempts: [] }).catch(() => {
          emit({ ...eventBase(), type: 'error', code: 'provider', retryable: true, message: 'The spoken conversation could not be processed. Please retry.' });
        });
      });
    }
    for (const observer of observers) observer();
    if (event.type === 'intent' && (event.intent === 'pause' || event.intent === 'stop' || event.intent === 'change-mode')) stop();
  }
  base.subscribe(emit);
  function stop() {
    connectionEpoch++;
    const pending = abort; abort = null; starting = null;
    pending?.abort(); base.disconnect();
    if (snapshot.state !== 'offline') emit({ ...eventBase(), type: 'state', state: 'offline' });
  }
  function start(): Promise<void> {
    if (starting) return starting;
    if (snapshot.state === 'ready') return Promise.resolve();
    stop();
    const attempt = new AbortController(); abort = attempt;
    const epoch = connectionEpoch;
    emit({ ...eventBase(), type: 'intent', intent: 'practice' });
    emit({ ...eventBase(), type: 'intent', intent: 'question-resolved' });
    emit({ ...eventBase(), type: 'state', state: 'connecting' });
    const pending = (async () => {
      // Defer side effects so an immediate cleanup can cancel startup entirely.
      await Promise.resolve();
      attempt.signal.throwIfAborted();
      await options.prepareConnection?.(attempt.signal);
      attempt.signal.throwIfAborted();
      await voice.connect({ sessionId, signal: attempt.signal });
      attempt.signal.throwIfAborted();
    })().catch(error => {
      if (epoch === connectionEpoch && !attempt.signal.aborted) {
        base.disconnect();
        if (!snapshot.error) emit({ ...eventBase(), type: 'error', code: 'connection', retryable: true,
          message: error instanceof Error ? error.message : 'Voice could not start. Please try again.' });
        emit({ ...eventBase(), type: 'state', state: 'error' });
      }
      throw error;
    }).finally(() => { if (epoch === connectionEpoch) starting = null; });
    starting = pending;
    return pending;
  }
  const voice: VoiceAdapter = { ...base,
    async submit(input) {
      if (input.utteranceId) claimUtterance(input.utteranceId);
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
    voice, sessionId, claimUtterance, getSnapshot: () => snapshot, getContext: () => context,
    subscribe(observer: () => void) { observers.add(observer); return () => { observers.delete(observer); }; },
    start, stop,
    pause() { emit({ ...eventBase(), type: 'intent', intent: 'pause' }); },
    hold(id: string, held: boolean) {
      if (holds.has(id) === held) return;
      if (held) holds.add(id); else holds.delete(id);
      emit({ ...eventBase(), type: 'presentation-hold', id, held });
    },
    resume() {
      if (snapshot.state !== 'ready') return start();
      emit({ ...eventBase(), type: 'intent', intent: 'practice' });
      emit({ ...eventBase(), type: 'intent', intent: 'question-resolved' });
      return Promise.resolve();
    },
  };
}
