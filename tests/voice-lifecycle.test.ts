import test from 'node:test';
import assert from 'node:assert/strict';
import { createRealtimeVoiceAdapter, type RealtimeDependencies } from '../src/voice/realtime';
import type { AttemptRef, VoiceEvent } from '../src/contracts';
import { verbContext } from './helpers/assessment-fixtures';

function fixture() {
  const events: VoiceEvent[] = [];
  const track = { enabled: true, stops: 0, stop() { this.stops++; } };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream;
  const channel = { readyState: 'open', onopen: null as (() => void) | null, onclose: null as (() => void) | null,
    onerror: null as (() => void) | null, onmessage: null, sent: [] as string[], closes: 0,
    send(value: string) { this.sent.push(value); }, close() { this.closes++; this.onclose?.(); } };
  const peer = { ontrack: null, onconnectionstatechange: null as (() => void) | null, connectionState: 'connected', closes: 0,
    addTrack() {}, createDataChannel: () => channel, createOffer: async () => ({ type: 'offer', sdp: 'v=0\r\noffer' }),
    setLocalDescription: async () => {}, setRemoteDescription: async () => { channel.onopen?.(); }, close() { this.closes++; } };
  const audio = { muted: true, autoplay: false, srcObject: null, pauses: 0, play: async () => {}, pause() { this.pauses++; } };
  let calls = 0; let releases = 0;
  const dependencies: RealtimeDependencies = {
    getUserMedia: async () => stream, createPeer: () => peer as unknown as RTCPeerConnection,
    createAudio: () => audio as unknown as HTMLAudioElement, origin: 'http://127.0.0.1:5174',
    fetch: async (url, init) => {
      if (url === 'http://127.0.0.1:5174/api/realtime/session/end') {
        releases++;
        assert.deepEqual(JSON.parse(String(init?.body)), { releaseToken: 'fixture-release-token-00000000000000' });
        assert.equal(init?.keepalive, true);
        return Response.json({ ended: true });
      }
      calls++; assert.equal(url, 'http://127.0.0.1:5174/api/realtime/session');
      assert.equal(new Headers(init?.headers).has('Authorization'), false);
      return Response.json({ sdp: 'v=0\r\nanswer', maxDurationSeconds: 600, releaseToken: 'fixture-release-token-00000000000000' });
    },
  };
  return { events, track, stream, channel, peer, audio, dependencies, calls: () => calls, releases: () => releases };
}
test('typed spelling works before voice starts and after it stops without microphone or provider activity', async () => {
  const f = fixture(); let media = 0;
  f.dependencies.getUserMedia = async () => { media++; return f.stream; };
  const adapter = createRealtimeVoiceAdapter({ dependencies: f.dependencies });
  const context = verbContext(); adapter.setContext(context); adapter.subscribe(event => f.events.push(event));
  const ref: AttemptRef = { ...context, obligation: 'spelling:past', attemptId: 'typed-1', revision: 1 };
  await adapter.submit({ ...context, inputId: 'typed-1', kind: 'typed', text: 'bought', attempts: [ref] });
  assert.equal(media, 0); assert.equal(f.calls(), 0);
  const first = f.events.find(event => event.type === 'assessment')!;
  assert.equal(first.batch.results[0]?.status, 'accepted');
  assert.deepEqual(first.batch.results[0]?.source, { kind: 'typed', inputId: 'typed-1' });
  await adapter.connect({ sessionId: context.sessionId, signal: new AbortController().signal });
  adapter.disconnect();
  await adapter.submit({ ...context, inputId: 'typed-2', kind: 'typed', text: 'buyed', attempts: [{ ...ref, attemptId: 'typed-2', revision: 2 }] });
  assert.equal(f.events.filter(event => event.type === 'assessment').at(-1)?.batch.results[0]?.status, 'incorrect');
  assert.equal(media, 1); assert.equal(f.calls(), 1); assert.equal(f.channel.sent.length, 0);
  assert.equal(f.events.some(event => event.type === 'error'), false);
});
test('offline typing rejects stale exercise identities and cannot certify oral obligations', async () => {
  const f = fixture(); const adapter = createRealtimeVoiceAdapter({ dependencies: f.dependencies });
  const context = verbContext(); adapter.setContext(context); adapter.subscribe(event => f.events.push(event));
  const ref: AttemptRef = { ...context, obligation: 'pronunciation:base', attemptId: 'typed-1', revision: 1 };
  await adapter.submit({ ...context, generation: 0, inputId: 'stale-input', kind: 'typed', text: 'buy', attempts: [ref] });
  await adapter.submit({ ...context, inputId: 'stale-ref', kind: 'typed', text: 'buy', attempts: [{ ...ref, generation: 0 }] });
  assert.equal(f.events.length, 0);
  await adapter.submit({ ...context, inputId: 'typed-oral', kind: 'typed', text: 'buy', attempts: [ref] });
  assert.equal(f.events.find(event => event.type === 'assessment')?.batch.results[0]?.status, 'uncertain');
  assert.equal(f.calls(), 0);
});
test('real adapter with mocked transport owns microphone mute and releases every resource once', async () => {
  const f = fixture(); const adapter = createRealtimeVoiceAdapter({ dependencies: f.dependencies });
  adapter.subscribe(event => f.events.push(event)); const abort = new AbortController();
  await adapter.connect({ sessionId: 's1', signal: abort.signal });
  assert.equal(f.calls(), 1); assert.ok(f.events.some(event => event.type === 'state' && event.state === 'ready'));
  adapter.setMuted(true); assert.equal(f.track.enabled, false);
  adapter.setMuted(false); assert.equal(f.track.enabled, true);
  abort.abort(); adapter.disconnect();
  assert.equal(f.track.stops, 1); assert.equal(f.peer.closes, 1); assert.equal(f.channel.closes, 1);
  assert.equal(f.audio.muted, true); assert.equal(f.audio.pauses, 1);
  assert.equal(f.releases(), 1);
});
test('a microphone result arriving after abort is stopped before any network call', async () => {
  const f = fixture(); let resolve!: (stream: MediaStream) => void;
  f.dependencies.getUserMedia = () => new Promise(r => { resolve = r; });
  const adapter = createRealtimeVoiceAdapter({ dependencies: f.dependencies }); const abort = new AbortController();
  const connection = adapter.connect({ sessionId: 's1', signal: abort.signal });
  await Promise.resolve();
  abort.abort(); resolve(f.stream);
  await assert.rejects(connection, { name: 'AbortError' });
  assert.equal(f.track.stops, 1); assert.equal(f.calls(), 0);
});
test('permission denial and a disabled broker leave no active media', async () => {
  const denied = fixture(); denied.dependencies.getUserMedia = async () => { throw new DOMException('Fixture denial', 'NotAllowedError'); };
  const adapter = createRealtimeVoiceAdapter({ dependencies: denied.dependencies }); adapter.subscribe(event => denied.events.push(event));
  await assert.rejects(adapter.connect({ sessionId: 's1', signal: new AbortController().signal }));
  assert.equal(denied.calls(), 0); assert.ok(denied.events.some(event => event.type === 'error' && event.code === 'permission'));
  const disabled = fixture(); disabled.dependencies.fetch = async () => new Response('{}', { status: 503 });
  const second = createRealtimeVoiceAdapter({ dependencies: disabled.dependencies });
  await assert.rejects(second.connect({ sessionId: 's2', signal: new AbortController().signal }));
  assert.equal(disabled.track.stops, 1); assert.equal(disabled.peer.closes, 1);
});
test('broker startup failures retain safe actionable errors without exposing response contents', async () => {
  const cases = [
    [401, /sign in again/i], [403, /account.*access/i], [409, /lesson.*changed/i],
    [429, /another.*call/i], [503, /unavailable/i], [502, /voice service/i],
  ] as const;
  for (const [status, message] of cases) {
    const f = fixture();
    f.dependencies.fetch = async () => Response.json({ error: 'PRIVATE_PROVIDER_RESPONSE' }, { status });
    const adapter = createRealtimeVoiceAdapter({ dependencies: f.dependencies });
    adapter.subscribe(event => f.events.push(event));
    await assert.rejects(adapter.connect({ sessionId: `failure-${status}`, signal: new AbortController().signal }), message);
    const error = f.events.find(event => event.type === 'error');
    assert.ok(error); assert.match(error.message, message);
    assert.doesNotMatch(error.message, /PRIVATE_PROVIDER_RESPONSE/);
    assert.equal(f.track.stops, 1); assert.equal(f.peer.closes, 1);
  }
});
test('SDP preparation and broker exchange do not consume the data channel connection timeout', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture();
  let offerReady!: () => void; let requestReady!: () => void;
  let finishOffer!: (offer: { type: string; sdp: string }) => void; let finishRequest!: (response: Response) => void;
  const preparing = new Promise<void>(resolve => { offerReady = resolve; });
  const requesting = new Promise<void>(resolve => { requestReady = resolve; });
  f.peer.createOffer = () => { offerReady(); return new Promise(resolve => { finishOffer = resolve; }); };
  const fetcher = f.dependencies.fetch;
  f.dependencies.fetch = (url, init) => {
    if (String(url).endsWith('/end')) return fetcher(url, init);
    requestReady(); return new Promise(resolve => { finishRequest = resolve; });
  };
  const adapter = createRealtimeVoiceAdapter({ dependencies: f.dependencies });
  t.after(() => adapter.disconnect());
  const connection = adapter.connect({ sessionId: 'delayed-negotiation', signal: new AbortController().signal });
  await preparing; t.mock.timers.tick(10000);
  finishOffer({ type: 'offer', sdp: 'v=0\r\noffer' });
  await requesting; t.mock.timers.tick(6000);
  finishRequest(Response.json({ sdp: 'v=0\r\nanswer', maxDurationSeconds: 600, releaseToken: 'fixture-release-token-00000000000000' }));
  await connection;
  assert.equal(f.track.stops, 0); assert.equal(f.peer.closes, 0);
});
test('a data channel that never opens still times out and releases the created call', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(); let remoteReady!: () => void;
  const answered = new Promise<void>(resolve => { remoteReady = resolve; });
  f.peer.setRemoteDescription = async () => { remoteReady(); };
  const adapter = createRealtimeVoiceAdapter({ dependencies: f.dependencies });
  adapter.subscribe(event => f.events.push(event));
  const connection = adapter.connect({ sessionId: 'channel-timeout', signal: new AbortController().signal });
  const rejected = assert.rejects(connection, /connection timed out/i);
  await answered; await Promise.resolve();
  t.mock.timers.tick(15000);
  await rejected;
  assert.equal(f.track.stops, 1); assert.equal(f.peer.closes, 1); assert.equal(f.releases(), 1);
  assert.ok(f.events.some(event => event.type === 'error' && /connection timed out/i.test(event.message)));
});
test('a late broker answer after cancellation is released without reconnecting media', async () => {
  const f = fixture(); let requestReady!: () => void; let finishRequest!: (response: Response) => void; let remoteDescriptions = 0;
  const requesting = new Promise<void>(resolve => { requestReady = resolve; });
  const fetcher = f.dependencies.fetch;
  f.dependencies.fetch = (url, init) => {
    if (String(url).endsWith('/end')) return fetcher(url, init);
    requestReady(); return new Promise(resolve => { finishRequest = resolve; });
  };
  f.peer.setRemoteDescription = async () => { remoteDescriptions++; f.channel.onopen?.(); };
  const adapter = createRealtimeVoiceAdapter({ dependencies: f.dependencies });
  adapter.subscribe(event => f.events.push(event));
  const abort = new AbortController();
  const connection = adapter.connect({ sessionId: 'cancelled-negotiation', signal: abort.signal });
  await requesting; abort.abort();
  finishRequest(Response.json({ sdp: 'v=0\r\nanswer', maxDurationSeconds: 600, releaseToken: 'fixture-release-token-00000000000000' }));
  await assert.rejects(connection, { name: 'AbortError' });
  assert.equal(f.track.stops, 1); assert.equal(f.peer.closes, 1); assert.equal(f.releases(), 1); assert.equal(remoteDescriptions, 0);
  assert.equal(f.events.some(event => event.type === 'state' && event.state === 'ready'), false);
});
test('cross-origin session endpoints fail before microphone permission or credentials', async () => {
  const f = fixture(); let media = 0;
  f.dependencies.getUserMedia = async () => { media++; return f.stream; };
  const adapter = createRealtimeVoiceAdapter({ sessionEndpoint: 'https://foreign.invalid/session', dependencies: f.dependencies });
  await assert.rejects(adapter.connect({ sessionId: 's1', signal: new AbortController().signal }));
  assert.equal(media, 0); assert.equal(f.calls(), 0);
});
test('a failed peer cleans media and does not reconnect or retry a paid session', async () => {
  const f = fixture(); const adapter = createRealtimeVoiceAdapter({ dependencies: f.dependencies });
  adapter.subscribe(event => f.events.push(event));
  await adapter.connect({ sessionId: 's1', signal: new AbortController().signal });
  f.peer.connectionState = 'failed'; f.peer.onconnectionstatechange?.();
  assert.equal(f.track.stops, 1); assert.equal(f.calls(), 1);
  assert.ok(f.events.some(event => event.type === 'state' && event.state === 'error'));
});

test('a new adapter waits for the previous call release before acquiring another microphone', async () => {
  const first = fixture(); const second = fixture(); let release!: () => void; let media = 0;
  const fetcher = first.dependencies.fetch;
  first.dependencies.fetch = async (url, init) => {
    if (String(url).endsWith('/end')) await new Promise<void>(resolve => { release = resolve; });
    return fetcher(url, init);
  };
  second.dependencies.getUserMedia = async () => { media++; return second.stream; };
  const oldAdapter = createRealtimeVoiceAdapter({ dependencies: first.dependencies });
  await oldAdapter.connect({ sessionId: 'first', signal: new AbortController().signal }); oldAdapter.disconnect();
  const nextAdapter = createRealtimeVoiceAdapter({ dependencies: second.dependencies });
  const next = nextAdapter.connect({ sessionId: 'second', signal: new AbortController().signal });
  await Promise.resolve(); assert.equal(media, 0); assert.equal(second.calls(), 0);
  release(); await next;
  assert.equal(media, 1); assert.equal(second.calls(), 1); assert.equal(first.releases(), 1); nextAdapter.disconnect();
});

test('a failed release blocks a new call and explicit retry closes the previous session first', async () => {
  const first = fixture(); let canRelease = false;
  const fetcher = first.dependencies.fetch;
  first.dependencies.fetch = async (url, init) => String(url).endsWith('/end') && !canRelease
    ? new Response('{}', { status: 502 }) : fetcher(url, init);
  const adapter = createRealtimeVoiceAdapter({ dependencies: first.dependencies });
  adapter.subscribe(event => first.events.push(event));
  await adapter.connect({ sessionId: 's1', signal: new AbortController().signal }); adapter.disconnect();
  await assert.rejects(adapter.connect({ sessionId: 's1', signal: new AbortController().signal }), /previous call/);
  assert.equal(first.calls(), 1);
  assert.ok(first.events.some(event => event.type === 'error' && /previous call/.test(event.message)));
  canRelease = true;
  await adapter.connect({ sessionId: 's1', signal: new AbortController().signal });
  assert.equal(first.calls(), 2); adapter.disconnect();
});
