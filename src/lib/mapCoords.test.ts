import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAP_CENTER,
  getLatLngFromRecord,
  isValidLatLngPair,
  mapCenterOrDefault,
} from './mapCoords';

describe('mapCoords', () => {
  it('rejects invalid pairs', () => {
    expect(isValidLatLngPair(null)).toBe(false);
    expect(isValidLatLngPair([45, undefined as unknown as number])).toBe(false);
    expect(isValidLatLngPair([NaN, 9] as [number, number])).toBe(false);
  });

  it('falls back when coords are invalid', () => {
    expect(mapCenterOrDefault([undefined, undefined] as unknown as [number, number])).toEqual(
      DEFAULT_MAP_CENTER
    );
    expect(mapCenterOrDefault([45.5, 9.2])).toEqual([45.5, 9.2]);
  });

  it('reads nested location fields', () => {
    expect(
      getLatLngFromRecord({
        location: { latitude: 45.1, longitude: 9.1 },
      })
    ).toEqual([45.1, 9.1]);
  });
});
