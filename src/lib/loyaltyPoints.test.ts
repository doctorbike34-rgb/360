import { describe, it, expect } from 'vitest';
import {
  formatLoyaltyPoints,
  loyaltyPointsNeedSanitize,
  normalizeLoyaltyPointsValue,
} from './loyaltyPoints';

describe('loyaltyPoints', () => {
  it('normalizes to integers', () => {
    expect(normalizeLoyaltyPointsValue(12.7)).toBe(13);
    expect(normalizeLoyaltyPointsValue(12.3)).toBe(12);
    expect(formatLoyaltyPoints(150.99)).toBe('151');
  });

  it('detects fractional stored values', () => {
    expect(loyaltyPointsNeedSanitize(10, 5)).toBe(false);
    expect(loyaltyPointsNeedSanitize(10.5, 5)).toBe(true);
    expect(loyaltyPointsNeedSanitize(10, 3.2)).toBe(true);
  });
});
