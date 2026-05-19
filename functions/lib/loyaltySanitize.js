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
exports.sanitizeAllLoyaltyPoints = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
function normalizePoints(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0)
        return 0;
    return Math.round(n);
}
function needsSanitize(data) {
    var _a, _b;
    const p = Number((_a = data.points) !== null && _a !== void 0 ? _a : 0);
    const w = Number((_b = data.weeklyPoints) !== null && _b !== void 0 ? _b : 0);
    return p !== normalizePoints(p) || w !== normalizePoints(w);
}
/** Admin: arrotonda points/weeklyPoints di tutti gli utenti (rimuove decimali già salvati). */
exports.sanitizeAllLoyaltyPoints = functions.region('europe-west1').https.onCall(async (_data, context) => {
    var _a;
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Login richiesto.');
    }
    const adminDoc = await db.collection('users').doc(context.auth.uid).get();
    if (((_a = adminDoc.data()) === null || _a === void 0 ? void 0 : _a.role) !== 'ADMIN') {
        throw new functions.https.HttpsError('permission-denied', 'Solo admin.');
    }
    let fixed = 0;
    let scanned = 0;
    let lastId;
    while (true) {
        let q = db.collection('users').orderBy(admin.firestore.FieldPath.documentId()).limit(400);
        if (lastId)
            q = q.startAfter(lastId);
        const snap = await q.get();
        if (snap.empty)
            break;
        const batch = db.batch();
        let batchWrites = 0;
        for (const docSnap of snap.docs) {
            scanned++;
            const data = docSnap.data();
            if (!needsSanitize(data))
                continue;
            batch.update(docSnap.ref, {
                points: normalizePoints(data.points),
                weeklyPoints: normalizePoints(data.weeklyPoints),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            batchWrites++;
            fixed++;
        }
        if (batchWrites > 0)
            await batch.commit();
        lastId = snap.docs[snap.docs.length - 1].id;
        if (snap.size < 400)
            break;
    }
    return { success: true, scanned, fixed };
});
//# sourceMappingURL=loyaltySanitize.js.map