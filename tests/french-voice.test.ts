import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { coachInstructions, createRealtimeProtocol, isSafeCoachText } from '../src/voice/protocol';
import { createSentenceHintHandler } from '../server/sentence-hints';
import { providerSession, type BrokerConfig } from '../server/realtime';
import { createFeedbackPolicy, type ClosedFeedbackEvidence } from '../server/feedback/policy';
import { ALL_SENTENCES, VERBS } from '../src/content';
import type { AttemptRef, ExerciseContext, FrenchVerbEntry, LearningLanguage, VoiceEvent } from '../src/contracts';

const verb: FrenchVerbEntry = {
  language: 'fr', id: 'fr-etre', lemma: 'être',
  forms: {
    infinitive: { accepted: ['être'], ipa: '/ɛtʁ/', spanishSoundGuide: 'La r es posterior.' },
    present: { accepted: ['suis'], ipa: '/sɥi/', spanishSoundGuide: 'Redondea los labios.' },
    participle: { accepted: ['été'], ipa: '/ete/', spanishSoundGuide: 'Conserva las dos vocales.' },
  },
  spanishMeanings: ['ser', 'estar'], image: { src: '/fixture.jpg', alt: 'Una persona en casa.', attribution: 'Test fixture' },
  examples: { infinitive: ['Je veux être ici.'], present: ['Je suis ici.'], participle: ["J’ai été ici."] },
  notes: ['El infinitivo no es un tiempo.'], presentConjugation: [{ pronoun: 'je', form: 'suis' }], auxiliary: 'avoir',
};
const french = (): ExerciseContext => ({ sessionId: 'french-session', exerciseId: 'french-exercise', generation: 1, mode: 'verb-image', language: 'fr', verb });
function protocolFixture() {
  const sent: any[] = []; const events: VoiceEvent[] = [];
  const protocol = createRealtimeProtocol({ sessionId: 'french-session', send: message => sent.push(message), emit: event => events.push(event), setAudioAllowed() {} });
  protocol.setContext(french());
  const receive = (value: object) => protocol.receive(JSON.stringify(value));
  const request = () => sent.filter(event => event.type === 'response.create').at(-1)?.response;
  const finish = (requestId: string, payload: object) => receive({ type: 'response.done', response: {
    id: `response-${requestId}`, metadata: { request_id: requestId }, status: 'completed',
    output: [{ type: 'message', content: [{ type: 'text', text: JSON.stringify(payload) }] }],
  } });
  return { protocol, sent, events, receive, request, finish };
}

test('French coaching uses French constructions and Spanish explanation without changing English grammar', () => {
  const instructions = coachInstructions(french());
  assert.match(instructions, /French-learning coach/);
  assert.match(instructions, /Explain and coach in Spanish/);
  for (const rule of ['infinitive is not a tense', 'present is not past', 'passé composé', 'imparfait', 'conditionnel présent', 'subject agreement', 'preceding direct object']) assert.ok(instructions.includes(rule));
  assert.doesNotMatch(instructions, /did not bought/);
  const english: ExerciseContext = { ...french(), mode: 'verb-visible', verb: VERBS[0]! };
  assert.match(coachInstructions(english), /did not buy, never did not bought/);
  assert.match(coachInstructions(english), /Explain in Spanish/);
});

test('French spoiler checks cover the requested French forms and keep pretranslation hints in Spanish', () => {
  assert.equal(isSafeCoachText('La forma es être.', french()), false);
  assert.equal(isSafeCoachText('Escribe suis.', french()), false);
  assert.equal(isSafeCoachText('La respuesta es été.', french()), false);
  assert.equal(isSafeCoachText('Piensa en el significado de la acción.', french()), true);
  const sentence = ALL_SENTENCES.find(item => item.language === 'fr'); assert.ok(sentence);
  const context: ExerciseContext = { sessionId: 'french-session', exerciseId: 'sentence', generation: 2, mode: 'sentence', stage: 'translation', sentence };
  assert.equal(isSafeCoachText('Usa el passé composé.', context), false);
  assert.equal(isSafeCoachText(sentence.alternatives[0]!.text, context), false);
  assert.equal(isSafeCoachText('What message do you want to express?', context), false);
  assert.equal(isSafeCoachText('¿Qué mensaje quieres comunicar?', context), true);
});

test('typed French forms retain accents and never dispatch provider inference', () => {
  const f = protocolFixture();
  try {
    for (const [index, text] of ['être', 'etre'].entries()) {
      const ref: AttemptRef = { ...french(), obligation: 'spelling:infinitive', attemptId: `typed-${index}`, revision: index + 1 };
      f.protocol.submit({ ...french(), kind: 'typed', inputId: `input-${index}`, text, attempts: [ref] });
    }
    const verdicts = f.events.filter(event => event.type === 'assessment').map(event => event.batch.results[0]?.status);
    assert.deepEqual(verdicts, ['accepted', 'incorrect']); assert.equal(f.sent.length, 0);
  } finally { f.protocol.dispose(); }
});

test('French audio assessment keeps audio provenance and discards a prior exercise response', () => {
  const f = protocolFixture();
  const ref: AttemptRef = { ...french(), obligation: 'pronunciation:present', attemptId: 'oral', revision: 1 };
  try {
    f.protocol.submit({ ...french(), kind: 'utterance', inputId: 'no-audio', text: 'suis', utteranceId: 'missing', attempts: [ref] });
    assert.equal(f.sent.length, 0);
    assert.equal(f.events.filter(event => event.type === 'assessment').at(-1)?.batch.results[0]?.status, 'uncertain');
    f.receive({ type: 'input_audio_buffer.speech_started', item_id: 'french-audio' });
    f.protocol.submit({ ...french(), kind: 'utterance', inputId: 'audio', text: 'suis', utteranceId: 'french-audio', attempts: [ref] });
    const request = f.request(); assert.match(request.instructions, /French-learning coach/);
    assert.equal(request.input[0].id, 'french-audio');
    const id = request.metadata.request_id;
    const count = f.events.filter(event => event.type === 'assessment').length;
    f.protocol.setContext({ ...french(), exerciseId: 'next-exercise', generation: 2 });
    f.finish(id, { requestId: id, results: [{ obligation: ref.obligation, status: 'accepted', audioClear: true, feedback: 'Bien.' }], intent: 'practice' });
    assert.equal(f.events.filter(event => event.type === 'assessment').length, count);
  } finally { f.protocol.dispose(); }
});

const origin = 'http://127.0.0.1:5174';
const envelope = (hint: string) => Response.json({ status: 'completed', output: [
  { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({ hint }) }] },
] });
async function hintRequest(body: object, fetcher: typeof fetch, authorize?: (sessionId: string, language: LearningLanguage) => Promise<void>) {
  const handler = createSentenceHintHandler({ apiKey: 'fixture-only', model: 'fixture-model', allowedOrigins: [origin] }, fetcher);
  const incoming = Object.assign(new PassThrough(), { method: 'POST', headers: { origin, 'content-type': 'application/json' } });
  let status = 0; let result = '';
  const outgoing = Object.assign(new EventEmitter(), { destroyed: false, writableEnded: false,
    writeHead(value: number) { status = value; }, end(value: string) { result = value; outgoing.writableEnded = true; } });
  const done = handler(incoming as unknown as IncomingMessage, outgoing as unknown as ServerResponse, authorize);
  incoming.end(JSON.stringify(body)); await done;
  return { status, body: JSON.parse(result) as unknown };
}

test('French written hints resolve authoritative curriculum and check session language before provider dispatch', async () => {
  const sentence = ALL_SENTENCES.find(item => item.language === 'fr'); assert.ok(sentence);
  const body = { helpEnabled: true, sentenceId: sentence.id, draft: 'Une tentative.', sessionId: 'french-session' };
  let calls = 0; let authorized = false;
  const fetcher: typeof fetch = async (_url, init) => {
    calls++; assert.ok(authorized);
    const request = JSON.parse(String(init?.body));
    const data = JSON.parse(request.input[0].content[0].text);
    assert.equal(data.targetLanguage, 'French'); assert.equal(data.baseLanguage, 'Spanish');
    assert.equal(data.spanishSentence, sentence.spanish);
    assert.deepEqual(data.nonExhaustiveExamples, sentence.alternatives.map(item => item.text));
    assert.match(request.instructions, /Accents carry meaning/);
    return envelope('Revisa quién realiza la acción y el significado que quieres comunicar.');
  };
  const authorize = async (sessionId: string, language: LearningLanguage) => {
    assert.equal(sessionId, 'french-session'); assert.equal(language, 'fr'); authorized = true;
  };
  assert.equal((await hintRequest(body, fetcher, authorize)).status, 200); assert.equal(calls, 1);
  assert.equal((await hintRequest(body, fetcher, async () => { throw Error('wrong session language'); })).status, 403);
  assert.equal((await hintRequest({ helpEnabled: true, sentenceId: sentence.id, draft: 'Une tentative.' }, fetcher, authorize)).status, 400);
  assert.equal(calls, 1);
});

test('French written hints suppress tense leaks and complete target answers', async () => {
  const sentence = ALL_SENTENCES.find(item => item.language === 'fr'); assert.ok(sentence);
  const body = { helpEnabled: true, sentenceId: sentence.id, draft: 'Une tentative.' };
  for (const text of ['Usa el passé composé.', 'Usa el imparfait.', 'Usa el futur proche.', 'Usa el conditionnel présent.', sentence.alternatives[0]!.text]) {
    assert.equal((await hintRequest(body, async () => envelope(text))).status, 502);
  }
});

test('provider session defaults to English and accepts only the canonical French binding', () => {
  const config: BrokerConfig = { enabled: false, apiKey: '', model: 'fixture', allowedOrigins: [origin], maxDurationSeconds: 600 };
  assert.match(providerSession(config).instructions, /English coach/);
  assert.match(providerSession(config, 'fr').instructions, /French coach/);
  assert.match(providerSession(config, 'fr').instructions, /Explain in Spanish/);
  assert.equal(providerSession(config, 'fr').audio.input.turn_detection.create_response, false);
});

test('French canonical feedback is grounded Spanish and cannot certify pronunciation or use another language summary', async () => {
  const claim = { sessionId: 'french-session', jobId: 'job', claimToken: 'claim' };
  const evidence: ClosedFeedbackEvidence = { claim,
    session: { sessionId: claim.sessionId, status: 'closed', revision: 1, language: 'fr' }, closedRevision: 1,
    segments: [{ sessionId: claim.sessionId, segmentId: 'segment', connectionEpoch: 1, qualified: true }],
    observations: [{ observationId: 'written', sessionId: claim.sessionId, segmentId: null, activity: 'written-form', outcome: 'uncertain' }],
  };
  const policy = createFeedbackPolicy({ read: async () => evidence });
  const result = await policy.evidence(claim); assert.equal(result.status, 'sufficient');
  if (result.status !== 'sufficient') return;
  const comment = result.snapshot.value.allowedComments[0]!;
  assert.match(comment, /francés.*inciertas/); assert.equal(policy.accepts(comment, result.snapshot), true);
  assert.equal(policy.accepts('Tu pronunciación es excelente.', result.snapshot), false);
  assert.equal(policy.accepts('Some responses in your written verb forms practice remain uncertain. Revisit this area with your tutor.', result.snapshot), false);
  const invalid = createFeedbackPolicy({ read: async () => ({ ...evidence, session: { ...evidence.session, language: 'de' } }) });
  assert.equal((await invalid.evidence(claim)).status, 'insufficient-evidence');
});
