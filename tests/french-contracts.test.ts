import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, getLanguage, requiredObligations, type FrenchVerbEntry, type ExerciseContext } from '../src/contracts';
import { createAssessmentController } from '../src/assessment/controller';
import { assessSpelling } from '../src/assessment/spelling';
import { parseWrittenSnapshot } from '../src/features/progress/written-snapshot-store';

const guidance = (text: string) => ({ accepted: [text], ipa: '', spanishSoundGuide: '' });
const verb: FrenchVerbEntry = { language: 'fr', id: 'fr-etre', lemma: 'être', auxiliary: 'avoir', presentConjugation: [],
  forms: { infinitive: guidance('être'), present: guidance('suis'), participle: guidance('été') },
  examples: { infinitive: ['Je veux être ici.'], present: ['Je suis ici.'], participle: ["J’ai été ici."] },
  spanishMeanings: ['ser', 'estar'], image: { src: '/photo.jpg', alt: 'Una persona está aquí.', attribution: 'fixture' }, notes: [] };
const context: ExerciseContext = { sessionId: 'fr-session', exerciseId: 'fr-exercise', generation: 1, mode: 'verb-image', verb };

test('French has its own form obligations and supplied infinitives omit only infinitive spelling', () => {
  assert.equal(DEFAULT_SETTINGS.learningLanguage, 'en');
  assert.deepEqual(requiredObligations('verb-image', 'fr'), [
    'spelling:infinitive','spelling:present','spelling:participle','meaning',
    'pronunciation:infinitive','pronunciation:present','pronunciation:participle',
    'sentence:infinitive','sentence:present','sentence:participle',
  ]);
  assert.equal(requiredObligations('verb-visible', 'fr').includes('spelling:infinitive'), false);
  assert.equal(requiredObligations('verb-visible', 'fr').includes('spelling:present'), true);
  assert.equal(getLanguage({ ...context, language: 'en' }), 'fr');
});

test('French spelling preserves accents and cannot certify oral work or English form slots', () => {
  const controller = createAssessmentController({ context });
  assert.deepEqual(controller.beginAttempt(['spelling:past']), []);
  const [ref] = controller.beginAttempt(['spelling:infinitive']);
  assert.ok(ref);
  assert.equal(assessSpelling(context, ref, 'être', 'correct').status, 'accepted');
  assert.equal(assessSpelling(context, ref, 'être', 'decomposed').status, 'accepted');
  assert.equal(assessSpelling(context, ref, 'etre', 'accent').status, 'incorrect');
  const result = assessSpelling(context, ref, 'être', 'typed');
  controller.applyBatch({ ...context, eventId: 'typed-result', results: [result] });
  assert.equal(controller.getSnapshot().completed, false);
  assert.equal(controller.getSnapshot().evidence['pronunciation:infinitive'], undefined);
  controller.dispose();
});

test('French written snapshots retain exact French draft keys and reject mixed legacy fields', () => {
  const scope = { userId: 'student', sessionId: context.sessionId };
  const value = { schemaVersion: 1, kind: 'verb-image', userId: 'student', identity: { sessionId: context.sessionId, exerciseId: context.exerciseId, generation: 1 },
    verbId: verb.id, photoSrc: verb.image.src, drafts: { infinitive: 'être', present: 'suis', participle: 'été' }, records: [] };
  assert.ok(parseWrittenSnapshot(scope, value));
  assert.equal(parseWrittenSnapshot(scope, { ...value, drafts: { base: 'be', past: 'was', participle: 'been' } }), null);
  assert.equal(parseWrittenSnapshot(scope, { ...value, verbId: 'be' }), null);
  assert.equal(parseWrittenSnapshot({ ...scope, sessionId: 'english-session' }, value), null);
});
