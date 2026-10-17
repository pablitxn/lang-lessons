import { PhoenixTelemetry, readPhoenixConfig } from '../server/telemetry';

// Synthetic export only: this script never imports a provider client or opens voice.
async function main() {
  const config = readPhoenixConfig(process.env);
  if (!config) throw new Error('Enable a Phoenix collector before running the synthetic smoke.');
  const telemetry = new PhoenixTelemetry(config);
  try {
    const session = telemetry.open('synthetic-fixture-model', 600, true)!;
    session.setup('completed', 200);
    telemetry.accept(session.receipt, { kind: 'response', sequence: 1, operation: 'assessment', outcome: 'completed',
      durationMs: 12, usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 } });
    session.end('completed'); await telemetry.flush();
    if (telemetry.counters.exported !== 3 || telemetry.counters.failed > 0) throw new Error('Synthetic collector delivery failed.');
    console.log(JSON.stringify({ synthetic: true, project: config.project, spans: 3, collectorAccepted: true,
      phoenixReadbackVerified: false, providerCalls: 0 }));
  } finally { await telemetry.shutdown(); }
}
main().catch(() => { console.error('Synthetic telemetry smoke failed; check the server-only Phoenix configuration and collector connectivity.'); process.exitCode = 1; });
