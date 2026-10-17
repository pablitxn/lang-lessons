import { TIMING, sameExercise, type ExerciseContext, type VoiceAdapter, type VoiceEvent } from '../contracts';
import { assessSpelling } from '../assessment/spelling';
import { createRealtimeProtocol, isObject, type RealtimeProtocol } from './protocol';

export interface RealtimeDependencies {
  getUserMedia(): Promise<MediaStream>;
  createPeer(): RTCPeerConnection;
  createAudio(): HTMLAudioElement;
  fetch: typeof fetch;
  origin: string;
}
export interface RealtimeVoiceOptions {
  sessionEndpoint?: string;
  /** Test seam: injected transport is mocked evidence, never real-provider validation. */
  dependencies?: Partial<RealtimeDependencies>;
}
interface Resources {
  sessionId: string; controller: AbortController; closed: boolean; ready: boolean;
  releaseAbort: () => void; stream?: MediaStream; peer?: RTCPeerConnection;
  channel?: RTCDataChannel; audio?: HTMLAudioElement; protocol?: RealtimeProtocol;
  timer?: ReturnType<typeof setTimeout>; startedAt: number;
  endpoint?: string; releaseToken?: string; releaseRequested?: boolean;
}
class PreviousCallCloseError extends Error {
  constructor() { super('The previous call could not close. Retry to finish closing it before starting another.'); }
}
interface ReleaseTask { endpoint: string; run(): Promise<void> }
// Shared across adapter instances so selecting another lesson also waits for
// the preceding call to close. Tokens remain only in this in-memory queue.
const pendingReleases = new Set<ReleaseTask>();
function releaseSession(endpoint: string, releaseToken: string, request: typeof fetch) {
  let pending: Promise<void> | null = null;
  const task: ReleaseTask = { endpoint, run() {
    if (pending) return pending;
    pending = (async () => {
      try {
        const response = await request(`${endpoint}/end`, { method: 'POST', credentials: 'same-origin', keepalive: true,
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ releaseToken }), signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new PreviousCallCloseError();
        const body: unknown = await response.json();
        if (!isObject(body) || body.ended !== true) throw new PreviousCallCloseError();
        pendingReleases.delete(task);
      } catch { throw new PreviousCallCloseError(); }
    })().finally(() => { pending = null; });
    return pending;
  } };
  pendingReleases.add(task);
  // Cleanup is immediate locally. A failed release is retained and retried only
  // by the learner's next explicit start, before requesting media or a new call.
  void task.run().catch(() => {});
}
/** Native browser WebRTC through the same-origin SDP broker; no client API keys. */
export function createRealtimeVoiceAdapter(options: RealtimeVoiceOptions = {}): VoiceAdapter {
  const listeners = new Set<(event: VoiceEvent) => void>();
  let active: Resources | null = null;
  let context: ExerciseContext | null = null;
  let sequence = 0;
  const deps: RealtimeDependencies = {
    getUserMedia: () => navigator.mediaDevices.getUserMedia({ audio: true }),
    createPeer: () => new RTCPeerConnection(),
    createAudio: () => document.createElement('audio'), fetch: (...args) => fetch(...args),
    origin: typeof location === 'undefined' ? 'http://127.0.0.1:5174' : location.origin,
    ...options.dependencies,
  };
  const emit = (event: VoiceEvent) => { for (const listener of listeners) listener(event); };
  const base = (resource: Resources) => ({ sessionId: resource.sessionId, eventId: `rtc-${++sequence}` });
  const current = (resource: Resources) => active === resource && !resource.closed;
  function release(resource: Resources) {
    if (resource.releaseRequested || !resource.endpoint || !resource.releaseToken) return;
    resource.releaseRequested = true;
    releaseSession(resource.endpoint, resource.releaseToken, deps.fetch);
  }
  function cleanup(resource: Resources) {
    if (resource.closed) { release(resource); return; }
    resource.closed = true; resource.ready = false; resource.controller.abort(); resource.releaseAbort();
    resource.protocol?.dispose();
    if (resource.timer) clearTimeout(resource.timer);
    resource.channel?.close(); resource.peer?.close();
    resource.stream?.getTracks().forEach(track => track.stop());
    if (resource.audio) { resource.audio.muted = true; resource.audio.pause(); resource.audio.srcObject = null; }
    release(resource);
  }
  function failure(resource: Resources, message: string, code: Extract<VoiceEvent, { type: 'error' }>['code'] = 'connection') {
    if (!current(resource)) return;
    cleanup(resource); active = null;
    emit({ ...base(resource), type: 'error', code, retryable: true, message });
    emit({ ...base(resource), type: 'state', state: 'error' });
  }
  function protocol() {
    if (!active?.ready || !active.protocol) throw new Error('Start a voice session before submitting a response.');
    return active.protocol;
  }
  const adapter: VoiceAdapter = {
    mode: 'openai-realtime',
    async connect(options) {
      adapter.disconnect();
      const resource: Resources = { sessionId: options.sessionId, controller: new AbortController(), closed: false,
        ready: false, releaseAbort: () => {}, startedAt: performance.now() };
      if (options.signal.aborted) throw new DOMException('Session cancelled.', 'AbortError');
      active = resource;
      const abort = () => { if (active === resource) adapter.disconnect(); };
      options.signal.addEventListener('abort', abort, { once: true });
      resource.releaseAbort = () => options.signal.removeEventListener('abort', abort);
      emit({ ...base(resource), type: 'state', state: 'connecting' });
      try {
        const endpoint = new URL(optionsForEndpoint(), deps.origin);
        if (endpoint.origin !== deps.origin || endpoint.username || endpoint.password) throw new Error('A same-origin session endpoint is required.');
        resource.endpoint = endpoint.href;
        await Promise.all([...pendingReleases].filter(task => task.endpoint === endpoint.href).map(task => task.run()));
        if (!current(resource)) throw new DOMException('Session cancelled.', 'AbortError');
        const stream = await deps.getUserMedia();
        if (!current(resource)) { stream.getTracks().forEach(track => track.stop()); throw new DOMException('Session cancelled.', 'AbortError'); }
        resource.stream = stream;
        resource.peer = deps.createPeer(); resource.audio = deps.createAudio();
        const peer = resource.peer; const audio = resource.audio;
        audio.autoplay = true; audio.muted = true;
        peer.ontrack = event => { if (current(resource) && event.streams[0]) audio.srcObject = event.streams[0]; };
        for (const track of stream.getTracks()) peer.addTrack(track, stream);
        const channel = peer.createDataChannel('oai-events'); resource.channel = channel;
        resource.protocol = createRealtimeProtocol({ sessionId: resource.sessionId,
          send(message) { if (current(resource) && channel.readyState === 'open') channel.send(JSON.stringify(message)); },
          emit(event) {
            if (!current(resource)) return;
            if (event.type === 'error') failure(resource, event.message, event.code);
            else emit(event);
          },
          setAudioAllowed(allowed) {
            audio.muted = !allowed;
            if (allowed && current(resource)) void audio.play().catch(() => failure(resource, 'Browser audio playback was blocked. Start voice again.', 'permission'));
          },
        });
        if (context?.sessionId === resource.sessionId) resource.protocol.setContext(context);
        channel.onmessage = event => { if (current(resource) && typeof event.data === 'string') resource.protocol?.receive(event.data); };
        peer.onconnectionstatechange = () => {
          if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected') failure(resource, 'Voice disconnected. Your local lesson progress is preserved.');
        };
        const opened = new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => finish(new Error('Voice channel timed out.')), 15000);
          const cancelled = () => finish(new DOMException('Session cancelled.', 'AbortError'));
          function finish(error?: Error) {
            clearTimeout(timeout); resource.controller.signal.removeEventListener('abort', cancelled);
            if (error) reject(error); else resolve();
          }
          channel.onopen = () => finish();
          channel.onerror = () => {
            finish(new Error('Voice channel failed.'));
            if (resource.ready) failure(resource, 'The voice data channel failed. Please reconnect explicitly.');
          };
          channel.onclose = () => {
            finish(new Error('Voice channel closed.'));
            if (resource.ready) failure(resource, 'Voice disconnected. Please reconnect explicitly.');
          };
          resource.controller.signal.addEventListener('abort', cancelled, { once: true });
        });
        // Observe rejection immediately while the SDP exchange is still pending.
        void opened.catch(() => {});
        const offer = await peer.createOffer();
        if (!current(resource)) throw new DOMException('Session cancelled.', 'AbortError');
        await peer.setLocalDescription(offer);
        const response = await deps.fetch(endpoint.href, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sdp: offer.sdp }), credentials: 'same-origin',
          signal: AbortSignal.any([resource.controller.signal, AbortSignal.timeout(15000)]) });
        if (!response.ok) throw new Error(response.status === 503 ? 'The local voice broker is disabled or missing server credentials.' : 'The voice session broker could not start this session.');
        const payload: unknown = await response.json();
        if (!isObject(payload) || typeof payload.sdp !== 'string' || !payload.sdp.startsWith('v=0')
          || payload.sdp.length > 60000 || !Number.isInteger(payload.maxDurationSeconds)
          || Number(payload.maxDurationSeconds) < 1 || Number(payload.maxDurationSeconds) > TIMING.maxVoiceSessionSeconds
          || typeof payload.releaseToken !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(payload.releaseToken)) throw new Error('The voice broker returned an invalid session.');
        resource.releaseToken = payload.releaseToken;
        if (!current(resource)) throw new DOMException('Session cancelled.', 'AbortError');
        await peer.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
        await opened;
        if (!current(resource)) throw new DOMException('Session cancelled.', 'AbortError');
        resource.ready = true;
        resource.timer = setTimeout(() => {
          if (current(resource)) {
            emit({ ...base(resource), type: 'feedback', identity: context ?? { sessionId: resource.sessionId, exerciseId: '', generation: 0 }, text: 'The local voice time limit was reached.' });
            adapter.disconnect();
          }
        }, Number(payload.maxDurationSeconds) * 1000);
        emit({ ...base(resource), type: 'state', state: 'ready' });
        emit({ ...base(resource), type: 'microphone', muted: false });
      } catch (error) {
        if (current(resource)) {
          const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'NotFoundError');
          failure(resource, denied ? 'Microphone access was not available. Check browser permission and try again.'
            : error instanceof PreviousCallCloseError ? error.message : 'Voice could not start. Check the local broker and browser connection, then retry.', denied ? 'permission' : 'connection');
        } else cleanup(resource);
        throw error;
      }
    },
    setContext(next) { context = next; if (active?.sessionId === next.sessionId) active.protocol?.setContext(next); },
    async submit(input) {
      // Spelling is deterministic local evidence, including before voice starts
      // and while a call is paused or unavailable.
      if (input.kind === 'typed' && !active?.ready) {
        if (!context || !sameExercise(context, input) || !input.attempts.length
          || input.attempts.some(ref => !sameExercise(context!, ref))) return;
        const eventId = `rtc-local-${++sequence}`;
        emit({ sessionId: context.sessionId, eventId, type: 'assessment', batch: { ...context, eventId,
          results: input.attempts.map(ref => assessSpelling(context!, ref, input.text, input.inputId)) } });
        return;
      }
      protocol().submit(input);
    },
    async requestHint(request) { protocol().requestHint(request); },
    cancelPendingHints() { active?.protocol?.cancelPendingHints(); },
    async askQuestion(question) { protocol().askQuestion(question); },
    interrupt() { active?.protocol?.interrupt(); },
    setMuted(muted) {
      if (!active?.ready) return;
      active.stream?.getAudioTracks().forEach(track => { track.enabled = !muted; });
      emit({ ...base(active), type: 'microphone', muted });
    },
    disconnect() {
      const resource = active; if (!resource) return;
      active = null; cleanup(resource);
      emit({ ...base(resource), type: 'usage', elapsedMs: Math.max(0, performance.now() - resource.startedAt) });
      emit({ ...base(resource), type: 'state', state: 'offline' });
    },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
  function optionsForEndpoint() { return options.sessionEndpoint ?? '/api/realtime/session'; }
  return adapter;
}
