import type { AssessmentBatch, EvidenceResult, ExerciseContext, HintRequest, LearnerInput, VoiceAdapter, VoiceConnectOptions, VoiceEvent } from '../../../contracts';

/** Explicit test adapter: no microphone, model, network or linguistic grading. */
export class SentenceFixtureVoice implements VoiceAdapter {
  readonly mode: VoiceAdapter['mode'];
  listeners = new Set<(event: VoiceEvent) => void>();
  contexts: ExerciseContext[] = [];
  inputs: LearnerInput[] = [];
  hints: HintRequest[] = [];
  connects = 0;
  disconnects = 0;
  interrupts = 0;
  sequence = 0;
  submitError: Promise<void> | null = null;
  constructor(mode: VoiceAdapter['mode'] = 'mock') { this.mode = mode; }
  connect(_options: VoiceConnectOptions): Promise<void> { this.connects++; return Promise.resolve(); }
  disconnect() { this.disconnects++; }
  interrupt() { this.interrupts++; }
  setContext(context: ExerciseContext) { this.contexts.push(context); }
  submit(input: LearnerInput): Promise<void> { this.inputs.push(input); return this.submitError ?? Promise.resolve(); }
  requestHint(hint: HintRequest): Promise<void> { this.hints.push(hint); return Promise.resolve(); }
  setMuted(muted: boolean) { this.emit({ type: 'microphone', eventId: this.id(), sessionId: this.context.sessionId, muted }); }
  subscribe(listener: (event: VoiceEvent) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  get context(): ExerciseContext { return this.contexts.at(-1)!; }
  id() { return `sentence-fixture-${++this.sequence}`; }
  emit(event: VoiceEvent) { for (const listener of [...this.listeners]) listener(event); }
  transcript(text: string, uncertain = false, utteranceId = this.id(), final = true) {
    this.emit({ type: 'transcript', eventId: this.id(), sessionId: this.context.sessionId,
      identity: this.context, utteranceId, text, uncertain, final });
  }
  assess(status: EvidenceResult['status'] | Partial<Record<string, EvidenceResult['status']>> = 'accepted', input = this.inputs.at(-1)!, source?: EvidenceResult['source'], feedback = 'Simulated fixture verdict.') {
    const batch: AssessmentBatch = { ...input, eventId: this.id(), results: input.attempts.map(ref => ({ ref,
      status: typeof status === 'string' ? status : status[ref.obligation] ?? 'uncertain',
      source: source ?? { kind: 'mock', fixtureId: this.id() }, feedback })) };
    this.emit({ type: 'assessment', eventId: this.id(), sessionId: input.sessionId, batch });
  }
  hint(text: string, request = this.hints.at(-1)!) {
    this.emit({ type: 'hint', eventId: this.id(), sessionId: request.sessionId,
      hint: { ...request, text, source: this.mode === 'mock' ? 'mock' : 'model' } });
  }
  speech(active: boolean) { this.emit({ type: 'speech', eventId: this.id(), sessionId: this.context.sessionId, speaker: 'assistant', active }); }
}
