import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';
import * as nodemailer from 'nodemailer';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { getSosPlatformFeePercent } from './platformFees';

admin.initializeApp();
const db = admin.firestore();

const ALLOWED_ORIGINS = [
  'https://www.db360app.it',
  'https://db360app.it',
  'https://doctorbike-v2.web.app',
  'https://doctorbike-v2.firebaseapp.com',
  'http://localhost:5173',
  'http://localhost:3000',
];

// Lazy initialization to avoid crashes in v2 (Cloud Run) container.
// functions.config() is NOT available in v2 functions.
let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key || key === 'sk_test_mock') {
      throw new Error('STRIPE_SECRET_KEY is not configured. Set it in .env or functions config.');
    }
    _stripe = new Stripe(key, {
      apiVersion: '2023-10-16',
    });
  }
  return _stripe;
}

let _mailTransporter: nodemailer.Transporter | null = null;
function getMailTransporter(): nodemailer.Transporter | null {
  if (_mailTransporter !== null) return _mailTransporter;
  const mailUser = process.env.MAIL_USER;
  const mailPass = process.env.MAIL_PASS;
  if (mailUser && mailPass) {
    _mailTransporter = nodemailer.createTransport({ service: 'gmail', auth: { user: mailUser, pass: mailPass } });
  }
  return _mailTransporter;
}

/**
 * Escrow Release & SOS Completion
 * Securely transfers funds from Cyclist to Mechanic minus Platform Fees.
 */
export const completeSOS = functions.region('europe-west1').https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be logged in.');
  }

  const { sosId, rating, text } = data;
  if (!sosId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing sosId.');
  }

  const sosRef = db.collection('sosRequests').doc(sosId);
  const cyclistId = context.auth.uid;

  try {
    const result = await db.runTransaction(async (t) => {
      const sosSnap = await t.get(sosRef);
      console.log('SOS snapshot fetched');
      if (!sosSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'SOS non trovato.');
      }

      const sosData = sosSnap.data();
      if (sosData?.cyclistId !== cyclistId) {
        throw new functions.https.HttpsError('permission-denied', 'Solo il ciclista può chiudere questo SOS.');
      }
      const validStatuses = ['ACCEPTED', 'IN_PROGRESS'];
      const currentStatus = sosData?.status || 'Sconosciuto';
      
      // SOS already completed (payment released) — cyclist may still submit stars-only review
      if (currentStatus === 'COMPLETED') {
        const lateRating = data.rating;
        const lateText = data.text || '';

        if (lateRating) {
          const mechanicId = sosData.mechanicId;
          if (!mechanicId) {
            throw new functions.https.HttpsError('failed-precondition', 'Meccanico non associato a questo SOS.');
          }
          const mechanicRef = db.collection('users').doc(mechanicId);
          const reviewRef = db.collection('reviews').doc(sosId);
          const reviewSnap = await t.get(reviewRef);

          if (!reviewSnap.exists) {
            t.set(reviewRef, {
              sosId,
              cyclistId,
              mechanicId,
              cyclistName: sosData.cyclistName || '',
              rating: lateRating,
              text: lateText,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            t.update(mechanicRef, {
              ratingSum: admin.firestore.FieldValue.increment(lateRating),
              reviews: admin.firestore.FieldValue.increment(1),
            });
          }
          t.update(sosRef, { isReviewed: true, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        }
        return { success: true, message: 'Operazione completata.' };
      }

      if (!validStatuses.includes(currentStatus)) {
        throw new functions.https.HttpsError('failed-precondition', `L'SOS non può essere chiuso perché è in stato: ${currentStatus}.`);
      }
      if (!['HELD', 'ESCROW'].includes(sosData?.paymentStatus)) {
        throw new functions.https.HttpsError('failed-precondition', `I fondi non sono in Escrow (Stato attuale: ${sosData?.paymentStatus || 'null'}).`);
      }

      const mechanicId = sosData.mechanicId;
      let amount = sosData.agreedPrice || sosData.estimatedPrice;

      if (!mechanicId || !amount) {
        throw new functions.https.HttpsError('failed-precondition', 'Dati SOS incompleti.');
      }

      const cyclistRef = db.collection('users').doc(cyclistId);
      const mechanicRef = db.collection('users').doc(mechanicId);
      const platformStatsRef = db.collection('platformStats').doc('global');
      const mechStatsRef = db.collection('mechanics').doc(mechanicId);

      const [cyclistSnap, mechanicSnap, platformSnap, mechStatsSnap] = await Promise.all([
         t.get(cyclistRef),
         t.get(mechanicRef),
         t.get(platformStatsRef),
         t.get(mechStatsRef)
      ]);
      console.log('User and stats snapshots fetched');

      const mechanicData = mechanicSnap.data() || {};
      const cyclistData = cyclistSnap.data() || {};
      
      // Server-side price verification: recalculate base price and discount
      const basePrice = mechanicData.sosPrice || amount; // fallback to existing amount
      let discountRate = cyclistData.firstInterventionDiscount;
      if (discountRate === undefined || discountRate === null) {
        discountRate = (cyclistData.completedJobs === 0) ? 0.5 : 0;
      }
      const serverCalculatedPrice = Math.max(0, basePrice - (basePrice * (discountRate || 0)));
      
      // Use server-calculated price if client price is suspiciously different (>1% variance)
      if (Math.abs(amount - serverCalculatedPrice) > 0.01) {
        console.warn(`Price mismatch: client=${amount}, server=${serverCalculatedPrice}. Using server-calculated price.`);
        amount = serverCalculatedPrice;
      }

      const plan = sosData.mechanicPlan || mechanicData.plan || 'BASE';
      const feePercent = getSosPlatformFeePercent(mechanicData.role, plan);
      const feeAmount = amount * feePercent;
      const netAmount = amount - feeAmount;

      const txRef = db.collection('transactions').doc();
      const txData = {
        fromId: cyclistId, // We use cyclistId to satisfy balance subtraction rule if any
        toId: mechanicId,
        amount: netAmount, // Only giving net amount to mechanic
        fee: feeAmount,
        type: 'SOS_PAYMENT',
        status: 'COMPLETED',
        sosId: sosId,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      };

      // Create Intervention Record
      const interventionRef = db.collection('interventions').doc();
      t.set(interventionRef, {
        sosId: sosId,
        date: new Date().toISOString(),
        cyclistId: cyclistId,
        cyclistName: sosData.cyclistName || 'Cyclist',
        mechanicId: mechanicId,
        mechanicName: mechanicData.name || 'Mechanic',
        mechanicType: plan,
        problemDescription: sosData.description || sosData.faultType || 'Intervento',
        problemSeverity: 'medium',
        location: {
            lat: sosData.lat,
            lng: sosData.lng,
            address: sosData.address || ''
        },
        duration: 0,
        cost: amount,
        status: 'completed',
        review: { rating: rating || 0, comment: text || '' }
      });

      // Update Mechanic user balance & stats
      const mechanicUpdates: any = {
         balance: admin.firestore.FieldValue.increment(netAmount),
         mechanicStatus: 'FREE',
         lastTxId: txRef.id
      };

      // --- Gamification Logic ---
      let pointsToAward = 5;
      if (rating === 5) pointsToAward = 20;
      else if (rating === 4) pointsToAward = 10;

      const mechanicBadges = mechanicData.badges || [];

      // Update Mechanic Gamification (use atomic FieldValue.increment to prevent lost updates)
      mechanicUpdates.points = admin.firestore.FieldValue.increment(pointsToAward);
      mechanicUpdates.weeklyPoints = admin.firestore.FieldValue.increment(pointsToAward);
      
      // Basic Badge Check for Mechanic
      const projectedPoints = (mechanicData.points || 0) + pointsToAward;
      if (projectedPoints >= 50 && !mechanicBadges.some((b: any) => b.id === 'first_sos')) {
          mechanicBadges.push({ id: 'first_sos', unlockedAt: Date.now() });
          mechanicUpdates.badges = mechanicBadges;
      }
      
      // Update completed jobs count
      mechanicUpdates.completedJobs = admin.firestore.FieldValue.increment(1);

      // Add Review if provided (stars-only is valid; text optional)
      if (rating) {
         const reviewRef = db.collection('reviews').doc(sosId);
         t.set(reviewRef, {
            mechanicId: mechanicId,
            cyclistId: cyclistId,
            sosId: sosId,
            cyclistName: sosData.cyclistName || '',
            rating: rating,
            text: text || '',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
         });
         
         mechanicUpdates.ratingSum = admin.firestore.FieldValue.increment(rating);
         mechanicUpdates.reviews = admin.firestore.FieldValue.increment(1);
      }

      // Update Cyclist Gamification (atomic increments)
      const cyclistUpdates: any = {
          isSOSActive: false,
          points: admin.firestore.FieldValue.increment(10),
          weeklyPoints: admin.firestore.FieldValue.increment(10),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      // Reset first-intervention discount after first use (prevent repeated discount)
      if (discountRate > 0) {
        cyclistUpdates.firstInterventionDiscount = 0;
      }

      if (mechanicData.role === 'PEER_MECHANIC') {
         mechanicUpdates.peerMechanicEarnings = admin.firestore.FieldValue.increment(netAmount);
         mechanicUpdates.peerMechanicJobsCompleted = admin.firestore.FieldValue.increment(1);
      }
      t.update(mechanicRef, mechanicUpdates);

      // Update Mechanic stats doc if it exists
      if (mechStatsSnap.exists) {
        t.update(mechStatsRef, {
          totalEarnings: admin.firestore.FieldValue.increment(netAmount),
          completedJobs: admin.firestore.FieldValue.increment(1),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }

      // Platform Stats (Admin Wallet)
      if (platformSnap.exists) {
        t.update(platformStatsRef, {
          totalFees: admin.firestore.FieldValue.increment(feeAmount),
          totalTransactions: admin.firestore.FieldValue.increment(amount),
          completedJobs: admin.firestore.FieldValue.increment(1),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } else {
        t.set(platformStatsRef, {
          totalFees: feeAmount,
          totalTransactions: amount,
          completedJobs: 1,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }

      // Finalize SOS — isReviewed only after a review exists (rating may come in a follow-up call)
      const sosFinalize: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {
        cyclistConfirmed: true,
        status: 'COMPLETED',
        paymentStatus: 'RELEASED',
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        platformFee: feeAmount,
        mechanicNet: netAmount,
        finalPrice: amount,
        releaseTxId: txRef.id,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (rating) {
        sosFinalize.isReviewed = true;
      }
      t.update(sosRef, sosFinalize);

      // Finalize Cyclist Profile & Award Points (Balance already deducted during HELD phase)
      t.update(cyclistRef, cyclistUpdates);

      t.set(txRef, txData);

      return { success: true, txId: txRef.id, fee: feeAmount, net: netAmount };
    });

    return result;
  } catch (error) {
    console.error("Escrow Release Failed:", error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError('internal', 'Transaction failed');
  }
});

export const transferFunds = functions.region('europe-west1').https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be logged in.');
  }

  const { toId, amount, toName } = data;
  const fromId = context.auth.uid;

  if (!toId || !amount || amount <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid transfer parameters.');
  }

  try {
    const result = await db.runTransaction(async (t) => {
      const senderRef = db.collection('users').doc(fromId);
      const receiverRef = db.collection('users').doc(toId);

      const [senderSnap, receiverSnap] = await Promise.all([
        t.get(senderRef),
        t.get(receiverRef)
      ]);

      if (!senderSnap.exists || !receiverSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'User not found.');
      }

      const senderData = senderSnap.data() || {};
      const receiverData = receiverSnap.data() || {};

      const senderBalance = senderData.balance || 0;
      if (senderBalance < amount) {
        throw new functions.https.HttpsError('resource-exhausted', 'Insufficient funds.');
      }

      const txRef = db.collection('transactions').doc();

      t.update(senderRef, {
        balance: admin.firestore.FieldValue.increment(-amount),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastTxId: txRef.id
      });

      t.update(receiverRef, {
        balance: admin.firestore.FieldValue.increment(amount),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastTxId: txRef.id
      });

      t.set(txRef, {
        fromId: fromId,
        toId: toId,
        fromName: senderData.name || 'Utente',
        toName: toName || receiverData.name || 'Destinatario',
        amount: amount,
        currency: 'DoctorBike Coin',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        type: 'P2P_TRANSFER'
      });

      return { success: true, txId: txRef.id };
    });

    return result;
  } catch (error) {
    console.error("Transfer Failed:", error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError('internal', 'Transfer failed');
  }
});

export const rewardRoadReport = onDocumentUpdated({
  document: 'roadReports/{reportId}',
  region: 'europe-west1'
}, async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();

  if (!before || !after) return;

  // Only fire when status transitions to 'confirmed' for the first time.
  if (before.status !== 'confirmed' && after.status === 'confirmed') {
    const reporterId = after.reporterId;
    const reportId = event.params.reportId;
    if (!reporterId) return;

    const reportRef = db.collection('roadReports').doc(reportId);
    const userRef = db.collection('users').doc(reporterId);

    try {
      await db.runTransaction(async (t) => {
        const reportSnap = await t.get(reportRef);
        if (!reportSnap.exists) return;

        // Idempotency sentinel: skip if reward was already issued on a previous retry.
        if (reportSnap.data()?.reporterRewarded === true) {
          console.log(`Reporter ${reporterId} already rewarded for report ${reportId} — skipping.`);
          return;
        }

        const userSnap = await t.get(userRef);
        if (!userSnap.exists) return;

        // Atomically increment balance and mark the report as rewarded.
        t.update(userRef, {
          balance: admin.firestore.FieldValue.increment(1.0),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        t.update(reportRef, {
          reporterRewarded: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
      console.log(`Rewarded reporter ${reporterId} for confirmed report ${reportId}`);
    } catch (error) {
      console.error('Error rewarding reporter:', error);
    }
  }
});

const PLAN_DURATION_DAYS = 30;

function checkoutSessionIsPaid(session: Stripe.Checkout.Session): boolean {
  if (session.payment_status === 'paid') return true;
  return session.status === 'complete';
}

function resolveCheckoutPaymentId(session: Stripe.Checkout.Session): string {
  if (typeof session.payment_intent === 'string') return session.payment_intent;
  if (session.payment_intent && typeof session.payment_intent === 'object') {
    return session.payment_intent.id;
  }
  if (typeof session.subscription === 'string') return session.subscription;
  if (session.subscription && typeof session.subscription === 'object') {
    return session.subscription.id;
  }
  return session.id;
}

function resolveCheckoutReturnUrl(
  returnUrl: string | undefined,
  requestOrigin: string | undefined
): string {
  const fallback = process.env.APP_URL || ALLOWED_ORIGINS[0];
  let fallbackOrigin: string;
  try {
    fallbackOrigin = new URL(fallback).origin;
  } catch {
    fallbackOrigin = ALLOWED_ORIGINS[0];
  }

  const tryOrigin = (origin: string, pathname = '/', search = '') => {
    if (!ALLOWED_ORIGINS.includes(origin)) return null;
    const path = pathname === '/onboarding' ? '/' : pathname || '/';
    return `${origin}${path}${search}`;
  };

  if (returnUrl) {
    try {
      const parsed = new URL(returnUrl);
      const resolved = tryOrigin(parsed.origin, parsed.pathname, parsed.search);
      if (resolved) return resolved;
      console.warn(`Blocked returnUrl origin: ${parsed.origin}`);
    } catch (e) {
      console.warn(`Invalid returnUrl: ${returnUrl}`);
    }
  }

  if (requestOrigin) {
    const fromRequest = tryOrigin(requestOrigin);
    if (fromRequest) return fromRequest;
  }

  return `${fallbackOrigin}/`;
}

async function activateSubscriptionFromCheckout(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId || session.client_reference_id;
  const planId = session.metadata?.planId;
  if (!userId || !planId) {
    console.warn('activateSubscriptionFromCheckout: missing userId or planId', session.id);
    return;
  }

  const paymentIntentId = resolveCheckoutPaymentId(session);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + PLAN_DURATION_DAYS);

  // Use session.id as deterministic subscription doc ID to prevent duplicates
  // from concurrent webhook + client calls
  const subRef = db.collection('subscriptions').doc(`checkout_${session.id}`);

  const userRef = db.collection('users').doc(userId);
  const userPlan = planId as string;

  let shouldRecordRevenue = false;

  await db.runTransaction(async (t) => {
    // --- PHASE 1: ALL READS FIRST (Firestore requires reads before writes) ---
    const userSnap = await t.get(userRef);
    if (!userSnap.exists) return;

    const subSnap = await t.get(subRef);
    const txRef = db.collection('transactions').doc(paymentIntentId);
    const txSnap = await t.get(txRef);

    const alreadyPaid = subSnap.exists && subSnap.data()?.status === 'PAID';
    shouldRecordRevenue = !alreadyPaid;

    // --- PHASE 2: ALL WRITES ---
    if (subSnap.exists) {
      t.update(subRef, {
        status: 'PAID',
        stripePaymentIntentId: paymentIntentId,
        expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      t.set(subRef, {
        userId,
        userName: userSnap.data()?.name || 'Meccanico',
        userEmail: userSnap.data()?.email || '',
        planId: userPlan,
        amount: (session.amount_total || 0) / 100,
        currency: session.currency || 'eur',
        status: 'PAID',
        stripeCheckoutSessionId: session.id,
        stripePaymentIntentId: paymentIntentId,
        expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    const txPayload = {
      fromId: userId,
      toId: 'PLATFORM',
      amount: (session.amount_total || 0) / 100,
      type: 'SUBSCRIPTION',
      status: 'COMPLETED',
      stripePaymentId: paymentIntentId,
      stripePaymentIntentId: paymentIntentId,
      planId: userPlan,
      stripeCheckoutSessionId: session.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (txSnap.exists) {
      t.update(txRef, txPayload);
    } else {
      t.set(txRef, {
        ...txPayload,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    t.update(userRef, {
      plan: userPlan,
      planExpiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
      subscriptionPaymentIntentId: paymentIntentId,
      subscriptionPendingPlan: admin.firestore.FieldValue.delete(),
      subscriptionCheckoutSessionId: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  // Webhook + client confirm both call this — increment platform revenue only once per checkout session.
  if (!shouldRecordRevenue) {
    console.log(`activateSubscriptionFromCheckout: revenue already recorded for ${session.id}`);
    return;
  }

  const statsRef = db.collection('platformStats').doc('global');
  await db.runTransaction(async (t) => {
    const snap = await t.get(statsRef);
    const revenue = (session.amount_total || 0) / 100;
    if (snap.exists) {
      t.update(statsRef, {
        totalSubscriptionRevenue: admin.firestore.FieldValue.increment(revenue),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      t.set(statsRef, {
        totalSubscriptionRevenue: revenue,
        totalFees: 0,
        totalTransactions: 0,
        completedJobs: 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  });
}

export const confirmSubscriptionCheckout = functions.region('europe-west1').https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Login richiesto.');
  }
  const sessionId = data?.sessionId as string;
  if (!sessionId) {
    throw new functions.https.HttpsError('invalid-argument', 'sessionId mancante.');
  }

  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    const userId = session.metadata?.userId || session.client_reference_id;
    if (userId !== context.auth.uid) {
      throw new functions.https.HttpsError('permission-denied', 'Sessione non valida per questo utente.');
    }
    if (!checkoutSessionIsPaid(session)) {
      return { success: false, pending: true, planId: session.metadata?.planId || null };
    }
    await activateSubscriptionFromCheckout(session);
    return { success: true, planId: session.metadata?.planId || null };
  } catch (error) {
    console.error('confirmSubscriptionCheckout failed:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError('internal', 'Conferma abbonamento fallita.');
  }
});

export const stripeWebhook = functions.region('europe-west1').https.onRequest(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!endpointSecret) {
    console.error('Missing STRIPE_WEBHOOK_SECRET — imposta la variabile d\'ambiente STRIPE_WEBHOOK_SECRET.');
    res.status(500).send('Webhook secret not configured.');
    return;
  }

  let event;
  try {
    event = getStripe().webhooks.constructEvent(req.rawBody, sig as string, endpointSecret as string);
  } catch (err) {
    res.status(400).send(`Webhook Error: ${err instanceof Error ? err.message : 'Unknown Error'}`);
    return;
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const sessionType = session.metadata?.type || 'TOPUP';

    if (sessionType === 'SUBSCRIPTION') {
      try {
        if (checkoutSessionIsPaid(session)) {
          await activateSubscriptionFromCheckout(session);
        }
      } catch (e) {
        console.error('Subscription checkout.session.completed failed:', e);
      }
    } else {
      const userId = session.metadata?.userId || session.client_reference_id;
      const amountStr = session.metadata?.dbcAmount;
      const paymentIntentId =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id;

      if (userId && amountStr && paymentIntentId) {
        const dbcAmount = parseFloat(amountStr);
        if (!isNaN(dbcAmount)) {
          const txRef = db.collection('transactions').doc(paymentIntentId);
          try {
            await db.runTransaction(async (t) => {
              const userRef = db.collection('users').doc(userId);
              t.update(userRef, { balance: admin.firestore.FieldValue.increment(dbcAmount) });
              t.set(txRef, {
                fromId: 'STRIPE_TOPUP',
                toId: userId,
                amount: dbcAmount,
                type: 'TOPUP',
                status: 'COMPLETED',
                stripePaymentId: paymentIntentId,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
              });
            });
          } catch (e) {
            console.error('Top-up checkout session failed:', e);
          }
        }
      }
    }
  }

  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    const userId = paymentIntent.metadata?.userId;
    const amountStr = paymentIntent.metadata?.dbcAmount;

    if (userId && amountStr) {
      const dbcAmount = parseFloat(amountStr);
      if (isNaN(dbcAmount)) { console.error(`Invalid dbcAmount: ${amountStr}`); res.json({received: true}); return; }
      const txRef = db.collection('transactions').doc(paymentIntent.id);
      
      try {
        await db.runTransaction(async (t) => {
          const txSnap = await t.get(txRef);
          const userRef = db.collection('users').doc(userId);
          
          if (txSnap.exists) {
            // Client already created PENDING transaction and incremented balance — just update status
            const txData = txSnap.data();
            if (txData && txData.status !== 'COMPLETED') {
              t.update(txRef, { status: 'COMPLETED', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
            }
            // Do NOT increment balance again — client already did it in their runTransaction
          } else {
            // Webhook creates transaction from scratch
            t.update(userRef, { balance: admin.firestore.FieldValue.increment(dbcAmount) });
            t.set(txRef, {
              fromId: 'STRIPE_TOPUP',
              toId: userId,
              amount: dbcAmount,
              type: 'TOPUP',
              status: 'COMPLETED',
              stripePaymentId: paymentIntent.id,
              createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
          }
        });
      } catch (e) {
        console.error("Topup transaction failed:", e);
      }
    }

    // Handle subscription payments: update subscription and transaction status
    try {
      const subsQuery = await db.collection('subscriptions')
        .where('stripePaymentIntentId', '==', paymentIntent.id)
        .where('status', '==', 'PENDING')
        .limit(1)
        .get();
      
      if (!subsQuery.empty) {
        const subDoc = subsQuery.docs[0];
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30); // 30 days from now
        
        await subDoc.ref.update({
          status: 'PAID',
          expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }

      const txQuery = await db.collection('transactions')
        .where('stripePaymentIntentId', '==', paymentIntent.id)
        .where('status', '==', 'PENDING')
        .limit(1)
        .get();
      
      if (!txQuery.empty) {
        await txQuery.docs[0].ref.update({
          status: 'COMPLETED',
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    } catch (e) {
      console.error("Subscription confirmation failed:", e);
    }
  }

  res.json({received: true});
});

/**
 * Create Stripe Payment Intent (HTTP Request version to bypass CORS issues)
 */
function setCorsHeaders(res: any, req: any) {
  const origin = req.headers.origin;
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  res.set('Access-Control-Allow-Origin', allowedOrigin);
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Authorization');
  res.set('Access-Control-Allow-Credentials', 'true');
}

export const createStripePayment = functions.region('europe-west1').https.onRequest(async (req, res) => {
  // 1. Manual CORS Handling
  setCorsHeaders(res, req);

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    // 2. Auth Verification (Manual)
    // Fallback: Check body.token if headers are stripped by proxy
    const authHeader = req.headers.authorization || req.headers.Authorization || req.headers['x-authorization'];
    const bodyToken = req.body.token;
    
    console.log('Incoming request. Auth header:', !!authHeader, 'X-Auth:', !!req.headers['x-authorization'], 'Body token:', !!bodyToken);

    let idToken = '';
    if (authHeader && (authHeader as string).startsWith('Bearer ')) {
      idToken = (authHeader as string).split('Bearer ')[1];
    } else if (bodyToken) {
      idToken = bodyToken;
    }

    if (!idToken) {
      console.warn('Missing token in headers and body. Headers:', JSON.stringify(req.headers));
      res.status(401).json({ error: 'Unauthorized: Missing token in headers or body' });
      return;
    }

    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const userId = decodedToken.uid;
    console.log('Token verified for user:', userId);
    console.log('Token verified for user:', userId);

    // 3. Payload Validation
    const { amount, currency = 'eur' } = req.body;
    if (!amount || amount <= 0) {
      res.status(400).json({ error: 'Invalid amount' });
      return;
    }

    // 4. Stripe Logic
    const paymentIntent = await getStripe().paymentIntents.create({
      amount: Math.round(amount * 100), // convert to cents
      currency,
      metadata: {
        userId: userId,
        dbcAmount: amount.toString(),
        platform: 'DoctorBikeV2'
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    res.json({ 
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id 
    });
  } catch (error) {
    console.error('Stripe Payment Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * Create Stripe Checkout Session (migrated from Payment Elements)
 * User is redirected to Stripe-hosted checkout page for better security and less code.
 */
export const createCheckoutSession = functions.region('europe-west1').https.onRequest(async (req, res) => {
  // 1. Manual CORS Handling
  setCorsHeaders(res, req);

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    // 2. Auth Verification (Manual)
    const authHeader = req.headers.authorization || req.headers.Authorization || req.headers['x-authorization'];
    const bodyToken = req.body.token;
    
    let idToken = '';
    if (authHeader && (authHeader as string).startsWith('Bearer ')) {
      idToken = (authHeader as string).split('Bearer ')[1];
    } else if (bodyToken) {
      idToken = bodyToken;
    }

    if (!idToken) {
      res.status(401).json({ error: 'Unauthorized: Missing token in headers or body' });
      return;
    }

    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const userId = decodedToken.uid;

    // 3. Payload Validation
    const { amount, currency = 'eur', type = 'TOPUP', planId, returnUrl } = req.body;
    if (!amount || amount <= 0) {
      res.status(400).json({ error: 'Invalid amount' });
      return;
    }

    const isSubscription = type === 'SUBSCRIPTION';
    const requestOrigin = req.headers.origin as string | undefined;
    let validatedReturnUrl = resolveCheckoutReturnUrl(returnUrl, requestOrigin);
    if (isSubscription && !validatedReturnUrl.includes('stripe_return=')) {
      const sep = validatedReturnUrl.includes('?') ? '&' : '?';
      validatedReturnUrl = `${validatedReturnUrl}${sep}stripe_return=onboarding`;
    }
    const separator = validatedReturnUrl.includes('?') ? '&' : '?';
    const successUrl = `${validatedReturnUrl}${separator}session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${validatedReturnUrl}${separator}session_id={CHECKOUT_SESSION_ID}`;

    // 4. Create Checkout Session
    const session = await getStripe().checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: currency,
          product_data: {
            name: isSubscription ? `Abbonamento ${planId || 'Pro'}` : 'Ricarica Saldo DoctorBike',
            description: isSubscription ? 'Abbonamento mensile DoctorBike 360' : `Ricarica di ${amount} EUR`,
          },
          unit_amount: Math.round(amount * 100), // convert to cents
          recurring: isSubscription ? { interval: 'month' } : undefined,
        },
        quantity: 1,
      }],
      mode: isSubscription ? 'subscription' : 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: userId,
      metadata: {
        userId: userId,
        dbcAmount: amount.toString(),
        type: type,
        planId: planId || '',
        platform: 'DoctorBikeV2'
      },
    });

    if (isSubscription && planId) {
      const userSnap = await db.collection('users').doc(userId).get();
      const userData = userSnap.data() || {};
      // Same doc id as activateSubscriptionFromCheckout — avoids duplicate PENDING + PAID rows.
      const subRef = db.collection('subscriptions').doc(`checkout_${session.id}`);
      await subRef.set({
        userId,
        userName: userData.name || decodedToken.name || 'Meccanico',
        userEmail: userData.email || decodedToken.email || '',
        planId,
        amount,
        currency,
        status: 'PENDING',
        stripeCheckoutSessionId: session.id,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      await db.collection('users').doc(userId).set(
        {
          subscriptionPendingPlan: planId,
          subscriptionCheckoutSessionId: session.id,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    res.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    console.error('Checkout Session Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * Refund a Stripe Payment Intent (Admin only)
 */
export const refundPayment = functions.region('europe-west1').https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be logged in.');
  }

  // 1. Verify Admin
  const adminDoc = await db.collection('users').doc(context.auth.uid).get();
  if (adminDoc.data()?.role !== 'ADMIN') {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can issue refunds.');
  }

  const { paymentIntentId, reason = 'requested_by_customer' } = data;
  if (!paymentIntentId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing paymentIntentId.');
  }

  try {
    // First: Find and validate the transaction in Firestore
    const txQuery = await db.collection('transactions')
      .where('stripePaymentIntentId', '==', paymentIntentId)
      .limit(1)
      .get();

    if (txQuery.empty) {
      throw new functions.https.HttpsError('not-found', 'Transaction not found for this payment intent.');
    }

    const txDoc = txQuery.docs[0];
    const txData = txDoc.data();

    if (txData.status === 'REFUNDED') {
      throw new functions.https.HttpsError('failed-precondition', 'Transaction already refunded.');
    }

    // Second: Update Firestore BEFORE calling Stripe (reversing the original order)
    // so that if Firestore fails, we never call Stripe
    let userRef: admin.firestore.DocumentReference | null = null;
    
    await db.runTransaction(async (t) => {
      // 1. Mark transaction as refunded
      t.update(txDoc.ref, { 
        status: 'REFUNDED',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // 2. For TOPUP: decrement user balance (claw back the DBC)
      if (txData.type === 'TOPUP' && txData.toId) {
        userRef = db.collection('users').doc(txData.toId);
        const userSnap = await t.get(userRef);
        if (userSnap.exists) {
          t.update(userRef, {
            balance: admin.firestore.FieldValue.increment(-txData.amount),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      }

      // 3. Decrement Platform Stats
      const statsRef = db.collection('platformStats').doc('global');
      const statsSnap = await t.get(statsRef);
      if (statsSnap.exists) {
        t.update(statsRef, {
          totalSubscriptionRevenue: txData.type === 'SUBSCRIPTION'
            ? admin.firestore.FieldValue.increment(-txData.amount)
            : admin.firestore.FieldValue.increment(0),
          completedJobs: txData.type === 'SOS_PAYMENT'
            ? admin.firestore.FieldValue.increment(-1)
            : admin.firestore.FieldValue.increment(0),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    });

    // Third: Now call Stripe (Firestore already updated — if Stripe fails we have an audit log)
    const refund = await getStripe().refunds.create({
      payment_intent: paymentIntentId,
      reason: reason as Stripe.RefundCreateParams.Reason,
    });

    console.log(`Refund issued for ${paymentIntentId}:`, refund.id);

    // Fourth: Store the refund ID in the transaction document
    await txDoc.ref.update({ refundId: refund.id });

    return { success: true, refundId: refund.id };
  } catch (error) {
    console.error('Stripe Refund Error:', error);
    throw new functions.https.HttpsError('internal', 'Refund failed');
  }
});

/**
 * Clear All Users from Firebase Auth (except Admins)
 * This is a high-privilege administrative tool.
 */
export const clearAllUsersAuth = functions.region('europe-west1').https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be logged in.');
  }

  // Verify requester is ADMIN in Firestore
  const adminDoc = await db.collection('users').doc(context.auth.uid).get();
  if (adminDoc.data()?.role !== 'ADMIN') {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can clear authentication data.');
  }

  try {
    // Paginate through all users (listUsers max 1000 per page)
    const usersToDelete: string[] = [];
    let allUsers: admin.auth.UserRecord[] = [];
    let nextPageToken: string | undefined = undefined;
    let currentPage: admin.auth.ListUsersResult;
    
    do {
      currentPage = await admin.auth().listUsers(1000, nextPageToken);
      allUsers = allUsers.concat(currentPage.users);
      nextPageToken = currentPage.pageToken;
    } while (nextPageToken);
    
    // Filter out the current admin who is performing the reset
    const usersToCheck = allUsers.filter(u => u.uid !== context.auth?.uid);

    // Fetch user documents in chunks of 100 to avoid N+1 queries
    for (let i = 0; i < usersToCheck.length; i += 100) {
      const chunk = usersToCheck.slice(i, i + 100);
      const docRefs = chunk.map(u => db.collection('users').doc(u.uid));
      
      if (docRefs.length > 0) {
        const userDocs = await db.getAll(...docRefs);

        for (const userDoc of userDocs) {
          // If the user does not exist in Firestore or is not an ADMIN, add to delete list
          if (!userDoc.exists || userDoc.data()?.role !== 'ADMIN') {
            usersToDelete.push(userDoc.id);
          }
        }
      }
    }

    if (usersToDelete.length > 0) {
      // Delete users in chunks of 100
      const chunks = [];
      for (let i = 0; i < usersToDelete.length; i += 100) {
        chunks.push(usersToDelete.slice(i, i + 100));
      }

      for (const chunk of chunks) {
        await admin.auth().deleteUsers(chunk);
      }
    }

    return { 
      success: true, 
      count: usersToDelete.length, 
      message: `${usersToDelete.length} utenti rimossi da Firebase Auth.` 
    };
  } catch (error) {
    console.error('Error clearing users auth:', error);
    throw new functions.https.HttpsError('internal', 'Errore durante la pulizia degli account.');
  }
});

/**
 * Trigger Email and Refund on KYC status change (v2)
 */
export const notifyUserKycStatus = onDocumentUpdated({
  document: 'users/{userId}',
  region: 'europe-west1'
}, async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();

  if (!before || !after) return;

  // Only proceed if kycStatus changed
  if (before.kycStatus === after.kycStatus) return;

  const userId = event.params.userId;
  const userEmail = after.email;
  const newStatus = after.kycStatus;

  console.log(`KYC Status changed for user ${userId}: ${before.kycStatus} -> ${newStatus}`);

  if (!userEmail) {
    console.warn(`No email found for user ${userId}, skipping notification.`);
    return;
  }

  try {
    const mailUser = process.env.MAIL_USER;
    const mailPass = process.env.MAIL_PASS;

    if (!mailUser || !mailPass) {
      console.warn('Mail configuration missing.');
      return;
    }

    if (!getMailTransporter()) {
      console.warn('Mail transporter not configured.');
      return;
    }

    const transporter = getMailTransporter()!;

    let subject = '';
    let text = '';

    if (newStatus === 'APPROVED') {
      subject = 'Account DoctorBike Approvato! 🚴‍♂️';
      text = `Ciao ${after.name || 'Meccanico'},\n\nGrandi notizie! I tuoi documenti sono stati verificati con successo. Ora sei un meccanico ufficiale sulla piattaforma DoctorBike.\n\nPuoi iniziare a ricevere richieste di assistenza e guadagnare subito!\n\nA presto,\nIl Team DoctorBike`;
    } else if (newStatus === 'REJECTED') {
      subject = 'Aggiornamento Documenti DoctorBike ⚠️';
      text = `Ciao ${after.name || 'Meccanico'},\n\nTi informiamo che i documenti caricati non hanno superato la verifica KYC.\n\nMotivo: ${after.kycRejectionReason || 'Documenti non conformi o illeggibili.'}\n\nAbbiamo provveduto a rimborsare la tua quota di iscrizione sul tuo saldo. Puoi caricare nuovi documenti dalla sezione profilo dell'app.\n\nSe hai domande, rispondi a questa email.\n\nIl Team DoctorBike`;
    } else {
      return;
    }

    await transporter.sendMail({
      from: `"DoctorBike Support" <${process.env.MAIL_USER}>`,
      to: userEmail,
      subject: subject,
      text: text,
    });

    console.log(`KYC notification email sent to ${userEmail} for status ${newStatus}`);
  } catch (error) {
    console.error('Error in notifyUserKycStatus:', error);
  }
});

/**
 * Send KYC Notification Email (Manual Trigger)
 */
export const sendKycEmail = functions.region('europe-west1').https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be logged in.');
  }

  const adminDoc = await db.collection('users').doc(context.auth.uid).get();
  if (adminDoc.data()?.role !== 'ADMIN') {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can send KYC emails.');
  }

  const { userId, status, reason } = data;
  if (!userId || !status) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing parameters.');
  }

  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) throw new functions.https.HttpsError('not-found', 'User not found.');
    
    const userData = userDoc.data() || {};
    const userEmail = userData.email;
    if (!userEmail) return { success: false, message: 'No email found' };

    if (!getMailTransporter()) {
       console.warn('Mail transporter not configured.');
       return { success: false, message: 'Mail config missing' };
    }

    const transporter = getMailTransporter()!;

    let subject = '';
    let text = '';

    if (status === 'APPROVED') {
      subject = 'Account DoctorBike Approvato! 🚴‍♂️';
      text = `Ciao ${userData.name || 'Meccanico'},\n\nGrandi notizie! I tuoi documenti sono stati verificati con successo. Ora sei un meccanico ufficiale sulla piattaforma DoctorBike.\n\nPuoi iniziare a ricevere richieste di assistenza e guadagnare subito!\n\nA presto,\nIl Team DoctorBike`;
    } else {
      subject = 'Aggiornamento Documenti DoctorBike ⚠️';
      text = `Ciao ${userData.name || 'Meccanico'},\n\nTi informiamo che i documenti caricati non hanno superato la verifica KYC.\n\nMotivo: ${reason || 'Documenti non conformi o illeggibili.'}\n\nAbbiamo provveduto a rimborsare la tua quota di iscrizione sul tuo saldo. Puoi caricare nuovi documenti dalla sezione profilo dell'app.\n\nSe hai domande, rispondi a questa email.\n\nIl Team DoctorBike`;
    }

    await transporter.sendMail({
      from: `"DoctorBike Support" <${process.env.MAIL_USER}>`,
      to: userEmail,
      subject: subject,
      text: text,
    });

    return { success: true };
  } catch (error) {
    console.error('Error sending KYC email:', error);
    throw new functions.https.HttpsError('internal', 'Email failed');
  }
});

/**
 * Scheduled function: sends daily reminder push notifications
 * to users who have dailyReminderEnabled=true and haven't claimed today.
 * Runs every day at 9:00 AM UTC.
 */
export const sendDailyBonusReminder = functions
  .region('europe-west1')
  .pubsub
  .schedule('every day 09:00')
  .timeZone('Europe/Rome')
  .onRun(async (context) => {
    console.log('Running daily bonus reminder job...');

    try {
      const usersSnapshot = await db
        .collection('users')
        .where('dailyReminderEnabled', '==', true)
        .get();

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      let sentCount = 0;

      for (const userDoc of usersSnapshot.docs) {
        const userData = userDoc.data();
        const lastClaim = userData.lastDailyClaim?.toDate?.();
        
        if (lastClaim && lastClaim >= todayStart) {
          continue; // Already claimed today
        }

        const fcmTokens = userData.fcmTokens || [];
        if (fcmTokens.length === 0) continue;

        const message = {
          notification: {
            title: '🎁 Bonus giornaliero DB360!',
            body: `Hai ${userData.dailyStreak || 1} giorni di streak! Riscuoti +10 punti reputazione ora.`,
          },
          data: {
            type: 'daily_bonus',
            streak: String(userData.dailyStreak || 1),
          },
          tokens: fcmTokens,
        };

        try {
          await admin.messaging().sendEachForMulticast(message);
          sentCount++;
        } catch (err) {
          console.error(`Failed to send reminder to user ${userDoc.id}:`, err);
        }
      }

      console.log(`Daily bonus reminder completed. Sent to ${sentCount} users.`);
      return { success: true, sentCount };
    } catch (error) {
      console.error('Daily bonus reminder job failed:', error);
      return { success: false, error };
    }
  });

export { askBikeDoctor, analyzeBikeIssue } from './gemini';
export { disputeSOS } from './disputes';
export { requestEurPayout, processEurPayout } from './payouts';
export { resetWeeklyPoints } from './leaderboard';
export { sanitizeAllLoyaltyPoints } from './loyaltySanitize';
export { productionReset } from './productionReset';
