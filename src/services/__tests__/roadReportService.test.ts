import { describe, it, expect, vi, beforeEach } from 'vitest';
import { roadReportService } from '../roadReportService';
import { addDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../../lib/firebase';
import { RoadReport } from '../../types';

// Mock dependencies
vi.mock('firebase/firestore', () => ({
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
}));

vi.mock('../../lib/firebase', () => ({
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
    it('should call handleFirestoreError and rethrow when addDoc throws an error', async () => {
      // Arrange
      const mockError = new Error('Firestore addDoc failed');
      vi.mocked(addDoc).mockRejectedValueOnce(mockError);

      const mockReportData: Omit<RoadReport, 'id' | 'createdAt' | 'updatedAt' | 'upvotes' | 'status'> = {
        type: 'pothole',
        location: { lat: 40.7128, lng: -74.0060 },
        description: 'Large pothole on main street',
        imageUrl: 'http://example.com/image.jpg',
        userId: 'user123',
      };

      // Act & Assert
      await expect(roadReportService.createRoadReport(mockReportData)).rejects.toThrow(mockError);

      // Verify that handleFirestoreError was called correctly
      expect(handleFirestoreError).toHaveBeenCalledWith(
        mockError,
        OperationType.CREATE,
        'roadReports'
      );
      expect(handleFirestoreError).toHaveBeenCalledTimes(1);
    });
  });
});
