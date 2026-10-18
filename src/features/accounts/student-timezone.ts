import type { ReadResult } from './access';

/** Feature adapter mirrors the P2 own-setting seam; root owns HTTP validation. */
export interface StudentTimeZone { readonly timeZone: string; readonly revision: number; readonly effectiveAt: string }
export interface StudentTimeZoneRequest { readonly operationId: string; readonly expectedRevision: number; readonly timeZone: string }
export type StudentTimeZoneResult = ReadResult<StudentTimeZone> | { readonly status: 'conflict' | 'invalid-input' };
export interface StudentTimeZoneApi {
  read(signal: AbortSignal): Promise<ReadResult<StudentTimeZone | null>>;
  set(input: StudentTimeZoneRequest, signal: AbortSignal): Promise<StudentTimeZoneResult>;
}
/** Validate an explicit selection only. Never resolve the browser's default timezone. */
export function canonicalStudentTimeZone(value: string): string | null {
  if (value.length > 128 || !(value === 'UTC' || /^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)+$/u.test(value))) return null;
  try { return new Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions().timeZone; }
  catch { return null; }
}
