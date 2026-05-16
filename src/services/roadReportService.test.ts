import { describe, it, expect, vi, beforeEach } from 'vitest';
import { roadReportService } from './roadReportService';
import { addDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firebase';
import { RoadReport } from '../types';

// Mock dependencies
vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual('firebase/firestore');
  return {
    ...actual,
    collection: vi.fn(),
    addDoc: vi.fn(),
    serverTimestamp: vi.fn(() => 'mock-timestamp'),
    doc: vi.fn(),
    runTransaction: vi.fn(),
    updateDoc: vi.fn(),
    query: vi.fn(),
    getDocs: vi.fn(),
    arrayUnion: vi.fn(),
    arrayRemove: vi.fn(),
  };
});

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: {
    CREATE: 'CREATE',
    READ: 'READ',
    UPDATE: 'UPDATE',
    DELETE: 'DELETE',
  },
}));

describe('roadReportService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createRoadReport', () => {
    it('should handle Firestore errors when addDoc fails', async () => {
      const mockError = new Error('Firestore addDoc failed');
      vi.mocked(addDoc).mockRejectedValueOnce(mockError);

      const mockReportData: Omit<RoadReport, 'id' | 'createdAt' | 'updatedAt' | 'upvotes' | 'status'> = {
        category: 'pothole',
        location: { lat: 40.7128, lng: -74.0060 },
        description: 'Large pothole on main street',
        severity: 'medium',
        photoUrl: 'http://example.com/image.jpg',
        reporterId: 'user123',
        reporterName: 'Test User',
      };

      await expect(roadReportService.createRoadReport(mockReportData as any)).rejects.toThrow(mockError);

      expect(handleFirestoreError).toHaveBeenCalledWith(
        mockError,
        OperationType.CREATE,
        'roadReports'
      );
      expect(handleFirestoreError).toHaveBeenCalledTimes(1);
    });
  });
});
