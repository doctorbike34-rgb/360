/** Allineato a src/lib/platformFees.ts — 5% solo ciclista esperto. */
export const PEER_MECHANIC_FEE_PERCENT = 0.05;

/** Meccanico pro: fee per piano abbonamento. */
export const MECHANIC_PLAN_FEE_PERCENT: Record<string, number> = {
  MECHANIC_FREE: 0.15,
  BASE: 0.15,
  CLUB: 0.1,
  PRO: 0.05,
};

export function getSosPlatformFeePercent(role: string | undefined, plan: string | undefined): number {
  if (role === 'PEER_MECHANIC') return PEER_MECHANIC_FEE_PERCENT;
  return MECHANIC_PLAN_FEE_PERCENT[plan || 'BASE'] ?? 0.15;
}
