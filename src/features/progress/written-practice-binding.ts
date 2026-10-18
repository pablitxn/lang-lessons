import type { WrittenPracticeBinding, WrittenPracticePort, WrittenPracticeSnapshot } from './written-snapshot';

/** Prevent construction/partial restore publications from replacing saved work. */
export function createWrittenPracticeBinding(binding: WrittenPracticeBinding | undefined) {
  let enabled = false;
  let last = '';
  function changed(snapshot: WrittenPracticeSnapshot) {
    if (!enabled || snapshot.userId !== binding?.userId) return;
    const encoded = JSON.stringify(snapshot);
    if (encoded === last) return;
    last = encoded; binding.onSnapshot?.(snapshot);
  }
  return {
    changed,
    attach(session: WrittenPracticePort) {
      const port: WrittenPracticePort = {
        snapshotWrittenPractice: () => session.snapshotWrittenPractice(),
        restoreWrittenPractice(snapshot) {
          enabled = false;
          const accepted = session.restoreWrittenPractice(snapshot);
          enabled = accepted;
          if (!accepted) binding?.onRestoreRejected?.();
          return accepted;
        },
      };
      enabled = binding?.initialSnapshot === undefined || port.restoreWrittenPractice(binding.initialSnapshot);
      const release = binding?.register(port);
      return () => { enabled = false; release?.(); };
    },
  };
}
