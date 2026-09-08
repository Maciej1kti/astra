export type Invalidation = {
  kind?: string;
  project_id?: string;
  tags_changed?: boolean;
  target?: { type?: string; id?: string };
};

/** Trailing coalescing with an independent maximum delay during event bursts. */
export function invalidationBatch(
  flush: (events: Invalidation[]) => void,
  delay = 150,
  maxWait = 500,
) {
  let events: Invalidation[] = [];
  let trailing: ReturnType<typeof setTimeout> | undefined,
    deadline: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    clearTimeout(trailing);
    clearTimeout(deadline);
    trailing = deadline = undefined;
    events = [];
  };
  const run = () => {
    const batch = events;
    cancel();
    if (batch.length) flush(batch);
  };
  return {
    push(event: Invalidation) {
      // Store only relevant identity, never source content; bounding also handles floods.
      if (events.length < 100) events.push(event);
      else events = [{ kind: "resync_required" }];
      clearTimeout(trailing);
      trailing = setTimeout(run, delay);
      deadline ??= setTimeout(run, maxWait);
    },
    cancel,
  };
}
