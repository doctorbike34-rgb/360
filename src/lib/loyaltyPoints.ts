/** Punti fedeltà sempre interi in DB e in UI. */
export function normalizeLoyaltyPointsValue(value: number | undefined | null): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

export function loyaltyPointsNeedSanitize(
  points?: number | null,
  weeklyPoints?: number | null
): boolean {
  const p = Number(points ?? 0);
  const w = Number(weeklyPoints ?? 0);
  return p !== normalizeLoyaltyPointsValue(p) || w !== normalizeLoyaltyPointsValue(w);
}

export function formatLoyaltyPoints(points: number): string {
  return String(normalizeLoyaltyPointsValue(points));
}
