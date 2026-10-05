/** No usable HTTP exchange took place, so the request's outcome is unknown. */
export class TransportError extends Error {
  constructor(options?: ErrorOptions) {
    super(
      "Nie udało się połączyć z serwerem. Sprawdź połączenie i wynik oczekującego zapisu.",
      options,
    );
    this.name = "TransportError";
  }
}

/** A reply outside the JSON contract, such as a proxy's own error page. */
export class InvalidResponseError extends Error {
  status: number;
  constructor(status: number, options?: ErrorOptions) {
    super(
      `Serwer zwrócił nieprawidłową odpowiedź (${status}). Sprawdź połączenie i wynik oczekującego zapisu.`,
      options,
    );
    this.name = "InvalidResponseError";
    this.status = status;
  }
}
