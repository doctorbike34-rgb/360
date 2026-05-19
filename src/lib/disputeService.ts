import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export async function disputeSOS(sosId: string, reason?: string): Promise<{ ticketId: string }> {
  const fn = httpsCallable<
    { sosId: string; reason?: string },
    { success: boolean; ticketId: string; alreadyOpen?: boolean }
  >(functions, 'disputeSOS');
  const result = await fn({ sosId, reason });
  return { ticketId: result.data.ticketId };
}
