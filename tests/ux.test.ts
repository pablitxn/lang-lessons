import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AttemptRef, EvidenceResult } from '../src/contracts';
import { currentSpellingResult, progressItems, spellingSegments } from '../src/ui/mobile/presentation';
import { ObligationProgress, SentencePrompt } from '../src/ui/mobile/components';
import { VoiceControls } from '../src/ui/mobile/__fixtures__/conversation-controls';

const identity = { sessionId: 's', exerciseId: 'buy', generation: 1 };
const ref: AttemptRef = { ...identity, obligation: 'spelling:past', attemptId: 'a', revision: 2 };
const result: EvidenceResult = { ref, status: 'incorrect', source: { kind: 'typed', inputId: 'past' }, feedback: 'Check the final letter.',
  spelling: { submittedText: 'bentt', incorrectGraphemeIndices: [4], missingGraphemeIndices: [] } };

test('feedback never attaches an old attempt or mismatched submitted text to the current draft', () => {
  assert.equal(currentSpellingResult(ref, result, 'bentt'), result);
  for (const changed of [{ revision: 3 }, { generation: 2 }, { sessionId: 'other' }, { exerciseId: 'bend' }, { attemptId: 'new' }, { obligation: 'spelling:base' as const }]) {
    assert.equal(currentSpellingResult({ ...ref, ...changed }, result, 'bentt'), undefined);
  }
  assert.equal(currentSpellingResult(ref, result, 'bent'), undefined);
  assert.equal(currentSpellingResult(undefined, result, 'bentt'), undefined);
  const uncertain: EvidenceResult = { ref, status: 'uncertain', source: result.source, feedback: 'Check again.' };
  assert.equal(currentSpellingResult(ref, uncertain, 'bentt'), uncertain);
});

test('French spelling feedback accepts canonical Unicode while preserving accents and attempt identity', () => {
  const frenchRef: AttemptRef = { ...ref, obligation: 'spelling:infinitive' };
  const accepted: EvidenceResult = { ...result, ref: frenchRef, status: 'accepted',
    spelling: { submittedText: 'être', incorrectGraphemeIndices: [], missingGraphemeIndices: [] } };
  assert.equal(currentSpellingResult(frenchRef, accepted, 'e\u0302tre'), accepted);
  assert.equal(currentSpellingResult(frenchRef, accepted, 'etre'), undefined);
  assert.equal(currentSpellingResult(frenchRef, accepted, 'étre'), undefined);
  assert.equal(currentSpellingResult({ ...frenchRef, revision: frenchRef.revision + 1 }, accepted, 'e\u0302tre'), undefined);
});

test('grapheme feedback keeps combining marks together and indicates omissions without revealing letters', () => {
  const segments = spellingSegments({ ...result, spelling: { submittedText: 'e\u0301x', incorrectGraphemeIndices: [1], missingGraphemeIndices: [0, 2] } });
  assert.deepEqual(segments, [
    { text: '▴', incorrect: true, gap: true }, { text: 'e\u0301', incorrect: false, gap: false },
    { text: 'x', incorrect: true, gap: false }, { text: '▴', incorrect: true, gap: true },
  ]);
  assert.equal(spellingSegments(result).filter(segment => segment.incorrect).map(segment => segment.text).join(''), 't');
});

test('visible-base progress excludes base spelling, keeps uncertainty distinct, and rejects old exercise evidence', () => {
  const evidence = { 'spelling:past': { ref, status: 'uncertain' as const } };
  assert.equal(progressItems('verb-image', identity, evidence).length, 10);
  const visible = progressItems('verb-visible', identity, evidence);
  assert.equal(visible.length, 9);
  assert.ok(!visible.some(item => item.obligation === 'spelling:base'));
  assert.equal(visible.find(item => item.obligation === 'spelling:past')?.status, 'uncertain');
  assert.equal(progressItems('verb-visible', { ...identity, generation: 2 }, evidence).find(item => item.obligation === 'spelling:past')?.status, 'not-attempted');
  const html = renderToStaticMarkup(createElement(ObligationProgress, { mode: 'verb-visible', identity, evidence }));
  assert.match(html, /0 <span>of 9/);
  assert.match(html, /Needs clarification/);
});

test('sentence presentation names no target tense before acceptance and offers Next only after explanation', () => {
  const props = { onHint() {}, onNext() {} };
  const before = renderToStaticMarkup(createElement(SentencePrompt, { ...props, stage: 'translation' }));
  assert.doesNotMatch(before, /tense|Next exercise|perfect|continuous/);
  const after = renderToStaticMarkup(createElement(SentencePrompt, { ...props, stage: 'explanation' }));
  assert.match(after, /Name the tense/);
  assert.doesNotMatch(after, /Next exercise/);
  assert.match(renderToStaticMarkup(createElement(SentencePrompt, { ...props, stage: 'complete' })), /Next exercise/);
});

test('disconnected voice is visible and start is explicit; mock evidence stays labeled', () => {
  const props = { state: 'offline' as const, muted: true, onStart() {}, onMute() {}, onStop() {} };
  const real = renderToStaticMarkup(createElement(VoiceControls, props));
  assert.match(real, /Voice disconnected/);
  assert.match(real, /Start voice/);
  assert.doesNotMatch(real, /Listening to you/);
  const mock = renderToStaticMarkup(createElement(VoiceControls, { ...props, mock: true }));
  assert.match(mock, /Mock session/);
  assert.match(mock, /Start mock session/);
});
