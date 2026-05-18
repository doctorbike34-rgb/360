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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a, _b, _c;
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendKycEmail = exports.notifyUserKycStatus = exports.clearAllUsersAuth = exports.refundPayment = exports.createCheckoutSession = exports.createStripePayment = exports.stripeWebhook = exports.rewardRoadReport = exports.transferFunds = exports.completeSOS = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const stripe_1 = __importDefault(require("stripe"));
const nodemailer = __importStar(require("nodemailer"));
const firestore_1 = require("firebase-functions/v2/firestore");
admin.initializeApp();
const db = admin.firestore();
const stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY || ((_a = functions.config().stripe) === null || _a === void 0 ? void 0 : _a.secret) || 'sk_test_mock', {
    apiVersion: '2023-10-16',
});
// Shared nodemailer transporter (created once, reused across invocations)
const mailUser = process.env.MAIL_USER || ((_b = functions.config().mail) === null || _b === void 0 ? void 0 : _b.user);
const mailPass = process.env.MAIL_PASS || ((_c = functions.config().mail) === null || _c === void 0 ? void 0 : _c.pass);
const mailTransporter = (mailUser && mailPass)
    ? nodemailer.createTransport({ service: 'gmail', auth: { user: mailUser, pass: mailPass } })
    : null;
/**
 * Escrow Release & SOS Completion
 * Securely transfers funds from Cyclist to Mechanic minus Platform Fees.
 */
exports.completeSOS = functions.region('europe-west1').https.onCall(async (data, context) => {
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
            if ((sosData === null || sosData === void 0 ? void 0 : sosData.cyclistId) !== cyclistId) {
                throw new functions.https.HttpsError('permission-denied', 'Solo il ciclista può chiudere questo SOS.');
            }
            const validStatuses = ['ACCEPTED', 'IN_PROGRESS'];
            const currentStatus = (sosData === null || sosData === void 0 ? void 0 : sosData.status) || 'Sconosciuto';
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
                    const oldRating = mechanicData.rating || 0;
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
            if (!['HELD', 'ESCROW'].includes(sosData === null || sosData === void 0 ? void 0 : sosData.paymentStatus)) {
                throw new functions.https.HttpsError('failed-precondition', `I fondi non sono in Escrow (Stato attuale: ${(sosData === null || sosData === void 0 ? void 0 : sosData.paymentStatus) || 'null'}).`);
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
            const plan = sosData.mechanicPlan || 'BASE';
            // Calculate Fee
            let feePercent = 0.15; // default 15%
            if (mechanicData.role === 'PEER_MECHANIC') {
                feePercent = 0.05; // 5% for expert cyclists
            }
            else {
                const feeMultipliers = { PRO: 0.05, CLUB: 0.10, BASE: 0.15 };
                feePercent = feeMultipliers[plan] !== undefined ? feeMultipliers[plan] : 0.15;
            }
            const feeAmount = amount * feePercent;
            const netAmount = amount - feeAmount;
            const txRef = db.collection('transactions').doc();
            const txData = {
                fromId: cyclistId,
                toId: mechanicId,
                amount: netAmount,
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
            const mechanicUpdates = {
                balance: admin.firestore.FieldValue.increment(netAmount),
                mechanicStatus: 'FREE',
                lastTxId: txRef.id
            };
            // --- Gamification Logic ---
            let pointsToAward = 5;
            if (rating === 5)
                pointsToAward = 20;
            else if (rating === 4)
                pointsToAward = 10;
            const currentPoints = mechanicData.points || 0;
            const currentWeekly = mechanicData.weeklyPoints || 0;
            const currentCompletedJobs = mechanicData.completedJobs || 0;
            const mechanicBadges = mechanicData.badges || [];
            const cyclistData2 = cyclistSnap.data() || {};
            const cyclistPoints = cyclistData2.points || 0;
            const cyclistWeekly = cyclistData2.weeklyPoints || 0;
            // Update Mechanic Gamification
            mechanicUpdates.points = currentPoints + pointsToAward;
            mechanicUpdates.weeklyPoints = currentWeekly + pointsToAward;
            // Basic Badge Check for Mechanic
            if (mechanicUpdates.points >= 50 && !mechanicBadges.some((b) => b.id === 'first_sos')) {
                mechanicBadges.push({ id: 'first_sos', unlockedAt: Date.now() });
                mechanicUpdates.badges = mechanicBadges;
            }
            // Update completed jobs count (only for regular mechanics, peer mechanics track their own)
            mechanicUpdates.completedJobs = currentCompletedJobs + 1;
            // Update Cyclist Gamification
            const cyclistUpdates = {
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
            }
            else {
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
    }
    catch (error) {
        console.error("Escrow Release Failed:", error);
        if (error instanceof functions.https.HttpsError)
            throw error;
        throw new functions.https.HttpsError('internal', error instanceof Error && error.message ? error.message : 'Transaction failed');
    }
});
exports.transferFunds = functions.region('europe-west1').https.onCall(async (data, context) => {
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
    }
    catch (error) {
        console.error("Transfer Failed:", error);
        if (error instanceof functions.https.HttpsError)
            throw error;
        throw new functions.https.HttpsError('internal', error instanceof Error && error.message ? error.message : 'Transfer failed');
    }
});
exports.rewardRoadReport = (0, firestore_1.onDocumentUpdated)({
    document: 'roadReports/{reportId}',
    region: 'europe-west1'
}, async (event) => {
    var _a, _b;
    const before = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
    const after = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
    if (!before || !after)
        return;
    if (before.status !== 'confirmed' && after.status === 'confirmed') {
        const reporterId = after.reporterId;
        if (!reporterId)
            return;
        try {
            await db.collection('users').doc(reporterId).update({
                balance: admin.firestore.FieldValue.increment(1.0),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`Rewarded reporter ${reporterId} for confirmed report ${event.params.reportId}`);
        }
        catch (error) {
            console.error('Error rewarding reporter:', error);
        }
    }
});
exports.stripeWebhook = functions.region('europe-west1').https.onRequest(async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g;
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || ((_a = functions.config().stripe) === null || _a === void 0 ? void 0 : _a.webhook_secret);
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
    }
    catch (err) {
        res.status(400).send(`Webhook Error: ${err instanceof Error ? err.message : 'Unknown Error'}`);
        return;
    }
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const userId = ((_b = session.metadata) === null || _b === void 0 ? void 0 : _b.userId) || session.client_reference_id;
        const amountStr = (_c = session.metadata) === null || _c === void 0 ? void 0 : _c.dbcAmount;
        const sessionType = ((_d = session.metadata) === null || _d === void 0 ? void 0 : _d.type) || 'TOPUP';
        const planId = (_e = session.metadata) === null || _e === void 0 ? void 0 : _e.planId;
        const paymentIntentId = session.payment_intent;
        if (userId && amountStr && paymentIntentId) {
            const dbcAmount = parseFloat(amountStr);
            const txRef = db.collection('transactions').doc(paymentIntentId);
            try {
                await db.runTransaction(async (t) => {
                    const userRef = db.collection('users').doc(userId);
                    // ALWAYS create transaction and increment balance (new Checkout Sessions flow)
                    t.update(userRef, { balance: admin.firestore.FieldValue.increment(dbcAmount) });
                    t.set(txRef, {
                        fromId: 'STRIPE_TOPUP',
                        toId: userId,
                        amount: dbcAmount,
                        type: sessionType === 'SUBSCRIPTION' ? 'SUBSCRIPTION' : 'TOPUP',
                        status: 'COMPLETED',
                        stripePaymentId: paymentIntentId,
                        planId: planId || '',
                        createdAt: admin.firestore.FieldValue.serverTimestamp()
                    }, { merge: true }); // use merge to avoid error if already exists from old test
                });
            }
            catch (e) {
                console.error("Checkout session transaction failed:", e);
            }
            // Handle subscription payments
            if (sessionType === 'SUBSCRIPTION') {
                try {
                    const subsQuery = await db.collection('subscriptions')
                        .where('stripePaymentIntentId', '==', paymentIntentId)
                        .where('status', '==', 'PENDING')
                        .limit(1)
                        .get();
                    if (!subsQuery.empty) {
                        const subDoc = subsQuery.docs[0];
                        const expiresAt = new Date();
                        expiresAt.setDate(expiresAt.getDate() + 30);
                        await subDoc.ref.update({
                            status: 'PAID',
                            expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
                            updatedAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                    }
                }
                catch (e) {
                    console.error("Subscription confirmation failed:", e);
                }
            }
        }
    }
    if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object;
        const userId = (_f = paymentIntent.metadata) === null || _f === void 0 ? void 0 : _f.userId;
        const amountStr = (_g = paymentIntent.metadata) === null || _g === void 0 ? void 0 : _g.dbcAmount;
        if (userId && amountStr) {
            const dbcAmount = parseFloat(amountStr);
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
                    }
                    else {
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
            }
            catch (e) {
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
        }
        catch (e) {
            console.error("Subscription confirmation failed:", e);
        }
    }
    res.json({ received: true });
});
/**
 * Create Stripe Payment Intent (HTTP Request version to bypass CORS issues)
 */
exports.createStripePayment = functions.region('europe-west1').https.onRequest(async (req, res) => {
    // 1. Manual CORS Handling
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Authorization');
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
        if (authHeader && authHeader.startsWith('Bearer ')) {
            idToken = authHeader.split('Bearer ')[1];
        }
        else if (bodyToken) {
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
            amount: Math.round(amount * 100),
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
    }
    catch (error) {
        console.error('Stripe Payment Error:', error);
        res.status(500).json({ error: error instanceof Error && error.message ? error.message : 'Internal Server Error' });
    }
});
/**
 * Create Stripe Checkout Session (migrated from Payment Elements)
 * User is redirected to Stripe-hosted checkout page for better security and less code.
 */
exports.createCheckoutSession = functions.region('europe-west1').https.onRequest(async (req, res) => {
    // 1. Manual CORS Handling
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Authorization');
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    try {
        // 2. Auth Verification (Manual)
        const authHeader = req.headers.authorization || req.headers.Authorization || req.headers['x-authorization'];
        const bodyToken = req.body.token;
        let idToken = '';
        if (authHeader && authHeader.startsWith('Bearer ')) {
            idToken = authHeader.split('Bearer ')[1];
        }
        else if (bodyToken) {
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
        const appUrl = process.env.APP_URL || 'https://www.db360app.it';
        // returnUrl already includes the full path (e.g. https://www.db360app.it/profile)
        const successUrl = `${returnUrl || appUrl}?session_id={CHECKOUT_SESSION_ID}`;
        const cancelUrl = `${returnUrl || appUrl}?session_id={CHECKOUT_SESSION_ID}`;
        // 4. Create Checkout Session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                    price_data: {
                        currency: currency,
                        product_data: {
                            name: type === 'SUBSCRIPTION' ? `Abbonamento ${planId || 'Pro'}` : 'Ricarica Saldo DoctorBike',
                            description: type === 'SUBSCRIPTION' ? 'Abbonamento mensile DoctorBike 360' : `Ricarica di ${amount} EUR`,
                        },
                        unit_amount: Math.round(amount * 100), // convert to cents
                    },
                    quantity: 1,
                }],
            mode: 'payment',
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
        res.json({
            sessionId: session.id,
            url: session.url
        });
    }
    catch (error) {
        console.error('Checkout Session Error:', error);
        res.status(500).json({ error: error instanceof Error && error.message ? error.message : 'Internal Server Error' });
    }
});
/**
 * Refund a Stripe Payment Intent (Admin only)
 */
exports.refundPayment = functions.region('europe-west1').https.onCall(async (data, context) => {
    var _a;
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be logged in.');
    }
    // 1. Verify Admin
    const adminDoc = await db.collection('users').doc(context.auth.uid).get();
    if (((_a = adminDoc.data()) === null || _a === void 0 ? void 0 : _a.role) !== 'ADMIN') {
        throw new functions.https.HttpsError('permission-denied', 'Only admins can issue refunds.');
    }
    const { paymentIntentId, reason = 'requested_by_customer' } = data;
    if (!paymentIntentId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing paymentIntentId.');
    }
    try {
        const refund = await stripe.refunds.create({
            payment_intent: paymentIntentId,
            reason: reason,
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
        }
        catch (fsErr) {
            console.error('Error updating Firestore after refund:', fsErr);
        }
        return { success: true, refundId: refund.id };
    }
    catch (error) {
        console.error('Stripe Refund Error:', error);
        throw new functions.https.HttpsError('internal', error instanceof Error && error.message ? error.message : 'Refund failed');
    }
});
/**
 * Clear All Users from Firebase Auth (except Admins)
 * This is a high-privilege administrative tool.
 */
exports.clearAllUsersAuth = functions.region('europe-west1').https.onCall(async (data, context) => {
    var _a, _b;
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be logged in.');
    }
    // Verify requester is ADMIN in Firestore
    const adminDoc = await db.collection('users').doc(context.auth.uid).get();
    if (((_a = adminDoc.data()) === null || _a === void 0 ? void 0 : _a.role) !== 'ADMIN') {
        throw new functions.https.HttpsError('permission-denied', 'Only admins can clear authentication data.');
    }
    try {
        const listUsersResult = await admin.auth().listUsers(1000);
        const usersToDelete = [];
        // Filter out the current admin who is performing the reset
        const usersToCheck = listUsersResult.users.filter(u => { var _a; return u.uid !== ((_a = context.auth) === null || _a === void 0 ? void 0 : _a.uid); });
        // Fetch user documents in chunks of 100 to avoid N+1 queries
        for (let i = 0; i < usersToCheck.length; i += 100) {
            const chunk = usersToCheck.slice(i, i + 100);
            const docRefs = chunk.map(u => db.collection('users').doc(u.uid));
            if (docRefs.length > 0) {
                const userDocs = await db.getAll(...docRefs);
                for (const userDoc of userDocs) {
                    // If the user does not exist in Firestore or is not an ADMIN, add to delete list
                    if (!userDoc.exists || ((_b = userDoc.data()) === null || _b === void 0 ? void 0 : _b.role) !== 'ADMIN') {
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
    }
    catch (error) {
        console.error('Error clearing users auth:', error);
        throw new functions.https.HttpsError('internal', 'Errore durante la pulizia degli account.');
    }
});
/**
 * Trigger Email and Refund on KYC status change (v2)
 */
exports.notifyUserKycStatus = (0, firestore_1.onDocumentUpdated)({
    document: 'users/{userId}',
    region: 'europe-west1'
}, async (event) => {
    var _a, _b, _c, _d;
    const before = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
    const after = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
    if (!before || !after)
        return;
    // Only proceed if kycStatus changed
    if (before.kycStatus === after.kycStatus)
        return;
    const userId = event.params.userId;
    const userEmail = after.email;
    const newStatus = after.kycStatus;
    console.log(`KYC Status changed for user ${userId}: ${before.kycStatus} -> ${newStatus}`);
    if (!userEmail) {
        console.warn(`No email found for user ${userId}, skipping notification.`);
        return;
    }
    try {
        const mailUser = (_c = functions.config().mail) === null || _c === void 0 ? void 0 : _c.user;
        const mailPass = (_d = functions.config().mail) === null || _d === void 0 ? void 0 : _d.pass;
        if (!mailUser || !mailPass) {
            console.warn('Mail configuration missing.');
            return;
        }
        if (!mailTransporter) {
            console.warn('Mail transporter not configured.');
            return;
        }
        let subject = '';
        let text = '';
        if (newStatus === 'APPROVED') {
            subject = 'Account DoctorBike Approvato! 🚴‍♂️';
            text = `Ciao ${after.name || 'Meccanico'},\n\nGrandi notizie! I tuoi documenti sono stati verificati con successo. Ora sei un meccanico ufficiale sulla piattaforma DoctorBike.\n\nPuoi iniziare a ricevere richieste di assistenza e guadagnare subito!\n\nA presto,\nIl Team DoctorBike`;
        }
        else if (newStatus === 'REJECTED') {
            subject = 'Aggiornamento Documenti DoctorBike ⚠️';
            text = `Ciao ${after.name || 'Meccanico'},\n\nTi informiamo che i documenti caricati non hanno superato la verifica KYC.\n\nMotivo: ${after.kycRejectionReason || 'Documenti non conformi o illeggibili.'}\n\nAbbiamo provveduto a rimborsare la tua quota di iscrizione sul tuo saldo. Puoi caricare nuovi documenti dalla sezione profilo dell'app.\n\nSe hai domande, rispondi a questa email.\n\nIl Team DoctorBike`;
        }
        else {
            return;
        }
        await mailTransporter.sendMail({
            from: `"DoctorBike Support" <${mailUser}>`,
            to: userEmail,
            subject: subject,
            text: text,
        });
        console.log(`KYC notification email sent to ${userEmail} for status ${newStatus}`);
    }
    catch (error) {
        console.error('Error in notifyUserKycStatus:', error);
    }
});
/**
 * Send KYC Notification Email (Manual Trigger)
 */
exports.sendKycEmail = functions.region('europe-west1').https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be logged in.');
    }
    const { userId, status, reason } = data;
    if (!userId || !status) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing parameters.');
    }
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists)
            throw new functions.https.HttpsError('not-found', 'User not found.');
        const userData = userDoc.data() || {};
        const userEmail = userData.email;
        if (!userEmail)
            return { success: false, message: 'No email found' };
        if (!mailTransporter) {
            console.warn('Mail transporter not configured.');
            return { success: false, message: 'Mail config missing' };
        }
        let subject = '';
        let text = '';
        if (status === 'APPROVED') {
            subject = 'Account DoctorBike Approvato! 🚴‍♂️';
            text = `Ciao ${userData.name || 'Meccanico'},\n\nGrandi notizie! I tuoi documenti sono stati verificati con successo. Ora sei un meccanico ufficiale sulla piattaforma DoctorBike.\n\nPuoi iniziare a ricevere richieste di assistenza e guadagnare subito!\n\nA presto,\nIl Team DoctorBike`;
        }
        else {
            subject = 'Aggiornamento Documenti DoctorBike ⚠️';
            text = `Ciao ${userData.name || 'Meccanico'},\n\nTi informiamo che i documenti caricati non hanno superato la verifica KYC.\n\nMotivo: ${reason || 'Documenti non conformi o illeggibili.'}\n\nAbbiamo provveduto a rimborsare la tua quota di iscrizione sul tuo saldo. Puoi caricare nuovi documenti dalla sezione profilo dell'app.\n\nSe hai domande, rispondi a questa email.\n\nIl Team DoctorBike`;
        }
        await mailTransporter.sendMail({
            from: `"DoctorBike Support" <${mailUser}>`,
            to: userEmail,
            subject: subject,
            text: text,
        });
        return { success: true };
    }
    catch (error) {
        console.error('Error sending KYC email:', error);
        throw new functions.https.HttpsError('internal', error instanceof Error && error.message ? error.message : 'Email failed');
    }
});
//# sourceMappingURL=index.js.map