import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();
const MIN_PAYOUT_EUR = 20;

function normalizeIban(iban: string): string {
  return iban.replace(/\s+/g, '').toUpperCase();
}

function isValidIban(iban: string): boolean {
  const n = normalizeIban(iban);
  return /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(n);
}

async function assertAdmin(uid: string) {
  const adminDoc = await db.collection('users').doc(uid).get();
  if (adminDoc.data()?.role !== 'ADMIN') {
    throw new functions.https.HttpsError('permission-denied', 'Solo admin.');
  }
}

/**
 * Richiesta prelievo EUR (1 DBC = 1 EUR). Blocca il saldo fino a approvazione/rifiuto admin.
 */
export const requestEurPayout = functions.region('europe-west1').https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Login richiesto.');
  }

  const amount = Number(data?.amountEur);
  const iban = normalizeIban(String(data?.iban || ''));
  const accountHolder = String(data?.accountHolder || '').trim().slice(0, 120);

  if (!Number.isFinite(amount) || amount < MIN_PAYOUT_EUR) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      `Importo minimo prelievo: €${MIN_PAYOUT_EUR}.`
    );
  }
  if (!isValidIban(iban)) {
    throw new functions.https.HttpsError('invalid-argument', 'IBAN non valido.');
  }
  if (!accountHolder || accountHolder.length < 3) {
    throw new functions.https.HttpsError('invalid-argument', 'Intestatario conto obbligatorio.');
  }

  const uid = context.auth.uid;
  const userRef = db.collection('users').doc(uid);

  const pendingSnap = await db
    .collection('payoutRequests')
    .where('userId', '==', uid)
    .where('status', '==', 'PENDING')
    .limit(1)
    .get();

  if (!pendingSnap.empty) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Hai già una richiesta di prelievo in elaborazione.'
    );
  }

  const payoutId = await db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Utente non trovato.');
    }

    const user = userSnap.data()!;
    const role = user.role as string;

    if (role !== 'MECHANIC' && role !== 'PEER_MECHANIC') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Prelievo disponibile solo per meccanici e ciclisti esperti.'
      );
    }

    if (role === 'MECHANIC' && user.kycStatus !== 'APPROVED') {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Completa la verifica KYC prima di richiedere un prelievo.'
      );
    }

    const balance = Number(user.balance) || 0;
    if (amount > balance) {
      throw new functions.https.HttpsError('failed-precondition', 'Saldo insufficiente.');
    }

    const payoutRef = db.collection('payoutRequests').doc();
    const txRef = db.collection('transactions').doc();

    transaction.update(userRef, {
      balance: balance - amount,
      lastTxId: txRef.id,
      payoutIban: iban,
      payoutAccountHolder: accountHolder,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    transaction.set(txRef, {
      fromId: uid,
      toId: 'PAYOUT_ESCROW',
      amount,
      currency: 'EUR',
      type: 'PAYOUT_REQUEST',
      payoutRequestId: payoutRef.id,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    transaction.set(payoutRef, {
      userId: uid,
      userName: user.name || 'Utente',
      userRole: role,
      amountEur: amount,
      iban,
      accountHolder,
      status: 'PENDING',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return payoutRef.id;
  });

  return { success: true, payoutId };
});

/**
 * Admin: segna prelievo come pagato (bonifico inviato) o rifiuta e rimborsa saldo.
 */
export const processEurPayout = functions.region('europe-west1').https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Login richiesto.');
  }
  await assertAdmin(context.auth.uid);

  const payoutId = String(data?.payoutId || '');
  const action = String(data?.action || '') as 'PAID' | 'REJECT';
  const rejectionReason = String(data?.rejectionReason || 'Richiesta non approvata').slice(0, 500);

  if (!payoutId || !['PAID', 'REJECT'].includes(action)) {
    throw new functions.https.HttpsError('invalid-argument', 'Parametri non validi.');
  }

  const payoutRef = db.collection('payoutRequests').doc(payoutId);

  await db.runTransaction(async (transaction) => {
    const payoutSnap = await transaction.get(payoutRef);
    if (!payoutSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Richiesta non trovata.');
    }

    const payout = payoutSnap.data()!;
    if (payout.status !== 'PENDING') {
      throw new functions.https.HttpsError('failed-precondition', 'Richiesta già elaborata.');
    }

    const userRef = db.collection('users').doc(payout.userId);
    const amount = Number(payout.amountEur) || 0;

    if (action === 'PAID') {
      const txRef = db.collection('transactions').doc();
      transaction.update(payoutRef, {
        status: 'PAID',
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        processedBy: context.auth!.uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      transaction.set(txRef, {
        fromId: 'PAYOUT_ESCROW',
        toId: payout.userId,
        amount,
        currency: 'EUR',
        type: 'PAYOUT_PAID',
        payoutRequestId: payoutId,
        iban: payout.iban,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return;
    }

    const userSnap = await transaction.get(userRef);
    const balance = userSnap.exists ? Number(userSnap.data()?.balance) || 0 : 0;
    const txRef = db.collection('transactions').doc();

    transaction.update(userRef, {
      balance: balance + amount,
      lastTxId: txRef.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    transaction.set(txRef, {
      fromId: 'PAYOUT_ESCROW',
      toId: payout.userId,
      amount,
      currency: 'EUR',
      type: 'PAYOUT_REFUND',
      payoutRequestId: payoutId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    transaction.update(payoutRef, {
      status: 'REJECTED',
      rejectionReason,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
      processedBy: context.auth!.uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  return { success: true, action };
});
