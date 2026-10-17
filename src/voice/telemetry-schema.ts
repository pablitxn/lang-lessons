/** Content-free telemetry contract. This is transport metadata, never learning evidence. */
export const OPERATIONS = ['assessment', 'hint', 'question', 'speak', 'transcription'] as const;
export const OUTCOMES = ['completed', 'failed', 'cancelled', 'incomplete', 'timeout'] as const;
export const TOKEN_FIELDS = ['inputTokens', 'outputTokens', 'totalTokens', 'cachedInputTokens',
  'inputAudioTokens', 'inputTextTokens', 'outputAudioTokens', 'outputTextTokens',
  'cachedInputAudioTokens', 'cachedInputTextTokens'] as const;
export type Operation = typeof OPERATIONS[number];
export type Outcome = typeof OUTCOMES[number];
export type TokenUsage = Partial<Record<typeof TOKEN_FIELDS[number], number>>;
export type TelemetryReport = { kind: 'session'; outcome: Outcome } | {
  kind: 'response'; sequence: number; operation: Operation; outcome: Outcome;
  durationMs: number; firstOutputMs?: number; usage?: TokenUsage;
};
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 100_000_000;
const duration = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 600_000;
export function parseTelemetryReport(value: unknown): TelemetryReport | null {
  if (!object(value) || !OUTCOMES.includes(value.outcome as Outcome)) return null;
  if (value.kind === 'session') return Object.keys(value).every(key => ['kind', 'outcome'].includes(key)) ? value as TelemetryReport : null;
  if (value.kind !== 'response' || !Object.keys(value).every(key => ['kind', 'sequence', 'operation', 'outcome', 'durationMs', 'firstOutputMs', 'usage'].includes(key))
    || !Number.isInteger(value.sequence) || Number(value.sequence) < 1 || Number(value.sequence) > 512
    || !OPERATIONS.includes(value.operation as Operation) || !duration(value.durationMs)) return null;
  if ('firstOutputMs' in value && (!duration(value.firstOutputMs) || value.firstOutputMs > value.durationMs)) return null;
  if ('usage' in value && (!object(value.usage) || Object.keys(value.usage).length === 0
    || !Object.entries(value.usage).every(([key, val]) => TOKEN_FIELDS.includes(key as typeof TOKEN_FIELDS[number]) && count(val)))) return null;
  return value as TelemetryReport;
}
