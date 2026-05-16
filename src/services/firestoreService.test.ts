import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { collection, doc, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { useAuthStore } from '../store/useAuthStore';
import { firestoreService } from './firestoreService';

// Mock dependencies
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  auth: {
    currentUser: {
      uid: 'test-user-id',
      email: 'test@example.com',
      emailVerified: true,
    },
  },
}));

vi.mock('../store/useAuthStore', () => ({
  useAuthStore: {
    getState: vi.fn().mockReturnValue({
      setQuotaError: vi.fn(),
    }),
  },
}));

describe('firestoreService', () => {
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  let mockSetQuotaError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    console.error = vi.fn();
    console.warn = vi.fn();
    vi.clearAllMocks();

    mockSetQuotaError = vi.fn();
    (useAuthStore.getState as any).mockReturnValue({
      setQuotaError: mockSetQuotaError,
    });
  });

  afterEach(() => {
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
  });

  describe('createDoc', () => {
    it('should successfully add a document', async () => {
      const mockCollectionRef = {};
      const mockData = { name: 'test' };
      const mockDocRef = { id: 'doc-123' };

      vi.mocked(collection).mockReturnValue(mockCollectionRef as any);
      vi.mocked(addDoc).mockResolvedValue(mockDocRef as any);

      const result = await firestoreService.createDoc('users', mockData);

      expect(collection).toHaveBeenCalledWith(db, 'users');
      expect(addDoc).toHaveBeenCalledWith(mockCollectionRef, mockData);
      expect(result).toBe(mockDocRef);
    });

    it('should handle standard errors', async () => {
      const standardError = new Error('Permission denied');
      vi.mocked(collection).mockReturnValue({} as any);
      vi.mocked(addDoc).mockRejectedValue(standardError);

      await firestoreService.createDoc('users', { name: 'test' });

      expect(console.error).toHaveBeenCalled();
      expect(mockSetQuotaError).not.toHaveBeenCalled();
    });

    it('should handle quota exceeded errors and update auth store', async () => {
      const quotaError = new Error('Quota exceeded');
      vi.mocked(collection).mockReturnValue({} as any);
      vi.mocked(addDoc).mockRejectedValue(quotaError);

      await firestoreService.createDoc('users', { name: 'test' });

      expect(console.warn).toHaveBeenCalled();
      expect(mockSetQuotaError).toHaveBeenCalledWith(true);
    });

    it('should handle quota limits errors and update auth store', async () => {
      const quotaError = new Error('Firebase quota limits reached');
      vi.mocked(collection).mockReturnValue({} as any);
      vi.mocked(addDoc).mockRejectedValue(quotaError);

      await firestoreService.createDoc('users', { name: 'test' });

      expect(console.warn).toHaveBeenCalled();
      expect(mockSetQuotaError).toHaveBeenCalledWith(true);
    });
  });

  describe('updateDoc', () => {
    it('should successfully update a document', async () => {
      const mockDocRef = {};
      const mockData = { name: 'updated' };

      vi.mocked(doc).mockReturnValue(mockDocRef as any);
      vi.mocked(updateDoc).mockResolvedValue(undefined);

      await firestoreService.updateDoc('users', 'doc-123', mockData);

      expect(doc).toHaveBeenCalledWith(db, 'users', 'doc-123');
      expect(updateDoc).toHaveBeenCalledWith(mockDocRef, mockData);
    });

    it('should handle standard errors', async () => {
      const standardError = new Error('Not found');
      vi.mocked(doc).mockReturnValue({} as any);
      vi.mocked(updateDoc).mockRejectedValue(standardError);

      await firestoreService.updateDoc('users', 'doc-123', { name: 'updated' });

      expect(console.error).toHaveBeenCalled();
      expect(mockSetQuotaError).not.toHaveBeenCalled();
    });

    it('should handle quota exceeded errors', async () => {
      const quotaError = new Error('Quota exceeded');
      vi.mocked(doc).mockReturnValue({} as any);
      vi.mocked(updateDoc).mockRejectedValue(quotaError);

      await firestoreService.updateDoc('users', 'doc-123', { name: 'updated' });

      expect(console.warn).toHaveBeenCalled();
      expect(mockSetQuotaError).toHaveBeenCalledWith(true);
    });
  });

  describe('deleteDoc', () => {
    it('should successfully delete a document', async () => {
      const mockDocRef = {};

      vi.mocked(doc).mockReturnValue(mockDocRef as any);
      vi.mocked(deleteDoc).mockResolvedValue(undefined);

      await firestoreService.deleteDoc('users', 'doc-123');

      expect(doc).toHaveBeenCalledWith(db, 'users', 'doc-123');
      expect(deleteDoc).toHaveBeenCalledWith(mockDocRef);
    });

    it('should handle standard errors', async () => {
      const standardError = new Error('Permission denied');
      vi.mocked(doc).mockReturnValue({} as any);
      vi.mocked(deleteDoc).mockRejectedValue(standardError);

      await firestoreService.deleteDoc('users', 'doc-123');

      expect(console.error).toHaveBeenCalled();
      expect(mockSetQuotaError).not.toHaveBeenCalled();
    });

    it('should handle quota exceeded errors', async () => {
      const quotaError = new Error('Quota exceeded');
      vi.mocked(doc).mockReturnValue({} as any);
      vi.mocked(deleteDoc).mockRejectedValue(quotaError);

      await firestoreService.deleteDoc('users', 'doc-123');

      expect(console.warn).toHaveBeenCalled();
      expect(mockSetQuotaError).toHaveBeenCalledWith(true);
    });
  });
});
