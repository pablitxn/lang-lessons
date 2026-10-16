import test from 'node:test';
import assert from 'node:assert/strict';
import { SENTENCES } from '../src/content';
import { createSentenceSession } from '../src/features/sentences/session';
import { createSessionRuntime } from '../src/app/session-runtime';
import { createRealtimeProtocol } from '../src/voice/protocol';
import type { LearnerInput, VoiceAdapter, VoiceEvent } from '../src/contracts';
import { FakeClock } from './helpers/assessment-fixtures';

/** Actual session/runtime/protocol with injected audio events and verdicts; no transport. */
test('speech begun before translation acceptance cannot acquire explanation obligations from a delayed transcript', async () => {
  const sessionId = 'stage-race'; const clock = new FakeClock();
  const listeners = new Set<(event: VoiceEvent) => void>();
  const events: VoiceEvent[] = []; const inputs: LearnerInput[] = []; const requests: Record<string, unknown>[] = [];
  const emit = (event: VoiceEvent) => { events.push(event); for (const listener of listeners) listener(event); };
  const protocol = createRealtimeProtocol({ sessionId, clock, setAudioAllowed() {}, send: message => requests.push(message as Record<string, unknown>), emit });
  const voice: VoiceAdapter = {
    mode: 'openai-realtime',
    async connect() { emit({ type: 'state', eventId: 'ready', sessionId, state: 'ready' }); },
    disconnect() { emit({ type: 'state', eventId: 'offline', sessionId, state: 'offline' }); },
    setContext: protocol.setContext,
    async submit(input) { inputs.push(input); protocol.submit(input); },
    async requestHint(request) { protocol.requestHint(request); },
    async askQuestion(question) { protocol.askQuestion(question); },
    cancelPendingHints: protocol.cancelPendingHints, interrupt: protocol.interrupt, setMuted() {},
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
  const runtime = createSessionRuntime(voice, sessionId);
  const sentence = SENTENCES.find(entry => entry.id === 'sentence-since-2020')!;
  const session = createSentenceSession({ voice: runtime.voice, sessionId, clock, difficulty: sentence.difficulty,
    sentences: [sentence], random: () => 0, onComplete() {} });
  const receive = (event: object) => protocol.receive(JSON.stringify(event));
  const lastRequest = () => ((requests.filter(event => event.type === 'response.create').at(-1)!.response as Record<string, unknown>).metadata as { request_id: string }).request_id;
  const finish = (requestId: string, obligations: readonly string[]) => receive({ type: 'response.done', response: {
    metadata: { request_id: requestId }, status: 'completed', output: [{ type: 'message', content: [{ type: 'text', text: JSON.stringify({
      requestId, intent: 'practice', results: obligations.map(obligation => ({ obligation, status: 'accepted', audioClear: true, feedback: 'Injected verdict.' })),
    }) }] }],
  } });
  const capture = (item_id: string) => { receive({ type: 'input_audio_buffer.speech_started', item_id }); receive({ type: 'input_audio_buffer.speech_stopped', item_id }); };
  const final = (item_id: string, transcript: string) => receive({ type: 'conversation.item.input_audio_transcription.completed', item_id, transcript });
  try {
    await runtime.start();
    capture('translation-A'); final('translation-A', 'We have lived here since 2020.');
    const translationRequest = lastRequest();
    assert.deepEqual(inputs[0]?.attempts.map(ref => ref.obligation), ['translation']);
    capture('early-B'); // Speech begins while A's translation assessment is pending.
    assert.equal(events.filter(event => event.type === 'transcription-pending').at(-1)?.count, 1);
    finish(translationRequest, ['translation']);
    assert.equal(session.getSnapshot().assessment.sentenceStage, 'explanation');
    assert.equal(events.filter(event => event.type === 'transcription-pending').at(-1)?.count, 1);
    final('early-B', 'It uses an auxiliary and participle.');
    await Promise.resolve(); await Promise.resolve();
    const delayed = inputs.find(input => input.utteranceId === 'early-B');
    assert.ok(delayed); assert.deepEqual(delayed.attempts, []);
    for (const obligation of ['tense', 'structure', 'meaning-fit'] as const) assert.equal(session.getSnapshot().assessment.evidence[obligation], undefined);
    assert.equal(events.filter(event => event.type === 'transcription-pending').at(-1)?.count, 0);
    finish(lastRequest(), []); // Conversational handling cannot create learning evidence.
    assert.equal(session.getSnapshot().assessment.sentenceStage, 'explanation');
    capture('fresh-C'); final('fresh-C', 'A fresh explanation begun in the explanation stage.');
    assert.deepEqual(inputs.at(-1)?.attempts.map(ref => ref.obligation), ['tense', 'structure', 'meaning-fit']);
    finish(lastRequest(), ['tense', 'structure', 'meaning-fit']);
    assert.equal(session.getSnapshot().assessment.sentenceStage, 'complete');
  } finally { session.dispose(); runtime.stop(); protocol.dispose(); }
});
