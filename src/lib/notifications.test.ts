import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { requestNotificationPermission } from './notifications';

vi.mock('./firebase', () => ({
  auth: { currentUser: null },
  db: {},
  getFCM: vi.fn(),
}));

vi.mock('firebase/messaging', () => ({
  getToken: vi.fn(),
  onMessage: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  updateDoc: vi.fn(),
  arrayUnion: vi.fn(),
}));

describe('requestNotificationPermission throttling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1000000)); // Set an initial time > 60000 to avoid issues with initial 0
    vi.stubGlobal('Notification', {
      requestPermission: vi.fn().mockResolvedValue('denied')
    });
    vi.stubGlobal('window', {
      Notification: {}
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('should throttle requests made within 60 seconds', async () => {
    // First call, should call requestPermission
    await requestNotificationPermission();
    expect(Notification.requestPermission).toHaveBeenCalledTimes(1);

    // Immediate second call, should be throttled
    const result2 = await requestNotificationPermission();
    expect(result2).toBeNull();
    expect(Notification.requestPermission).toHaveBeenCalledTimes(1);

    // Advance 30s
    vi.advanceTimersByTime(30000);
    const result3 = await requestNotificationPermission();
    expect(result3).toBeNull();
    expect(Notification.requestPermission).toHaveBeenCalledTimes(1);

    // Advance 30s more (total 60s)
    vi.advanceTimersByTime(30000);
    await requestNotificationPermission();
    expect(Notification.requestPermission).toHaveBeenCalledTimes(2);
  });
});
