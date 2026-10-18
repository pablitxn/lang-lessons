/** Metadata-only P6 linkage for the separately owned Phoenix transcript traces.
 * Routing is explicit; this module opens no connection and captures no content.
 * Never pass claim tokens, evidence, audio, exceptions or provider responses. */
export interface FeedbackTraceEvent {
  readonly operation: 'session-feedback';
  readonly jobId: string;
  readonly sessionId?: string;
  readonly outcome: 'blocked' | 'not-claimed' | 'stored' | 'failed' | 'insufficient-evidence' | 'stale' | 'repository-error';
}

export interface FeedbackTelemetry {
  /** Integrator-approved Phoenix destination alias; never a credential or URL. */
  readonly route: string;
  /** Sink must whitelist attributes, redact secrets and enforce trace access.
   * This event intentionally contains no transcript or arbitrary payload fields. */
  publish(route: string, event: FeedbackTraceEvent): Promise<void>;
}

export async function traceFeedback(telemetry: FeedbackTelemetry | undefined, event: FeedbackTraceEvent): Promise<void> {
  if (!telemetry || !telemetry.route.trim()) return;
  try {
    await telemetry.publish(telemetry.route, event);
  } catch {
    // Observability failure cannot overwrite the stored outcome or trigger retry.
    // Do not log an exporter error: it can contain credentials or payloads.
  }
}
