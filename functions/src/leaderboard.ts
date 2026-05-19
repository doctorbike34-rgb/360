import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

/**
 * Ogni lunedì alle 00:00 (Europe/Rome) azzera weeklyPoints per la classifica settimanale.
 */
export const resetWeeklyPoints = functions
  .region('europe-west1')
  .pubsub.schedule('0 0 * * 1')
  .timeZone('Europe/Rome')
  .onRun(async () => {
    console.log('resetWeeklyPoints: start');
    let processed = 0;
    let lastId: string | undefined;

    while (true) {
      let q = db.collection('users').orderBy(admin.firestore.FieldPath.documentId()).limit(400);
      if (lastId) {
        q = q.startAfter(lastId);
      }

      const snap = await q.get();
      if (snap.empty) break;

      const batch = db.batch();
      let updatesInBatch = 0;

      for (const docSnap of snap.docs) {
        const weekly = Number(docSnap.data().weeklyPoints) || 0;
        if (weekly > 0) {
          batch.update(docSnap.ref, {
            weeklyPoints: 0,
            weeklyPointsResetAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          updatesInBatch++;
        }
      }

      if (updatesInBatch > 0) {
        await batch.commit();
        processed += updatesInBatch;
      }

      lastId = snap.docs[snap.docs.length - 1].id;
      if (snap.size < 400) break;
    }

    console.log(`resetWeeklyPoints: done, ${processed} users updated`);
    return { success: true, processed };
  });
