import test from 'node:test';
import assert from 'node:assert/strict';
import { VERB_IDS, type VerbMode } from '../src/contracts';
import { createVerbSession, type VerbSession } from '../src/features/verbs/session';
import { VerbFixtureAdapter } from '../src/features/verbs/__fixtures__/adapter';
import { FakeClock } from './helpers/assessment-fixtures';
import { createMockVoiceAdapter, createRealtimeVoiceAdapter } from '../src/voice';
import { createSessionRuntime } from '../src/app/session-runtime';
import { VERB_PHOTOS, VERBS } from '../src/content';

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

test('manual verb navigation works offline and paused, clears drafts and rejects stale work without completion', async () => {
  for (const mode of ['verb-image', 'verb-visible'] as const) {
    const { session, voice, clock, completed } = setup(mode);
    session.edit('past', 'waz'); session.finalize('past', 'waz');
    const pending = voice.inputs.at(-1)!;
    session.requestHint(); const hint = voice.hints.at(-1)!;
    voice.utterance('Queued old response');
    const old = session.getSnapshot().assessment;
    session.controller.setInteraction({ connection: 'offline', intent: 'pause', questionPending: true });
    assert.equal(session.skip(), true);
    const next = session.getSnapshot();
    assert.notEqual(next.assessment.exerciseId, old.exerciseId);
    assert.equal(next.assessment.generation, old.generation + 1);
    assert.deepEqual(next.drafts, { base: '', past: '', participle: '' });
    assert.equal(next.assessment.interaction.connection, 'offline');
    assert.equal(next.assessment.interaction.intent, 'pause');
    assert.equal(next.assessment.interaction.questionPending, false);
    voice.settle(pending);
    voice.emit({ type: 'hint', hint: { ...hint, source: 'mock', text: 'Stale hint' } });
    await flush(); clock.advance(10000);
    assert.deepEqual(session.getSnapshot().assessment.evidence, {});
    assert.equal(session.getSnapshot().assessment.hint, null);
    assert.equal(voice.inputs.length, 1);
    assert.equal(voice.interrupts, 1);
    assert.equal(voice.connects, 0);
    assert.deepEqual(completed, []);
    session.dispose(); assert.equal(session.skip(), false);
  }
});

test('manual verb navigation cancels the previous exercise quiet timer', async () => {
  const { session, voice, clock, completed } = setup();
  spelling(session, voice); await oral(session, voice);
  assert.equal(session.skip(), true);
  const id = session.getSnapshot().assessment.exerciseId;
  clock.advance(10000);
  assert.equal(session.getSnapshot().assessment.exerciseId, id);
  assert.deepEqual(completed, []);
  session.dispose();
});

test('back and forward restore the exact photograph, partial drafts, and locally checked spelling in both verb modes', () => {
  for (const mode of ['verb-image', 'verb-visible'] as const) {
    const { session, voice, completed } = setup(mode);
    const first = session.getSnapshot().assessment;
    assert.notEqual(first.context.mode, 'sentence');
    if (first.context.mode === 'sentence') throw new Error('Verb fixture expected');
    assert.equal(session.getSnapshot().canGoBack, false);
    assert.equal(session.previous(), false);
    assert.equal(voice.interrupts, 0);
    session.edit('past', 'was'); session.finalize('past', 'was'); voice.settle(voice.inputs.at(-1)!);
    session.edit('participle', 'be');
    session.skip();
    const second = session.getSnapshot().assessment;
    assert.notEqual(second.context.mode, 'sentence');
    if (second.context.mode === 'sentence') throw new Error('Verb fixture expected');
    assert.equal(session.getSnapshot().canGoBack, true);
    session.edit('past', 'b');

    const submissions = voice.inputs.length;
    assert.equal(session.previous(), true);
    const restored = session.getSnapshot();
    assert.equal(restored.canGoBack, false);
    assert.equal(restored.assessment.context.mode === 'sentence' ? null : restored.assessment.context.verb, first.context.verb);
    assert.notEqual(restored.assessment.exerciseId, first.exerciseId);
    assert.equal(restored.assessment.generation, first.generation + 2);
    assert.deepEqual(restored.drafts, { base: '', past: 'was', participle: 'be' });
    assert.equal(restored.assessment.results['spelling:past']?.status, 'accepted');
    assert.equal(restored.assessment.results['spelling:past']?.source.kind, 'typed');
    assert.equal(restored.assessment.evidence['spelling:participle'], undefined);
    assert.equal(voice.inputs.length, submissions);
    session.finalize('past', 'was');
    assert.equal(voice.inputs.length, submissions);

    session.edit('past', 'wuz'); session.finalize('past', 'wuz'); voice.settle(voice.inputs.at(-1)!, 'incorrect');
    session.skip();
    const forward = session.getSnapshot();
    assert.equal(forward.assessment.context.mode === 'sentence' ? null : forward.assessment.context.verb, second.context.verb);
    assert.equal(forward.drafts.past, 'b');
    assert.equal(forward.assessment.evidence['spelling:past'], undefined);
    session.previous();
    const edited = session.getSnapshot();
    assert.equal(edited.drafts.past, 'wuz');
    assert.equal(edited.assessment.results['spelling:past']?.status, 'incorrect');
    assert.ok(edited.assessment.results['spelling:past']?.spelling?.incorrectGraphemeIndices.length);
    session.skip(); session.skip();
    assert.equal(session.getSnapshot().drafts.past, '');
    assert.equal(session.getSnapshot().assessment.generation, first.generation + 6);
    session.dispose();
    assert.equal(session.previous(), false);
    assert.deepEqual(completed, []);
  }
});

test('returning to the same verb rejects prior-visit assessments, hints, transcripts, and late request failures', async () => {
  const { session, voice, clock, completed } = setup();
  const initial = session.getSnapshot().assessment;
  let rejectOld: (error: Error) => void = () => { throw new Error('Old request was not submitted'); };
  voice.submit = input => {
    voice.inputs.push(input);
    return new Promise<void>((_resolve, reject) => { rejectOld = reject; });
  };
  session.edit('past', 'was'); session.finalize('past', 'was');
  const oldInput = voice.inputs.at(-1)!;
  session.requestHint(); const oldHint = voice.hints.at(-1)!;
  voice.utterance('Queued old response');
  session.skip(); session.previous();
  const restored = session.getSnapshot();
  const freshRef = restored.assessment.results['spelling:past']?.ref;
  assert.notEqual(restored.assessment.exerciseId, initial.exerciseId);
  assert.equal(restored.assessment.results['spelling:past']?.status, 'accepted');
  voice.settle(oldInput, 'incorrect');
  voice.emit({ type: 'hint', hint: { ...oldHint, source: 'mock', text: 'Stale hint' } });
  voice.emit({ type: 'feedback', identity: initial.context, text: 'Stale answer' });
  voice.emit({ type: 'transcript', identity: initial.context, utteranceId: 'late-old-transcript', text: 'Old speech', final: true, uncertain: false });
  rejectOld(new Error('Old provider request failed'));
  await flush(); clock.advance(10000);
  const current = session.getSnapshot();
  assert.equal(current.assessment.results['spelling:past']?.ref, freshRef);
  assert.equal(current.assessment.results['spelling:past']?.status, 'accepted');
  assert.equal(current.assessment.hint, null);
  assert.equal(current.assessment.systemError, null);
  assert.equal(current.lastUtterance, '');
  assert.notEqual(current.coachText, 'Stale answer');
  assert.equal(current.assessment.evidence.meaning, undefined);
  assert.equal(voice.inputs.length, 1);
  assert.deepEqual(completed, []);
  session.dispose();
});

test('history navigation stays offline and paused while clearing transient speech and helper state', () => {
  const { session, voice } = setup();
  session.edit('past', 'was'); session.finalize('past', 'was');
  session.controller.setInteraction({ connection: 'offline', intent: 'pause', questionPending: true,
    inputFocused: true, compositionActive: true, questionDraftActive: true, learnerSpeaking: true,
    assistantSpeaking: true, presentationHolds: ['old-picture-modal'] });
  session.skip(); session.previous();
  const state = session.getSnapshot();
  assert.equal(state.drafts.past, 'was');
  assert.equal(state.assessment.results['spelling:past']?.status, 'accepted');
  const interaction = state.assessment.interaction;
  assert.equal(interaction.connection, 'offline');
  assert.equal(interaction.intent, 'pause');
  for (const key of ['questionPending', 'inputFocused', 'compositionActive', 'questionDraftActive', 'learnerSpeaking', 'assistantSpeaking'] as const) {
    assert.equal(interaction[key], false, key);
  }
  assert.equal(interaction.processingCount, 0);
  assert.deepEqual(interaction.presentationHolds, []);
  assert.equal(state.question, '');
  assert.equal(state.clarification, '');
  assert.equal(voice.inputs.length, 1);
  assert.equal(voice.connects, 0);
  session.dispose();
});

test('completed history retains typed work but never restores oral evidence or repeats automatic completion', async () => {
  const { session, voice, clock, completed } = setup();
  const first = session.getSnapshot().assessment;
  spelling(session, voice); await oral(session, voice);
  clock.advance(1800);
  assert.deepEqual(completed, [first.exerciseId]);
  assert.equal(session.getSnapshot().assessment.exerciseId, first.exerciseId);
  session.nextPicture(first.exerciseId);
  const next = session.getSnapshot().assessment.context;
  session.previous();
  const review = session.getSnapshot();
  const reviewId = review.assessment.exerciseId;
  assert.deepEqual(review.drafts, { base: 'be', past: 'was', participle: 'been' });
  assert.equal(review.assessment.evidence.meaning, undefined);
  assert.equal(review.assessment.evidence['pronunciation:base'], undefined);
  assert.equal(review.assessment.completed, false);
  clock.advance(10000);
  assert.equal(session.getSnapshot().assessment.exerciseId, reviewId);
  await oral(session, voice);
  assert.equal(session.getSnapshot().assessment.advancePending, false);
  clock.advance(10000);
  assert.deepEqual(completed, [first.exerciseId]);
  assert.equal(session.getSnapshot().assessment.exerciseId, reviewId);
  session.edit('past', 'were'); session.finalize('past', 'were'); voice.settle(voice.inputs.at(-1)!);
  assert.equal(session.getSnapshot().assessment.evidence['spelling:past']?.status, 'accepted');
  session.skip();
  const forward = session.getSnapshot().assessment.context;
  assert.equal(forward.mode === 'sentence' ? null : forward.verb, next.mode === 'sentence' ? null : next.verb);
  session.previous();
  assert.equal(session.getSnapshot().drafts.past, 'were');
  assert.deepEqual(completed, [first.exerciseId]);
  session.dispose();
});

test('shuffled decks visit every verb once per round, exhaust every photo, and preserve history without reshuffling', () => {
  for (const mode of ['verb-image', 'verb-visible'] as const) {
    for (const [firstSample, nextSample] of [[0, 1 - Number.EPSILON], [0.5, 0.25], [1 - Number.EPSILON, 0]]) {
      const catalog = mode === 'verb-image' ? VERB_PHOTOS.map(photo => photo.src) : VERBS.map(verb => verb.id);
      let randomCalls = 0;
      let sample = firstSample!;
      const voice = new VerbFixtureAdapter('deck-test');
      const session = createVerbSession({ voice, sessionId: 'deck-test', mode, namespace: 'deck', onComplete() {},
        random: () => { randomCalls++; return sample; } });
      const selected = () => {
        const context = session.getSnapshot().assessment.context;
        if (context.mode === 'sentence') throw new Error('Verb fixture expected');
        return context.verb;
      };
      const key = () => mode === 'verb-image' ? selected().image.src : selected().id;
      const firstVerb = selected();
      session.edit('past', 'unfinished first item');
      const order: string[] = [key()];
      const verbs: string[] = [selected().id];
      const assertCompleteRounds = (ids: string[]) => {
        for (let index = 0; index < ids.length; index += VERB_IDS.length) {
          assert.deepEqual(new Set(ids.slice(index, index + VERB_IDS.length)), new Set(VERB_IDS),
            'Every round visits all verbs before another photograph of the same verb.');
        }
      };
      assert.ok(randomCalls > 0, 'The first round starts with a shuffle.');
      for (let index = 1; index < catalog.length; index++) {
        const before = randomCalls;
        session.skip(); order.push(key()); verbs.push(selected().id);
        if (index % VERB_IDS.length === 0) assert.ok(randomCalls > before, 'A new round is shuffled.');
        assert.equal(session.getSnapshot().drafts.past, '', 'Each image occurrence has its own draft.');
      }
      assert.deepEqual(new Set(order), new Set(catalog));
      assert.equal(new Set(order).size, catalog.length);
      assertCompleteRounds(verbs);
      const firstCycleCalls = randomCalls;
      for (let index = order.length - 2; index >= 0; index--) {
        assert.equal(session.previous(), true);
        assert.equal(key(), order[index]);
        assert.equal(randomCalls, firstCycleCalls, 'Back navigation does not consume a random sample.');
      }
      assert.equal(selected(), firstVerb);
      assert.equal(session.getSnapshot().drafts.past, 'unfinished first item');
      assert.equal(session.previous(), false);
      for (let index = 1; index < order.length; index++) {
        session.skip(); assert.equal(key(), order[index]);
        assert.equal(randomCalls, firstCycleCalls, 'Forward history keeps the existing deck.');
      }
      assert.equal(randomCalls, firstCycleCalls);

      const previousLast = key();
      const previousVerb = selected().id;
      sample = nextSample!;
      session.skip();
      assert.notEqual(key(), previousLast, 'A new cycle must not immediately repeat the same photo or word.');
      assert.notEqual(selected().id, previousVerb, 'A new cycle must not repeat the verb with a different photograph.');
      assert.ok(randomCalls > firstCycleCalls, 'A new cycle starts with a fresh shuffle.');
      const nextRoundCalls = randomCalls;
      const nextOrder = [key()];
      const nextVerbs = [selected().id];
      assert.equal(session.getSnapshot().drafts.past, '');
      session.previous(); assert.equal(key(), previousLast);
      session.skip(); assert.equal(key(), nextOrder[0]);
      assert.equal(randomCalls, nextRoundCalls, 'Crossing an existing cycle boundary does not shuffle again.');
      for (let index = 1; index < catalog.length; index++) {
        const before = randomCalls;
        session.skip(); nextOrder.push(key()); nextVerbs.push(selected().id);
        if (index % VERB_IDS.length === 0) assert.ok(randomCalls > before, 'Later photo rounds also use a fresh verb shuffle.');
      }
      assert.deepEqual(new Set(nextOrder), new Set(catalog));
      assert.equal(new Set(nextOrder).size, catalog.length);
      assertCompleteRounds(nextVerbs);
      const allVerbs = [...verbs, ...nextVerbs];
      for (let index = 1; index < allVerbs.length; index++) {
        assert.notEqual(allVerbs[index], allVerbs[index - 1], 'Adjacent exercises never repeat a verb, including round and cycle boundaries.');
      }
      assert.notDeepEqual(nextOrder, order);
      assert.equal(voice.inputs.length, 0);
      session.dispose();
    }
  }
});

test('fresh lesson launches use a fresh injected shuffle and reject invalid random samples', () => {
  for (const mode of ['verb-image', 'verb-visible'] as const) {
    const firstEntries: string[] = [];
    for (const sample of [0, 0.5]) {
      const session = createVerbSession({ voice: new VerbFixtureAdapter('fresh-deck'), sessionId: 'fresh-deck',
        mode, random: () => sample, onComplete() {} });
      const context = session.getSnapshot().assessment.context;
      if (context.mode === 'sentence') throw new Error('Verb fixture expected');
      firstEntries.push(mode === 'verb-image' ? context.verb.image.src : context.verb.id);
      assert.equal(session.getSnapshot().canGoBack, false);
      assert.deepEqual(session.getSnapshot().drafts, { base: '', past: '', participle: '' });
      session.dispose();
    }
    assert.notEqual(firstEntries[0], firstEntries[1]);
    for (const sample of [-0.1, 1, Infinity, -Infinity, NaN]) {
      const voice = new VerbFixtureAdapter('invalid-deck');
      assert.throws(() => createVerbSession({ voice, sessionId: 'invalid-deck', mode,
        random: () => sample, onComplete() {} }), RangeError);
      assert.equal(voice.listeners.size, 0);
    }
  }
});

test('both verb modes require every oral gate plus only their editable spelling fields, then Pictures awaits Next while visible verbs advance once after quiet', async () => {
  for (const mode of ['verb-image', 'verb-visible'] as const) {
    const { session, voice, clock, completed } = setup(mode);
    const initial = session.getSnapshot().assessment;
    assert.deepEqual(session.fields, mode === 'verb-image' ? ['base', 'past', 'participle'] : ['past', 'participle']);
    spelling(session, voice);
    clock.advance(5000); assert.equal(completed.length, 0);
    await oral(session, voice);
    clock.advance(1799); assert.equal(completed.length, 0);
    clock.advance(1); assert.deepEqual(completed, [initial.exerciseId]);
    if (mode === 'verb-image') {
      clock.advance(10000);
      assert.equal(session.getSnapshot().assessment.exerciseId, initial.exerciseId);
      session.nextPicture(initial.exerciseId);
      session.nextPicture(initial.exerciseId); // A stale second click cannot skip generation 2.
    }
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

test('real-adapter spelling works offline without transport and preserves independent oral fixture evidence', async () => {
  for (const mode of ['verb-image', 'verb-visible'] as const) {
    let transportCalls = 0;
    const voice = createRealtimeVoiceAdapter({ dependencies: {
      async fetch() { transportCalls++; throw new Error('This test must not call a provider or broker.'); },
      async getUserMedia() { transportCalls++; throw new Error('This test must not request a microphone.'); },
      createPeer() { transportCalls++; throw new Error('This test must not create a peer connection.'); },
      createAudio() { transportCalls++; throw new Error('This test must not create audio.'); },
    } });
    const session = createVerbSession({ voice, mode, sessionId: `offline-${mode}`, random: () => 0, onComplete() {} });
    const initial = session.getSnapshot().assessment;
    const oralRefs = session.controller.beginAttempt(['meaning', 'pronunciation:base']);
    // Seed controller evidence explicitly; no real audio is captured or assessed.
    session.controller.applyBatch({ ...initial, eventId: 'seeded-oral-fixture', results: oralRefs.map(ref => ({
      ref, status: 'accepted', source: { kind: 'audio', utteranceId: 'seeded-audio-fixture', audioAvailable: true },
      feedback: 'Seeded unit fixture only.',
    })) });

    session.edit('past', 'was'); session.finalize('past', 'was'); await flush();
    const accepted = session.getSnapshot().assessment;
    assert.equal(accepted.evidence['spelling:past']?.status, 'accepted');
    assert.equal(accepted.evidence['spelling:past']?.source?.kind, 'typed');
    assert.equal(accepted.systemError, null);
    assert.equal(accepted.interaction.connection, 'offline');

    session.edit('past', 'wuz'); session.finalize('past', 'wuz'); await flush();
    const incorrect = session.getSnapshot().assessment;
    assert.equal(incorrect.evidence['spelling:past']?.status, 'incorrect');
    assert.ok(incorrect.results['spelling:past']?.spelling?.incorrectGraphemeIndices.length);
    assert.equal(incorrect.evidence.meaning?.status, 'accepted');
    assert.equal(incorrect.evidence['pronunciation:base']?.status, 'accepted');
    assert.equal(incorrect.systemError, null);
    assert.equal(incorrect.interaction.processingCount, 0);
    assert.equal(transportCalls, 0);
    session.dispose();
  }
});

test('offline verb questions and hints never submit remote work or create connection failures', async () => {
  const { session, voice } = setup();
  voice.emit({ type: 'state', state: 'offline' });
  session.ask('Could you explain that?');
  session.requestHint();
  await flush();
  const snapshot = session.getSnapshot();
  assert.equal(voice.inputs.length, 0);
  assert.equal(voice.hints.length, 0);
  assert.equal(snapshot.assessment.systemError, null);
  assert.equal(snapshot.assessment.interaction.questionPending, false);
  assert.equal(snapshot.assessment.hintPending, false);
  assert.equal(snapshot.clarification, 'Connect the conversation before asking a question.');
  voice.emit({ type: 'state', state: 'ready' });
  session.requestHint();
  assert.equal(voice.hints.length, 1);
  session.ask('Could you explain that?');
  assert.equal(voice.inputs.length, 1);
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
  assert.match(session.getSnapshot().clarification, /Please say it again/);
  voice.utterance("He's been here; he buys bread. Natural connected speech."); await flush();
  assert.equal(session.getSnapshot().clarification, '');
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

test('a queued unclear turn after oral completion retains a visible clarification without a model request', async () => {
  const { session, voice } = setup();
  voice.utterance('All oral requirements.', false, 'first'); await flush();
  voice.utterance('', true, 'unclear-second'); await flush();
  assert.equal(voice.inputs.length, 1);
  voice.settle(voice.inputs[0]!); await flush();
  assert.equal(voice.inputs.length, 1);
  assert.equal(session.getSnapshot().assessment.evidence.meaning?.status, 'accepted');
  assert.equal(session.getSnapshot().assessment.interaction.questionPending, true);
  assert.match(session.getSnapshot().clarification, /Please clarify before we move on/);
  voice.emit({ type: 'intent', intent: 'question-resolved' });
  assert.equal(session.getSnapshot().clarification, '');
  session.dispose();
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


test('selected photograph stays attached to the exercise while spelling and presentation change', () => {
  const { session, voice } = setup();
  const original = session.getSnapshot().assessment.context;
  assert.notEqual(original.mode, 'sentence');
  if (original.mode === 'sentence') throw new Error('Verb fixture expected');
  const photo = original.verb.image;
  session.edit('base', 'be');
  session.finalize('base', 'be');
  voice.settle(voice.inputs.at(-1)!);
  session.controller.setPresentationHold('photo-context', true);
  session.controller.setPresentationHold('photo-context', false);
  session.controller.activity();
  const updated = session.getSnapshot().assessment.context;
  assert.notEqual(updated.mode, 'sentence');
  if (updated.mode === 'sentence') throw new Error('Verb fixture expected');
  assert.equal(updated.exerciseId, original.exerciseId);
  assert.equal(updated.verb.image, photo);
  assert.equal(session.getSnapshot().assessment.evidence['spelling:base']?.status, 'accepted');
  session.dispose();
});
