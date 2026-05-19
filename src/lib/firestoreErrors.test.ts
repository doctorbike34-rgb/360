import { describe, it, expect } from 'vitest';
import { isFirestoreQuotaError } from './firestoreErrors';

describe('isFirestoreQuotaError', () => {
  it('detects quota exceeded messages', () => {
    expect(isFirestoreQuotaError(new Error('Quota exceeded'))).toBe(true);
    expect(isFirestoreQuotaError(new Error('quota limits reached'))).toBe(true);
  });

  it('detects resource-exhausted with billing/quota wording', () => {
    const err = new Error('billing quota for project exceeded');
    (err as { code?: string }).code = 'resource-exhausted';
    expect(isFirestoreQuotaError(err)).toBe(true);
  });

  it('ignores rate limits on resource-exhausted', () => {
    const err = new Error('Rate limit exceeded');
    (err as { code?: string }).code = 'resource-exhausted';
    expect(isFirestoreQuotaError(err)).toBe(false);
  });

  it('ignores permission errors', () => {
    const err = new Error('Missing or insufficient permissions');
    (err as { code?: string }).code = 'permission-denied';
    expect(isFirestoreQuotaError(err)).toBe(false);
  });
});
