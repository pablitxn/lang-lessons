export type FeedbackState = 'not-requested' | 'pending' | 'running' | 'succeeded' | 'failed' | 'insufficient-evidence';
export interface FeedbackJobRef { readonly sessionId: string; readonly jobId: string; readonly claimToken: string }
export interface ProfessorComment { readonly sessionId: string; readonly text: string; readonly provenanceVersion: string }
/** P2 must fence every complete/fail by the current claim; Q13 evidence payload is deliberately absent. */
export interface FeedbackRepository {
  claim(jobId: string): Promise<FeedbackJobRef | null>;
  complete(claim: FeedbackJobRef, comment: ProfessorComment): Promise<'stored' | 'stale'>;
  fail(claim: FeedbackJobRef): Promise<'recorded' | 'stale'>;
}
