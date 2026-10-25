import { TIMING, sameExercise, parseVoiceStartFailure, type ExerciseContext, type VoiceAdapter, type VoiceEvent, type VoiceStartFailureCategory } from '../contracts';
import { readBoundedJsonResponse } from '../platform/bounded-json';
import { assessSpelling } from '../assessment/spelling';
import { createRealtimeTelemetry, type RealtimeTelemetry } from './telemetry';
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
  channel?: RTCDataChannel; audio?: HTMLAudioElement; protocol?: RealtimeProtocol; telemetry?: RealtimeTelemetry;
  timer?: ReturnType<typeof setTimeout>; startedAt: number;
  endpoint?: string; releaseToken?: string; releaseRequested?: boolean;
}
class PreviousCallCloseError extends Error {
  constructor() { super('The previous call could not close. Retry to finish closing it before starting another.'); }
}
class VoiceStartError extends Error {
  constructor(message: string, readonly code: Extract<VoiceEvent, { type: 'error' }>['code'] = 'connection') { super(message); }
}
const providerFailureMessages: Record<VoiceStartFailureCategory, string> = {
  authentication: 'The voice service could not authenticate with its provider. Ask the administrator to check its credentials.',
  permission: 'The voice service is not permitted to create calls. Ask the administrator to check provider access.',
  quota: 'The voice service has reached its usage allowance. Ask the administrator to check credits and limits before retrying.',
  'credits-exhausted': 'The voice service has no API credit available. Ask the administrator to check billing before retrying.',
  'project-spend-limit': 'The voice service has reached its project spending limit. Ask the administrator to review it before retrying.',
  'organization-spend-limit': 'The voice service has reached its organization spending limit. Ask the administrator to review it before retrying.',
  'usage-limit': 'The voice service has reached its provider usage limit. Ask the administrator to review it before retrying.',
  'rate-limit': 'The voice provider is limiting requests right now. Wait before starting another call.',
  configuration: 'The voice provider rejected the call configuration. Ask the administrator to review the voice service.',
  'model-unavailable': 'The configured voice model is unavailable to this service. Ask the administrator to check model access.',
  unavailable: 'The voice provider is temporarily unavailable. Try again later.',
  rejected: 'The voice provider rejected this call. Ask the administrator to check the voice service before retrying.',
};
async function brokerStartError(response: Response) {
  // Only an allowlisted diagnostic can select a static message. Provider and
  // proxy text never enters the lesson, logs, or learning evidence.
  const status = response.status;
  if (status === 401) return new VoiceStartError('Your sign-in expired. Sign in again before starting the tutor.', 'configuration');
  if (status === 403) return new VoiceStartError('Your account does not have access to tutor calls.', 'configuration');
  if (status === 400 || status === 409) return new VoiceStartError('This lesson has changed. Reopen it before starting the tutor again.', 'configuration');
  if (status === 429) return new VoiceStartError('Another tutor call is still active. End it before starting a new call.');
  if (status === 503) return new VoiceStartError('Tutor calls are unavailable right now. Try again when the voice service is ready.', 'configuration');
  if (status === 502) {
    const body = await readBoundedJsonResponse(response);
    const failure = isObject(body) ? parseVoiceStartFailure(body.failure) : null;
    if (failure) return new VoiceStartError(providerFailureMessages[failure.category],
      ['rate-limit', 'unavailable', 'rejected'].includes(failure.category) ? 'connection' : 'configuration');
  }
  return new VoiceStartError('The voice service could not start this call. Please try again.');
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
  function cleanup(resource: Resources, outcome: 'completed' | 'failed' = 'completed') {
    if (resource.closed) { release(resource); return; }
    resource.closed = true; resource.ready = false; resource.controller.abort(); resource.releaseAbort();
    resource.telemetry?.close(outcome);
    resource.protocol?.dispose();
    if (resource.timer) clearTimeout(resource.timer);
    resource.channel?.close(); resource.peer?.close();
    resource.stream?.getTracks().forEach(track => track.stop());
    if (resource.audio) { resource.audio.muted = true; resource.audio.pause(); resource.audio.srcObject = null; }
    release(resource);
  }
  function failure(resource: Resources, message: string, code: Extract<VoiceEvent, { type: 'error' }>['code'] = 'connection') {
    if (!current(resource)) return;
    cleanup(resource, 'failed'); active = null;
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
          observeRequest(id, operation) { resource.telemetry?.start(id, operation); },
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
        channel.onmessage = event => {
          if (current(resource) && typeof event.data === 'string') {
            resource.telemetry?.receive(event.data); resource.protocol?.receive(event.data);
          }
        };
        peer.onconnectionstatechange = () => {
          if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected') failure(resource, 'Voice disconnected. Your local lesson progress is preserved.');
        };
        let startChannelTimeout = () => {};
        const opened = new Promise<void>((resolve, reject) => {
          let settled = false;
          let timeout: ReturnType<typeof setTimeout> | undefined;
          startChannelTimeout = () => {
            if (!settled) timeout = setTimeout(() => finish(new VoiceStartError('The voice connection timed out. Check your connection and try again.')), 15000);
          };
          const cancelled = () => finish(new DOMException('Session cancelled.', 'AbortError'));
          function finish(error?: Error) {
            if (settled) return;
            settled = true;
            if (timeout) clearTimeout(timeout);
            resource.controller.signal.removeEventListener('abort', cancelled);
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
          body: JSON.stringify({ sdp: offer.sdp, ...(options.segment ? { segment: options.segment } : {}) }), credentials: 'same-origin',
          signal: AbortSignal.any([resource.controller.signal, AbortSignal.timeout(15000)]) });
        if (!response.ok) throw await brokerStartError(response);
        const payload: unknown = await response.json();
        if (!isObject(payload) || typeof payload.sdp !== 'string' || !payload.sdp.startsWith('v=0')
          || payload.sdp.length > 60000 || !Number.isInteger(payload.maxDurationSeconds)
          || Number(payload.maxDurationSeconds) < 1 || Number(payload.maxDurationSeconds) > TIMING.maxVoiceSessionSeconds
          || typeof payload.releaseToken !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(payload.releaseToken)) throw new Error('The voice broker returned an invalid session.');
        resource.releaseToken = payload.releaseToken;
        if (!current(resource)) throw new DOMException('Session cancelled.', 'AbortError');
        if (typeof payload.telemetryReceipt === 'string' && /^[a-f0-9]{64}$/.test(payload.telemetryReceipt)) {
          resource.telemetry = createRealtimeTelemetry({ endpoint: new URL('/api/realtime/telemetry', endpoint).href,
            receipt: payload.telemetryReceipt, fetch: deps.fetch });
        }
        await peer.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
        // The channel cannot connect until its SDP answer has arrived. Offer
        // preparation and the separately bounded broker request get their own time.
        startChannelTimeout();
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
            : error instanceof PreviousCallCloseError || error instanceof VoiceStartError ? error.message : 'Voice could not start. Check the voice service and browser connection, then retry.',
          denied ? 'permission' : error instanceof VoiceStartError ? error.code : 'connection');
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
