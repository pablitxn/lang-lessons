import { getFormGuidance, type PracticeVerbForm } from '../../../contracts';
import type { EvidenceResult, EvidenceSource, ExerciseContext, HintRequest, LearnerInput, VoiceAdapter, VoiceConnectOptions, VoiceEvent } from '../../../contracts';

/** Recording test double only: oral fixture acceptance is not linguistic assessment. */
export class VerbFixtureAdapter implements VoiceAdapter {
  readonly mode: 'mock' | 'openai-realtime';
  listeners = new Set<(event: VoiceEvent) => void>();
  inputs: LearnerInput[] = [];
  hints: HintRequest[] = [];
  context: ExerciseContext | undefined;
  contexts: ExerciseContext[] = [];
  connects = 0;
  disconnects = 0;
  interrupts = 0;
  sequence = 0;
  ready = true;
  failSubmit = false;
  constructor(readonly sessionId: string, readonly autoAssess = false, mode: 'mock' | 'openai-realtime' = 'mock') { this.mode = mode; }
  async connect(_options: VoiceConnectOptions) { this.connects++; this.ready = true; this.emit({ type: 'state', state: 'ready' }); }
  setContext(context: ExerciseContext) { this.context = context; this.contexts.push(context); }
  async submit(input: LearnerInput) {
    this.inputs.push(input);
    if (this.failSubmit) throw new Error('Fixture connection failure');
    if (!this.autoAssess || !input.attempts.length) return;
    if (input.kind === 'typed') {
      const obligation = input.attempts[0]!.obligation;
      const form = obligation.slice('spelling:'.length) as PracticeVerbForm;
      const accepted = this.context && this.context.mode !== 'sentence' && getFormGuidance(this.context.verb, form)?.accepted.includes(input.text.trim().toLowerCase());
      this.settle(input, accepted ? 'accepted' : 'incorrect');
    } else this.settle(input, 'accepted');
  }
  async requestHint(request: HintRequest) {
    this.hints.push(request);
    if (this.autoAssess) this.emit({ type: 'hint', hint: { ...request, source: 'mock', text: 'Mock hint: think about the action and build a complete sentence.' } });
  }
  interrupt() { this.interrupts++; }
  setMuted(muted: boolean) { this.emit({ type: 'microphone', muted }); }
  disconnect() { this.disconnects++; this.ready = false; this.emit({ type: 'state', state: 'offline' }); }
  subscribe(listener: (event: VoiceEvent) => void) {
    this.listeners.add(listener);
    listener({ type: 'state', state: this.ready ? 'ready' : 'offline', eventId: `state-${++this.sequence}`, sessionId: this.sessionId });
    return () => { this.listeners.delete(listener); };
  }
  emit(event: Omit<VoiceEvent, 'sessionId' | 'eventId'> | Record<string, unknown>) {
    const complete = { ...event, sessionId: this.sessionId, eventId: `fixture-${++this.sequence}` } as VoiceEvent;
    for (const listener of this.listeners) listener(complete);
  }
  utterance(text: string, uncertain = false, utteranceId = `utterance-${++this.sequence}`) {
    if (!this.context) throw new Error('The feature must set its context.');
    this.emit({ type: 'speech', speaker: 'learner', active: true });
    this.emit({ type: 'transcript', identity: this.context, utteranceId, text, final: true, uncertain });
    this.emit({ type: 'speech', speaker: 'learner', active: false });
  }
  settle(input: LearnerInput, status: EvidenceResult['status'] = 'accepted', source: EvidenceSource = { kind: 'mock', fixtureId: 'verbs-explicit-test-double' }) {
    this.emit({ type: 'assessment', batch: { sessionId: input.sessionId, exerciseId: input.exerciseId, generation: input.generation,
      eventId: `batch-${++this.sequence}`, results: input.attempts.map(ref => ({ ref, status, source, feedback: 'Mock fixture outcome.',
        ...(ref.obligation.startsWith('spelling:') ? { spelling: { submittedText: input.text,
          incorrectGraphemeIndices: status === 'incorrect' ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(input.text), (_, index) => index) : [],
          missingGraphemeIndices: [] } } : {}),
      })) } });
  }
}
