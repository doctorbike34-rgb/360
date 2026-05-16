import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';
import * as nodemailer from 'nodemailer';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';

admin.initializeApp();
const db = admin.firestore();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || functions.config().stripe?.secret || 'sk_test_mock', {
  apiVersion: '2023-10-16',
});

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
      
      // If already completed, just handle review if provided
      if (currentStatus === 'COMPLETED') {
        const rating = data.rating;
        const text = data.text || '';
        
        if (rating && !sosData.isReviewed) {
           const mechanicId = sosData.mechanicId;
           const mechanicRef = db.collection('users').doc(mechanicId);
           const mechanicSnap = await t.get(mechanicRef);
           const mechanicData = mechanicSnap.data() || {};

           const reviewRef = db.collection('reviews').doc();
           t.set(reviewRef, {
             sosId: sosId,
             cyclistId: cyclistId,
             mechanicId: mechanicId,
             rating: rating,
             text: text,
             createdAt: admin.firestore.FieldValue.serverTimestamp()
           });

           const oldRating = mechanicData.rating || 5.0;
           const oldReviews = mechanicData.reviews || 0;
           const newReviews = oldReviews + 1;
           const newRating = ((oldRating * oldReviews) + rating) / newReviews;

           t.update(mechanicRef, {
              rating: newRating,
              reviews: newReviews
           });
           t.update(sosRef, { isReviewed: true });
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
      const amount = sosData.agreedPrice || sosData.estimatedPrice;

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
      const plan = sosData.mechanicPlan || 'BASE';
      
      // Calculate Fee
      let feePercent = 0.15; // default 15%
      if (mechanicData.role === 'PEER_MECHANIC') {
        feePercent = 0.05; // 5% for expert cyclists
      } else {
        const feeMultipliers: Record<string, number> = { PRO: 0.05, CLUB: 0.10, BASE: 0.15 };
        feePercent = feeMultipliers[plan] !== undefined ? feeMultipliers[plan] : 0.15;
      }

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

      // Add Review if provided
      let newRating = mechanicData.rating || 5.0;
      let newReviews = mechanicData.reviews || 0;

      if (rating) {
         const reviewRef = db.collection('reviews').doc();
         t.set(reviewRef, {
            mechanicId: mechanicId,
            cyclistId: cyclistId,
            sosId: sosId,
            rating: rating,
            text: text || '',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
         });
         
         const oldRating = mechanicData.rating || 5.0;
         const oldReviews = mechanicData.reviews || 0;
         newReviews = oldReviews + 1;
         newRating = ((oldRating * oldReviews) + rating) / newReviews;
      }

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

      const currentPoints = mechanicData.points || 0;
      const currentWeekly = mechanicData.weeklyPoints || 0;
      const mechanicBadges = mechanicData.badges || [];
      
      const cyclistData = cyclistSnap.data() || {};
      const cyclistPoints = cyclistData.points || 0;
      const cyclistWeekly = cyclistData.weeklyPoints || 0;

      // Update Mechanic Gamification
      mechanicUpdates.points = currentPoints + pointsToAward;
      mechanicUpdates.weeklyPoints = currentWeekly + pointsToAward;
      
      // Basic Badge Check for Mechanic
      if (mechanicUpdates.points >= 50 && !mechanicBadges.some((b: any) => b.id === 'first_sos')) {
          mechanicBadges.push({ id: 'first_sos', unlockedAt: Date.now() });
          mechanicUpdates.badges = mechanicBadges;
      }

      // Update Cyclist Gamification
      const cyclistUpdates: any = {
          isSOSActive: false,
          points: cyclistPoints + 10,
          weeklyPoints: cyclistWeekly + 10,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      if (rating) {
         mechanicUpdates.rating = newRating;
         mechanicUpdates.reviews = newReviews;
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

      // Finalize SOS
      t.update(sosRef, {
        isReviewed: true,
        cyclistConfirmed: true,
        status: 'COMPLETED',
        paymentStatus: 'RELEASED',
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        platformFee: feeAmount,
        mechanicNet: netAmount,
        finalPrice: netAmount,
        releaseTxId: txRef.id,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Finalize Cyclist Profile & Award Points (Balance already deducted during HELD phase)
      t.update(cyclistRef, cyclistUpdates);

      t.set(txRef, txData);

      return { success: true, txId: txRef.id, fee: feeAmount, net: netAmount };
    });

    return result;
  } catch (error: any) {
    console.error("Escrow Release Failed:", error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError('internal', error.message || 'Transaction failed');
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
  } catch (error: any) {
    console.error("Transfer Failed:", error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError('internal', error.message || 'Transfer failed');
  }
});

export const rewardRoadReport = onDocumentUpdated({
  document: 'roadReports/{reportId}',
  region: 'europe-west1'
}, async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();

  if (!before || !after) return;

  if (before.status !== 'confirmed' && after.status === 'confirmed') {
    const reporterId = after.reporterId;
    if (!reporterId) return;

    try {
      await db.collection('users').doc(reporterId).update({
        balance: admin.firestore.FieldValue.increment(1.0),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(`Rewarded reporter ${reporterId} for confirmed report ${event.params.reportId}`);
    } catch (error) {
      console.error('Error rewarding reporter:', error);
    }
  }
});

export const stripeWebhook = functions.region('europe-west1').https.onRequest(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || functions.config().stripe?.webhook_secret;

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig as string, endpointSecret as string);
  } catch (err: any) {
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    const userId = paymentIntent.metadata?.userId;
    const amountStr = paymentIntent.metadata?.dbcAmount;

    if (userId && amountStr) {
      const dbcAmount = parseFloat(amountStr);
      const txRef = db.collection('transactions').doc(paymentIntent.id);
      
      try {
        await db.runTransaction(async (t) => {
          const txSnap = await t.get(txRef);
          if (txSnap.exists) return;

          const userRef = db.collection('users').doc(userId);
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
        });
      } catch (e) {
        console.error("Topup transaction failed:", e);
      }
    }
  }

  res.json({received: true});
});

/**
 * Create Stripe Payment Intent (HTTP Request version to bypass CORS issues)
 */
export const createStripePayment = functions.region('europe-west1').https.onRequest(async (req, res) => {
  // 1. Manual CORS Handling
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

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
    const paymentIntent = await stripe.paymentIntents.create({
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
  } catch (error: any) {
    console.error('Stripe Payment Error:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
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
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      reason: reason as Stripe.RefundCreateParams.Reason,
    });

    console.log(`Refund issued for ${paymentIntentId}:`, refund.id);

    // Update Firestore to reflect the refund
    try {
      const txQuery = await db.collection('transactions')
        .where('stripePaymentIntentId', '==', paymentIntentId)
        .limit(1)
        .get();

      if (!txQuery.empty) {
        const txDoc = txQuery.docs[0];
        const txData = txDoc.data();
        
        await db.runTransaction(async (t) => {
          // 1. Mark transaction as refunded
          t.update(txDoc.ref, { 
            status: 'REFUNDED',
            refundId: refund.id,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });

          // 2. Decrement Platform Stats if it was a subscription
          if (txData.type === 'SUBSCRIPTION') {
            const statsRef = db.collection('platformStats').doc('global');
            t.update(statsRef, {
              totalSubscriptionRevenue: admin.firestore.FieldValue.increment(-txData.amount),
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
          }
        });
      }
    } catch (fsErr) {
      console.error('Error updating Firestore after refund:', fsErr);
    }

    return { success: true, refundId: refund.id };
  } catch (error: any) {
    console.error('Stripe Refund Error:', error);
    throw new functions.https.HttpsError('internal', error.message || 'Refund failed');
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
    const listUsersResult = await admin.auth().listUsers(1000);
    const usersToDelete: string[] = [];
    
    // Filter out the current admin who is performing the reset
    const usersToCheck = listUsersResult.users.filter(u => u.uid !== context.auth?.uid);

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
    const mailUser = functions.config().mail?.user;
    const mailPass = functions.config().mail?.pass;

    if (!mailUser || !mailPass) {
      console.warn('Mail configuration missing.');
      return;
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: mailUser, pass: mailPass }
    });

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
      from: `"DoctorBike Support" <${mailUser}>`,
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

    const mailUser = functions.config().mail?.user;
    const mailPass = functions.config().mail?.pass;
    if (!mailUser || !mailPass) {
       console.warn('Mail configuration missing.');
       return { success: false, message: 'Mail config missing' };
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: mailUser, pass: mailPass }
    });

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
      from: `"DoctorBike Support" <${mailUser}>`,
      to: userEmail,
      subject: subject,
      text: text,
    });

    return { success: true };
  } catch (error: any) {
    console.error('Error sending KYC email:', error);
    throw new functions.https.HttpsError('internal', error.message || 'Email failed');
  }
});
