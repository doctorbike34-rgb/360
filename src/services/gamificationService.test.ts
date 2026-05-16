import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gamificationService } from './gamificationService';
import { db } from '../lib/firebase';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';

// Mock dependencies
vi.mock('../lib/firebase', () => ({
  db: {}
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(),
  getDoc: vi.fn(),
  query: vi.fn(),
  collection: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn()
}));

describe('gamificationService.awardPoints', () => {
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    // Prevent console output during tests
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Spy on checkAndAwardBadges
    vi.spyOn(gamificationService, 'checkAndAwardBadges').mockResolvedValue(undefined);
  });

  it('updates points and calls checkAndAwardBadges when user exists', async () => {
    const mockUserRef = { id: 'user123' };
    vi.mocked(doc).mockReturnValue(mockUserRef as any);
    vi.mocked(serverTimestamp).mockReturnValue('mockTimestamp' as any);

    const mockData = { points: 10, weeklyPoints: 5 };
    const mockUserDoc = {
      exists: () => true,
      data: () => mockData
    };

    const mockTransaction = {
      get: vi.fn().mockResolvedValue(mockUserDoc),
      update: vi.fn()
    };

    vi.mocked(runTransaction).mockImplementation(async (db, updateFunction) => {
      await updateFunction(mockTransaction as any);
    });

    await gamificationService.awardPoints('user123', 'test_action', 5);

    expect(doc).toHaveBeenCalledWith(db, 'users', 'user123');
    expect(mockTransaction.get).toHaveBeenCalledWith(mockUserRef);
    expect(mockTransaction.update).toHaveBeenCalledWith(mockUserRef, {
      points: 15,
      weeklyPoints: 10,
      updatedAt: 'mockTimestamp'
    });
    expect(consoleLogSpy).toHaveBeenCalledWith('Awarded 5 points for test_action');
    expect(gamificationService.checkAndAwardBadges).toHaveBeenCalledWith('user123');
  });

  it('does nothing if user does not exist', async () => {
    const mockUserRef = { id: 'user123' };
    vi.mocked(doc).mockReturnValue(mockUserRef as any);

    const mockUserDoc = {
      exists: () => false,
      data: vi.fn()
    };

    const mockTransaction = {
      get: vi.fn().mockResolvedValue(mockUserDoc),
      update: vi.fn()
    };

    vi.mocked(runTransaction).mockImplementation(async (db, updateFunction) => {
      await updateFunction(mockTransaction as any);
    });

    await gamificationService.awardPoints('user123', 'test_action', 5);

    expect(mockTransaction.get).toHaveBeenCalledWith(mockUserRef);
    expect(mockTransaction.update).not.toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith('Awarded 5 points for test_action');
    expect(gamificationService.checkAndAwardBadges).toHaveBeenCalledWith('user123');
  });

  it('defaults to 0 points when user exists but has no points yet', async () => {
    const mockUserRef = { id: 'user123' };
    vi.mocked(doc).mockReturnValue(mockUserRef as any);
    vi.mocked(serverTimestamp).mockReturnValue('mockTimestamp' as any);

    const mockData = {}; // No points or weeklyPoints
    const mockUserDoc = {
      exists: () => true,
      data: () => mockData
    };

    const mockTransaction = {
      get: vi.fn().mockResolvedValue(mockUserDoc),
      update: vi.fn()
    };

    vi.mocked(runTransaction).mockImplementation(async (db, updateFunction) => {
      await updateFunction(mockTransaction as any);
    });

    await gamificationService.awardPoints('user123', 'test_action', 5);

    expect(mockTransaction.update).toHaveBeenCalledWith(mockUserRef, {
      points: 5,
      weeklyPoints: 5,
      updatedAt: 'mockTimestamp'
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
