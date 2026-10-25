import test from 'node:test';
import assert from 'node:assert/strict';
import { createVerbSession } from '../src/features/verbs/session';
import { VerbFixtureAdapter } from '../src/features/verbs/__fixtures__/adapter';
import { FakeClock } from './helpers/assessment-fixtures';
import { createRealtimeVoiceAdapter } from '../src/voice';
import { createPicturePreload } from '../src/features/verbs/picture-preload';
import { getFormGuidance } from '../src/contracts';
import { getPictureDictionaryEntry } from '../src/features/verbs/dictionary';

const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
test('Pictures card depends on written gates while oral completion remains independent', async () => {
  const voice = new VerbFixtureAdapter('s', true);
  const clock = new FakeClock(); const completed: string[] = [];
  let draws = 0;
  const session = createVerbSession({ voice, clock, mode: 'verb-image', sessionId: 's', random: () => { draws++; return 0; }, onComplete: id => completed.push(id) });
  const original = session.getSnapshot().assessment;
  const nextPhoto = session.getSnapshot().nextPicture;
  const before = draws;
  for (let i = 0; i < 20; i++) session.getSnapshot();
  assert.equal(draws, before);
  session.edit('base', 'be'); session.finalize('base', 'be');
  session.edit('past', 'was'); session.finalize('past', 'was');
  voice.utterance('Mock fixture supplies oral verdicts'); await flush(); clock.advance(5000);
  assert.equal(session.getSnapshot().pictureComplete, false);
  session.edit('participle', 'been'); session.finalize('participle', 'been'); clock.advance(1800);
  assert.equal(session.getSnapshot().pictureComplete, true);
  assert.deepEqual(completed, [original.exerciseId]);
  clock.advance(20000); assert.equal(session.getSnapshot().assessment.exerciseId, original.exerciseId);
  assert.equal(session.nextPicture(original.exerciseId), true);
  assert.equal(session.nextPicture(original.exerciseId), false);
  const context = session.getSnapshot().assessment.context;
  assert.equal(context.mode !== 'sentence' && context.verb.image.src, nextPhoto?.src);
  assert.equal(session.getSnapshot().pictureComplete, false);
  session.previous(); assert.equal(session.getSnapshot().assessment.evidence.meaning, undefined);
  assert.equal(session.getSnapshot().pictureComplete, true);
  assert.equal(session.getSnapshot().assessment.completed, false);
  session.dispose();
});
test('preload bounds Image allocations, replaces queued work, ignores stale success and tolerates failure/disposal', async () => {
  const allocated: string[] = []; const ready: string[] = [];
  const jobs: { resolve: () => void; reject: () => void }[] = [];
  const preload = createPicturePreload(() => ({ src: '', decode() { allocated.push(this.src); return new Promise<void>((resolve, reject) => jobs.push({ resolve, reject: () => reject(new Error('fixture decode failure')) })); } }), item => ready.push(item.key));
  preload.setNext({ key: 'a', src: '/images/verbs/be-1.jpg' });
  preload.setNext({ key: 'b', src: '/images/verbs/be-2.jpg' });
  preload.setNext({ key: 'c', src: '/images/verbs/be-3.jpg' });
  assert.equal(allocated.length, 1);
  jobs[0]!.resolve(); await flush(); assert.deepEqual(ready, []);
  assert.deepEqual(allocated, ['/images/verbs/be-1.jpg', '/images/verbs/be-3.jpg']);
  jobs[1]!.reject(); await flush();
  preload.setNext({ key: 'external', src: 'https://example.com/cue.jpg' }); assert.equal(allocated.length, 2);
  preload.setNext({ key: 'd', src: '/images/verbs/go-1.jpg' });
  preload.setNext({ key: 'e', src: '/images/verbs/go-2.jpg' });
  preload.dispose(); jobs[2]!.resolve(); await flush();
  assert.equal(allocated.length, 3); assert.deepEqual(ready, []);
});

test('offline Pictures reveals the card after three written forms without audio and invalidates it on edit', () => {
  const clock = new FakeClock(); const completed: string[] = [];
  const session = createVerbSession({ voice: createRealtimeVoiceAdapter(), clock, mode: 'verb-image', sessionId: 'offline-picture',
    random: () => 0, onComplete: id => completed.push(id) });
  const original = session.getSnapshot().assessment;
  assert.equal(original.interaction.connection, 'offline');
  for (const [form, value] of [['base', 'be'], ['past', 'was']] as const) {
    session.edit(form, value); session.finalize(form, value);
    assert.equal(session.getSnapshot().pictureComplete, false);
    assert.equal(session.nextPicture(original.exerciseId), false);
  }
  session.edit('participle', 'ben'); session.finalize('participle', 'ben');
  assert.equal(session.getSnapshot().pictureComplete, false);
  session.edit('participle', 'been'); session.finalize('participle', 'been');
  assert.equal(session.getSnapshot().pictureComplete, true);
  assert.equal(session.getSnapshot().assessment.completed, false);
  assert.equal(session.getSnapshot().assessment.evidence.meaning, undefined);
  assert.ok(Object.keys(session.getSnapshot().assessment.evidence).every(key => key.startsWith('spelling:')));
  clock.advance(20000);
  assert.deepEqual(completed, []); assert.equal(session.getSnapshot().assessment.exerciseId, original.exerciseId);
  session.edit('past', 'wer');
  assert.equal(session.getSnapshot().pictureComplete, false);
  assert.equal(session.nextPicture(original.exerciseId), false);
  session.finalize('past', 'wer'); assert.equal(session.getSnapshot().pictureComplete, false);
  session.edit('past', 'were'); session.finalize('past', 'were');
  assert.equal(session.getSnapshot().pictureComplete, true);
  assert.equal(session.nextPicture(original.exerciseId), true);
  assert.equal(session.nextPicture(original.exerciseId), false);
  assert.deepEqual(completed, []);
  assert.equal(session.getSnapshot().pictureComplete, false);
  session.previous(); assert.equal(session.getSnapshot().pictureComplete, true);
  assert.equal(session.getSnapshot().assessment.completed, false);
  assert.equal(session.getSnapshot().assessment.evidence.meaning, undefined);
  session.dispose();
});

test('both languages reveal the visible verb dictionary after two written forms and invalidate stale Next actions', () => {
  for (const language of ['en', 'fr'] as const) {
    const completed: string[] = [];
    const clock = new FakeClock();
    const session = createVerbSession({ voice: createRealtimeVoiceAdapter(), clock, mode: 'verb-visible', language,
      sessionId: `offline-visible-${language}`, random: () => 0, onComplete: id => completed.push(id) });
    try {
      const original = session.getSnapshot().assessment;
      if (original.context.mode === 'sentence') throw new Error('Expected verb context');
      assert.equal(session.fields.length, 2);
      assert.equal(session.getSnapshot().writtenComplete, false);
      assert.equal(session.nextVerb(original.exerciseId), false);
      for (const [index, form] of session.fields.entries()) {
        const answer = getFormGuidance(original.context.verb, form)!.accepted[0]!;
        session.edit(form, answer); session.finalize(form, answer);
        assert.equal(session.getSnapshot().writtenComplete, index === session.fields.length - 1);
      }
      assert.ok(getPictureDictionaryEntry(original.context.verb.id)?.senses[0]?.definition.text);
      assert.equal(session.getSnapshot().pictureComplete, false, 'The picture-only compatibility flag retains its meaning');
      assert.equal(session.getSnapshot().assessment.completed, false);
      assert.ok(Object.keys(session.getSnapshot().assessment.evidence).every(key => key.startsWith('spelling:')));
      clock.advance(20000);
      assert.equal(session.getSnapshot().assessment.exerciseId, original.exerciseId);
      assert.deepEqual(completed, []);
      const editedForm = session.fields[0]!;
      const answer = getFormGuidance(original.context.verb, editedForm)!.accepted[0]!;
      session.edit(editedForm, 'incorrect');
      assert.equal(session.getSnapshot().writtenComplete, false);
      assert.equal(session.nextVerb(original.exerciseId), false);
      session.edit(editedForm, answer); session.finalize(editedForm, answer);
      assert.equal(session.getSnapshot().writtenComplete, true);
      assert.equal(session.nextVerb(original.exerciseId), true);
      assert.equal(session.nextVerb(original.exerciseId), false);
      assert.equal(session.getSnapshot().writtenComplete, false);
      assert.deepEqual(completed, [], 'Written dictionary navigation does not manufacture oral completion');
      assert.equal(session.previous(), true);
      assert.equal(session.getSnapshot().writtenComplete, true);
      assert.equal(session.getSnapshot().assessment.evidence.meaning, undefined);
    } finally { session.dispose(); }
  }
});
