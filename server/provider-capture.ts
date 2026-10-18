import WebSocket from 'ws';
import type { BrokerBinding } from './broker/authority';
import type { DebugEvidence, DebugEvidencePolicy, DebugEvidenceSink } from './debug-evidence';
import { createDebugEvidenceRecorder } from './debug-evidence';

export interface CaptureSocket {
  on(event: 'message', listener: (data: unknown) => void): unknown;
  on(event: 'close' | 'error', listener: () => void): unknown;
  terminate(): void;
}
export interface ProviderCapture {
  start(binding: BrokerBinding, callId: string): { stop(): Promise<void> };
  shutdown(): Promise<void>;
}
const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_:.-]{1,200}$/.test(v);
/** Only completed text and fixed interaction labels cross the capture boundary. */
export function projectProviderEvidence(value: unknown): DebugEvidence | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const e = value as Record<string, unknown>;
  if (!id(e.event_id)) return null;
  if (e.type === 'conversation.item.input_audio_transcription.completed' || e.type === 'response.output_audio_transcript.done') {
    if (!id(e.item_id) || !Number.isSafeInteger(e.content_index) || (e.content_index as number) < 0
      || typeof e.transcript !== 'string' || e.transcript.length < 1 || e.transcript.length > 16000) return null;
    if (e.type === 'response.output_audio_transcript.done' && !id(e.response_id)) return null;
    return { eventId: e.event_id, kind: 'transcript', speaker: e.type.startsWith('conversation.') ? 'learner' : 'tutor', text: e.transcript };
  }
  const interactions: Record<string, { speaker: 'learner' | 'tutor'; text: string }> = {
    'input_audio_buffer.speech_started': { speaker: 'learner', text: 'Speech started' },
    'input_audio_buffer.speech_stopped': { speaker: 'learner', text: 'Speech stopped' },
    'output_audio_buffer.started': { speaker: 'tutor', text: 'Audio output started' },
    'output_audio_buffer.stopped': { speaker: 'tutor', text: 'Audio output stopped' },
    'output_audio_buffer.cleared': { speaker: 'tutor', text: 'Audio output cleared' },
  };
  const item = typeof e.type === 'string' && Object.hasOwn(interactions, e.type) ? interactions[e.type] : undefined;
  if (!item || !id(e.type === 'input_audio_buffer.speech_started' || e.type === 'input_audio_buffer.speech_stopped' ? e.item_id : e.response_id)) return null;
  return { eventId: e.event_id, kind: 'interaction', ...item };
}

/** Does not infer learner connectivity, create calls, fetch audio or replay missed events. */
export function createProviderCapture(options: {
  policy: DebugEvidencePolicy; sink: DebugEvidenceSink;
  connect(callId: string): CaptureSocket;
  synthetic: boolean;
  gap?: (segment: BrokerBinding['segment']) => void;
}): ProviderCapture {
  type Handle = { stop(): Promise<void>; supersede(): void };
  const active = new Map<string, Handle>();
  // Includes stopped/draining handles until their actual queue settles, even after timeout.
  const owned = new Set<Handle>();
  const recorders = new Map<string, { recorder: ReturnType<typeof createDebugEvidenceRecorder>; users: number }>();
  let shutdown = false;
  return {
    start(binding, callId) {
      if (shutdown || !/^[A-Za-z0-9_-]{1,200}$/.test(callId)) throw new Error('Invalid capture lifecycle.');
      const segment = { ...binding.segment }; const key = segment.sessionId;
      const recorderKey = JSON.stringify([segment.sessionId, segment.segmentId, segment.connectionEpoch]);
      if (owned.size >= 256) throw new Error('Capture capacity exhausted.');
      if (!recorders.has(recorderKey) && recorders.size >= 256) {
        const idle = [...recorders].find(([, entry]) => entry.users === 0);
        if (!idle) throw new Error('Capture capacity exhausted.');
        recorders.delete(idle[0]);
      }
      const entry = recorders.get(recorderKey) ?? { recorder: createDebugEvidenceRecorder(options.policy, options.sink), users: 0 };
      // LRU replay window: only fully drained, inactive entries can be evicted.
      recorders.delete(recorderKey); recorders.set(recorderKey, entry);
      const recorder = entry.recorder;
      const socket = options.connect(callId);
      active.get(key)?.supersede();
      entry.users++;
      let accepting = true; let draining = true; let superseded = false; let pending = 0; let queue = Promise.resolve(); let stopped: Promise<void> | undefined;
      const gap = () => { try { options.gap?.(segment); } catch { /* Metadata diagnostics must not break cleanup. */ } };
      const handle = { supersede() { superseded = true; void handle.stop(); }, stop() {
        if (stopped) return stopped;
        accepting = false; if (active.get(key) === handle) active.delete(key);
        stopped = new Promise<void>(resolve => {
          const timer = setTimeout(() => { draining = false; gap(); resolve(); }, 2000);
          void queue.finally(() => { clearTimeout(timer); entry.users--; owned.delete(handle); resolve(); });
        });
        try { socket.terminate(); } catch { gap(); }
        return stopped;
      } };
      owned.add(handle); active.set(key, handle);
      socket.on('message', raw => {
        if (!accepting || active.get(key) !== handle) return;
        // Size-check bytes before decoding; never retain raw provider payloads.
        if (!(typeof raw === 'string' || Buffer.isBuffer(raw)) || Buffer.byteLength(raw) > 65536) { gap(); return; }
        let event: DebugEvidence | null;
        try { event = projectProviderEvidence(JSON.parse(raw.toString())); } catch { gap(); return; }
        if (!event) return;
        if (pending >= 64) { gap(); return; }
        pending++;
        queue = queue.then(async () => {
          // Superseded epochs must not export queued content into a new visit.
          if (!draining || superseded) return;
          const result = await recorder.record(segment, event, options.synthetic, 'provider-observed');
          if (['invalid', 'conflict', 'blocked'].includes(result)) gap();
        }).catch(gap).finally(() => { pending--; });
      });
      const lost = () => { if (accepting) { gap(); void handle.stop(); } };
      socket.on('error', lost); socket.on('close', lost);
      return handle;
    },
    async shutdown() { shutdown = true; await Promise.all([...owned].map(handle => handle.stop())); },
  };
}

/** Fixed provider origin and server credential. Constructing the factory makes no connection. */
export function providerSidebandConnector(apiKey: string): (callId: string) => CaptureSocket {
  return callId => {
    if (!apiKey || !/^[A-Za-z0-9_-]{1,200}$/.test(callId)) throw new Error('Invalid sideband configuration.');
    return new WebSocket(`wss://api.openai.com/v1/realtime?call_id=${encodeURIComponent(callId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` }, maxPayload: 65536, handshakeTimeout: 10000,
      followRedirects: false, perMessageDeflate: false,
    });
  };
}
