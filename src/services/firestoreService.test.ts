import { describe, it, expect, vi, beforeEach } from 'vitest';
import { firestoreService } from './firestoreService';
import { addDoc, collection, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { useAuthStore } from '../store/useAuthStore';

// Mock dependencies
vi.mock('../lib/firebase', () => ({
  db: {},
  auth: {
    currentUser: { uid: 'test-user', email: 'test@example.com', emailVerified: true }
  }
}));

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

vi.mock('../store/useAuthStore', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({
      setQuotaError: vi.fn()
    }))
  }
}));

describe('firestoreService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createDoc', () => {
    it('should successfully create a document', async () => {
      const mockCollection = { id: 'test-collection' };
      (collection as any).mockReturnValue(mockCollection);
      (addDoc as any).mockResolvedValue({ id: 'new-doc-id' });

      const result = await firestoreService.createDoc('users', { name: 'Test' });

      expect(collection).toHaveBeenCalledWith(db, 'users');
      expect(addDoc).toHaveBeenCalledWith(mockCollection, { name: 'Test' });
      expect(result).toEqual({ id: 'new-doc-id' });
    });

    it('should handle errors and log them', async () => {
      const mockError = new Error('Permission denied');
      (addDoc as any).mockRejectedValue(mockError);
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await firestoreService.createDoc('users', { name: 'Test' });

      expect(consoleErrorSpy).toHaveBeenCalled();
      const loggedError = JSON.parse(consoleErrorSpy.mock.calls[0][1]);
      expect(loggedError.error).toBe('Permission denied');
      expect(loggedError.operationType).toBe('create');
      expect(loggedError.path).toBe('users');
    });

    it('should handle quota errors', async () => {
      const mockError = new Error('Quota exceeded for this project');
      (addDoc as any).mockRejectedValue(mockError);
      const setQuotaError = vi.fn();
      (useAuthStore.getState as any).mockReturnValue({ setQuotaError });
      
      await firestoreService.createDoc('users', { name: 'Test' });

      expect(setQuotaError).toHaveBeenCalledWith(true);
    });
  });

  describe('updateDoc', () => {
    it('should successfully update a document', async () => {
      const mockDoc = { id: 'test-doc' };
      (doc as any).mockReturnValue(mockDoc);
      (updateDoc as any).mockResolvedValue(undefined);

      await firestoreService.updateDoc('users', 'user123', { name: 'Updated' });

      expect(doc).toHaveBeenCalledWith(db, 'users', 'user123');
      expect(updateDoc).toHaveBeenCalledWith(mockDoc, { name: 'Updated' });
    });
  });

  describe('deleteDoc', () => {
    it('should successfully delete a document', async () => {
      const mockDoc = { id: 'test-doc' };
      (doc as any).mockReturnValue(mockDoc);
      (deleteDoc as any).mockResolvedValue(undefined);

      await firestoreService.deleteDoc('users', 'user123');

      expect(doc).toHaveBeenCalledWith(db, 'users', 'user123');
      expect(deleteDoc).toHaveBeenCalledWith(mockDoc);
    });
  });
});
