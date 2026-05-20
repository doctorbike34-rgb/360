import { describe, expect, it } from 'vitest';
import { navigationUrl } from './openNavigation';

describe('navigationUrl', () => {
  it('builds Google Maps directions URL', () => {
    expect(navigationUrl('google', 45.46, 9.19)).toContain('google.com/maps/dir');
    expect(navigationUrl('google', 45.46, 9.19)).toContain('45.46,9.19');
  });

  it('builds Apple Maps URL', () => {
    expect(navigationUrl('apple', 45.46, 9.19)).toContain('maps.apple.com');
  });

  it('builds Waze URL', () => {
    expect(navigationUrl('waze', 45.46, 9.19)).toContain('waze.com');
    expect(navigationUrl('waze', 45.46, 9.19)).toContain('navigate=yes');
  });
});
