const SESSION_KEY = 'db360_stripe_session_id';
const RETURN_KEY = 'db360_stripe_return';

/** Salva session_id Stripe dall'URL prima che auth/landing cancellino il contesto. */
export function captureStripeReturnFromUrl(): {
  sessionId: string | null;
  returnTo: string | null;
  captured: boolean;
} {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session_id');
  const returnTo = params.get('stripe_return');

  if (sessionId) {
    sessionStorage.setItem(SESSION_KEY, sessionId);
    if (returnTo) sessionStorage.setItem(RETURN_KEY, returnTo);
    const path = window.location.pathname || '/';
    window.history.replaceState({}, document.title, path);
    return { sessionId, returnTo, captured: true };
  }

  return {
    sessionId: sessionStorage.getItem(SESSION_KEY),
    returnTo: sessionStorage.getItem(RETURN_KEY),
    captured: false,
  };
}

export function peekStripeSessionId(): string | null {
  return sessionStorage.getItem(SESSION_KEY);
}

export function clearStripeReturnStorage(): void {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(RETURN_KEY);
}
