import { createAssessmentProgress } from '../progress/assessment-progress';
import type { ProgressSink } from '../../contracts';
import { assessSpelling, createAssessmentController, type AssessmentClock, type AssessmentController, type AssessmentSnapshot } from '../../assessment';
import { VERB_PHOTOS, VERBS } from '../../content';
import { isCurrentAttempt, sameExercise, type ExerciseContext, type ExerciseIdentity, type LearnerInput, type Obligation, type VerbEntry, type VerbForm, type VerbMode, type VoiceAdapter, type VoiceEvent } from '../../contracts';

export interface VerbSessionSnapshot {
  assessment: AssessmentSnapshot;
  drafts: Readonly<Record<VerbForm, string>>;
  coachText: string;
  clarification: string;
  lastUtterance: string;
  question: string;
  muted: boolean;
  canGoBack: boolean;
  pictureComplete: boolean;
  nextPicture: import("../../contracts").NextPicture | null;
}
export interface VerbSessionOptions {
  voice: VoiceAdapter;
  sessionId: string;
  mode: VerbMode;
  onComplete: (exerciseId: string) => void;
  progressSink?: ProgressSink;
  /** Root supplies a stable gate for its ordered close preparation. */
  canWrite?: () => boolean;
  onProgressError?: () => void;
  clock?: AssessmentClock;
  random?: () => number;
  /** Injectable ephemeral namespace for deterministic fixtures, never persisted. */
  namespace?: string;
  /** Root reserves a live transcript while this feature queues its assessment. */
  claimUtterance?: ((utteranceId: string) => void) | undefined;
}
interface PendingUtterance extends ExerciseIdentity { text: string; utteranceId: string; uncertain: boolean }
interface HistoryEntry {
  verb: VerbEntry;
  drafts: Record<VerbForm, string>;
  finalized: readonly VerbForm[];
  completed: boolean;
}

/** Feature orchestration only. The shared controller owns every evidence gate and timer. */
export function createVerbSession(options: VerbSessionOptions) {
  const { voice, mode, sessionId } = options;
  const namespace = options.namespace ?? crypto.randomUUID();
  const listeners = new Set<() => void>();
  const reportProgress = createAssessmentProgress(options.progressSink, () => { if (!disposed) options.onProgressError?.(); });
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
  const reviewHold = `${namespace}-completed-review`;
  const photoBags = new Map<VerbEntry['id'], (typeof VERB_PHOTOS)[number][]>();
  const lastPhotos = new Map<VerbEntry['id'], string>();
  const history = shuffledDeck();
  let historyIndex = 0;

  function newEntry(verb: VerbEntry): HistoryEntry {
    return { verb, drafts: { base: '', past: '', participle: '' }, finalized: [], completed: false };
  }
  function shuffle<T>(items: T[]): T[] {
    for (let index = 0; index < items.length - 1; index++) {
      const sample = (options.random ?? Math.random)();
      if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
        throw new RangeError('Random sample must be finite and within [0, 1).');
      }
      const swap = index + Math.floor(sample * (items.length - index));
      [items[index], items[swap]] = [items[swap]!, items[index]!];
    }
    return items;
  }
  function withNextPhoto(verb: VerbEntry): VerbEntry {
    let photos = photoBags.get(verb.id);
    if (!photos?.length) {
      photos = shuffle(VERB_PHOTOS.filter(photo => photo.verbId === verb.id));
      if (!photos.length) throw new Error(`No reviewed photograph for ${verb.id}.`);
      if (photos.length > 1 && photos[0]!.src === lastPhotos.get(verb.id)) {
        [photos[0], photos[1]] = [photos[1]!, photos[0]!];
      }
      photoBags.set(verb.id, photos);
    }
    const photo = photos.shift()!;
    lastPhotos.set(verb.id, photo.src);
    return { ...verb, image: { src: photo.src, alt: photo.alt, attribution: photo.attribution } };
  }
  function shuffledDeck(previous?: VerbEntry): HistoryEntry[] {
    // Every round contains each verb once, regardless of its photo collection size.
    const verbs = shuffle([...VERBS]);
    if (verbs.length > 1 && verbs[0]!.id === previous?.id) {
      [verbs[0], verbs[1]] = [verbs[1]!, verbs[0]!];
    }
    // Photo bags are consumed only for new rounds, never while revisiting history.
    return verbs.map(verb => newEntry(mode === 'verb-image' ? withNextPhoto(verb) : verb));
  }
  function context(verb: VerbEntry): ExerciseContext {
    return { sessionId, exerciseId: `${namespace}:${mode}:${verb.id}:${generation}`, generation, mode, verb };
  }
  function visit(index: number) {
    if (disposed || options.canWrite?.() === false || index === historyIndex || !history[index]) return false;
    const current = history[historyIndex]!;
    current.drafts = { ...drafts };
    current.finalized = fields.filter(form => submittedRevisions[form] === draftRevisions[form]);
    const next = history[index]!;
    voice.interrupt();
    historyIndex = index;
    generation++; drafts = { ...next.drafts }; queue = []; heard = new Set();
    draftRevisions = { base: 0, past: 0, participle: 0 }; submittedRevisions = {};
    hintTargetKey = ''; hintLevel = 1; lastUtterance = ''; clarification = '';
    pendingHintId = ''; pendingQuestionId = ''; question = '';
    coachText = 'Keep speaking naturally, and ask questions whenever you need.';
    controller.startExercise(context(next.verb));
    controller.setInteraction({ learnerSpeaking: false, assistantSpeaking: false });
    // Retain only typed work. Each visit has fresh refs, and oral/provider work
    // from a previous visit can never be replayed into the current exercise.
    for (const form of next.finalized) {
      if (!drafts[form].trim()) continue;
      const refs = controller.beginAttempt([`spelling:${form}`]);
      const snapshot = controller.getSnapshot();
      const inputId = `restored-spelling-${form}-${++sequence}`;
      controller.applyBatch({ ...snapshot.context, eventId: inputId,
        results: refs.map(ref => assessSpelling(snapshot.context, ref, drafts[form], inputId)) });
      submittedRevisions[form] = draftRevisions[form];
    }
    // A previously completed exercise remains editable for review; advancing
    // from it is manual and must not report the same completion again.
    if (next.completed) controller.setPresentationHold(reviewHold, true);
    return true;
  }
  function startNext() {
    if (disposed || options.canWrite?.() === false) return false;
    if (historyIndex === history.length - 1) {
      history.push(...shuffledDeck(history[historyIndex]!.verb));
    }
    return visit(historyIndex + 1);
  }
  function previous() {
    if (disposed || historyIndex === 0) return false;
    return visit(historyIndex - 1);
  }
  function publish() {
    if (disposed || !initialized) return;
    if (options.canWrite?.() !== false) reportProgress(controller.getSnapshot().evidence, controller.getSnapshot().exerciseId);
    view = { assessment: controller.getSnapshot(), drafts: Object.freeze({ ...drafts }), coachText, clarification, lastUtterance, question, muted, canGoBack: historyIndex > 0,
      pictureComplete: mode === 'verb-image' && controller.getSnapshot().completed,
      nextPicture: mode === 'verb-image' && history[historyIndex + 1] ? { key: `${namespace}:${generation}:${historyIndex + 1}`, src: history[historyIndex + 1]!.verb.image.src } : null };
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
    if (disposed || options.canWrite?.() === false || !queue.length) return;
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
    if (options.canWrite?.() === false && (event.type === 'assessment' || event.type === 'transcript')) return;
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
  controller = createAssessmentController({ context: context(history[0]!.verb), allowMock: voice.mode === 'mock',
    ...(options.clock ? { clock: options.clock } : {}),
    onContextChange: next => voice.setContext(next),
    onCancelHint: () => voice.cancelPendingHints?.(),
    onAdvance: snapshot => {
      if (disposed || snapshot.context.mode === 'sentence') return;
      const entry = history[historyIndex]!;
      if (entry.completed) return;
      entry.completed = true;
      options.onComplete(snapshot.exerciseId);
      if (disposed || controller.getSnapshot().interaction.intent !== 'practice') return;
      if (mode === 'verb-image') { publish(); return; }
      startNext();
    },
  });
  const unsubscribeController = controller.subscribe(() => { publish(); scheduleDrain(); });
  initialized = true;
  publish();
  for (const event of initialEvents) handleEvent(event);

  function finalize(form: VerbForm, value: string) {
    if (disposed || options.canWrite?.() === false || !fields.includes(form) || value !== drafts[form] || !value.trim()) return;
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
      if (disposed || options.canWrite?.() === false || controller.getSnapshot().completed || !fields.includes(form)) return;
      drafts = { ...drafts, [form]: value };
      draftRevisions[form]++;
      controller.invalidate(`spelling:${form}`);
    },
    finalize,
    nextPicture(expectedExerciseId: string) {
      if (disposed || mode !== 'verb-image' || controller.getSnapshot().exerciseId !== expectedExerciseId
        || !controller.getSnapshot().completed) return false;
      return startNext();
    },
    // Explicit history navigation never reports completion.
    skip: startNext,
    previous,
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
