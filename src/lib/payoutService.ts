import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export async function requestEurPayout(params: {
  amountEur: number;
  iban: string;
  accountHolder: string;
}): Promise<{ payoutId: string }> {
  const fn = httpsCallable<
    { amountEur: number; iban: string; accountHolder: string },
    { success: boolean; payoutId: string }
  >(functions, 'requestEurPayout');
  const result = await fn(params);
  return { payoutId: result.data.payoutId };
}

export async function processEurPayout(params: {
  payoutId: string;
  action: 'PAID' | 'REJECT';
  rejectionReason?: string;
}): Promise<void> {
  const fn = httpsCallable(functions, 'processEurPayout');
  await fn(params);
}
