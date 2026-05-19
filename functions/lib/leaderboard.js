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
exports.resetWeeklyPoints = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
/**
 * Ogni lunedì alle 00:00 (Europe/Rome) azzera weeklyPoints per la classifica settimanale.
 */
exports.resetWeeklyPoints = functions
    .region('europe-west1')
    .pubsub.schedule('0 0 * * 1')
    .timeZone('Europe/Rome')
    .onRun(async () => {
    console.log('resetWeeklyPoints: start');
    let processed = 0;
    let lastId;
    while (true) {
        let q = db.collection('users').orderBy(admin.firestore.FieldPath.documentId()).limit(400);
        if (lastId) {
            q = q.startAfter(lastId);
        }
        const snap = await q.get();
        if (snap.empty)
            break;
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
        if (snap.size < 400)
            break;
    }
    console.log(`resetWeeklyPoints: done, ${processed} users updated`);
    return { success: true, processed };
});
//# sourceMappingURL=leaderboard.js.map