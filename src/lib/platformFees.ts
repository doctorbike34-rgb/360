import type { UserPlan, UserRole } from '../types';

/** Commissione fissa 5% solo per ciclisti esperti (PEER_MECHANIC). */
export const PEER_MECHANIC_FEE_PERCENT = 0.05;

/** Meccanici professionisti: fee per piano abbonamento (BASE/CLUB/PRO). */
export const MECHANIC_PLAN_FEE_PERCENT: Record<UserPlan, number> = {
  MECHANIC_FREE: 0.15,
  BASE: 0.15,
  CLUB: 0.1,
  PRO: 0.05,
};

export function getSosPlatformFeePercent(role: UserRole | string | undefined, plan: string | undefined): number {
  if (role === 'PEER_MECHANIC') return PEER_MECHANIC_FEE_PERCENT;
  const p = (plan || 'BASE') as UserPlan;
  return MECHANIC_PLAN_FEE_PERCENT[p] ?? 0.15;
}

export function formatFeePercentLabel(percent: number): string {
  return `${Math.round(percent * 100)}%`;
}
