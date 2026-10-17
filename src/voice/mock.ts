import { sameExercise, type EvidenceResult, type ExerciseContext, type HintRequest, type LearnerInput,
  type LearnerQuestion, type VoiceAdapter, type VoiceConnectOptions, type VoiceEvent } from '../contracts';
import { assessSpelling } from '../assessment/spelling';

export interface MockVoiceAdapter extends VoiceAdapter {
  readonly mode: 'mock';
  simulateUtterance(text: string, outcome?: EvidenceResult['status']): string;
  simulateSpeech(speaker: 'learner' | 'assistant', active: boolean): void;
  simulateIntent(intent: Extract<VoiceEvent, { type: 'intent' }>['intent']): void;
}
export function isMockVoiceAdapter(adapter: VoiceAdapter): adapter is MockVoiceAdapter {
  return adapter.mode === 'mock' && 'simulateUtterance' in adapter;
}
/** Explicit simulator; no microphone, network, language model or acoustic grading. */
export function createMockVoiceAdapter(): MockVoiceAdapter {
  const listeners = new Set<(event: VoiceEvent) => void>();
  let context: ExerciseContext | null = null;
  let sessionId = '';
  let connected = false;
  let generation = 0;
  let sequence = 0;
  let hintEpoch = 0;
  let stageEpoch = 0;
  let releaseAbort: (() => void) | undefined;
  const utterances = new Map<string, { context: ExerciseContext; stageEpoch: number; outcome: EvidenceResult['status'] }>();
  const id = () => `mock-${++sequence}`;
  const emit = (event: VoiceEvent) => { for (const listener of listeners) listener(event); };
  const eventBase = () => ({ eventId: id(), sessionId });
  function ready() { if (!connected || !context || context.sessionId !== sessionId) throw new Error('Start the mock session and set its exercise first.'); return context; }
  const adapter: MockVoiceAdapter = {
    mode: 'mock',
    async connect(options: VoiceConnectOptions) {
      adapter.disconnect(); sessionId = options.sessionId; const epoch = ++generation;
      if (options.signal.aborted) throw new DOMException('Session cancelled.', 'AbortError');
      const abort = () => adapter.disconnect();
      options.signal.addEventListener('abort', abort, { once: true });
      releaseAbort = () => options.signal.removeEventListener('abort', abort);
      emit({ ...eventBase(), type: 'state', state: 'connecting' });
      await Promise.resolve();
      if (generation !== epoch || options.signal.aborted) throw new DOMException('Session cancelled.', 'AbortError');
      connected = true; emit({ ...eventBase(), type: 'state', state: 'ready' });
      emit({ ...eventBase(), type: 'microphone', muted: false });
    },
    setContext(next) {
      if (!context || !sameExercise(context, next)) { utterances.clear(); stageEpoch++; }
      else if (context.mode === 'sentence' && next.mode === 'sentence' && context.stage !== next.stage) stageEpoch++;
      context = next;
    },
    async submit(input: LearnerInput) {
      const current = ready(); const epoch = generation; const capturedStageEpoch = stageEpoch;
      if (!sameExercise(current, input) || input.attempts.some(ref => !sameExercise(current, ref))) return;
      const utterance = input.utteranceId ? utterances.get(input.utteranceId) : undefined;
      const outcome = utterance && sameExercise(utterance.context, current) && utterance.stageEpoch === stageEpoch ? utterance.outcome : 'uncertain';
      const results = input.attempts.map(ref => input.kind === 'typed' && ref.obligation.startsWith('spelling:')
        ? assessSpelling(current, ref, input.text, input.inputId)
        : { ref, status: outcome, source: { kind: 'mock' as const, fixtureId: input.utteranceId ?? 'unverified-input' },
          feedback: outcome === 'accepted' ? 'Simulated acceptance; no real speech assessment.'
            : outcome === 'incorrect' ? 'Simulated retry; try another demo response.' : 'Simulated uncertainty; please repeat.' });
      await Promise.resolve();
      if (!connected || epoch !== generation || capturedStageEpoch !== stageEpoch || !context || !sameExercise(context, current)) return;
      const eventId = id();
      emit({ eventId, sessionId, type: 'assessment', batch: { sessionId, exerciseId: input.exerciseId,
        generation: input.generation, eventId, results } });
    },
    async requestHint(request: HintRequest) {
      const current = ready(); const epoch = generation; const hintGeneration = ++hintEpoch;
      if (!sameExercise(current, request)) return;
      const text = current.mode === 'sentence'
        ? ['Think about the time described in the prompt.', 'Consider how the start of the situation relates to now.', 'Try a full thought that preserves the meaning of the prompt.'][request.level - 1]!
        : ['Think about the action and its meaning.', 'Compare the sound and shape of the forms you already know.', 'Try a complete thought about the action in a clear situation.'][request.level - 1]!;
      await Promise.resolve();
      if (connected && epoch === generation && hintGeneration === hintEpoch && context && sameExercise(context, current)) emit({ ...eventBase(), type: 'hint', hint: { ...request, text, source: 'mock' } });
    },
    cancelPendingHints() { hintEpoch++; },
    async askQuestion(question: LearnerQuestion) {
      const current = ready(); if (!sameExercise(current, question)) return;
      adapter.simulateIntent('question');
      emit({ ...eventBase(), type: 'feedback', identity: current, text: 'Mock conversation: your question keeps this exercise open. Use the demo controls to resolve it when ready.' });
    },
    interrupt() { if (connected) adapter.simulateSpeech('assistant', false); },
    setMuted(muted) { if (connected) emit({ ...eventBase(), type: 'microphone', muted }); },
    disconnect() {
      generation++; releaseAbort?.(); releaseAbort = undefined; utterances.clear();
      const wasConnected = connected; connected = false;
      if (wasConnected || sessionId) emit({ ...eventBase(), type: 'state', state: 'offline' });
    },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    simulateUtterance(text, outcome = 'accepted') {
      const current = ready(); const utteranceId = id(); const capturedStageEpoch = stageEpoch;
      if (text.length > 4000) throw new Error('Mock utterances are limited to 4,000 characters.');
      utterances.set(utteranceId, { context: current, stageEpoch: capturedStageEpoch, outcome });
      if (utterances.size > 100) utterances.delete(utterances.keys().next().value!);
      adapter.simulateSpeech('learner', true); adapter.simulateSpeech('learner', false);
      emit({ ...eventBase(), type: 'transcript', identity: current, utteranceId, text, final: true, uncertain: outcome === 'uncertain',
        ...(current.mode === 'sentence' ? { sentenceScope: { capturedStage: current.stage, eligible: capturedStageEpoch === stageEpoch } } : {}) });
      return utteranceId;
    },
    simulateSpeech(speaker, active) { if (connected) emit({ ...eventBase(), type: 'speech', speaker, active }); },
    simulateIntent(intent) { if (connected) emit({ ...eventBase(), type: 'intent', intent }); },
  };
  return adapter;
}
