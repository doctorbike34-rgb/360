import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { firestoreService } from './firestoreService';
import { addDoc, updateDoc, deleteDoc, collection, doc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { useAuthStore } from '../store/useAuthStore';

// Mock firebase/firestore
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn()
}));

// Mock firebase lib
vi.mock('../lib/firebase', () => ({
  db: {},
  auth: {
    currentUser: {
      uid: 'test-user-id',
      email: 'test@example.com',
      emailVerified: true
    }
  }
}));

// Mock useAuthStore
vi.mock('../store/useAuthStore', () => ({
  useAuthStore: {
    getState: vi.fn()
  }
}));

describe('firestoreService', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let setQuotaErrorMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    setQuotaErrorMock = vi.fn();
    vi.mocked(useAuthStore.getState).mockReturnValue({
      setQuotaError: setQuotaErrorMock
    } as any);

    vi.clearAllMocks();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('createDoc', () => {
    it('handles generic errors correctly', async () => {
      const errorMsg = 'Generic error';
      vi.mocked(addDoc).mockRejectedValueOnce(new Error(errorMsg));
      vi.mocked(collection).mockReturnValueOnce('mock-collection' as any);

      await firestoreService.createDoc('test-path', { data: 'test' });

      expect(addDoc).toHaveBeenCalledWith('mock-collection', { data: 'test' });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Firestore Error: ',
        expect.stringContaining('"operationType":"create"')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Firestore Error: ',
        expect.stringContaining('"path":"test-path"')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Firestore Error: ',
        expect.stringContaining(errorMsg)
      );
    });

    it('handles quota errors correctly', async () => {
      const errorMsg = 'Quota exceeded';
      vi.mocked(addDoc).mockRejectedValueOnce(new Error(errorMsg));
      vi.mocked(collection).mockReturnValueOnce('mock-collection' as any);

      await firestoreService.createDoc('test-path', { data: 'test' });

      expect(setQuotaErrorMock).toHaveBeenCalledWith(true);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Firestore Quota Exceeded (Service) for test-path. Action: create.'
      );
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('updateDoc', () => {
    it('handles generic errors correctly', async () => {
      const errorMsg = 'Generic update error';
      vi.mocked(updateDoc).mockRejectedValueOnce(new Error(errorMsg));
      vi.mocked(doc).mockReturnValueOnce('mock-doc' as any);

      await firestoreService.updateDoc('test-path', 'doc-id', { data: 'test' });

      expect(updateDoc).toHaveBeenCalledWith('mock-doc', { data: 'test' });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Firestore Error: ',
        expect.stringContaining('"operationType":"update"')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Firestore Error: ',
        expect.stringContaining('"path":"test-path/doc-id"')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Firestore Error: ',
        expect.stringContaining(errorMsg)
      );
    });

    it('handles quota errors correctly', async () => {
      const errorMsg = 'Quota exceeded limit';
      vi.mocked(updateDoc).mockRejectedValueOnce(new Error(errorMsg));
      vi.mocked(doc).mockReturnValueOnce('mock-doc' as any);

      await firestoreService.updateDoc('test-path', 'doc-id', { data: 'test' });

      expect(setQuotaErrorMock).toHaveBeenCalledWith(true);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Firestore Quota Exceeded (Service) for test-path/doc-id. Action: update.'
      );
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('deleteDoc', () => {
    it('handles generic errors correctly', async () => {
      const errorMsg = 'Generic delete error';
      vi.mocked(deleteDoc).mockRejectedValueOnce(new Error(errorMsg));
      vi.mocked(doc).mockReturnValueOnce('mock-doc' as any);

      await firestoreService.deleteDoc('test-path', 'doc-id');

      expect(deleteDoc).toHaveBeenCalledWith('mock-doc');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Firestore Error: ',
        expect.stringContaining('"operationType":"delete"')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Firestore Error: ',
        expect.stringContaining('"path":"test-path/doc-id"')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Firestore Error: ',
        expect.stringContaining(errorMsg)
      );
    });

    it('handles quota errors correctly', async () => {
      const errorMsg = 'quota limits reached';
      vi.mocked(deleteDoc).mockRejectedValueOnce(new Error(errorMsg));
      vi.mocked(doc).mockReturnValueOnce('mock-doc' as any);

      await firestoreService.deleteDoc('test-path', 'doc-id');

      expect(setQuotaErrorMock).toHaveBeenCalledWith(true);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Firestore Quota Exceeded (Service) for test-path/doc-id. Action: delete.'
      );
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });
});
