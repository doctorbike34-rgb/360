import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export async function confirmSubscriptionCheckout(sessionId: string): Promise<{
  success: boolean;
  pending?: boolean;
  planId?: string | null;
}> {
  const fn = httpsCallable<{ sessionId: string }, { success: boolean; pending?: boolean; planId?: string | null }>(
    functions,
    'confirmSubscriptionCheckout'
  );
  const result = await fn({ sessionId });
  return result.data;
}
