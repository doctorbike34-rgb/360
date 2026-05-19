import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { collection, doc, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { isFirestoreQuotaError } from '../lib/firestoreErrors';
import { useAuthStore } from '../store/useAuthStore';
import { firestoreService } from './firestoreService';

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
  OperationType: {
    CREATE: 'create',
    UPDATE: 'update',
    DELETE: 'delete',
    LIST: 'list',
    GET: 'get',
    WRITE: 'write',
  },
  handleFirestoreError: (error: unknown, operationType: string, path: string | null) => {
    if (isFirestoreQuotaError(error)) {
      useAuthStore.getState().setQuotaError(true);
      console.warn(`Firestore quota limit for ${path}. Action: ${operationType}.`);
      return;
    }
    console.error(
      'Firestore Error: ',
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
        operationType,
        path,
      })
    );
  },
}));

vi.mock('../store/useAuthStore', () => ({
  useAuthStore: {
    getState: vi.fn(),
  },
}));

import { db } from '../lib/firebase';

describe('firestoreService', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let mockSetQuotaError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.clearAllMocks();

    mockSetQuotaError = vi.fn();
    vi.mocked(useAuthStore.getState).mockReturnValue({
      setQuotaError: mockSetQuotaError,
    } as any);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
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

    it('should handle generic errors correctly', async () => {
      const errorMsg = 'Generic error';
      vi.mocked(addDoc).mockRejectedValueOnce(new Error(errorMsg));
      vi.mocked(collection).mockReturnValueOnce('mock-collection' as any);

      await firestoreService.createDoc('test-path', { data: 'test' });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Firestore Error: ',
        expect.stringContaining('"operationType":"create"')
      );
    });

    it('should handle quota exceeded errors and update auth store', async () => {
      vi.mocked(collection).mockReturnValue({} as any);
      vi.mocked(addDoc).mockRejectedValue(new Error('Quota exceeded'));

      await firestoreService.createDoc('users', { name: 'test' });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Firestore quota limit')
      );
      expect(mockSetQuotaError).toHaveBeenCalledWith(true);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('updateDoc', () => {
    it('should successfully update a document', async () => {
      const mockDocRef = {};
      vi.mocked(doc).mockReturnValue(mockDocRef as any);
      vi.mocked(updateDoc).mockResolvedValue(undefined);

      await firestoreService.updateDoc('users', 'doc-123', { name: 'updated' });

      expect(updateDoc).toHaveBeenCalledWith(mockDocRef, { name: 'updated' });
    });

    it('should handle quota errors correctly during update', async () => {
      vi.mocked(updateDoc).mockRejectedValueOnce(new Error('Quota exceeded limit'));
      vi.mocked(doc).mockReturnValueOnce('mock-doc' as any);

      await firestoreService.updateDoc('test-path', 'doc-id', { data: 'test' });

      expect(mockSetQuotaError).toHaveBeenCalledWith(true);
    });
  });

  describe('deleteDoc', () => {
    it('should successfully delete a document', async () => {
      const mockDocRef = {};
      vi.mocked(doc).mockReturnValue(mockDocRef as any);
      vi.mocked(deleteDoc).mockResolvedValue(undefined);

      await firestoreService.deleteDoc('users', 'doc-123');

      expect(deleteDoc).toHaveBeenCalledWith(mockDocRef);
    });

    it('should handle quota errors correctly during delete', async () => {
      vi.mocked(deleteDoc).mockRejectedValueOnce(new Error('quota limits reached'));
      vi.mocked(doc).mockReturnValueOnce('mock-doc' as any);

      await firestoreService.deleteDoc('test-path', 'doc-id');

      expect(mockSetQuotaError).toHaveBeenCalledWith(true);
    });
  });
});
