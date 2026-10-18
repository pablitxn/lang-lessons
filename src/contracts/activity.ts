import type { CallSegmentRef } from './session';

/** Instants, not client-supplied totals. Server ingestion must bind identities and clocks. */
export type ActivityInterval = {
  readonly intervalId: string; readonly sessionId: string;
  readonly startedAtMs: number; readonly endedAtMs: number;
} & (
  | { readonly kind: 'written'; readonly trust: 'client-reported' }
  | { readonly kind: 'tutor'; readonly trust: 'server-observed'; readonly segment: CallSegmentRef }
);
export interface ActivityProjection {
  /** Written visibility/input claims are not independently observed by the server. */
  readonly writtenMs: number;
  readonly tutorMs: number;
  /** Union, never writtenMs + tutorMs. */
  readonly totalMs: number;
  readonly writtenTrust: 'client-reported';
  readonly tutorTrust: 'server-observed';
}
