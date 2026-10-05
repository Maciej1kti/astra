type Session<T> = {
  /** Changes whenever the session ends; a read from an earlier one is void. */
  generation: () => number;
  active: () => boolean;
  read: () => Promise<T>;
  apply: (value: T) => void;
};
export type PreferenceRead<T> = {
  generation: number;
  request: number;
  response: Promise<{ value: T } | { error: unknown }>;
};

/**
 * Preference reads travel beside bootstrap and beside each other. Only the
 * newest result of the session that started it is applied; an older reply is
 * still returned to its caller, and a reply for an ended session is dropped.
 */
export function preferenceReads<T>(session: Session<T>) {
  let latest = 0;
  function start(): PreferenceRead<T> {
    return {
      generation: session.generation(),
      request: ++latest,
      // Consume either outcome even if the caller fails first and never looks.
      response: session.read().then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      ),
    };
  }
  async function settle(read = start()): Promise<T | undefined> {
    const result = await read.response;
    if (!session.active() || read.generation !== session.generation())
      return undefined;
    if ("error" in result) throw result.error;
    if (read.request === latest) session.apply(result.value);
    return result.value;
  }
  return { start, settle };
}
