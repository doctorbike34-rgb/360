/**
 * Distinguishes Firestore plan/billing quota errors from transient rate limits.
 * Paid Blaze plans can still hit per-second rate limits without hitting monthly quota.
 */
export function isFirestoreQuotaError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  const code = (error as { code?: string }).code;

  if (message.includes('rate limit') || message.includes('too many requests')) {
    return false;
  }

  if (code === 'resource-exhausted') {
    return (
      message.includes('quota') ||
      message.includes('billing') ||
      message.includes('plan limit')
    );
  }

  return message.includes('quota exceeded') || message.includes('quota limits');
}
