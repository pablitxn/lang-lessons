import test from 'node:test';
import assert from 'node:assert/strict';
import { sentenceHintFailureMessage } from '../src/features/sentences/use-written-hint';

test('written hint errors distinguish access, throttling, configuration, timeout and validated output in Spanish', () => {
  const messages = [
    sentenceHintFailureMessage(403, 'access-denied'), sentenceHintFailureMessage(429, 'rate-limited'),
    sentenceHintFailureMessage(503, 'not-configured'), sentenceHintFailureMessage(504, 'timeout'),
    sentenceHintFailureMessage(502, 'invalid-response'), sentenceHintFailureMessage(502, 'provider-unavailable'),
    sentenceHintFailureMessage(0), sentenceHintFailureMessage(400, 'invalid-request'),
  ];
  assert.equal(new Set(messages).size, messages.length);
  assert.match(messages[0]!, /práctica ya no está activa/);
  assert.match(messages[1]!, /Esperá un minuto/);
  assert.match(messages[2]!, /necesita configuración/);
  assert.match(messages[3]!, /tardó demasiado/);
  assert.match(messages[4]!, /pista válida/);
  assert.match(messages[5]!, /servicio de pistas no está disponible/);
  assert.match(messages[6]!, /Revisá tu conexión/);
  assert.match(messages[7]!, /Revisá la frase/);
});

test('older broker responses and untrusted reason values never become user-visible provider errors', () => {
  for (const reason of [undefined, null, false, 42, {}, ['not-configured'], 'private key, prompt and provider message']) {
    assert.equal(sentenceHintFailureMessage(401, reason), sentenceHintFailureMessage(403));
    assert.equal(sentenceHintFailureMessage(429, reason), sentenceHintFailureMessage(429));
    assert.equal(sentenceHintFailureMessage(504, reason), sentenceHintFailureMessage(504));
    assert.equal(sentenceHintFailureMessage(502, reason), sentenceHintFailureMessage(502));
    assert.equal(sentenceHintFailureMessage(503, reason), sentenceHintFailureMessage(503));
    assert.doesNotMatch(sentenceHintFailureMessage(503, reason), /private|key|prompt|provider/i);
  }
  assert.equal(sentenceHintFailureMessage(502, 'not-configured'), sentenceHintFailureMessage(502), 'A reason must match its status');
  assert.equal(sentenceHintFailureMessage(403, 'not-configured'), sentenceHintFailureMessage(403), 'Authorization failures retain their status meaning');
});
