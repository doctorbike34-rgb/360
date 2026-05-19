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
exports.disputeSOS = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
/**
 * Contestazione SOS: blocca pagamento e crea ticket assistenza collegato.
 */
exports.disputeSOS = functions.region('europe-west1').https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Login richiesto.');
    }
    const sosId = String((data === null || data === void 0 ? void 0 : data.sosId) || '');
    const reason = String((data === null || data === void 0 ? void 0 : data.reason) || 'Contestazione intervento SOS').slice(0, 2000);
    if (!sosId) {
        throw new functions.https.HttpsError('invalid-argument', 'sosId mancante.');
    }
    const sosRef = db.collection('sosRequests').doc(sosId);
    const sosSnap = await sosRef.get();
    if (!sosSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'SOS non trovato.');
    }
    const sos = sosSnap.data();
    if (sos.cyclistId !== context.auth.uid) {
        throw new functions.https.HttpsError('permission-denied', 'Solo il ciclista può contestare.');
    }
    const allowedStatuses = ['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'];
    if (!allowedStatuses.includes(sos.status)) {
        throw new functions.https.HttpsError('failed-precondition', 'Questo intervento non può essere contestato nello stato attuale.');
    }
    const userSnap = await db.collection('users').doc(context.auth.uid).get();
    const userData = userSnap.data() || {};
    const userName = userData.name || 'Ciclista';
    const existingTicket = await db
        .collection('supportTickets')
        .where('sosId', '==', sosId)
        .where('category', '==', 'DISPUTE')
        .where('status', '==', 'OPEN')
        .limit(1)
        .get();
    if (!existingTicket.empty) {
        return { success: true, ticketId: existingTicket.docs[0].id, alreadyOpen: true };
    }
    const ticketRef = db.collection('supportTickets').doc();
    const batch = db.batch();
    batch.update(sosRef, {
        status: 'DISPUTED',
        paymentStatus: 'DISPUTED',
        disputedAt: admin.firestore.FieldValue.serverTimestamp(),
        disputeReason: reason,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    batch.set(ticketRef, {
        userId: context.auth.uid,
        userName,
        userRole: userData.role || 'CYCLIST',
        status: 'OPEN',
        category: 'DISPUTE',
        sosId,
        subject: `Contestazione SOS #${sosId.slice(0, 6)}`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastMessage: reason,
    });
    await batch.commit();
    return { success: true, ticketId: ticketRef.id };
});
//# sourceMappingURL=disputes.js.map