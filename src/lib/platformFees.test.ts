import { describe, it, expect } from 'vitest';
import {
  getSosPlatformFeePercent,
  PEER_MECHANIC_FEE_PERCENT,
  MECHANIC_PLAN_FEE_PERCENT,
} from './platformFees';

describe('platformFees', () => {
  it('applies 5% only to peer mechanics', () => {
    expect(getSosPlatformFeePercent('PEER_MECHANIC', 'BASE')).toBe(PEER_MECHANIC_FEE_PERCENT);
    expect(PEER_MECHANIC_FEE_PERCENT).toBe(0.05);
  });

  it('applies plan fees to professional mechanics', () => {
    expect(getSosPlatformFeePercent('MECHANIC', 'BASE')).toBe(MECHANIC_PLAN_FEE_PERCENT.BASE);
    expect(getSosPlatformFeePercent('MECHANIC', 'CLUB')).toBe(0.1);
    expect(getSosPlatformFeePercent('MECHANIC', 'PRO')).toBe(0.05);
  });
});
