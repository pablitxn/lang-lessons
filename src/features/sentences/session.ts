import { createAssessmentController, type AssessmentClock, type AssessmentController, type AssessmentSnapshot, type InteractionPatch } from '../../assessment';
import { SENTENCES } from '../../content';
import { isMockVoiceAdapter } from '../../voice/mock';
import { isQuiet, sameExercise, type Difficulty, type ExerciseContext, type LearnerInput,
  type SentenceEntry, type VoiceAdapter, type VoiceEvent, type VoiceState } from '../../contracts';

/** Conservative display envelope until a provider can attest to semantic hint safety. */
export const TRANSLATION_HINTS = [
  '¿Qué mensaje quieres comunicar?',
  '¿Qué relación expresa el contexto entre la acción y el momento del que hablas?',
  '¿Qué detalle del contexto falta en tu intento? Prueba otra frase completa.',
] as const;
const SAFE_ENGLISH_HINTS = [
  'What message do you want to express?',
  'How does the context relate the activity to the time you are talking about?',
  'Which detail from the context is missing in your attempt? Try another complete sentence.',
] as const;
function normalizeHint(text: string) { return text.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase(); }
export function guardTranslationHint(text: string, level: 1 | 2 | 3): { text: string; fallback: boolean } {
  const allowed = [TRANSLATION_HINTS[level - 1]!, SAFE_ENGLISH_HINTS[level - 1]!];
  const found = allowed.find(candidate => normalizeHint(candidate) === normalizeHint(text));
  return found ? { text: found, fallback: false } : { text: TRANSLATION_HINTS[level - 1]!, fallback: true };
}
export function matchingSentences(difficulty: Difficulty, sentences = SENTENCES): readonly SentenceEntry[] {
  return sentences.filter(sentence => sentence.difficulty.grammar === difficulty.grammar
    && sentence.difficulty.vocabulary === difficulty.vocabulary);
}
function pick(pool: readonly SentenceEntry[], previous: string | undefined, random: () => number): SentenceEntry {
  const candidates = pool.length > 1 ? pool.filter(sentence => sentence.id !== previous) : pool;
  const sample = random();
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) throw new RangeError('Random sample must be within [0, 1).');
  if (!candidates.length) throw new Error('No authored sentence matches both difficulty settings.');
  return candidates[Math.floor(sample * candidates.length)]!;
}

export interface SentenceLessonSnapshot {
  assessment: AssessmentSnapshot;
  requestedDifficulty: Difficulty;
  nextPoolSize: number;
  lastResponse: string;
  notice: string;
  muted: boolean;
  hintLevel: 0 | 1 | 2 | 3;
  hintOrigin: 'none' | 'model' | 'mock' | 'authored-fallback';
  coachText: string;
}
export interface SentenceSessionOptions {
  voice: VoiceAdapter;
  sessionId: string;
  difficulty: Difficulty;
  onComplete: (exerciseId: string) => void;
  clock?: AssessmentClock;
  connectionState?: VoiceState;
  microphoneMuted?: boolean;
  sentences?: readonly SentenceEntry[];
  random?: () => number;
}
export interface SentenceSession {
  getSnapshot(): SentenceLessonSnapshot;
  subscribe(listener: () => void): () => void;
  setDifficulty(difficulty: Difficulty): void;
  setInteraction(patch: InteractionPatch): void;
  setPresentationHold(id: string, held: boolean): void;
  setMuted(muted: boolean): void;
  pause(paused: boolean): void;
  askQuestion(text: string): void;
  resolveQuestion(): void;
  submitMockResponse(text: string): boolean;
  requestHint(): boolean;
  reviseTranslation(): void;
  next(): boolean;
  skip(): boolean;
  dispose(): void;
}

/** Orchestrates the shared controller; there is no feature-owned evidence reducer. */
export function createSentenceSession(options: SentenceSessionOptions): SentenceSession {
  const voice = options.voice;
  const sentences = options.sentences ?? SENTENCES;
  const random = options.random ?? Math.random;
  let requestedDifficulty = { ...options.difficulty };
  let sequence = 0;
  let generation = 1;
  let disposed = false;
  let lastResponse = '';
  let notice = '';
  let coachText = '';
  let muted = options.microphoneMuted ?? true;
  let hintLevel: 0 | 1 | 2 | 3 = 0;
  let hintOrigin: SentenceLessonSnapshot['hintOrigin'] = 'none';
  let utterances = new Set<string>();
  let view: SentenceLessonSnapshot;
  const listeners = new Set<() => void>();
  const identityPrefix = `sentence-${globalThis.crypto.randomUUID()}`;
  const first = pick(matchingSentences(requestedDifficulty, sentences), undefined, random);
  function context(sentence: SentenceEntry): ExerciseContext {
    return { sessionId: options.sessionId, exerciseId: `${identityPrefix}-${generation}`, generation,
      mode: 'sentence', stage: 'translation', sentence };
  }
  let controller: AssessmentController;
  function publish() {
    if (disposed) return;
    view = Object.freeze({ assessment: controller.getSnapshot(), requestedDifficulty: { ...requestedDifficulty },
      nextPoolSize: matchingSentences(requestedDifficulty, sentences).length, lastResponse, notice, muted,
      hintLevel, hintOrigin, coachText });
    for (const listener of listeners) listener();
  }
  function startNext(): boolean {
    const pool = matchingSentences(requestedDifficulty, sentences);
    if (!pool.length) { notice = 'No authored prompt matches both selected settings. Change grammar or vocabulary in Preferences.'; publish(); return false; }
    const current = controller.getSnapshot().context;
    const sentence = pick(pool, current.mode === 'sentence' ? current.sentence.id : undefined, random);
    generation++;
    utterances = new Set(); lastResponse = ''; notice = ''; coachText = ''; hintLevel = 0; hintOrigin = 'none';
    controller.startExercise(context(sentence));
    return true;
  }
  controller = createAssessmentController({ context: context(first), allowMock: voice.mode === 'mock',
    ...(options.clock ? { clock: options.clock } : {}),
    onCancelHint: () => voice.cancelPendingHints?.(),
    onContextChange: next => { hintLevel = 0; hintOrigin = 'none'; coachText = ''; voice.setContext(next); },
    onAdvance: snapshot => { options.onComplete(snapshot.exerciseId); startNext(); },
  });
  const unsubscribeController = controller.subscribe(publish);
  controller.setInteraction({ connection: options.connectionState ?? 'offline' });

  function current(identity: { sessionId: string; exerciseId: string; generation: number }) {
    return !disposed && sameExercise(controller.getSnapshot(), identity);
  }
  function reportFailure(identity: ExerciseContext) {
    if (!current(identity)) return;
    notice = 'The voice request failed. Previously accepted work is preserved; retry when connected.';
    controller.handleVoiceEvent({ type: 'error', eventId: `sentence-error-${++sequence}`, sessionId: options.sessionId,
      code: 'provider', retryable: true, message: 'Voice is unavailable. Please reconnect and try again.' });
  }
  function submit(input: LearnerInput, identity: ExerciseContext) {
    try { void voice.submit(input).catch(() => reportFailure(identity)); } catch { reportFailure(identity); }
  }
  function readyForResponse() {
    const { interaction, completed } = controller.getSnapshot();
    return !disposed && !completed && interaction.connection === 'ready' && interaction.intent === 'practice'
      && !interaction.questionPending;
  }
  function processResponse(text: string, utteranceId: string, uncertain: boolean): boolean {
    if (utterances.has(utteranceId)) return false;
    // Even an ineligible final utterance must not be replayed into a later stage.
    utterances.add(utteranceId);
    if (!readyForResponse()) return false;
    const obligations = controller.getOpenObligations();
    if (!obligations.length || obligations.some(key => controller.getSnapshot().evidence[key]?.status === 'processing')) return false;
    const identity = controller.getSnapshot().context;
    const attempts = controller.beginAttempt(obligations, `oral-${++sequence}`);
    if (!attempts.length) return false;
    hintOrigin = 'none'; coachText = '';
    if (uncertain || !text.trim()) {
      notice = 'The audio was unclear. Please repeat; this is not a learner error.';
      controller.applyBatch({ ...identity, eventId: `unclear-${++sequence}`, results: attempts.map(ref => ({ ref,
        status: 'uncertain', source: { kind: 'audio', utteranceId, audioAvailable: false },
        feedback: 'The audio needs clarification. Please repeat your response.' })) });
      return true;
    }
    notice = ''; lastResponse = text;
    submit({ ...identity, inputId: `oral-input-${++sequence}`, kind: 'utterance', text, utteranceId, attempts }, identity);
    publish(); return true;
  }
  function receive(event: VoiceEvent) {
    if (disposed || event.sessionId !== options.sessionId) return;
    const before = controller.getSnapshot();
    if (event.type === 'transcript') {
      if (!current(event.identity)) return;
      controller.handleVoiceEvent(event);
      if (event.final) processResponse(event.text, event.utteranceId, event.uncertain);
      return;
    }
    if (event.type === 'hint') {
      const guarded = event.hint.stage === 'translation'
        ? guardTranslationHint(event.hint.text, event.hint.level) : { text: event.hint.text, fallback: false };
      if (controller.applyHint({ ...event.hint, text: guarded.text })) {
        hintOrigin = guarded.fallback ? 'authored-fallback' : event.hint.source;
        if (guarded.fallback) notice = 'A reviewed meaning-focused prompt is shown because the generated hint could not be safely displayed.';
        if (guarded.fallback) queueMicrotask(() => {
          if (current(before) && controller.getSnapshot().hint?.requestId === event.hint.requestId) voice.cancelPendingHints?.();
        });
        publish();
      }
      return;
    }
    if (event.type === 'assessment') {
      // No raw pre-acceptance corrective text can bypass the hint envelope via feedback.
      const results = event.batch.results.map(result => ({ ...result,
        feedback: before.sentenceStage === 'translation'
          ? result.status === 'accepted' ? 'Oral translation accepted. Now explain your actual construction.'
            : result.status === 'uncertain' ? 'The audio needs clarification. Please repeat without penalty.'
              : 'Review the Spanish context and try again, or ask for a gradual hint.'
          : result.feedback,
      }));
      controller.handleVoiceEvent({ ...event, batch: { ...event.batch, results } });
      return;
    }
    if (event.type === 'feedback') {
      if (!current(event.identity)) return;
      const guarded = before.sentenceStage === 'translation'
        ? guardTranslationHint(event.text, Math.max(1, hintLevel) as 1 | 2 | 3) : { text: event.text, fallback: false };
      coachText = guarded.text;
      if (guarded.fallback) hintOrigin = 'authored-fallback';
      controller.handleVoiceEvent(event); publish(); return;
    }
    if (event.type === 'microphone') muted = event.muted;
    controller.handleVoiceEvent(event.type === 'error' ? { ...event, message: 'Voice is unavailable. Your accepted work is preserved.' } : event);
    publish();
  }
  const unsubscribeVoice = voice.subscribe(receive);
  publish();

  const session: SentenceSession = {
    getSnapshot: () => view,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setDifficulty(difficulty) { requestedDifficulty = { ...difficulty }; publish(); },
    setInteraction: patch => controller.setInteraction(patch),
    setPresentationHold: (id, held) => controller.setPresentationHold(id, held),
    setMuted(next) { if (disposed) return; voice.setMuted(next); },
    pause(paused) { if (disposed) return; if (paused) voice.interrupt(); controller.setInteraction({ intent: paused ? 'pause' : 'practice' }); },
    askQuestion(text) {
      if (disposed || !text.trim()) return;
      if (controller.getSnapshot().interaction.connection !== 'ready') {
        notice = 'Connect the conversation before asking a question.'; publish(); return;
      }
      const identity = controller.getSnapshot().context;
      controller.setInteraction({ questionPending: true });
      if (voice.askQuestion) {
        try { void voice.askQuestion({ ...identity, requestId: `question-${++sequence}`, text: text.trim() }).catch(() => reportFailure(identity)); }
        catch { reportFailure(identity); }
      } else submit({ ...identity, inputId: `question-${++sequence}`, kind: 'typed', text: text.trim(), attempts: [] }, identity);
    },
    resolveQuestion() { controller.setInteraction({ questionPending: false }); },
    submitMockResponse(text) {
      if (voice.mode !== 'mock' || !text.trim() || !readyForResponse()) return false;
      if (isMockVoiceAdapter(voice)) {
        try { voice.simulateUtterance(text.trim(), 'accepted'); return true; }
        catch { reportFailure(controller.getSnapshot().context); return false; }
      }
      return processResponse(text.trim(), `mock-utterance-${++sequence}`, false);
    },
    requestHint() {
      const snapshot = controller.getSnapshot();
      if (disposed || snapshot.completed || snapshot.sentenceStage === 'complete' || snapshot.hintPending
        || snapshot.interaction.connection !== 'ready' || snapshot.interaction.intent !== 'practice'
        || snapshot.interaction.processingCount > 0 || snapshot.interaction.questionPending) return false;
      const target = controller.getOpenObligations()[0];
      if (!target) return false;
      hintLevel = Math.min(3, hintLevel + 1) as 1 | 2 | 3;
      const request = controller.beginHint(target, hintLevel);
      const identity = snapshot.context;
      try { void voice.requestHint(request).catch(() => reportFailure(identity)); } catch { reportFailure(identity); }
      return true;
    },
    reviseTranslation() { if (!disposed) { notice = 'Say your revised translation. Its explanation will be assessed again.'; lastResponse = ''; controller.invalidate('translation'); } },
    next() {
      if (disposed) return false;
      const snapshot = controller.getSnapshot();
      if (snapshot.completed) return isQuiet(snapshot.interaction) && startNext();
      if (controller.manualContinue()) return true;
      notice = 'Finish all four requirements and close any question or helper before continuing.'; publish(); return false;
    },
    skip() {
      const snapshot = controller.getSnapshot();
      if (!disposed && isQuiet(snapshot.interaction)) return startNext();
      notice = 'Finish the conversation or close the helper before changing prompts.'; publish(); return false;
    },
    dispose() { if (disposed) return; disposed = true; unsubscribeVoice(); unsubscribeController(); voice.cancelPendingHints?.(); controller.dispose(); listeners.clear(); },
  };
  return session;
}
