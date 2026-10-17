const assert = require('node:assert/strict');

/** Test-only browser transport. No physical microphone or provider is used. */
async function installBrowserTransport(context, origin, options = {}) {
  const fixture = {
    enabled: options.enabled ?? true, sessionStatus: 200, statusRequests: 0,
    sessionRequests: 0, releaseRequests: 0, releaseStatus: 200, externalRequests: [],
    statusBarrier: null, sessionBarrier: null, releaseBarrier: null,
  };
  await context.route('**/*', async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.origin !== origin) {
      fixture.externalRequests.push(request.url()); await route.abort(); return;
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
