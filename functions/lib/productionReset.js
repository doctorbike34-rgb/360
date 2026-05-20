"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.productionReset = void 0;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const db = admin.firestore();
async function assertAdmin(uid) {
    var _a;
    const doc = await db.collection('users').doc(uid).get();
    if (((_a = doc.data()) === null || _a === void 0 ? void 0 : _a.role) !== 'ADMIN') {
        throw new https_1.HttpsError('permission-denied', 'Solo admin.');
    }
}
/** Deletes all docs in a flat collection in parallel batches of 400. */
async function deleteCollection(path) {
    let deleted = 0;
    while (true) {
        const snap = await db.collection(path).limit(400).get();
        if (snap.empty)
            break;
        const batch = db.batch();
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        deleted += snap.size;
        if (snap.size < 400)
            break;
    }
    return deleted;
}
/** Deletes chats + all their messages sub-collection. */
async function deleteChatsWithMessages() {
    let deleted = 0;
    while (true) {
        const chats = await db.collection('chats').limit(50).get();
        if (chats.empty)
            break;
        await Promise.all(chats.docs.map(async (chatDoc) => {
            // Delete messages sub-collection first
            while (true) {
                const msgs = await chatDoc.ref.collection('messages').limit(400).get();
                if (msgs.empty)
                    break;
                const b = db.batch();
                msgs.docs.forEach((m) => b.delete(m.ref));
                await b.commit();
                if (msgs.size < 400)
                    break;
            }
            await chatDoc.ref.delete();
            deleted++;
        }));
    }
    return deleted;
}
/** Resets all ADMIN user stats to zero (keeps their account). */
async function resetAdminUsers() {
    const admins = await db.collection('users').where('role', '==', 'ADMIN').get();
    await Promise.all(admins.docs.map((d) => d.ref.update({
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
    })));
    return admins.size;
}
/** Deletes all non-ADMIN users from Firestore. */
async function deleteNonAdminUsersFirestore() {
    let deleted = 0;
    while (true) {
        const snap = await db
            .collection('users')
            .where('role', '!=', 'ADMIN')
            .limit(400)
            .get();
        if (snap.empty)
            break;
        const batch = db.batch();
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        deleted += snap.size;
        if (snap.size < 400)
            break;
    }
    return deleted;
}
/** Collects all admin UIDs from Firestore (to protect them). */
async function getAdminUids() {
    const snap = await db.collection('users').where('role', '==', 'ADMIN').get();
    return new Set(snap.docs.map((d) => d.id));
}
/** Deletes all Firebase Auth users except admins. */
async function deleteNonAdminAuthUsers(adminUids) {
    const toDelete = [];
    let nextPageToken;
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
    await Promise.all(Array.from({ length: Math.ceil(toDelete.length / 100) }, (_, i) => admin.auth().deleteUsers(toDelete.slice(i * 100, (i + 1) * 100))));
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
exports.productionReset = (0, https_1.onCall)({
    region: 'europe-west1',
    timeoutSeconds: 3600,
    memory: '1GiB',
}, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Login richiesto.');
    }
    const callerUid = request.auth.uid;
    await assertAdmin(callerUid);
    const summary = {};
    // 1. Delete all data collections in parallel (fastest possible)
    const [chats, sosRequests, reviews, supportTickets, aiConversations, mechanics, events, roadReports, transactions, subscriptions, payoutRequests, mapPresence, interventions,] = await Promise.all([
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
});
//# sourceMappingURL=productionReset.js.map