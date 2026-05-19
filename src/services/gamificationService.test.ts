import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gamificationService } from './gamificationService';
import { db } from '../lib/firebase';
import { doc, runTransaction, serverTimestamp, increment } from 'firebase/firestore';

vi.mock('../lib/firebase', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(),
  increment: vi.fn((n: number) => ({ __increment: n })),
  getDoc: vi.fn(),
  query: vi.fn(),
  collection: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
}));

describe('gamificationService.awardPoints', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(gamificationService, 'checkAndAwardBadges').mockResolvedValue(undefined);
  });

  it('updates points and calls checkAndAwardBadges when user exists', async () => {
    const mockUserRef = { id: 'user123' };
    vi.mocked(doc).mockReturnValue(mockUserRef as any);
    vi.mocked(serverTimestamp).mockReturnValue('mockTimestamp' as any);
    vi.mocked(increment).mockImplementation((n) => ({ __increment: n }) as any);

    const mockUserDoc = {
      exists: () => true,
      data: () => ({ points: 10, weeklyPoints: 5 }),
    };

    const mockTransaction = {
      get: vi.fn().mockResolvedValue(mockUserDoc),
      update: vi.fn(),
    };

    vi.mocked(runTransaction).mockImplementation(async (_db, updateFunction) => {
      await updateFunction(mockTransaction as any);
    });

    await gamificationService.awardPoints('user123', 'test_action', 5);

    expect(doc).toHaveBeenCalledWith(db, 'users', 'user123');
    expect(mockTransaction.get).toHaveBeenCalledWith(mockUserRef);
    expect(mockTransaction.update).toHaveBeenCalledWith(mockUserRef, {
      points: { __increment: 5 },
      weeklyPoints: { __increment: 5 },
      updatedAt: 'mockTimestamp',
    });
    expect(consoleLogSpy).toHaveBeenCalledWith('Awarded 5 points for test_action');
    expect(gamificationService.checkAndAwardBadges).toHaveBeenCalledWith('user123');
  });

  it('does nothing if user does not exist', async () => {
    const mockUserRef = { id: 'user123' };
    vi.mocked(doc).mockReturnValue(mockUserRef as any);

    const mockUserDoc = {
      exists: () => false,
      data: vi.fn(),
    };

    const mockTransaction = {
      get: vi.fn().mockResolvedValue(mockUserDoc),
      update: vi.fn(),
    };

    vi.mocked(runTransaction).mockImplementation(async (_db, updateFunction) => {
      await updateFunction(mockTransaction as any);
    });

    await gamificationService.awardPoints('user123', 'test_action', 5);

    expect(mockTransaction.get).toHaveBeenCalledWith(mockUserRef);
    expect(mockTransaction.update).not.toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith('Awarded 5 points for test_action');
    expect(gamificationService.checkAndAwardBadges).toHaveBeenCalledWith('user123');
  });

  it('uses increment when user exists but has no points yet', async () => {
    const mockUserRef = { id: 'user123' };
    vi.mocked(doc).mockReturnValue(mockUserRef as any);
    vi.mocked(serverTimestamp).mockReturnValue('mockTimestamp' as any);

    const mockUserDoc = {
      exists: () => true,
      data: () => ({}),
    };

    const mockTransaction = {
      get: vi.fn().mockResolvedValue(mockUserDoc),
      update: vi.fn(),
    };

    vi.mocked(runTransaction).mockImplementation(async (_db, updateFunction) => {
      await updateFunction(mockTransaction as any);
    });

    await gamificationService.awardPoints('user123', 'test_action', 5);

    expect(mockTransaction.update).toHaveBeenCalledWith(mockUserRef, {
      points: { __increment: 5 },
      weeklyPoints: { __increment: 5 },
      updatedAt: 'mockTimestamp',
    });
  });

  it('gracefully handles and logs errors if runTransaction throws', async () => {
    const error = new Error('Transaction failed');
    vi.mocked(runTransaction).mockRejectedValue(error);

    await gamificationService.awardPoints('user123', 'test_action', 5);

    expect(consoleErrorSpy).toHaveBeenCalledWith('Error awarding points:', error);
    expect(gamificationService.checkAndAwardBadges).not.toHaveBeenCalled();
  });
});
