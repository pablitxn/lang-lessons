import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRealtimeProtocol, isSafeCoachText } from '../src/voice/protocol';
import type { AttemptRef, HintRequest, VoiceEvent } from '../src/contracts';
import { FakeClock, batch, sentenceContext, verbContext } from './helpers/assessment-fixtures';
import { createAssessmentController } from '../src/assessment';
import { SENTENCES, VERBS } from '../src/content';
import { PAST_TENSES } from '../src/contracts';

function setup(clock?: FakeClock) {
  const sent: Record<string, unknown>[] = []; const events: VoiceEvent[] = []; const output: boolean[] = [];
  const protocol = createRealtimeProtocol({ sessionId: 's1', send: message => sent.push(message as Record<string, unknown>), emit: event => events.push(event), setAudioAllowed: allowed => output.push(allowed), ...(clock ? { clock } : {}) });
  protocol.setContext(verbContext());
  const receive = (event: object) => protocol.receive(JSON.stringify(event));
  const requestId = () => ((sent.filter(event => event.type === 'response.create').at(-1)!.response as Record<string, unknown>).metadata as { request_id: string }).request_id;
  const finish = (id: string, payload: object) => receive({ type: 'response.done', response: { id: `r-${id}`, metadata: { request_id: id }, status: 'completed', output: [{ type: 'function_call', name: 'report_lesson_result', arguments: JSON.stringify(payload) }] } });
  return { protocol, sent, events, output, receive, requestId, finish };
}
const ref: AttemptRef = { sessionId: 's1', exerciseId: 'e1', generation: 1, obligation: 'pronunciation:base', attemptId: 'a1', revision: 1 };

test('manual exercise changes discard old audio evidence while tracking the actual end of speech', () => {
  for (const freshSpeech of [false, true]) {
    const s = setup(new FakeClock());
    s.receive({ type: 'input_audio_buffer.speech_started', item_id: 'old' });
    s.protocol.setContext({ ...verbContext(), exerciseId: 'next', generation: 2 });
    if (freshSpeech) s.receive({ type: 'input_audio_buffer.speech_started', item_id: 'fresh' });
    s.receive({ type: 'input_audio_buffer.speech_started', item_id: 'old' });
    s.receive({ type: 'input_audio_buffer.speech_stopped', item_id: 'old' });
    s.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'old', transcript: 'Old exercise response' });
    assert.equal(s.events.some(event => event.type === 'transcript'), false);
    assert.equal(s.events.filter(event => event.type === 'speech' && event.speaker === 'learner' && !event.active).length, freshSpeech ? 0 : 1);
    if (freshSpeech) {
      s.receive({ type: 'input_audio_buffer.speech_stopped', item_id: 'fresh' });
      assert.equal(s.events.filter(event => event.type === 'speech' && event.speaker === 'learner' && !event.active).length, 1);
    }
    s.protocol.dispose();
  }
});

for (const tense of PAST_TENSES) test(`${tense} reaches provider task context with safe translation and actual accepted construction`, () => {
  const s = setup(new FakeClock()); const initial = sentenceContext();
  if (initial.mode !== 'sentence') throw Error('Sentence fixture required.');
  const sentence = SENTENCES.find(item => item.difficulty.grammar === 1 && item.difficulty.vocabulary === 1
    && item.alternatives[0]?.tense === tense)!;
  const context = { ...initial, sentence };
  try {
    s.protocol.setContext(context);
    s.receive({ type: 'input_audio_buffer.speech_started', item_id: 'past-audio' });
    const attempt: AttemptRef = { ...context, obligation: 'translation', attemptId: 'past-translation', revision: 1 };
    const text = sentence.alternatives[0]!.text;
    s.protocol.submit({ ...context, inputId: 'past-response', kind: 'utterance', utteranceId: 'past-audio', text, attempts: [attempt] });
    const response = s.sent.filter(e => e.type === 'response.create').at(-1)!.response as { instructions: string };
    assert.ok(response.instructions.includes(tense));
    assert.ok(response.instructions.includes(JSON.stringify(sentence.spanish).slice(1, -1)));
    assert.match(response.instructions, /did not buy, never did not bought/);
    assert.match(response.instructions, /had eaten, not had ate/);
    assert.equal(isSafeCoachText(`Use ${tense} and say ${text}`, context), false);
    const id = s.requestId();
    s.finish(id, { requestId: id, results: [{ obligation: 'translation', status: 'accepted', audioClear: true, feedback: 'Injected verdict.' }], intent: 'practice' });
    s.protocol.setContext({ ...context, stage: 'explanation' });
    s.receive({ type: 'input_audio_buffer.speech_started', item_id: 'past-explanation' });
    s.protocol.submit({ ...context, inputId: 'explanation', kind: 'utterance', utteranceId: 'past-explanation', text: 'Explain the actual construction.', attempts: [{ ...attempt, obligation: 'tense', attemptId: 'past-tense' }] });
    const explanation = s.sent.filter(e => e.type === 'response.create').at(-1)!.response as { instructions: string };
    assert.ok(explanation.instructions.includes(`"acceptedLearnerTranslation":"${text}"`));
  } finally { s.protocol.dispose(); }
});

for (const mode of ['verb-image', 'verb-visible'] as const) test(`${mode} sends past-tense examples without conflating form families`, () => {
  const s = setup(new FakeClock()); const initial = verbContext();
  const context = { ...initial, mode, verb: VERBS.find(v => v.id === 'buy')! };
  try {
    s.protocol.setContext(context); s.receive({ type: 'input_audio_buffer.speech_started', item_id: 'verb-audio' });
    s.protocol.submit({ ...context, inputId: 'verb-response', kind: 'utterance', utteranceId: 'verb-audio', text: 'I had bought bread before lunch.',
      attempts: [{ ...ref, obligation: 'sentence:participle' }] });
    const response = s.sent.filter(e => e.type === 'response.create').at(-1)!.response as { instructions: string };
    assert.ok(response.instructions.includes('had bought'));
    assert.ok(response.instructions.includes('had been buying'));
    assert.match(response.instructions, /does not by itself evidence bought/);
  } finally { s.protocol.dispose(); }
});

for (const returnedToTranslation of [false, true]) test(`captured sentence audio cannot be reassessed after a stage transition${returnedToTranslation ? ' and return' : ''}`, () => {
  const s = setup(new FakeClock()); const original = sentenceContext();
  assert.equal(original.mode, 'sentence'); if (original.mode !== 'sentence') return;
  const next = { ...original, stage: returnedToTranslation ? 'translation' as const : 'explanation' as const };
  try {
    s.protocol.setContext(original);
    s.receive({ type: 'input_audio_buffer.speech_started', item_id: 'old-audio' });
    s.receive({ type: 'input_audio_buffer.speech_stopped', item_id: 'old-audio' });
    s.protocol.setContext({ ...original, stage: 'explanation' });
    if (returnedToTranslation) s.protocol.setContext(next);
    // A duplicate provider start must retain the original capture, not its new stage.
    s.receive({ type: 'input_audio_buffer.speech_started', item_id: 'old-audio' });
    s.receive({ type: 'input_audio_buffer.speech_stopped', item_id: 'old-audio' });
    assert.equal(s.events.filter(event => event.type === 'transcription-pending').at(-1)?.count, 1);
    s.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'old-audio', transcript: 'A delayed response.' });
    assert.deepEqual(s.events.find(event => event.type === 'transcript')?.sentenceScope, { capturedStage: 'translation', eligible: false });
    assert.equal(s.events.filter(event => event.type === 'transcription-pending').at(-1)?.count, 0);
    const attempt: AttemptRef = { ...next, obligation: returnedToTranslation ? 'translation' : 'tense', attemptId: 'fresh', revision: 2 };
    s.receive({ type: 'input_audio_buffer.speech_started', item_id: 'fresh-audio' });
    s.protocol.submit({ ...next, inputId: 'fresh', kind: 'utterance', text: 'Fresh response.', utteranceId: 'fresh-audio', attempts: [attempt] });
    const freshRequest = s.requestId();
    // Even a caller bypassing the feature guard cannot grade old audio or supersede a valid request.
    s.protocol.submit({ ...next, inputId: 'stale', kind: 'utterance', text: 'Old response.', utteranceId: 'old-audio', attempts: [{ ...attempt, attemptId: 'stale', revision: 3 }] });
    assert.equal(s.sent.filter(event => event.type === 'response.create').length, 1);
    assert.equal(s.events.filter(event => event.type === 'assessment').at(-1)?.batch.results[0]?.status, 'uncertain');
    s.finish(freshRequest, { requestId: freshRequest, results: [{ obligation: attempt.obligation, status: 'accepted', audioClear: true, feedback: 'Injected acceptance.' }], intent: 'practice' });
    assert.equal(s.events.filter(event => event.type === 'assessment').at(-1)?.batch.results[0]?.ref.attemptId, 'fresh');
    assert.equal(s.events.filter(event => event.type === 'assessment').at(-1)?.batch.results[0]?.status, 'accepted');
    s.protocol.submit({ ...next, inputId: 'conversation', kind: 'utterance', text: 'May I ask why?', utteranceId: 'old-audio', attempts: [] });
    assert.equal(s.sent.filter(event => event.type === 'response.create').length, 2);
  } finally { s.protocol.dispose(); }
});

test('transcripts without a captured audio item cannot call the model or certify pronunciation', () => {
  const s = setup(); s.protocol.submit({ ...verbContext(), inputId: 'text', kind: 'utterance', text: 'buy', utteranceId: 'invented', attempts: [ref] });
  assert.equal(s.sent.length, 0);
  const event = s.events.find(event => event.type === 'assessment');
  assert.equal(event?.type === 'assessment' && event.batch.results[0]?.status, 'uncertain'); s.protocol.dispose();
});
test('actual audio references and response metadata correlate independent assessments', () => {
  const s = setup(); s.receive({ type: 'input_audio_buffer.speech_started', item_id: 'audio-1' });
  s.protocol.submit({ ...verbContext(), inputId: 'speech', kind: 'utterance', text: 'buy', utteranceId: 'audio-1', attempts: [ref] });
  const id = s.requestId(); const response = s.sent.find(event => event.type === 'response.create')!.response as Record<string, unknown>;
  assert.equal(response.conversation, 'none'); assert.deepEqual((response.input as object[])[0], { type: 'item_reference', id: 'audio-1' });
  s.finish(id, { requestId: id, results: [{ obligation: ref.obligation, status: 'accepted', audioClear: true, feedback: 'Clear pronunciation.' }], intent: 'practice' });
  const event = s.events.find(event => event.type === 'assessment');
  assert.equal(event?.type === 'assessment' && event.batch.results[0]?.status, 'accepted');
  assert.equal(event?.type === 'assessment' && event.batch.results[0]?.ref.attemptId, 'a1'); s.protocol.dispose();
});
test('audio uncertainty overrides a claimed model acceptance or learner error', () => {
  for (const status of ['accepted', 'incorrect']) {
    const s = setup(); s.receive({ type: 'input_audio_buffer.speech_started', item_id: 'audio-1' });
    s.protocol.submit({ ...verbContext(), inputId: 'speech', kind: 'utterance', text: 'buy', utteranceId: 'audio-1', attempts: [ref] });
    const id = s.requestId(); s.finish(id, { requestId: id, results: [{ obligation: ref.obligation, status, audioClear: false, feedback: 'Claimed result.' }], intent: 'practice' });
    const event = s.events.find(event => event.type === 'assessment');
    assert.equal(event?.type === 'assessment' && event.batch.results[0]?.status, 'uncertain'); s.protocol.dispose();
  }
});
test('unknown obligation, duplicate output and mismatched request IDs cannot create success', () => {
  for (const payload of [
    (id: string) => ({ requestId: id, results: [{ obligation: 'translation', status: 'accepted', audioClear: true, feedback: 'Accepted.' }], intent: 'practice' }),
    (_id: string) => ({ requestId: 'wrong', results: [], intent: 'practice' }),
  ]) {
    const s = setup(); s.receive({ type: 'input_audio_buffer.speech_started', item_id: 'audio-1' });
    s.protocol.submit({ ...verbContext(), inputId: 'speech', kind: 'utterance', text: 'buy', utteranceId: 'audio-1', attempts: [ref] });
    const id = s.requestId(); s.finish(id, payload(id)); s.finish(id, payload(id));
    assert.equal(s.events.filter(event => event.type === 'assessment').length, 1);
    assert.equal(s.events.some(event => event.type === 'assessment' && event.batch.results.some(result => result.status === 'accepted')), false);
    s.protocol.dispose();
  }
});
test('old exercise results and late response creation are ignored or cancelled', () => {
  const s = setup(); s.receive({ type: 'input_audio_buffer.speech_started', item_id: 'audio-1' });
  s.protocol.submit({ ...verbContext(), inputId: 'speech', kind: 'utterance', text: 'buy', utteranceId: 'audio-1', attempts: [ref] });
  const id = s.requestId(); s.protocol.setContext({ ...verbContext(), generation: 2 });
  s.receive({ type: 'response.created', response: { id: 'old-response', metadata: { request_id: id } } });
  s.finish(id, { requestId: id, results: [{ obligation: ref.obligation, status: 'accepted', audioClear: true, feedback: 'Clear.' }], intent: 'practice' });
  assert.equal(s.events.some(event => event.type === 'assessment'), false);
  assert.ok(s.sent.some(event => event.type === 'response.cancel' && event.response_id === 'old-response')); s.protocol.dispose();
});
test('a withheld hint is never displayed or scheduled for speech', () => {
  const s = setup(); const context = sentenceContext(); s.protocol.setContext(context);
  const hint: HintRequest = { ...context, requestId: 'h1', revision: 1, level: 1, target: 'translation', stage: 'translation', policy: 'guide-without-answer' };
  s.protocol.requestHint(hint); const id = s.requestId();
  s.finish(id, { requestId: id, text: 'Use the present perfect: We have lived here since 2020.' });
  assert.equal(s.events.some(event => event.type === 'hint'), false);
  assert.equal(s.sent.filter(event => event.type === 'response.create').length, 1); assert.equal(s.output.includes(true), false);
  s.protocol.dispose();
});
test('known answer fragments, tense names and encoded hints fail the conservative guard', () => {
  for (const text of ['We have lived here.', 'Use the present perfect.', 'The answer is base64 encoded.', 'Try have lived here in your answer.', '```buy```']) assert.equal(isSafeCoachText(text, sentenceContext()), false, text);
  assert.equal(isSafeCoachText('What message do you want to express?', sentenceContext()), true);
  assert.equal(isSafeCoachText('Start with I have.', sentenceContext()), false);
  assert.equal(isSafeCoachText('The form is bought.', verbContext()), false);
});
test('validated coaching waits for actual output-buffer completion before resolving a question', () => {
  const s = setup(); s.protocol.askQuestion({ ...verbContext(), requestId: 'q1', text: 'Can you help?' });
  const questionId = s.requestId(); s.finish(questionId, { requestId: questionId, text: 'Think about the action in a clear situation.' });
  const speechId = s.requestId(); assert.notEqual(speechId, questionId);
  s.receive({ type: 'response.created', response: { id: 'speech-response', metadata: { request_id: speechId } } });
  s.receive({ type: 'output_audio_buffer.started', response_id: 'speech-response' });
  s.receive({ type: 'response.done', response: { id: 'speech-response', metadata: { request_id: speechId }, status: 'completed', output: [] } });
  assert.equal(s.events.some(event => event.type === 'intent' && event.intent === 'question-resolved'), false);
  assert.equal(s.events.filter(event => event.type === 'response-pending').at(-1)?.count, 1);
  s.receive({ type: 'output_audio_buffer.stopped', response_id: 'speech-response' });
  assert.ok(s.events.some(event => event.type === 'intent' && event.intent === 'question-resolved'));
  assert.equal(s.events.filter(event => event.type === 'response-pending').at(-1)?.count, 0); s.protocol.dispose();
});
test('malformed provider JSON and unrequested audio never become trusted feedback', () => {
  const s = setup(); s.protocol.receive('{invalid'); s.receive({ type: 'output_audio_buffer.started', response_id: 'unknown' });
  assert.ok(s.events.some(event => event.type === 'error' && event.code === 'invalid-event'));
  assert.equal(s.output.includes(true), false); s.protocol.dispose();
});
test('editing can cancel a pending hint before its text or speech is emitted', () => {
  const s = setup(); const context = sentenceContext(); s.protocol.setContext(context);
  s.protocol.requestHint({ ...context, requestId: 'h1', revision: 1, level: 1, target: 'translation', stage: 'translation', policy: 'guide-without-answer' });
  const id = s.requestId(); s.protocol.cancelPendingHints();
  s.finish(id, { requestId: id, text: 'Think about the start and now.' });
  assert.equal(s.events.some(event => event.type === 'hint'), false);
  assert.equal(s.sent.filter(event => event.type === 'response.create').length, 1); s.protocol.dispose();
});
test('late speech-stop events cannot clear a newer learner utterance', () => {
  const s = setup();
  s.receive({ type: 'input_audio_buffer.speech_started', item_id: 'old' });
  s.receive({ type: 'input_audio_buffer.speech_started', item_id: 'new' });
  s.receive({ type: 'input_audio_buffer.speech_stopped', item_id: 'old' });
  assert.equal(s.events.filter((event): event is Extract<VoiceEvent, { type: 'speech' }> => event.type === 'speech' && event.speaker === 'learner').at(-1)?.active, true);
  s.receive({ type: 'input_audio_buffer.speech_stopped', item_id: 'new' });
  assert.equal(s.events.filter((event): event is Extract<VoiceEvent, { type: 'speech' }> => event.type === 'speech' && event.speaker === 'learner').at(-1)?.active, false); s.protocol.dispose();
});
test('sentence explanation retains the actual accepted translation and clears it for a new exercise', () => {
  const s = setup(); const context = sentenceContext(); s.protocol.setContext(context);
  const translation: AttemptRef = { ...context, obligation: 'translation', attemptId: 't1', revision: 1 };
  const learnerText = 'We have been living here since 2020.';
  s.receive({ type: 'input_audio_buffer.speech_started', item_id: 'translation-audio' });
  s.protocol.submit({ ...context, inputId: 'translation', kind: 'utterance', text: learnerText, utteranceId: 'translation-audio', attempts: [translation] });
  const id = s.requestId(); s.finish(id, { requestId: id, results: [{ obligation: 'translation', status: 'accepted', audioClear: true, feedback: 'Your meaning fits.' }], intent: 'practice' });
  assert.equal(context.mode, 'sentence'); if (context.mode !== 'sentence') return;
  s.protocol.setContext({ ...context, stage: 'explanation' });
  s.protocol.askQuestion({ ...context, requestId: 'q1', text: 'Can I explain this form?' });
  assert.ok(JSON.stringify(s.sent.at(-1)).includes(learnerText));
  s.protocol.setContext({ ...context, generation: 2 });
  s.protocol.askQuestion({ ...context, generation: 2, requestId: 'q2', text: 'Can I try?' });
  assert.ok(!JSON.stringify(s.sent.at(-1)).includes(learnerText)); s.protocol.dispose();
});
test('a superseded provider assessment cannot speak stale coaching or replace a fresh result', () => {
  const s = setup(); s.receive({ type: 'input_audio_buffer.speech_started', item_id: 'audio-1' });
  const input = { ...verbContext(), inputId: 'speech', kind: 'utterance' as const, text: 'buy', utteranceId: 'audio-1' };
  s.protocol.submit({ ...input, attempts: [ref] }); const old = s.requestId();
  s.protocol.submit({ ...input, attempts: [{ ...ref, revision: 2, attemptId: 'a2' }] });
  const newer = s.requestId();
  s.finish(old, { requestId: old, results: [{ obligation: ref.obligation, status: 'accepted', audioClear: true, feedback: 'Clear.' }], intent: 'practice', coachText: 'An obsolete response.' });
  assert.equal(s.events.some(event => event.type === 'assessment' || event.type === 'feedback'), false);
  s.finish(newer, { requestId: newer, results: [{ obligation: ref.obligation, status: 'uncertain', audioClear: false, feedback: 'Repeat.' }], intent: 'practice' });
  assert.equal(s.events.filter(event => event.type === 'assessment').length, 1); s.protocol.dispose();
});
test('speech can remain conversational after lesson obligations are complete', () => {
  const s = setup(); s.receive({ type: 'input_audio_buffer.speech_started', item_id: 'question-audio' });
  s.protocol.submit({ ...verbContext(), inputId: 'question', kind: 'utterance', text: 'Can I ask something?', utteranceId: 'question-audio', attempts: [] });
  const id = s.requestId(); s.finish(id, { requestId: id, results: [], intent: 'question', coachText: 'Take the time you need.' });
  assert.ok(s.events.some(event => event.type === 'intent' && event.intent === 'question'));
  assert.equal(s.events.some(event => event.type === 'assessment' && event.batch.results.length > 0), false); s.protocol.dispose();
});
test('a delayed final question keeps a completed verb open after speech has stopped', () => {
  const clock = new FakeClock(); let advances = 0;
  const controller = createAssessmentController({ context: verbContext(), clock, allowMock: true, onAdvance: () => { advances++; } });
  controller.setInteraction({ connection: 'ready' }); controller.applyBatch(batch(controller.beginAttempt(controller.getOpenObligations())));
  const protocol = createRealtimeProtocol({ sessionId: 's1', send() {}, setAudioAllowed() {}, emit(event) {
    controller.handleVoiceEvent(event);
    if (event.type === 'transcript') controller.setInteraction({ questionPending: true });
  } });
  protocol.setContext(verbContext());
  try {
    protocol.receive(JSON.stringify({ type: 'input_audio_buffer.speech_started', item_id: 'question' }));
    protocol.receive(JSON.stringify({ type: 'input_audio_buffer.speech_stopped', item_id: 'question' }));
    clock.advance(4000); assert.equal(advances, 0);
    protocol.receive(JSON.stringify({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'question', transcript: 'Can I ask why?' }));
    clock.advance(4000); assert.equal(advances, 0);
    controller.setInteraction({ questionPending: false }); clock.advance(1800); assert.equal(advances, 1);
  } finally { protocol.dispose(); controller.dispose(); }
});
test('rejected pre-translation question coaching never creates an audio response', () => {
  const s = setup(); const context = sentenceContext(); s.protocol.setContext(context);
  try {
    s.protocol.askQuestion({ ...context, requestId: 'unsafe-question', text: 'What should I start with?' });
    const id = s.requestId(); s.finish(id, { requestId: id, text: 'Start with I have.' });
    assert.equal(s.sent.filter(event => event.type === 'response.create').length, 1);
    assert.equal(s.events.some(event => event.type === 'feedback' && event.text === 'Start with I have.'), false);
  } finally { s.protocol.dispose(); }
});
test('transcription timeout fails closed and never advances a completed exercise', () => {
  const clock = new FakeClock(); let advances = 0;
  const controller = createAssessmentController({ context: verbContext(), clock, allowMock: true, onAdvance: () => { advances++; } });
  controller.setInteraction({ connection: 'ready' }); controller.applyBatch(batch(controller.beginAttempt(controller.getOpenObligations())));
  const protocol = createRealtimeProtocol({ sessionId: 's1', clock, send() {}, setAudioAllowed() {}, emit: controller.handleVoiceEvent });
  protocol.setContext(verbContext());
  protocol.receive(JSON.stringify({ type: 'input_audio_buffer.speech_started', item_id: 'late' }));
  protocol.receive(JSON.stringify({ type: 'input_audio_buffer.speech_stopped', item_id: 'late' }));
  clock.advance(19999); assert.equal(advances, 0); assert.equal(controller.getSnapshot().interaction.processingCount, 1);
  clock.advance(1); assert.equal(controller.getSnapshot().interaction.connection, 'error');
  assert.equal(controller.getSnapshot().interaction.processingCount, 0);
  clock.advance(5000); assert.equal(advances, 0);
  protocol.dispose(); controller.dispose(); assert.equal(clock.tasks.size, 0);
});
test('outstanding transcriptions survive a same-exercise stage transition but cancel on replacement or provider error', () => {
  const clock = new FakeClock(); const s = setup(clock); const context = sentenceContext();
  assert.equal(context.mode, 'sentence'); if (context.mode !== 'sentence') return;
  s.protocol.setContext(context);
  s.receive({ type: 'input_audio_buffer.speech_started', item_id: 'late' }); s.receive({ type: 'input_audio_buffer.speech_stopped', item_id: 'late' });
  s.protocol.setContext({ ...context, stage: 'explanation' });
  assert.equal(s.events.filter(event => event.type === 'transcription-pending').at(-1)?.count, 1);
  s.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'late', transcript: 'May I ask why?' });
  assert.equal(s.events.filter(event => event.type === 'transcript').length, 1);
  assert.equal(s.events.filter(event => event.type === 'transcription-pending').at(-1)?.count, 0);
  s.receive({ type: 'input_audio_buffer.speech_started', item_id: 'old-exercise' }); s.receive({ type: 'input_audio_buffer.speech_stopped', item_id: 'old-exercise' });
  s.protocol.setContext({ ...context, generation: 2 }); assert.equal(clock.tasks.size, 0);
  s.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'old-exercise', transcript: 'Old question.' });
  assert.equal(s.events.filter(event => event.type === 'transcript').length, 1);
  s.receive({ type: 'input_audio_buffer.speech_started', item_id: 'failed' }); s.receive({ type: 'input_audio_buffer.speech_stopped', item_id: 'failed' });
  s.receive({ type: 'error' }); assert.equal(clock.tasks.size, 0);
  assert.equal(s.events.filter(event => event.type === 'transcription-pending').at(-1)?.count, 0);
  assert.ok(s.events.some(event => event.type === 'error')); s.protocol.dispose();
});
test('pre-translation assessment feedback and hints use the same reviewed envelope as questions', () => {
  for (const kind of ['assessment', 'hint'] as const) {
    const s = setup(); const context = sentenceContext(); s.protocol.setContext(context);
    try {
      if (kind === 'assessment') {
        s.receive({ type: 'input_audio_buffer.speech_started', item_id: 'audio' });
        s.protocol.submit({ ...context, inputId: 'oral', kind: 'utterance', text: 'An attempt.', utteranceId: 'audio', attempts: [] });
      } else s.protocol.requestHint({ ...context, requestId: 'hint', revision: 1, level: 1, target: 'translation', stage: 'translation', policy: 'guide-without-answer' });
      const id = s.requestId(); s.finish(id, kind === 'assessment' ? { requestId: id, results: [], intent: 'question', coachText: 'Start with I have.' } : { requestId: id, text: 'Start with I have.' });
      assert.equal(s.sent.filter(event => event.type === 'response.create').length, 1);
      assert.equal(s.events.some(event => event.type === 'feedback' && event.text === 'Start with I have.'), false);
    } finally { s.protocol.dispose(); }
  }
  const s = setup(); const context = sentenceContext(); s.protocol.setContext(context);
  s.protocol.askQuestion({ ...context, requestId: 'question', text: 'Can you guide me?' });
  const id = s.requestId(); const approved = 'What message do you want to express?';
  s.finish(id, { requestId: id, text: approved });
  assert.ok(s.events.some(event => event.type === 'feedback' && event.text === approved));
  assert.equal(s.sent.filter(event => event.type === 'response.create').length, 2); s.protocol.dispose();
});
test('out-of-order final transcripts release only their own hold and duplicates do not release another', () => {
  const clock = new FakeClock(); const s = setup(clock);
  for (const item_id of ['first', 'second']) {
    s.receive({ type: 'input_audio_buffer.speech_started', item_id }); s.receive({ type: 'input_audio_buffer.speech_stopped', item_id });
  }
  assert.equal(s.events.filter(event => event.type === 'transcription-pending').at(-1)?.count, 2);
  for (const item_id of ['second', 'second']) s.receive({ type: 'conversation.item.input_audio_transcription.completed', item_id, transcript: 'A question.' });
  assert.equal(s.events.filter(event => event.type === 'transcription-pending').at(-1)?.count, 1);
  assert.equal(s.events.filter(event => event.type === 'transcript').length, 1);
  s.receive({ type: 'conversation.item.input_audio_transcription.failed', item_id: 'first' });
  assert.equal(s.events.filter(event => event.type === 'transcription-pending').at(-1)?.count, 0);
  assert.equal(clock.tasks.size, 0); s.protocol.dispose();
});
