const assert = require('node:assert/strict');

/** Test-only browser transport. No physical microphone or provider is used. */
async function installBrowserTransport(context, origin, options = {}) {
  const fixture = {
    enabled: options.enabled ?? true, sessionStatus: 200, statusRequests: 0,
    sessionRequests: 0, releaseRequests: 0, releaseStatus: 200, externalRequests: [],
    statusBarrier: null, sessionBarrier: null, releaseBarrier: null, progressBarrier: null, closeBarrier: null, learningCalls: [],
  };
  const sessions = new Map(); const operations = new Map(); const eventReceipts = new Map();
  let sequence = 0;
  await context.route('**/*', async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.origin !== origin) {
      fixture.externalRequests.push(request.url()); await route.abort(); return;
    }
    if (url.pathname === '/api/learning/config') {
      await route.fulfill({ status: 200, json: { accountsEnabled: options.accountsEnabled ?? true } }); return;
    }
    if (url.pathname === '/api/me') {
      await route.fulfill({ status: 200, json: { id: 'browser-fixture-student', role: 'student', capabilities: { granted: ['practice:own'] } } }); return;
    }
    // Mock only HTTP boundaries; main.tsx, account composition, durable queues,
    // lifecycle and navigation are the shipped implementations.
    if (url.pathname.startsWith('/api/learning/')) {
      fixture.learningCalls.push(url.pathname);
      if (url.pathname === '/api/learning/progress' && fixture.progressBarrier) await fixture.progressBarrier;
      if (url.pathname === '/api/learning/session/confirm-close' && fixture.closeBarrier) await fixture.closeBarrier;
      const body = request.method() === 'POST' ? request.postDataJSON() : null;
      const sessionId = body?.sessionId ?? url.searchParams.get('sessionId');
      let row = sessions.get(sessionId); let result;
      const snapshot = () => ({ sessionId, mode: row.mode, status: row.status, revision: row.revision });
      switch (url.pathname) {
        case '/api/learning/session/create': {
          if (operations.has(body.operationId)) { result = operations.get(body.operationId); break; }
          const id = `fixture-session-${++sequence}`;
          sessions.set(id, { mode: body.mode, status: 'open', revision: 0, journal: 0, epoch: 0, close: null });
          result = { sessionId: id, mode: body.mode, status: 'open', revision: 0 }; operations.set(body.operationId, result); break;
        }
        case '/api/learning/session': assert.ok(row); result = snapshot(); break;
        case '/api/learning/session/start-call': assert.equal(body.expectedRevision, row.revision); row.revision++; row.epoch++; result = { session: snapshot(), segment: { sessionId, segmentId: `fixture-segment-${++sequence}`, connectionEpoch: row.epoch } }; break;
        case '/api/learning/session/stop-call': assert.equal(body.expectedRevision, row.revision); row.revision++; result = snapshot(); break;
        case '/api/learning/session/confirm-close':
          assert.equal(body.expectedRevision, row.revision); assert.equal(body.finalProgress.journalRevision, row.journal);
          row.status = 'closed'; row.revision++; result = row.close = { sessionId, operationId: body.operationId, status: 'closed', revision: row.revision, feedback: row.epoch ? 'insufficient-evidence' : 'not-requested' }; break;
        case '/api/learning/session/close': result = row.close; break;
        case '/api/learning/usage/open': assert.ok(row); result = { streamId: `fixture-stream-${++sequence}` }; break;
        case '/api/learning/usage/written': result = { eventId: body.eventId, sequence: body.sequence, intervalId: null, observedAt: new Date().toISOString(), status: 'recorded' }; break;
        case '/api/learning/failed-feedback':
        case '/api/learning/open-sessions': result = { items: [], nextCursor: null }; break;
        case '/api/learning/recovery': assert.ok(row); result = { session: snapshot(), progress: { sessionId, journalRevision: row.journal }, activeSegments: [], feedback: null }; break;
        case '/api/learning/instance/issue': result = operations.get(body.operationId) ?? { sessionId, exerciseId: `fixture-instance-${++sequence}`, generation: 0 }; operations.set(body.operationId, result); break;
        case '/api/learning/progress': {
          assert.ok(row);
          const acknowledgments = body.map(event => {
            const previous = eventReceipts.get(event.eventId);
            if (previous) return { ...previous, status: 'duplicate' };
            const receipt = { eventId: event.eventId, status: 'accepted', committedRevision: ++row.journal }; eventReceipts.set(event.eventId, receipt); return receipt;
          });
          result = { status: 'committed', acknowledgments, current: { sessionId, journalRevision: row.journal } }; break;
        }
        default: throw new Error(`Unexpected learning fixture request: ${url.pathname}`);
      }
      await route.fulfill({ status: 200, json: result }); return;
    }
    if (url.pathname === '/api/realtime/status') {
      fixture.statusRequests += 1;
      if (fixture.statusBarrier) await fixture.statusBarrier;
      await route.fulfill({ status: 200, json: { enabled: fixture.enabled } }).catch(() => {}); return;
    }
    if (url.pathname === '/api/realtime/session') {
      fixture.sessionRequests += 1;
      assert.equal(request.method(), 'POST'); assert.match(request.postDataJSON().sdp, /^v=0/);
      if (fixture.sessionBarrier) await fixture.sessionBarrier;
      await route.fulfill({ status: fixture.sessionStatus, json: fixture.sessionStatus === 200
        ? { sdp: 'v=0\r\ns=Browser transport fixture\r\n', maxDurationSeconds: 600, releaseToken: 'fixture-release-token-00000000000000' }
        : { error: 'Test transport rejected this session.' } }).catch(() => {}); return;
    }
    if (url.pathname === '/api/realtime/session/end') {
      fixture.releaseRequests += 1;
      assert.equal(request.method(), 'POST');
      assert.equal(request.postDataJSON().releaseToken, 'fixture-release-token-00000000000000');
      if (fixture.releaseBarrier) await fixture.releaseBarrier;
      await route.fulfill({ status: fixture.releaseStatus, json: { ended: fixture.releaseStatus === 200 } }).catch(() => {}); return;
    }
    // Any future API path must be explicitly added to this test boundary.
    if (url.pathname.startsWith('/api/')) {
      await route.abort(); throw new Error(`Unexpected API request in browser fixture: ${url.pathname}`);
    }
    await route.continue();
  });
  await context.addInitScript(() => {
    const fixture = {
      mediaCalls: 0, tracks: [], peers: [], messages: [], pendingMedia: [], deferMedia: false, mediaError: null,
      resolveMedia() { this.pendingMedia.splice(0).forEach(resolve => resolve()); },
    };
    window.__voiceTransportFixture = fixture;
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
      fixture.mediaCalls += 1;
      if (fixture.mediaError) throw new DOMException('Test microphone permission was denied.', fixture.mediaError);
      if (fixture.deferMedia) await new Promise(resolve => fixture.pendingMedia.push(resolve));
      const track = { kind: 'audio', enabled: true, stopped: false, stop() { this.stopped = true; } };
      fixture.tracks.push(track);
      return { getTracks: () => [track], getAudioTracks: () => [track] };
    } });
    window.RTCPeerConnection = class {
      constructor() { this.closed = false; this.connectionState = 'new'; fixture.peers.push(this); }
      addTrack() {}
      createDataChannel() {
        this.channel = { readyState: 'connecting', send: value => fixture.messages.push(JSON.parse(value)),
          close() { this.readyState = 'closed'; this.onclose?.(); } };
        return this.channel;
      }
      async createOffer() { return { type: 'offer', sdp: 'v=0\r\ns=Browser transport fixture\r\n' }; }
      async setLocalDescription() {}
      async setRemoteDescription() {
        this.connectionState = 'connected'; this.channel.readyState = 'open'; this.channel.onopen?.();
      }
      close() { this.closed = true; this.connectionState = 'closed'; }
    };
    Math.random = () => 0;
  });
  return fixture;
}

async function inspectTransport(page) {
  return page.evaluate(() => {
    const fixture = window.__voiceTransportFixture;
    return { mediaCalls: fixture.mediaCalls,
      tracks: fixture.tracks.map(track => ({ enabled: track.enabled, stopped: track.stopped })),
      peers: fixture.peers.map(peer => ({ closed: peer.closed, channel: peer.channel?.readyState })) };
  });
}

module.exports = { installBrowserTransport, inspectTransport };
