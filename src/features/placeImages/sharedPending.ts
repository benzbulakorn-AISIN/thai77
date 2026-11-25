/**
 * Share one asynchronous batch between every consumer interested in the same
 * keys. A later consumer can join work started by an effect that has already
 * been cleaned up (notably React StrictMode's development remount).
 */
export function joinPendingBatch(
  pending: Map<string, Promise<void>>,
  keys: readonly string[],
  start: (freshKeys: readonly string[]) => Promise<void>,
): Promise<void> {
  const fresh = keys.filter((key) => !pending.has(key));
  if (fresh.length) {
    let work: Promise<void>;
    work = start(fresh).finally(() => {
      fresh.forEach((key) => {
        if (pending.get(key) === work) pending.delete(key);
      });
    });
    fresh.forEach((key) => pending.set(key, work));
  }

  const waits = new Set<Promise<void>>();
  keys.forEach((key) => {
    const work = pending.get(key);
    if (work) waits.add(work);
  });
  return Promise.allSettled([...waits]).then(() => undefined);
}
