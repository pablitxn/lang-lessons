import test from 'node:test';
import assert from 'node:assert/strict';
import { VERB_IDS, type VerbMode } from '../src/contracts';
import { createVerbSession, type VerbSession } from '../src/features/verbs/session';
import { VerbFixtureAdapter } from '../src/features/verbs/__fixtures__/adapter';
import { FakeClock } from './helpers/assessment-fixtures';
import { createMockVoiceAdapter } from '../src/voice';
import { createSessionRuntime } from '../src/app/session-runtime';

const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
function setup(mode: VerbMode = 'verb-image', real = false) {
  const voice = new VerbFixtureAdapter('verbs-test', false, real ? 'openai-realtime' : 'mock');
  const clock = new FakeClock();
  const completed: string[] = [];
  const session = createVerbSession({ voice, clock, mode, sessionId: 'verbs-test', random: () => 0, namespace: 'test', onComplete: id => completed.push(id), claimUtterance: () => {} });
  return { voice, clock, completed, session };
}
function spelling(session: VerbSession, voice: VerbFixtureAdapter) {
  const context = session.getSnapshot().assessment.context;
  assert.notEqual(context.mode, 'sentence');
  if (context.mode === 'sentence') throw new Error('Verb fixture expected');
  for (const form of session.fields) {
    const value = context.verb.forms[form].accepted[0]!;
    session.edit(form, value); session.finalize(form, value);
    voice.settle(voice.inputs.at(-1)!);
  }
}
async function oral(session: VerbSession, voice: VerbFixtureAdapter) {
  voice.utterance('One turn with meaning, three pronunciations, and three original sentences.');
  await flush();
  const input = voice.inputs.at(-1)!;
  assert.equal(input.kind, 'utterance');
  assert.equal(input.attempts.length, 7);
  voice.settle(input);
  assert.equal(session.getSnapshot().assessment.evidence.meaning?.status, 'accepted');
}

test('both verb modes require every oral gate plus only their editable spelling fields, then advance once after quiet', async () => {
  for (const mode of ['verb-image', 'verb-visible'] as const) {
    const { session, voice, clock, completed } = setup(mode);
    const initial = session.getSnapshot().assessment;
    assert.deepEqual(session.fields, mode === 'verb-image' ? ['base', 'past', 'participle'] : ['past', 'participle']);
    spelling(session, voice);
    clock.advance(5000); assert.equal(completed.length, 0);
    await oral(session, voice);
    clock.advance(1799); assert.equal(completed.length, 0);
    clock.advance(1); assert.deepEqual(completed, [initial.exerciseId]);
    const next = session.getSnapshot();
    assert.equal(next.assessment.generation, 2);
    assert.notEqual(next.assessment.context.mode === 'sentence' ? '' : next.assessment.context.verb.id, 'be');
    assert.ok(VERB_IDS.includes(next.assessment.context.mode === 'sentence' ? 'be' : next.assessment.context.verb.id));
    assert.deepEqual(next.drafts, { base: '', past: '', participle: '' });
    clock.advance(10000); assert.equal(completed.length, 1);
    session.dispose();
    assert.equal(voice.listeners.size, 0); assert.equal(voice.connects, 0); assert.equal(voice.disconnects, 0);
  }
});

test('typing is idempotent across processing-ref changes and an edited field preserves independent oral evidence', async () => {
  const { session, voice } = setup();
  await oral(session, voice);
  session.edit('past', 'was'); session.finalize('past', 'was');
  const pending = voice.inputs.at(-1)!;
  session.finalize('past', 'was'); session.finalize('past', 'was');
  assert.equal(voice.inputs.filter(input => input.kind === 'typed').length, 1);
  session.edit('past', 'were');
  voice.settle(pending);
  assert.equal(session.getSnapshot().assessment.evidence['spelling:past']?.status, 'not-attempted');
  assert.equal(session.getSnapshot().assessment.evidence.meaning?.status, 'accepted');
  session.finalize('past', 'were');
  voice.settle(voice.inputs.at(-1)!, 'uncertain');
  session.retrySpelling('past');
  assert.equal(voice.inputs.filter(input => input.kind === 'typed').length, 3);
  voice.settle(voice.inputs.at(-1)!);
  assert.equal(session.getSnapshot().assessment.evidence['spelling:past']?.status, 'accepted');
  session.dispose();
});

test('continuing utterances queue without superseding pending refs; accepted work survives a later partial turn', async () => {
  const { session, voice } = setup();
  voice.utterance('First turn', false, 'first'); await flush();
  const first = voice.inputs[0]!;
  voice.utterance('Continuing naturally', false, 'second'); await flush();
  assert.equal(voice.inputs.length, 1);
  assert.ok(session.getSnapshot().assessment.interaction.presentationHolds.length > 0);
  voice.emit({ type: 'assessment', batch: { ...first, eventId: 'partial-first', results: first.attempts.map(ref => ({
    ref, status: ref.obligation === 'meaning' ? 'accepted' : 'uncertain', source: { kind: 'mock', fixtureId: 'partial' }, feedback: 'Fixture partial evidence.',
  })) } });
  await flush();
  assert.equal(voice.inputs.length, 2);
  const second = voice.inputs[1]!;
  assert.equal(second.utteranceId, 'second');
  assert.equal(second.attempts.length, 6);
  assert.ok(!second.attempts.some(ref => ref.obligation === 'meaning'));
  voice.settle(first); // A late duplicate cannot settle the new refs.
  assert.equal(session.getSnapshot().assessment.evidence['sentence:past']?.status, 'processing');
  voice.settle(second);
  assert.equal(session.getSnapshot().assessment.evidence.meaning?.status, 'accepted');
  assert.equal(session.getSnapshot().assessment.evidence['sentence:past']?.status, 'accepted');
  session.dispose();
});

test('questions, continuing speech, helper holds, typing, and explicit pause prevent completed verbs from advancing', async () => {
  const { session, voice, clock, completed } = setup();
  spelling(session, voice); await oral(session, voice);
  session.controller.setPresentationHold('reference', true); clock.advance(3000); assert.equal(completed.length, 0);
  session.controller.setPresentationHold('reference', false);
  session.ask('Why does this construction work?');
  assert.equal(voice.inputs.at(-1)!.attempts.length, 0);
  clock.advance(3000); assert.equal(completed.length, 0);
  voice.emit({ type: 'intent', intent: 'question-resolved' });
  voice.emit({ type: 'speech', speaker: 'learner', active: true }); clock.advance(3000); assert.equal(completed.length, 0);
  voice.emit({ type: 'speech', speaker: 'learner', active: false });
  session.controller.setInteraction({ inputFocused: true }); clock.advance(3000); assert.equal(completed.length, 0);
  session.controller.setInteraction({ inputFocused: false });
  session.pause(); clock.advance(3000); assert.equal(completed.length, 0);
  assert.equal(voice.interrupts, 1);
  session.resume(); clock.advance(1799); assert.equal(completed.length, 0);
  clock.advance(1); assert.equal(completed.length, 1);
  session.dispose();
});

test('uncertain audio never becomes incorrect, and transcript text cannot certify actual pronunciation', async () => {
  const { session, voice } = setup();
  voice.utterance('Ambiguous audio', true); await flush();
  assert.equal(voice.inputs.length, 0);
  const records = Object.values(session.getSnapshot().assessment.evidence);
  assert.equal(records.length, 7);
  assert.ok(records.every(record => record.status === 'uncertain'));
  voice.utterance("He's been here; he buys bread. Natural connected speech."); await flush();
  assert.equal(voice.inputs.at(-1)!.text, "He's been here; he buys bread. Natural connected speech.");
  voice.settle(voice.inputs.at(-1)!, 'accepted', { kind: 'audio', utteranceId: 'no-audio', audioAvailable: false });
  assert.equal(session.getSnapshot().assessment.evidence['pronunciation:base']?.status, 'uncertain');
  session.dispose();
  const real = setup('verb-visible', true);
  real.voice.utterance('A textual transcript only'); await flush();
  real.voice.settle(real.voice.inputs.at(-1)!); // Mock source is forbidden in real mode.
  assert.equal(real.session.getSnapshot().assessment.evidence.meaning?.status, 'uncertain');
  real.session.dispose();
});

test('transport failure preserves accepted oral work and reconnect never automatically resubmits an old draft', async () => {
  const { session, voice } = setup();
  await oral(session, voice);
  voice.failSubmit = true;
  session.edit('past', 'was'); session.finalize('past', 'was'); await flush();
  const snapshot = session.getSnapshot().assessment;
  assert.equal(snapshot.evidence.meaning?.status, 'accepted');
  assert.equal(snapshot.evidence['spelling:past']?.status, 'uncertain');
  assert.ok(snapshot.systemError);
  const count = voice.inputs.length;
  voice.emit({ type: 'state', state: 'ready' }); await flush();
  assert.equal(voice.inputs.length, count);
  voice.failSubmit = false; session.retrySpelling('past');
  assert.equal(voice.inputs.length, count + 1);
  session.dispose();
});

test('a rejected superseded submission cannot turn a newer accepted attempt into a connection failure', async () => {
  const { session, voice } = setup();
  const original = voice.submit.bind(voice);
  let rejectOld: (error: Error) => void = () => { throw new Error('Old request was not submitted'); };
  voice.submit = input => {
    voice.inputs.push(input);
    return new Promise<void>((_resolve, reject) => { rejectOld = reject; });
  };
  session.edit('past', 'was'); session.finalize('past', 'was');
  voice.submit = original;
  session.edit('past', 'were'); session.finalize('past', 'were'); voice.settle(voice.inputs.at(-1)!);
  rejectOld(new Error('Late old transport failure')); await flush();
  const snapshot = session.getSnapshot().assessment;
  assert.equal(snapshot.evidence['spelling:past']?.status, 'accepted');
  assert.equal(snapshot.systemError, null); assert.equal(snapshot.interaction.connection, 'ready');
  session.dispose();
});

test('hints are correlated and progressive, and disposing prevents timers or late events from affecting a replacement lesson', async () => {
  const { session, voice, clock, completed } = setup();
  session.requestHint(); session.requestHint(); session.requestHint();
  assert.deepEqual(voice.hints.map(hint => hint.level), [1, 2, 3]);
  const hint = voice.hints[2]!;
  session.edit('base', 'be');
  voice.emit({ type: 'hint', hint: { ...hint, text: 'Old hint', source: 'mock' } });
  assert.equal(session.getSnapshot().assessment.hint, null);
  spelling(session, voice); await oral(session, voice);
  const previous = session.getSnapshot();
  session.dispose(); clock.advance(10000);
  voice.utterance('A late response after unmount'); await flush();
  assert.equal(completed.length, 0);
  assert.equal(session.getSnapshot(), previous);
  assert.equal(voice.listeners.size, 0);
});

test('learner questions and their answers remain visible when an older hint finishes later', () => {
  const { session, voice } = setup();
  session.requestHint();
  const old = voice.hints.at(-1)!;
  session.ask('Could you explain that?');
  const identity = session.getSnapshot().assessment.context;
  voice.emit({ type: 'feedback', identity, text: 'A contextual answer to your question.' });
  voice.emit({ type: 'hint', hint: { ...old, text: 'An older hint', source: 'mock' } });
  const snapshot = session.getSnapshot();
  assert.equal(snapshot.question, 'Could you explain that?');
  assert.equal(snapshot.coachText, 'A contextual answer to your question.');
  assert.equal(snapshot.assessment.interaction.questionPending, true);
  session.dispose();
});

test('the current root runtime and production mock adapter drive both spelling and oral gates without feature-owned connection', async () => {
  const base = createMockVoiceAdapter();
  const root = createSessionRuntime(base, 'root-mock');
  const clock = new FakeClock();
  const completed: string[] = [];
  const session = createVerbSession({ voice: root.voice, sessionId: root.sessionId, mode: 'verb-visible', clock, random: () => 0, onComplete: id => completed.push(id) });
  await root.start();
  session.edit('past', 'was'); session.finalize('past', 'was'); await flush();
  session.edit('participle', 'been'); session.finalize('participle', 'been'); await flush();
  assert.equal(session.getSnapshot().assessment.evidence['spelling:past']?.status, 'accepted');
  base.simulateUtterance('Explicit oral mock fixture', 'accepted'); await flush();
  session.ask('Why is this valid?'); await flush();
  assert.equal(session.getSnapshot().assessment.interaction.questionPending, true);
  clock.advance(3000); assert.equal(completed.length, 0);
  root.resume(); clock.advance(1800);
  assert.equal(completed.length, 1);
  session.dispose(); root.stop();
});

test('live transcripts without the root reservation contract never dispatch a competing assessment or create success', async () => {
  const voice = new VerbFixtureAdapter('unclaimed', false, 'openai-realtime');
  const session = createVerbSession({ voice, sessionId: 'unclaimed', mode: 'verb-image', random: () => 0, onComplete() {} });
  voice.utterance('A final live transcript'); await flush();
  assert.equal(voice.inputs.length, 0);
  assert.equal(Object.keys(session.getSnapshot().assessment.evidence).length, 0);
  assert.match(session.getSnapshot().coachText, /unavailable/);
  session.dispose();
});
