import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

async function assertAdmin(uid: string) {
  const adminDoc = await db.collection('users').doc(uid).get();
  if (adminDoc.data()?.role !== 'ADMIN') {
    throw new functions.https.HttpsError('permission-denied', 'Solo admin.');
  }
}

async function deleteCollection(path: string, batchSize = 400): Promise<number> {
  let deleted = 0;
  while (true) {
    const snap = await db.collection(path).limit(batchSize).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.size;
    if (snap.size < batchSize) break;
  }
  return deleted;
}

async function deleteChatsWithMessages(): Promise<number> {
  let deleted = 0;
  while (true) {
    const chats = await db.collection('chats').limit(50).get();
    if (chats.empty) break;

    for (const chatDoc of chats.docs) {
      const messages = await chatDoc.ref.collection('messages').limit(400).get();
      if (!messages.empty) {
        const msgBatch = db.batch();
        messages.docs.forEach((m) => msgBatch.delete(m.ref));
        await msgBatch.commit();
      }
      await chatDoc.ref.delete();
      deleted++;
    }
  }
  return deleted;
}

async function resetAdminUsers(adminUid: string): Promise<number> {
  const admins = await db.collection('users').where('role', '==', 'ADMIN').get();
  let count = 0;
  for (const docSnap of admins.docs) {
    await docSnap.ref.update({
      balance: 0,
      completedJobs: 0,
      points: 0,
      weeklyPoints: 0,
      peerMechanicEarnings: 0,
      peerMechanicJobsCompleted: 0,
      hasWelcomeGift: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    count++;
  }
  return count;
}

async function deleteNonAdminUsers(adminUid: string): Promise<number> {
  let deleted = 0;
  while (true) {
    const snap = await db.collection('users').limit(200).get();
    if (snap.empty) break;

    const batch = db.batch();
    let ops = 0;
    for (const docSnap of snap.docs) {
      if (docSnap.id === adminUid) continue;
      if (docSnap.data()?.role === 'ADMIN') continue;
      batch.delete(docSnap.ref);
      ops++;
      deleted++;
    }
    if (ops > 0) {
      await batch.commit();
    } else {
      break;
    }
    if (snap.size < 200) break;
  }
  return deleted;
}

/**
 * Reset ambiente produzione: pulisce dati operativi e utenti non-admin (Firestore + Auth).
 */
export const productionReset = functions
  .region('europe-west1')
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .https.onCall(async (_data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Login richiesto.');
    }

    const adminUid = context.auth.uid;
    await assertAdmin(adminUid);

    const summary: Record<string, number> = {};

    summary.chats = await deleteChatsWithMessages();
    summary.sosRequests = await deleteCollection('sosRequests');
    summary.reviews = await deleteCollection('reviews');
    summary.supportTickets = await deleteCollection('supportTickets');
    summary.aiConversations = await deleteCollection('aiConversations');
    summary.mechanics = await deleteCollection('mechanics');
    summary.events = await deleteCollection('events');
    summary.roadReports = await deleteCollection('roadReports');
    summary.transactions = await deleteCollection('transactions');
    summary.subscriptions = await deleteCollection('subscriptions');
    summary.payoutRequests = await deleteCollection('payoutRequests');
    summary.mapPresence = await deleteCollection('mapPresence');
    summary.interventions = await deleteCollection('interventions');

    summary.usersDeleted = await deleteNonAdminUsers(adminUid);
    summary.adminsReset = await resetAdminUsers(adminUid);

    await db.collection('platformStats').doc('global').set({
      totalFees: 0,
      totalTransactions: 0,
      totalSubscriptionRevenue: 0,
      completedJobs: 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    let authDeleted = 0;
    const usersToDelete: string[] = [];
    let nextPageToken: string | undefined;
    do {
      const page = await admin.auth().listUsers(1000, nextPageToken);
      for (const u of page.users) {
        if (u.uid === adminUid) continue;
        const userDoc = await db.collection('users').doc(u.uid).get();
        if (!userDoc.exists || userDoc.data()?.role !== 'ADMIN') {
          usersToDelete.push(u.uid);
        }
      }
      nextPageToken = page.pageToken;
    } while (nextPageToken);

    for (let i = 0; i < usersToDelete.length; i += 100) {
      await admin.auth().deleteUsers(usersToDelete.slice(i, i + 100));
    }
    authDeleted = usersToDelete.length;
    summary.authDeleted = authDeleted;

    return { success: true, summary };
  });
