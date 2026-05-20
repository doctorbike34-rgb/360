import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

const db = admin.firestore();

async function assertAdmin(uid: string): Promise<void> {
  const doc = await db.collection('users').doc(uid).get();
  if (doc.data()?.role !== 'ADMIN') {
    throw new HttpsError('permission-denied', 'Solo admin.');
  }
}

/** Deletes all docs in a flat collection in parallel batches of 400. */
async function deleteCollection(path: string): Promise<number> {
  let deleted = 0;
  while (true) {
    const snap = await db.collection(path).limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.size;
    if (snap.size < 400) break;
  }
  return deleted;
}

/** Deletes chats + all their messages sub-collection. */
async function deleteChatsWithMessages(): Promise<number> {
  let deleted = 0;
  while (true) {
    const chats = await db.collection('chats').limit(50).get();
    if (chats.empty) break;
    await Promise.all(
      chats.docs.map(async (chatDoc) => {
        // Delete messages sub-collection first
        while (true) {
          const msgs = await chatDoc.ref.collection('messages').limit(400).get();
          if (msgs.empty) break;
          const b = db.batch();
          msgs.docs.forEach((m) => b.delete(m.ref));
          await b.commit();
          if (msgs.size < 400) break;
        }
        await chatDoc.ref.delete();
        deleted++;
      })
    );
  }
  return deleted;
}

/** Resets all ADMIN user stats to zero (keeps their account). */
async function resetAdminUsers(): Promise<number> {
  const admins = await db.collection('users').where('role', '==', 'ADMIN').get();
  await Promise.all(
    admins.docs.map((d) =>
      d.ref.update({
        balance: 0,
        completedJobs: 0,
        points: 0,
        weeklyPoints: 0,
        peerMechanicEarnings: 0,
        peerMechanicJobsCompleted: 0,
        hasWelcomeGift: true,
        lastTxId: admin.firestore.FieldValue.delete(),
        lastSosAt: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    )
  );
  return admins.size;
}

/** Deletes all non-ADMIN users from Firestore. */
async function deleteNonAdminUsersFirestore(): Promise<number> {
  let deleted = 0;
  while (true) {
    const snap = await db
      .collection('users')
      .where('role', '!=', 'ADMIN')
      .limit(400)
      .get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.size;
    if (snap.size < 400) break;
  }
  return deleted;
}

/** Collects all admin UIDs from Firestore (to protect them). */
async function getAdminUids(): Promise<Set<string>> {
  const snap = await db.collection('users').where('role', '==', 'ADMIN').get();
  return new Set(snap.docs.map((d) => d.id));
}

/** Deletes all Firebase Auth users except admins. */
async function deleteNonAdminAuthUsers(adminUids: Set<string>): Promise<number> {
  const toDelete: string[] = [];
  let nextPageToken: string | undefined;

  // Collect all non-admin UIDs first (no per-user Firestore reads)
  do {
    const page = await admin.auth().listUsers(1000, nextPageToken);
    for (const u of page.users) {
      if (!adminUids.has(u.uid)) {
        toDelete.push(u.uid);
      }
    }
    nextPageToken = page.pageToken;
  } while (nextPageToken);

  // Delete in parallel chunks of 100 (Auth API limit)
  await Promise.all(
    Array.from({ length: Math.ceil(toDelete.length / 100) }, (_, i) =>
      admin.auth().deleteUsers(toDelete.slice(i * 100, (i + 1) * 100))
    )
  );

  return toDelete.length;
}

/**
 * Full production reset:
 * - Deletes ALL data collections in parallel
 * - Deletes ALL non-admin Firestore users
 * - Deletes ALL non-admin Firebase Auth users
 * - Resets admin stats to zero
 * - Resets platformStats
 *
 * Uses v2 with 3600s timeout so it never times out.
 */
export const productionReset = onCall(
  {
    region: 'europe-west1',
    timeoutSeconds: 3600,
    memory: '1GiB',
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Login richiesto.');
    }

    const callerUid = request.auth.uid;
    await assertAdmin(callerUid);

    const summary: Record<string, number> = {};

    // 1. Delete all data collections in parallel (fastest possible)
    const [
      chats,
      sosRequests,
      reviews,
      supportTickets,
      aiConversations,
      mechanics,
      events,
      roadReports,
      transactions,
      subscriptions,
      payoutRequests,
      mapPresence,
      interventions,
    ] = await Promise.all([
      deleteChatsWithMessages(),
      deleteCollection('sosRequests'),
      deleteCollection('reviews'),
      deleteCollection('supportTickets'),
      deleteCollection('aiConversations'),
      deleteCollection('mechanics'),
      deleteCollection('events'),
      deleteCollection('roadReports'),
      deleteCollection('transactions'),
      deleteCollection('subscriptions'),
      deleteCollection('payoutRequests'),
      deleteCollection('mapPresence'),
      deleteCollection('interventions'),
    ]);

    summary.chats = chats;
    summary.sosRequests = sosRequests;
    summary.reviews = reviews;
    summary.supportTickets = supportTickets;
    summary.aiConversations = aiConversations;
    summary.mechanics = mechanics;
    summary.events = events;
    summary.roadReports = roadReports;
    summary.transactions = transactions;
    summary.subscriptions = subscriptions;
    summary.payoutRequests = payoutRequests;
    summary.mapPresence = mapPresence;
    summary.interventions = interventions;

    // 2. Get admin UIDs (needed for both Firestore and Auth cleanup)
    const adminUids = await getAdminUids();

    // 3. Delete non-admin users from Firestore + Auth in parallel
    const [usersDeleted, authDeleted] = await Promise.all([
      deleteNonAdminUsersFirestore(),
      deleteNonAdminAuthUsers(adminUids),
    ]);

    summary.usersDeleted = usersDeleted;
    summary.authDeleted = authDeleted;

    // 4. Reset admin stats + platformStats in parallel
    const [adminsReset] = await Promise.all([
      resetAdminUsers(),
      db.collection('platformStats').doc('global').set({
        totalFees: 0,
        totalTransactions: 0,
        totalSubscriptionRevenue: 0,
        completedJobs: 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }),
    ]);

    summary.adminsReset = adminsReset;

    return { success: true, summary };
  }
);
