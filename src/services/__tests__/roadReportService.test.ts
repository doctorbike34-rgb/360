import { describe, it, expect, vi, beforeEach } from 'vitest';
import { roadReportService } from '../roadReportService';
import { addDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../../lib/firebase';

// Mock dependencies
vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual('firebase/firestore');
  return {
    ...actual,
    collection: vi.fn(),
    addDoc: vi.fn(),
    serverTimestamp: vi.fn(() => 'mock-timestamp'),
  };
});

vi.mock('../../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: {
    CREATE: 'create',
    UPDATE: 'update',
    DELETE: 'delete',
  }
}));

describe('roadReportService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createRoadReport', () => {
    it('should handle Firestore errors when addDoc fails', async () => {
      const mockError = new Error('Firestore error');
      vi.mocked(addDoc).mockRejectedValueOnce(mockError);

      const reportData = {
        title: 'Test Report',
        description: 'Test Description',
        location: { lat: 0, lng: 0 },
        type: 'pothole',
        category: 'road'
      };

      await expect(roadReportService.createRoadReport(reportData as any)).rejects.toThrow('Firestore error');

      expect(handleFirestoreError).toHaveBeenCalledWith(
        mockError,
        OperationType.CREATE,
        'roadReports'
      );
    });
  });
});
