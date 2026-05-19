import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

function normalizePoints(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

function needsSanitize(data: FirebaseFirestore.DocumentData): boolean {
  const p = Number(data.points ?? 0);
  const w = Number(data.weeklyPoints ?? 0);
  return p !== normalizePoints(p) || w !== normalizePoints(w);
}

/** Admin: arrotonda points/weeklyPoints di tutti gli utenti (rimuove decimali già salvati). */
export const sanitizeAllLoyaltyPoints = functions.region('europe-west1').https.onCall(async (_data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Login richiesto.');
  }

  const adminDoc = await db.collection('users').doc(context.auth.uid).get();
  if (adminDoc.data()?.role !== 'ADMIN') {
    throw new functions.https.HttpsError('permission-denied', 'Solo admin.');
  }

  let fixed = 0;
  let scanned = 0;
  let lastId: string | undefined;

  while (true) {
    let q = db.collection('users').orderBy(admin.firestore.FieldPath.documentId()).limit(400);
    if (lastId) q = q.startAfter(lastId);

    const snap = await q.get();
    if (snap.empty) break;

    const batch = db.batch();
    let batchWrites = 0;

    for (const docSnap of snap.docs) {
      scanned++;
      const data = docSnap.data();
      if (!needsSanitize(data)) continue;

      batch.update(docSnap.ref, {
        points: normalizePoints(data.points),
        weeklyPoints: normalizePoints(data.weeklyPoints),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      batchWrites++;
      fixed++;
    }

    if (batchWrites > 0) await batch.commit();
    lastId = snap.docs[snap.docs.length - 1].id;
    if (snap.size < 400) break;
  }

  return { success: true, scanned, fixed };
});
