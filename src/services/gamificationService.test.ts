import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gamificationService } from './gamificationService';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

// Mock dependencies
vi.mock('../lib/firebase', () => ({
  db: {}
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => 'mocked-timestamp'),
  getDoc: vi.fn(),
  query: vi.fn(),
  collection: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
}));

describe('gamificationService.awardPoints', () => {
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let checkAndAwardBadgesSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    checkAndAwardBadgesSpy = vi.spyOn(gamificationService, 'checkAndAwardBadges').mockResolvedValue(undefined);
  });

  it('should successfully award points when user exists', async () => {
    const mockUserRef = { id: 'user1' };
    (doc as any).mockReturnValue(mockUserRef);

    const mockTransaction = {
      get: vi.fn().mockResolvedValue({
        exists: () => true,
        data: () => ({ points: 10, weeklyPoints: 5 })
      }),
      update: vi.fn()
    };

    (runTransaction as any).mockImplementation(async (dbInstance: any, callback: any) => {
      await callback(mockTransaction);
    });

    await gamificationService.awardPoints('user1', 'test_action', 5);

    expect(doc).toHaveBeenCalledWith(db, 'users', 'user1');
    expect(mockTransaction.get).toHaveBeenCalledWith(mockUserRef);
    expect(mockTransaction.update).toHaveBeenCalledWith(mockUserRef, {
      points: 15,
      weeklyPoints: 10,
      updatedAt: 'mocked-timestamp'
    });
    expect(consoleLogSpy).toHaveBeenCalledWith('Awarded 5 points for test_action');
    expect(checkAndAwardBadgesSpy).toHaveBeenCalledWith('user1');
  });

  it('should not update if user document does not exist', async () => {
    const mockUserRef = { id: 'user1' };
    (doc as any).mockReturnValue(mockUserRef);

    const mockTransaction = {
      get: vi.fn().mockResolvedValue({
        exists: () => false
      }),
      update: vi.fn()
    };

    (runTransaction as any).mockImplementation(async (dbInstance: any, callback: any) => {
      await callback(mockTransaction);
    });

    await gamificationService.awardPoints('user1', 'test_action', 5);

    expect(mockTransaction.get).toHaveBeenCalledWith(mockUserRef);
    expect(mockTransaction.update).not.toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith('Awarded 5 points for test_action');
    expect(checkAndAwardBadgesSpy).toHaveBeenCalledWith('user1');
  });

  it('should catch and log errors during transaction', async () => {
    const mockError = new Error('Transaction failed');
    (runTransaction as any).mockRejectedValue(mockError);

    await gamificationService.awardPoints('user1', 'test_action', 5);

    expect(consoleErrorSpy).toHaveBeenCalledWith('Error awarding points:', mockError);
    expect(checkAndAwardBadgesSpy).not.toHaveBeenCalled();
  });
});
