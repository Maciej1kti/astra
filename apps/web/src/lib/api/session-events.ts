type SessionHandlers = {
  ended?: () => void;
  restored?: () => void;
  /** An owner of retained work asks for the pairing controls again. */
  reconnect?: () => void;
};
type SessionEvent = "ended" | "restored" | "reconnect";

export function publishSession(state: SessionEvent) {
  window.dispatchEvent(new Event(`session-${state}`));
}
export function subscribeSession(handlers: SessionHandlers) {
  const listeners = (["ended", "restored", "reconnect"] as const).map(
    (state) => [`session-${state}`, () => handlers[state]?.()] as const,
  );
  for (const [name, listener] of listeners)
    window.addEventListener(name, listener);
  return () => {
    for (const [name, listener] of listeners)
      window.removeEventListener(name, listener);
  };
}
