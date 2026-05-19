import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export async function sanitizeAllLoyaltyPoints(): Promise<{ fixed: number; scanned: number }> {
  const fn = httpsCallable<unknown, { fixed?: number; scanned?: number }>(
    functions,
    'sanitizeAllLoyaltyPoints'
  );
  const res = await fn({});
  return { fixed: res.data.fixed ?? 0, scanned: res.data.scanned ?? 0 };
}

export async function runProductionReset(): Promise<Record<string, number>> {
  const fn = httpsCallable<unknown, { success: boolean; summary: Record<string, number> }>(
    functions,
    'productionReset'
  );
  const res = await fn({});
  return res.data.summary ?? {};
}
