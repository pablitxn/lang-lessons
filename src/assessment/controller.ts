import {
  TIMING, canAdvanceVerb, hasAllEvidence, hasValidEvidenceSource, isCurrentAttempt,
  isQuiet, requiredObligations, sameExercise,
  type AdvanceTicket, type AssessmentBatch, type AttemptRef, type EvidenceRecord,
  type EvidenceResult, type ExerciseContext, type HintRequest, type HintResult,
  type InteractionState, type LearningSnapshot, type Obligation, type VoiceEvent,
} from '../contracts';

export interface AssessmentClock {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}
export interface AssessmentSnapshot extends LearningSnapshot {
  context: ExerciseContext;
  results: Readonly<Partial<Record<Obligation, EvidenceResult>>>;
  hint: HintResult | null;
  hintPending: boolean;
  systemError: string | null;
  advancePending: boolean;
  canContinue: boolean;
  completed: boolean;
}
export interface AssessmentControllerOptions {
  context: ExerciseContext;
  allowMock?: boolean;
  clock?: AssessmentClock;
  onAdvance?: (snapshot: AssessmentSnapshot) => void;
  onContextChange?: (context: ExerciseContext) => void;
}
export type InteractionPatch = Partial<Omit<InteractionState, 'lastActivityAt' | 'activityRevision' | 'processingCount'>>;
export interface AssessmentController {
  getSnapshot(): AssessmentSnapshot;
  subscribe(listener: () => void): () => void;
  startExercise(context: ExerciseContext): void;
  getOpenObligations(): readonly Obligation[];
  beginAttempt(obligations: readonly Obligation[], attemptId?: string): readonly AttemptRef[];
  invalidate(obligation: Obligation): void;
  applyBatch(batch: AssessmentBatch): number;
  setInteraction(patch: InteractionPatch): void;
  setPresentationHold(id: string, held: boolean): void;
  activity(): void;
  beginHint(target: Obligation, level: 1 | 2 | 3): HintRequest;
  applyHint(hint: HintResult): boolean;
  handleVoiceEvent(event: VoiceEvent): void;
  manualContinue(): boolean;
  dispose(): void;
}
const realClock: AssessmentClock = {
  now: () => performance.now(),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** Pure session state plus one cancellable timer; no React, provider or storage dependency. */
export function createAssessmentController(options: AssessmentControllerOptions): AssessmentController {
  const clock = options.clock ?? realClock;
  const allowMock = options.allowMock === true;
  const listeners = new Set<() => void>();
  let context = options.context;
  let evidence: Partial<Record<Obligation, EvidenceRecord>> = {};
  let results: Partial<Record<Obligation, EvidenceResult>> = {};
  let revisions: Partial<Record<Obligation, number>> = {};
  let seen = new Set<string>();
  let sequence = 0;
  let hintRevision = 0;
  let pendingHint: HintRequest | null = null;
  let hint: HintResult | null = null;
  let systemError: string | null = null;
  let completed = false;
  let disposed = false;
  let timer: unknown;
  let ticket: AdvanceTicket | null = null;
  let interaction: InteractionState = initialInteraction();
  let snapshot: AssessmentSnapshot;

  function initialInteraction(): InteractionState {
    return { learnerSpeaking: false, assistantSpeaking: false, questionPending: false,
      processingCount: 0, inputFocused: false, compositionActive: false, questionDraftActive: false,
      presentationHolds: [], connection: 'offline', intent: 'practice',
      lastActivityAt: clock.now(), activityRevision: 0 };
  }
  function cancelTimer() {
    if (ticket) clock.clearTimeout(timer);
    timer = undefined;
    ticket = null;
  }
  function invalidateHint() { hintRevision++; pendingHint = null; hint = null; }
  function touch() {
    cancelTimer();
    interaction = { ...interaction, lastActivityAt: clock.now(), activityRevision: interaction.activityRevision + 1 };
  }
  function nextRef(obligation: Obligation, attemptId: string): AttemptRef {
    const revision = (revisions[obligation] ?? 0) + 1;
    revisions[obligation] = revision;
    return { sessionId: context.sessionId, exerciseId: context.exerciseId, generation: context.generation,
      obligation, attemptId, revision };
  }
  function resetExplanation() {
    for (const obligation of ['tense', 'structure', 'meaning-fit'] as const) {
      delete evidence[obligation]; delete results[obligation];
      revisions[obligation] = (revisions[obligation] ?? 0) + 1;
    }
  }
  function refreshStage() {
    if (context.mode !== 'sentence') return;
    const translationAccepted = evidence.translation?.status === 'accepted';
    const stage = !translationAccepted ? 'translation'
      : hasAllEvidence('sentence', context, evidence, allowMock) ? 'complete' : 'explanation';
    if (context.stage !== stage) {
      context = { ...context, stage };
      invalidateHint();
      options.onContextChange?.(context);
    }
  }
  function emit() {
    refreshStage();
    interaction = { ...interaction, processingCount:
      Object.values(evidence).filter(record => record.status === 'processing').length + (pendingHint ? 1 : 0) };
    if (!disposed && !completed && context.mode !== 'sentence' && isQuiet(interaction)
      && hasAllEvidence(context.mode, context, evidence, allowMock) && !ticket) {
      ticket = { sessionId: context.sessionId, exerciseId: context.exerciseId, generation: context.generation,
        activityRevision: interaction.activityRevision, dueAt: interaction.lastActivityAt + TIMING.verbQuietPeriodMs };
      const scheduled = ticket;
      timer = clock.setTimeout(() => {
        if (disposed || completed || ticket !== scheduled || context.mode === 'sentence') return;
        if (canAdvanceVerb(context.mode, context, evidence, interaction, scheduled, clock.now(), allowMock)) {
          cancelTimer(); completed = true; emit(); options.onAdvance?.(snapshot);
        }
      }, Math.max(0, scheduled.dueAt - clock.now()));
    }
    snapshot = Object.freeze({ sessionId: context.sessionId, exerciseId: context.exerciseId,
      generation: context.generation, mode: context.mode, context,
      evidence: Object.freeze({ ...evidence }), results: Object.freeze({ ...results }),
      interaction: Object.freeze({ ...interaction, presentationHolds: [...interaction.presentationHolds] }),
      ...(context.mode === 'sentence' ? { sentenceStage: context.stage } : {}),
      hint, hintPending: pendingHint !== null, systemError, advancePending: ticket !== null,
      canContinue: !completed && context.mode === 'sentence' && context.stage === 'complete'
        && isQuiet(interaction) && hasAllEvidence('sentence', context, evidence, allowMock), completed });
    for (const listener of listeners) listener();
  }
  function applicable(obligation: Obligation) { return requiredObligations(context.mode).includes(obligation); }
  function allowedNow(obligation: Obligation) {
    return applicable(obligation) && (context.mode !== 'sentence' || obligation === 'translation' || context.stage !== 'translation');
  }
  function failPending(message: string) {
    evidence = { ...evidence };
    for (const [key, record] of Object.entries(evidence)) if (record.status === 'processing') {
      evidence[key as Obligation] = { ref: record.ref, status: 'uncertain', feedback: message };
    }
    invalidateHint(); systemError = message;
  }

  const controller: AssessmentController = {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    startExercise(next) {
      if (disposed || sameExercise(context, next)) return;
      cancelTimer(); context = next; evidence = {}; results = {}; revisions = {}; seen = new Set();
      completed = false; systemError = null; invalidateHint();
      // Keep session connection and speaking signals; reset exercise-specific holds.
      interaction = { ...initialInteraction(), connection: interaction.connection,
        learnerSpeaking: interaction.learnerSpeaking, assistantSpeaking: interaction.assistantSpeaking,
        intent: interaction.intent };
      options.onContextChange?.(context); emit();
    },
    getOpenObligations: () => requiredObligations(context.mode).filter(key => allowedNow(key) && evidence[key]?.status !== 'accepted'),
    beginAttempt(obligations, attemptId = `attempt-${++sequence}`) {
      if (disposed || completed) return [];
      const unique = [...new Set(obligations)];
      if (!unique.length || unique.some(key => !allowedNow(key))) return [];
      if (context.mode === 'sentence' && unique.includes('translation') && unique.length > 1) return [];
      touch(); invalidateHint(); evidence = { ...evidence }; results = { ...results };
      if (context.mode === 'sentence' && unique.includes('translation')) resetExplanation();
      const refs = unique.map(key => {
        const ref = nextRef(key, attemptId);
        evidence[key] = { ref, status: 'processing' }; delete results[key]; return ref;
      });
      emit(); return refs;
    },
    invalidate(obligation) {
      if (disposed || completed || !applicable(obligation)) return;
      touch(); invalidateHint(); evidence = { ...evidence }; results = { ...results };
      if (context.mode === 'sentence' && obligation === 'translation') resetExplanation();
      evidence[obligation] = { ref: nextRef(obligation, `edit-${++sequence}`), status: 'not-attempted' };
      delete results[obligation]; emit();
    },
    applyBatch(batch) {
      if (disposed || completed || !sameExercise(context, batch) || seen.has(batch.eventId)) return 0;
      seen.add(batch.eventId);
      if (seen.size > 1024) seen.delete(seen.values().next().value!);
      let applied = 0;
      for (const result of batch.results) {
        const current = evidence[result.ref.obligation];
        if (!current || current.status !== 'processing' || !isCurrentAttempt(current.ref, result.ref)
          || !allowedNow(result.ref.obligation) || !['uncertain', 'incorrect', 'accepted'].includes(result.status)) continue;
        const safe: EvidenceResult = result.status === 'uncertain' || hasValidEvidenceSource(result, allowMock)
          ? result : { ...result, status: 'uncertain', feedback: 'This response needs valid audio evidence or a fresh typed spelling attempt.' };
        evidence = { ...evidence, [safe.ref.obligation]: { ref: safe.ref, status: safe.status, source: safe.source, feedback: safe.feedback } };
        results = { ...results, [safe.ref.obligation]: safe }; applied++;
      }
      if (applied) { touch(); emit(); }
      return applied;
    },
    setInteraction(patch) { if (disposed) return; touch(); interaction = { ...interaction, ...patch }; emit(); },
    setPresentationHold(id, held) {
      if (!id || disposed) return;
      const holds = new Set(interaction.presentationHolds);
      if (held) holds.add(id); else holds.delete(id);
      controller.setInteraction({ presentationHolds: [...holds] });
    },
    activity() { if (!disposed) { touch(); emit(); } },
    beginHint(target, level) {
      if (disposed || completed || !allowedNow(target)) throw new Error('Hint target is unavailable in this stage.');
      touch(); invalidateHint();
      pendingHint = { sessionId: context.sessionId, exerciseId: context.exerciseId, generation: context.generation,
        requestId: `hint-${++sequence}`, revision: hintRevision, level, target,
        stage: context.mode === 'sentence' ? context.stage : 'verb', policy: 'guide-without-answer' };
      const request = pendingHint; emit(); return request;
    },
    applyHint(next) {
      if (disposed || !pendingHint || !sameExercise(context, next) || next.requestId !== pendingHint.requestId
        || next.revision !== pendingHint.revision || next.target !== pendingHint.target || next.stage !== pendingHint.stage
        || (next.source === 'mock' && !allowMock)) return false;
      touch(); hint = next; pendingHint = null; emit(); return true;
    },
    handleVoiceEvent(event) {
      if (disposed || event.sessionId !== context.sessionId) return;
      switch (event.type) {
        case 'assessment': controller.applyBatch(event.batch); break;
        case 'hint': controller.applyHint(event.hint); break;
        case 'speech': controller.setInteraction(event.speaker === 'learner' ? { learnerSpeaking: event.active } : { assistantSpeaking: event.active }); break;
        case 'state':
          if (event.state !== 'ready' && event.state !== 'connecting') failPending('Voice is unavailable. Please retry when connected.');
          if (event.state === 'ready') systemError = null;
          controller.setInteraction({ connection: event.state }); break;
        case 'intent':
          if (event.intent === 'question' || event.intent === 'question-resolved') controller.setInteraction({ questionPending: event.intent === 'question' });
          else controller.setInteraction({ intent: event.intent });
          break;
        case 'error': failPending(event.message); controller.setInteraction({ connection: 'error' }); break;
        case 'microphone': controller.activity(); break;
        case 'transcript': if (sameExercise(context, event.identity)) controller.activity(); break;
        case 'feedback': if (sameExercise(context, event.identity)) controller.activity(); break;
        case 'usage': break;
      }
    },
    manualContinue() {
      if (disposed || !snapshot.canContinue) return false;
      completed = true; touch(); emit(); options.onAdvance?.(snapshot); return true;
    },
    dispose() { disposed = true; cancelTimer(); listeners.clear(); },
  };
  refreshStage(); options.onContextChange?.(context); emit();
  return controller;
}
