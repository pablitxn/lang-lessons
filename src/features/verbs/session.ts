import { createAssessmentController, type AssessmentClock, type AssessmentController, type AssessmentSnapshot } from '../../assessment';
import { pickNextVerb } from '../../content';
import { isCurrentAttempt, sameExercise, type ExerciseContext, type ExerciseIdentity, type LearnerInput, type Obligation, type VerbEntry, type VerbForm, type VerbMode, type VoiceAdapter, type VoiceEvent } from '../../contracts';

export interface VerbSessionSnapshot {
  assessment: AssessmentSnapshot;
  drafts: Readonly<Record<VerbForm, string>>;
  coachText: string;
  clarification: string;
  lastUtterance: string;
  question: string;
  muted: boolean;
}
export interface VerbSessionOptions {
  voice: VoiceAdapter;
  sessionId: string;
  mode: VerbMode;
  onComplete: (exerciseId: string) => void;
  clock?: AssessmentClock;
  random?: () => number;
  /** Injectable ephemeral namespace for deterministic fixtures, never persisted. */
  namespace?: string;
  /** Root reserves a live transcript while this feature queues its assessment. */
  claimUtterance?: ((utteranceId: string) => void) | undefined;
}
interface PendingUtterance extends ExerciseIdentity { text: string; utteranceId: string; uncertain: boolean }

/** Feature orchestration only. The shared controller owns every evidence gate and timer. */
export function createVerbSession(options: VerbSessionOptions) {
  const { voice, mode, sessionId } = options;
  const namespace = options.namespace ?? crypto.randomUUID();
  const listeners = new Set<() => void>();
  const fields: readonly VerbForm[] = mode === 'verb-image' ? ['base', 'past', 'participle'] : ['past', 'participle'];
  let generation = 1;
  let sequence = 0;
  let disposed = false;
  let initialized = false;
  let scheduledDrain = false;
  let drafts: Record<VerbForm, string> = { base: '', past: '', participle: '' };
  let draftRevisions: Record<VerbForm, number> = { base: 0, past: 0, participle: 0 };
  let submittedRevisions: Partial<Record<VerbForm, number>> = {};
  let coachText = 'Say the meaning in Spanish, pronounce all three forms, and make one original sentence for each. Any order works.';
  let clarification = '';
  let lastUtterance = '';
  let question = '';
  let muted = false;
  let queue: PendingUtterance[] = [];
  let heard = new Set<string>();
  let hintTargetKey = '';
  let hintLevel: 1 | 2 | 3 = 1;
  let pendingHintId = '';
  let pendingQuestionId = '';
  let view: VerbSessionSnapshot;
  let controller: AssessmentController;
  const initialEvents: VoiceEvent[] = [];
  const queueHold = `${namespace}-queued-utterances`;

  function context(verb: VerbEntry): ExerciseContext {
    return { sessionId, exerciseId: `${namespace}:${mode}:${verb.id}:${generation}`, generation, mode, verb };
  }
  function startNext() {
    if (disposed) return false;
    const current = controller.getSnapshot().context;
    if (current.mode === 'sentence') return false;
    const next = pickNextVerb(current.verb.id, options.random);
    voice.interrupt();
    generation++; drafts = { base: '', past: '', participle: '' }; queue = []; heard = new Set();
    draftRevisions = { base: 0, past: 0, participle: 0 }; submittedRevisions = {};
    hintTargetKey = ''; hintLevel = 1; lastUtterance = ''; clarification = '';
    pendingHintId = ''; pendingQuestionId = ''; question = '';
    coachText = 'A new verb. Keep speaking naturally, and ask questions whenever you need.';
    controller.startExercise(context(next));
    return true;
  }
  function publish() {
    if (disposed || !initialized) return;
    view = { assessment: controller.getSnapshot(), drafts: Object.freeze({ ...drafts }), coachText, clarification, lastUtterance, question, muted };
    for (const listener of listeners) listener();
  }
  function scheduleDrain() {
    if (scheduledDrain || disposed || !initialized || queue.length === 0) return;
    scheduledDrain = true;
    queueMicrotask(() => { scheduledDrain = false; drain(); });
  }
  function clearQueue() {
    queue = [];
    if (initialized) controller.setPresentationHold(queueHold, false);
  }
  function failed(identity: ExerciseIdentity, stillRelevant: () => boolean) {
    if (disposed || !sameExercise(controller.getSnapshot(), identity) || !stillRelevant()) return;
    clearQueue();
    controller.handleVoiceEvent({ type: 'error', eventId: `submit-error-${++sequence}`, sessionId,
      code: 'connection', retryable: true, message: 'This response could not be processed. Your accepted work is safe. Reconnect, then try again.' });
  }
  function submit(input: LearnerInput) {
    const stillRelevant = () => {
      const current = controller.getSnapshot();
      return input.attempts.length ? input.attempts.some(ref => {
        const record = current.evidence[ref.obligation];
        return record?.status === 'processing' && isCurrentAttempt(record.ref, ref);
      }) : input.kind === 'utterance' || current.interaction.questionPending && pendingQuestionId === input.inputId;
    };
    try { Promise.resolve(voice.submit(input)).catch(() => failed(input, stillRelevant)); }
    catch { failed(input, stillRelevant); }
  }
  function oralTargets(): readonly Obligation[] {
    return controller.getOpenObligations().filter(obligation => !obligation.startsWith('spelling:'));
  }
  function drain() {
    if (disposed || !queue.length) return;
    const snapshot = controller.getSnapshot();
    if (snapshot.interaction.questionPending || snapshot.interaction.intent !== 'practice' || snapshot.interaction.connection !== 'ready') {
      clearQueue(); return;
    }
    const targets = oralTargets();
    // Do not supersede a continuing utterance's pending valid evidence.
    if (targets.some(target => snapshot.evidence[target]?.status === 'processing')) return;
    const utterance = queue.shift()!;
    if (!sameExercise(snapshot, utterance)) { scheduleDrain(); if (!queue.length) clearQueue(); return; }
    if (targets.length) {
      const refs = controller.beginAttempt(targets, `utterance-${utterance.utteranceId}`);
      if (refs.length && utterance.uncertain) {
        controller.applyBatch({ ...utterance, eventId: `uncertain-${++sequence}`, results: refs.map(ref => ({
          ref, status: 'uncertain', source: { kind: 'audio', utteranceId: utterance.utteranceId, audioAvailable: false },
          feedback: "I didn't catch that clearly. Please say it again when you are ready.",
        })) });
      } else if (refs.length) {
        submit({ sessionId, exerciseId: snapshot.exerciseId, generation: snapshot.generation,
          inputId: `oral-${++sequence}`, kind: 'utterance', text: utterance.text, utteranceId: utterance.utteranceId, attempts: refs });
      }
    } else if (utterance.uncertain) {
      coachText = "I didn't catch that clearly. Please clarify before we move on.";
      clarification = coachText;
      controller.setInteraction({ questionPending: true });
    } else {
      // A prior queued assessment may have completed the oral checklist. Preserve
      // this reserved turn as conversation instead of silently consuming a question.
      submit({ sessionId, exerciseId: snapshot.exerciseId, generation: snapshot.generation,
        inputId: `conversation-${++sequence}`, kind: 'utterance', text: utterance.text,
        utteranceId: utterance.utteranceId, attempts: [] });
    }
    if (!queue.length) controller.setPresentationHold(queueHold, false); else scheduleDrain();
  }
  function handleEvent(event: VoiceEvent) {
    if (disposed || event.sessionId !== sessionId) return;
    controller.handleVoiceEvent(event);
    if (event.type === 'microphone') { muted = event.muted; publish(); }
    if (event.type === 'intent' && event.intent === 'question-resolved') {
      pendingQuestionId = ''; clarification = ''; publish();
    }
    if (event.type === 'intent' && event.intent === 'question') pendingHintId = '';
    if (event.type === 'hint' && event.hint.requestId === pendingHintId && controller.getSnapshot().hint?.requestId === event.hint.requestId) {
      coachText = event.hint.text; publish();
    }
    if (event.type === 'feedback' && sameExercise(controller.getSnapshot(), event.identity)) {
      coachText = event.text; publish();
    }
    if (event.type === 'error' || (event.type === 'state' && event.state !== 'ready') || (event.type === 'intent' && event.intent !== 'question-resolved')) clearQueue();
    if (event.type !== 'transcript' || !event.final || !sameExercise(controller.getSnapshot(), event.identity) || heard.has(event.utteranceId)) return;
    heard.add(event.utteranceId);
    lastUtterance = event.text;
    const interaction = controller.getSnapshot().interaction;
    if (interaction.questionPending) question = event.text;
    clarification = event.uncertain ? "I didn't catch that clearly. Please say it again when you are ready." : '';
    if (event.uncertain) coachText = clarification;
    publish();
    if (interaction.questionPending || interaction.intent !== 'practice' || interaction.connection !== 'ready') return;
    if (!oralTargets().length) return; // Root retains natural conversation after the checklist.
    const claimUtterance = options.claimUtterance;
    if (voice.mode !== 'mock' && !claimUtterance) {
      coachText = 'Live verb assessment is unavailable in this session. Your current work is safe.';
      publish(); return;
    }
    claimUtterance?.(event.utteranceId);
    queue.push({ ...event.identity, text: event.text, utteranceId: event.utteranceId, uncertain: event.uncertain });
    controller.setPresentationHold(queueHold, true);
    scheduleDrain();
  }

  // Subscribe before setContext so synchronously replayed adapter state is retained.
  const unsubscribeVoice = voice.subscribe(event => initialized ? handleEvent(event) : initialEvents.push(event));
  controller = createAssessmentController({ context: context(pickNextVerb(undefined, options.random)), allowMock: voice.mode === 'mock',
    ...(options.clock ? { clock: options.clock } : {}),
    onContextChange: next => voice.setContext(next),
    onCancelHint: () => voice.cancelPendingHints?.(),
    onAdvance: snapshot => {
      if (disposed || snapshot.context.mode === 'sentence') return;
      options.onComplete(snapshot.exerciseId);
      if (disposed || controller.getSnapshot().interaction.intent !== 'practice') return;
      startNext();
    },
  });
  const unsubscribeController = controller.subscribe(() => { publish(); scheduleDrain(); });
  initialized = true;
  publish();
  for (const event of initialEvents) handleEvent(event);

  function finalize(form: VerbForm, value: string) {
    if (disposed || !fields.includes(form) || value !== drafts[form] || !value.trim()) return;
    // Controller refs change from editing to processing; that is not a new draft.
    if (submittedRevisions[form] === draftRevisions[form]) return;
    submittedRevisions[form] = draftRevisions[form];
    const refs = controller.beginAttempt([`spelling:${form}`]);
    if (!refs.length) return;
    const snapshot = controller.getSnapshot();
    submit({ sessionId, exerciseId: snapshot.exerciseId, generation: snapshot.generation,
      inputId: `spelling-${form}-${++sequence}`, kind: 'typed', text: value, attempts: refs });
  }

  return {
    mode, sessionId, voice, fields, controller,
    getSnapshot: () => view,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    edit(form: VerbForm, value: string) {
      if (disposed || !fields.includes(form)) return;
      drafts = { ...drafts, [form]: value };
      draftRevisions[form]++;
      controller.invalidate(`spelling:${form}`);
    },
    finalize,
    // Explicit navigation replaces the exercise without reporting completion.
    skip: startNext,
    retrySpelling(form: VerbForm) {
      if (disposed || controller.getSnapshot().evidence[`spelling:${form}`]?.status !== 'uncertain') return;
      delete submittedRevisions[form];
      finalize(form, drafts[form]);
    },
    ask(text: string) {
      if (disposed || !text.trim()) return;
      if (controller.getSnapshot().interaction.connection !== 'ready') {
        clarification = 'Connect the conversation before asking a question.';
        publish(); return;
      }
      question = text.trim(); pendingHintId = ''; clarification = '';
      clearQueue();
      controller.setInteraction({ questionPending: true });
      const snapshot = controller.getSnapshot();
      pendingQuestionId = `question-${++sequence}`;
      // A nonempty conversational question has no assessment targets and cannot pass gates.
      if (voice.askQuestion) {
        const request = { sessionId, exerciseId: snapshot.exerciseId, generation: snapshot.generation, requestId: pendingQuestionId, text: question };
        const stillRelevant = () => pendingQuestionId === request.requestId && controller.getSnapshot().interaction.questionPending;
        try { Promise.resolve(voice.askQuestion(request)).catch(() => failed(request, stillRelevant)); }
        catch { failed(request, stillRelevant); }
      } else submit({ sessionId, exerciseId: snapshot.exerciseId, generation: snapshot.generation,
        inputId: pendingQuestionId, kind: 'typed', text: question, attempts: [] });
    },
    requestHint() {
      if (disposed) return;
      const snapshot = controller.getSnapshot();
      if (snapshot.interaction.connection !== 'ready' || snapshot.interaction.intent !== 'practice'
        || snapshot.interaction.questionPending) return;
      const target = controller.getOpenObligations()[0];
      if (!target) return;
      const targetKey = `${snapshot.exerciseId}:${target}:${snapshot.evidence[target]?.ref.revision ?? 0}`;
      hintLevel = targetKey === hintTargetKey ? Math.min(3, hintLevel + 1) as 1 | 2 | 3 : 1;
      hintTargetKey = targetKey;
      const request = controller.beginHint(target, hintLevel);
      pendingHintId = request.requestId;
      const stillRelevant = () => pendingHintId === request.requestId && controller.getSnapshot().hintPending;
      try { Promise.resolve(voice.requestHint(request)).catch(() => failed(request, stillRelevant)); }
      catch { failed(request, stillRelevant); }
    },
    setMuted(next: boolean) { if (!disposed) voice.setMuted(next); },
    pause() { if (!disposed) { clearQueue(); controller.setInteraction({ intent: 'pause' }); voice.interrupt(); } },
    resume() { if (!disposed) controller.setInteraction({ intent: 'practice', questionPending: false }); },
    dispose() {
      if (disposed) return;
      disposed = true; queue = [];
      unsubscribeVoice(); unsubscribeController(); controller.dispose(); listeners.clear();
      voice.cancelPendingHints?.();
      // The root owns adapter connect/disconnect and mode-change audio shutdown.
    },
  };
}

export type VerbSession = ReturnType<typeof createVerbSession>;
