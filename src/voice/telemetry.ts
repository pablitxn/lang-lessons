import { isObject } from './protocol';
import type { Operation, Outcome, TelemetryReport, TokenUsage } from './telemetry-schema';

interface Pending { sequence: number; operation: Operation; startedAt: number; firstOutputMs?: number; responseId?: string; timer: ReturnType<typeof setTimeout> }
export interface RealtimeTelemetry {
  start(id: string, operation: Operation): void;
  receive(raw: string): void;
  close(outcome: Outcome): void;
  flush(): Promise<void>;
}
/** Only allowlisted numeric metrics leave this module. Provider content is never relayed. */
export function createRealtimeTelemetry(options: { endpoint: string; receipt: string; fetch: typeof fetch; now?: () => number }): RealtimeTelemetry {
  const pending = new Map<string, Pending>();
  const seen = new Set<string>();
  const queue: TelemetryReport[] = [];
  const now = options.now ?? (() => performance.now());
  let sequence = 0; let closed = false; let sending: Promise<void> | undefined;
  const elapsed = (entry: Pending) => Math.max(0, Math.min(600_000, now() - entry.startedAt));
  function pump() {
    if (sending) return;
    sending = (async () => {
      while (queue.length) {
        const report = queue.shift()!;
        try {
          await options.fetch(options.endpoint, { method: 'POST', credentials: 'same-origin', keepalive: true,
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ receipt: options.receipt, report }),
            signal: AbortSignal.timeout(2500) });
        } catch { /* Bounded, best-effort telemetry never changes learning or reconnects voice. */ }
      }
    })().finally(() => { sending = undefined; if (queue.length) pump(); });
  }
  function enqueue(report: TelemetryReport) {
    if (queue.length >= 64) {
      if (report.kind !== 'session') return;
      queue.shift();
    }
    queue.push(report); pump();
  }
  function finish(id: string, outcome: Outcome, usage?: TokenUsage) {
    const entry = pending.get(id); if (!entry) return;
    clearTimeout(entry.timer); pending.delete(id);
    enqueue({ kind: 'response', sequence: entry.sequence, operation: entry.operation, outcome, durationMs: elapsed(entry),
      ...(entry.firstOutputMs === undefined ? {} : { firstOutputMs: entry.firstOutputMs }), ...(usage ? { usage } : {}) });
  }
  const telemetry: RealtimeTelemetry = {
    start(id, operation) {
      if (closed || id.length > 256 || seen.has(id) || pending.size >= 16 || sequence >= 512) return;
      seen.add(id);
      pending.set(id, { sequence: ++sequence, operation, startedAt: now(),
        timer: setTimeout(() => finish(id, 'timeout'), operation === 'transcription' ? 600_000 : 20_000) });
    },
    receive(raw) {
      if (closed || raw.length > 1_000_000) return;
      let event: unknown; try { event = JSON.parse(raw); } catch { return; }
      if (!isObject(event)) return;
      if (event.type === 'input_audio_buffer.speech_started' && typeof event.item_id === 'string') {
        telemetry.start(`audio:${event.item_id}`, 'transcription'); return;
      }
      if (event.type === 'input_audio_buffer.speech_stopped' && typeof event.item_id === 'string') {
        const id = `audio:${event.item_id}`; const entry = pending.get(id);
        if (entry) { clearTimeout(entry.timer); entry.timer = setTimeout(() => finish(id, 'timeout'), 20_000); }
        return;
      }
      if (typeof event.type === 'string' && ['conversation.item.input_audio_transcription.completed', 'conversation.item.input_audio_transcription.failed'].includes(event.type)
        && typeof event.item_id === 'string') {
        finish(`audio:${event.item_id}`, event.type.endsWith('completed') ? 'completed' : 'failed', usageFrom(event.usage)); return;
      }
      if (event.type === 'response.created' && isObject(event.response) && isObject(event.response.metadata)) {
        const id = event.response.metadata.request_id;
        if (typeof id === 'string' && typeof event.response.id === 'string' && event.response.id.length <= 256) {
          const entry = pending.get(id); if (entry && entry.responseId === undefined) entry.responseId = event.response.id;
        }
      } else if (event.type === 'response.done' && isObject(event.response) && isObject(event.response.metadata)) {
        const id = event.response.metadata.request_id;
        const entry = typeof id === 'string' ? pending.get(id) : undefined;
        if (!entry || typeof id !== 'string' || typeof event.response.id !== 'string'
          || entry.responseId !== undefined && entry.responseId !== event.response.id) return;
        const status = event.response.status;
        if (status !== 'completed' && status !== 'failed' && status !== 'cancelled' && status !== 'incomplete') return;
        finish(id, status, usageFrom(event.response.usage));
      } else if (['response.output_text.delta', 'response.text.delta', 'response.output_audio.delta', 'response.audio.delta'].includes(String(event.type))) {
        for (const entry of pending.values()) if (entry.responseId === event.response_id && entry.responseId !== undefined && entry.firstOutputMs === undefined) entry.firstOutputMs = elapsed(entry);
      }
    },
    close(outcome) {
      if (closed) return; closed = true;
      const finalOutcome = pending.size > 0 && outcome === 'completed' ? 'incomplete' : outcome;
      for (const id of pending.keys()) finish(id, 'incomplete');
      enqueue({ kind: 'session', outcome: finalOutcome });
    },
    async flush() { while (sending) await sending; },
  };
  return telemetry;
}
function usageFrom(value: unknown): TokenUsage | undefined {
  if (!isObject(value)) return undefined;
  const usage: TokenUsage = {};
  function add(key: keyof TokenUsage, val: unknown) {
    if (typeof val === 'number' && Number.isSafeInteger(val) && val >= 0 && val <= 100_000_000) usage[key] = val;
  }
  add('inputTokens', value.input_tokens); add('outputTokens', value.output_tokens); add('totalTokens', value.total_tokens);
  if (isObject(value.input_token_details)) {
    add('cachedInputTokens', value.input_token_details.cached_tokens);
    add('inputAudioTokens', value.input_token_details.audio_tokens); add('inputTextTokens', value.input_token_details.text_tokens);
    if (isObject(value.input_token_details.cached_tokens_details)) {
      add('cachedInputAudioTokens', value.input_token_details.cached_tokens_details.audio_tokens);
      add('cachedInputTextTokens', value.input_token_details.cached_tokens_details.text_tokens);
    }
  }
  if (isObject(value.output_token_details)) {
    add('outputAudioTokens', value.output_token_details.audio_tokens); add('outputTextTokens', value.output_token_details.text_tokens);
  }
  return Object.keys(usage).length ? usage : undefined;
}
