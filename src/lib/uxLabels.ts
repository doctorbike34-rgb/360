/** Etichette UX in italiano (stati tecnici, auth, guasti). */

export function getSosStatusLabel(status: string | undefined): string {
  switch (status) {
    case 'PENDING':
      return 'In attesa';
    case 'ACCEPTED':
      return 'Accettata';
    case 'IN_PROGRESS':
      return 'In corso';
    case 'COMPLETED':
      return 'Completata';
    case 'CANCELLED':
      return 'Annullata';
    case 'DISPUTED':
      return 'In contestazione';
    case 'REJECTED':
      return 'Rifiutata';
    default:
      return status || '—';
  }
}

export function translateAuthFieldError(message: string): string {
  const map: Record<string, string> = {
    'Email is required': 'Inserisci un indirizzo email valido',
    'Password must be at least 6 characters': 'La password deve avere almeno 6 caratteri',
    'Name must be at least 2 characters': 'Il nome deve avere almeno 2 caratteri',
    'Role is required': 'Seleziona un ruolo',
    'Invalid email': 'Email non valida',
  };
  return map[message] || message;
}

export function formatFaultTypeTitle(
  faultType: string | undefined,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  if (!faultType) return 'SOS';
  const key = `cyclist.${faultType.toLowerCase().replace(/_([a-z])/g, (_g, c: string) => c.toUpperCase())}`;
  const translated = t(key);
  if (translated !== key) return `SOS — ${translated}`;
  return `SOS — ${faultType.replace(/_/g, ' ')}`;
}
