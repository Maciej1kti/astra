type SessionHandlers = { ended?: () => void; restored?: () => void };

export function publishSession(state: "ended" | "restored") {
  window.dispatchEvent(new Event(`session-${state}`));
}
export function subscribeSession(handlers: SessionHandlers) {
  const ended = () => handlers.ended?.();
  const restored = () => handlers.restored?.();
  window.addEventListener("session-ended", ended);
  window.addEventListener("session-restored", restored);
  return () => {
    window.removeEventListener("session-ended", ended);
    window.removeEventListener("session-restored", restored);
  };
}
