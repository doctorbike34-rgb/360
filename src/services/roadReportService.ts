import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc, updateDoc, doc, runTransaction, query, getDocs, serverTimestamp, arrayUnion, arrayRemove } from 'firebase/firestore';
import { RoadReport } from '../types';

export const roadReportService = {
  createRoadReport: async (reportData: Omit<RoadReport, 'id' | 'createdAt' | 'updatedAt' | 'upvotes' | 'status'>) => {
    try {
      const docRef = await addDoc(collection(db, 'roadReports'), {
        ...reportData,
        status: 'open',
        upvotes: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return docRef.id;
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'roadReports');
      throw e;
    }
  },

  upvoteReport: async (reportId: string, userId: string) => {
    const reportRef = doc(db, 'roadReports', reportId);
    try {
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(reportRef);
        if (!snap.exists()) return;
        const data = snap.data() as RoadReport;
        
        const upvotes = data.upvotes || [];
        if (upvotes.includes(userId)) return;

        const newUpvotes = [...upvotes, userId];
        const updates: any = {
          upvotes: newUpvotes,
          updatedAt: serverTimestamp()
        };

        if (newUpvotes.length >= 3 && data.status === 'open') {
          updates.status = 'confirmed';
        }

        transaction.update(reportRef, updates);
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `roadReports/${reportId}`);
      throw e;
    }
  },

  updateReportStatus: async (reportId: string, status: RoadReport['status'], adminNote?: string) => {
    try {
      const updates: any = {
        status,
        updatedAt: serverTimestamp()
      };
      if (adminNote) updates.adminNote = adminNote;
      await updateDoc(doc(db, 'roadReports', reportId), updates);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `roadReports/${reportId}`);
      throw e;
    }
  }
};
