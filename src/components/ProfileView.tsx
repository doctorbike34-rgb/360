import toast from 'react-hot-toast';
import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useThemeStore } from '../store/useThemeStore';
import { signOut, sendEmailVerification, sendPasswordResetEmail } from 'firebase/auth';
import { auth, db, functions, handleFirestoreError, OperationType } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { doc, updateDoc, serverTimestamp, collection, query, where, orderBy, limit, getDocs, getDoc, onSnapshot, setDoc, deleteDoc, runTransaction, increment, addDoc } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { UserPlan } from '../types';
import { getCloudFunctionUrl } from '../config/env';
import { useConfirmDialog } from '../hooks/useConfirmDialog';
import { 
  CreditCard, 
  Settings, 
  Shield, 
  History, 
  LogOut, 
  ChevronRight, 
  Award,
  Bell,
  Wallet,
  Zap,
  X,
  CreditCard as CardIcon,
  CheckCircle2,
  Loader2,
  Sparkles,
  User as UserIcon,
  Phone,
  Bike as BikeIcon,
  Save,
  AlertCircle,
  Star,
  MessageSquare,
  Mail,
  Camera,
  QrCode,
  Download,
  MapPin as MapIcon,
  Navigation2,
  ArrowLeft,
  Gift,
  CalendarCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Chat } from './Chat';
import { LeaderboardView } from './LeaderboardView';
import { BADGE_CATALOG, DAILY_BONUS_POINTS } from '../lib/badgeMeta';
import { formatLoyaltyPoints } from '../lib/loyaltyPoints';
import { InterventionHistory } from './InterventionHistory';
import { gamificationService } from '../services/gamificationService';
import { requestEurPayout } from '../lib/payoutService';

import { P2PWalletModal } from './P2PWalletModal';
import { TransactionsModal } from './TransactionsModal';
import { FullScreenPortal } from './FullScreenPortal';

export interface ProfileViewProps {
  isAvailable?: boolean;
  onToggleAvailability?: () => void;
}

function isValidPhotoURL(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.startsWith('data:image/') || url.startsWith('https://') || url.startsWith('http://');
}

export function ProfileView({ isAvailable, onToggleAvailability }: ProfileViewProps) {
  const { requestConfirm, ConfirmDialogPortal } = useConfirmDialog();
  const { user, role, profile, deferredPrompt, setDeferredPrompt } = useAuthStore();
  const { isDarkMode, toggleDarkMode } = useThemeStore();
  const { t, i18n } = useTranslation();
  
  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    setDeferredPrompt(null);
  };
  
  // Modals state
  const [showTopUp, setShowTopUp] = useState(false);
  const [showP2PWallet, setShowP2PWallet] = useState(false);
  const [showTransactionsModal, setShowTransactionsModal] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSafety, setShowSafety] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [reviews, setReviews] = useState<any[]>([]);
  const [isReviewsLoading, setIsReviewsLoading] = useState(false);
  const [showReviews, setShowReviews] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [showFAQ, setShowFAQ] = useState(false);
  const [userSupportTicket, setUserSupportTicket] = useState<any | null>(null);
  const [isCreatingTicket, setIsCreatingTicket] = useState(false);
  const [showPayout, setShowPayout] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState(20);
  const [payoutIban, setPayoutIban] = useState(profile?.payoutIban || '');
  const [payoutHolder, setPayoutHolder] = useState(profile?.payoutAccountHolder || profile?.name || '');
  const [isPayoutSubmitting, setIsPayoutSubmitting] = useState(false);
  const [pendingPayout, setPendingPayout] = useState<{ id: string; amountEur: number; status: string } | null>(null);
  
  // Payment state
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [paymentStep, setPaymentStep] = useState<'SELECT_AMOUNT' | 'SELECT_METHOD' | 'STRIPE' | 'PROCESSING' | 'SUCCESS'>('SELECT_AMOUNT');
  const [isProcessing, setIsProcessing] = useState(false);
  
  const processedStripeRef = useRef(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    if (!sessionId || !user || processedStripeRef.current) return;

    processedStripeRef.current = true;
    window.history.replaceState({}, document.title, window.location.pathname);

    const handleReturn = async () => {
      if (profile?.subscriptionPendingPlan || profile?.role === 'MECHANIC') {
        setPlanUpgradeStep('PROCESSING');
        try {
          const { confirmSubscriptionCheckout } = await import('../lib/subscriptionCheckout');
          const result = await confirmSubscriptionCheckout(sessionId);
          if (result.success) {
            toast.success(`Piano ${result.planId || ''} attivato! 🎉`);
            setPlanUpgradeStep('SUCCESS');
            setShowPlans(false);
            return;
          }
        } catch (e) {
          console.error(e);
        }
        setPlanUpgradeStep('SELECT');
      }

      setPaymentStep('PROCESSING');
      const initialBalance = profile?.balance ?? 0;
      const unsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
        if (snap.exists()) {
          const balance = snap.data().balance || 0;
          if (balance > initialBalance) {
            setPaymentStep('SUCCESS');
            unsub();
          }
        }
      });
      setTimeout(() => {
        unsub();
        setPaymentStep((prev) => (prev === 'PROCESSING' ? 'SELECT_AMOUNT' : prev));
      }, 15000);
    };

    void handleReturn();
  }, [user, profile?.subscriptionPendingPlan, profile?.role, profile?.balance]);

  // Profile edit state
  const [editName, setEditName] = useState(profile?.name || '');
  const [editPhone, setEditPhone] = useState(profile?.phone || '');
  const [editEmail, setEditEmail] = useState(profile?.email || auth.currentUser?.email || '');
  const [editBikeModel, setEditBikeModel] = useState(profile?.bikeModel || '');
  const [editLocationName, setEditLocationName] = useState(profile?.locationName || '');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [showPlans, setShowPlans] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState<string | null>(null);
  const [isRequestingNotification, setIsRequestingNotification] = useState(false);
  const [planUpgradeStep, setPlanUpgradeStep] = useState<'SELECT' | 'PAYMENT' | 'STRIPE' | 'PROCESSING' | 'SUCCESS'>('SELECT');
  const [selectedPlanForUpgrade, setSelectedPlanForUpgrade] = useState<any | null>(null);

  const [isSendingVerification, setIsSendingVerification] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showInterventionHistory, setShowInterventionHistory] = useState(false);
  const [showPaymentMethods, setShowPaymentMethods] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [dailyStreak, setDailyStreak] = useState(profile?.dailyStreak || 0);
  const [dailyReminderEnabled, setDailyReminderEnabled] = useState(profile?.dailyReminderEnabled || false);
  const [isClaimingDaily, setIsClaimingDaily] = useState(false);

  useEffect(() => {
    if (profile) {
      setDailyStreak(profile.dailyStreak || 0);
      setDailyReminderEnabled(profile.dailyReminderEnabled || false);
    }
  }, [profile]);

  const sendVerification = async () => {
    if (!auth.currentUser) return;
    setIsSendingVerification(true);
    try {
      await sendEmailVerification(auth.currentUser);
      setVerificationSent(true);
      setTimeout(() => setVerificationSent(false), 5000);
    } catch (err) {
      console.error('Error sending verification:', err);
      toast.error('Errore nell\'invio della verifica: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSendingVerification(false);
    }
  };

  const plans = [
    { id: 'BASE', title: 'BASE', price: 29, features: ['Visibilità standard', 'Commissione 15%', 'Supporto base', 'Badge Certificato BRONZO'], color: 'bg-grey/10 text-grey' },
    { id: 'CLUB', title: 'CLUB', price: 59, features: ['Meccanico in primo piano', 'Commissione 10%', 'Creazione eventi social', 'Badge Certificato ARGENTO'], color: 'bg-slate-300 text-slate-700' },
    { id: 'PRO', title: 'PRO', price: 99, features: ['Visibilità prioritaria', 'Commissione 5%', 'Dashboard statistiche', 'Badge Certificato ORO'], color: 'bg-amber-400 text-amber-900' }
  ];

  const upgradePlan = async (planId: string) => {
    if (!user) return;
    const plan = plans.find(p => p.id === planId);
    setSelectedPlanForUpgrade(plan);
    setPlanUpgradeStep('PAYMENT');
  };

  const claimDailyBonus = async () => {
    if (!user || isClaimingDaily) return;
    setIsClaimingDaily(true);
    try {
      const result = await gamificationService.claimDailyBonus(user.uid);
      if (result.success) {
        toast.success(`+${result.amount} punti reputazione! Streak: ${result.streak} 🔥`, { duration: 3000 });
        setDailyStreak(result.streak);
      } else {
        toast.error('Hai già riscosso il bonus oggi! Torna domani.', { duration: 3000 });
      }
    } catch (e) {
      console.error("Claim daily bonus failed", e);
      toast.error('Errore nel riscossione del bonus');
    } finally {
      setIsClaimingDaily(false);
    }
  };

  const toggleDailyReminder = async () => {
    if (!user) return;
    try {
      const newVal = !dailyReminderEnabled;
      await updateDoc(doc(db, 'users', user.uid), {
        dailyReminderEnabled: newVal,
        updatedAt: serverTimestamp()
      });
      setDailyReminderEnabled(newVal);
      if (newVal) {
        toast.success('Promemoria giornaliero attivato! 🔔', { duration: 3000 });
      } else {
        toast('Promemoria disattivato', { duration: 2000 });
      }
    } catch (e) {
      console.error("Toggle daily reminder failed", e);
      toast.error('Errore nel salvataggio');
    }
  };

  const initStripeUpgrade = async () => {
    if (!user || !selectedPlanForUpgrade) return;
    setPlanUpgradeStep('PROCESSING');
    setIsUpgrading(selectedPlanForUpgrade.id);
    try {
      const idToken = await user.getIdToken();
      console.log('Generated ID Token (exists):', !!idToken);
      const returnUrl = `${window.location.origin}/profile`;
      const response = await fetch(getCloudFunctionUrl('createCheckoutSession'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
          'X-Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          amount: selectedPlanForUpgrade.price,
          currency: 'eur',
          type: 'SUBSCRIPTION',
          planId: selectedPlanForUpgrade.id,
          returnUrl,
          token: idToken
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('Failed to create checkout session');
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Errore durante l'inizializzazione del pagamento");
      setPlanUpgradeStep('PAYMENT');
    } finally {
      setIsUpgrading(null);
    }
  };

  useEffect(() => {
    if (user) {
      const q = query(
        collection(db, 'supportTickets'),
        where('userId', '==', user.uid),
        where('status', '==', 'OPEN'),
        limit(1)
      );
      const unsub = onSnapshot(q, (snap) => {
        if (!snap.empty) {
          setUserSupportTicket({ id: snap.docs[0].id, ...snap.docs[0].data() });
        } else {
          setUserSupportTicket(null);
        }
      }, (error) => {
        console.error('Support ticket listener error:', error);
      });
      return unsub;
    }
  }, [user]);

  useEffect(() => {
    if (!user || (role !== 'MECHANIC' && role !== 'PEER_MECHANIC')) return;
    const q = query(
      collection(db, 'payoutRequests'),
      where('userId', '==', user.uid),
      where('status', '==', 'PENDING'),
      limit(1)
    );
    return onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const d = snap.docs[0];
        setPendingPayout({ id: d.id, amountEur: d.data().amountEur, status: d.data().status });
      } else {
        setPendingPayout(null);
      }
    });
  }, [user, role]);

  useEffect(() => {
    if (profile?.payoutIban) setPayoutIban(profile.payoutIban);
    if (profile?.payoutAccountHolder) setPayoutHolder(profile.payoutAccountHolder);
  }, [profile?.payoutIban, profile?.payoutAccountHolder]);

  const submitEurPayout = async () => {
    if (!user || isPayoutSubmitting) return;
    if (role === 'MECHANIC' && profile?.kycStatus !== 'APPROVED') {
      toast.error('Completa la verifica KYC (carica documenti) prima del prelievo.');
      return;
    }
    setIsPayoutSubmitting(true);
    try {
      await requestEurPayout({
        amountEur: payoutAmount,
        iban: payoutIban,
        accountHolder: payoutHolder,
      });
      toast.success('Richiesta prelievo inviata. Riceverai il bonifico dopo approvazione admin.');
      setShowPayout(false);
    } catch (err: any) {
      toast.error(err?.message || 'Errore richiesta prelievo');
    } finally {
      setIsPayoutSubmitting(false);
    }
  };

  const startSupportTicket = async () => {
    if (!user) return;
    if (userSupportTicket && userSupportTicket.status === 'OPEN') {
      setShowSupport(true);
      return;
    }
    if (userSupportTicket && userSupportTicket.status === 'CLOSED') {
      setShowFAQ(true);
      return;
    }
    setShowFAQ(true);
  };

  const createTicketFromFAQ = async () => {
    if (!user) return;
    setShowFAQ(false);
    setIsCreatingTicket(true);
    try {
      const ticketRef = doc(collection(db, 'supportTickets'));
      await setDoc(ticketRef, {
        userId: user.uid,
        userName: profile?.name || user.displayName || 'Utente',
        userRole: role,
        status: 'OPEN',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastMessage: 'Richiesta di assistenza avviata'
      });
      setUserSupportTicket({ id: ticketRef.id, userId: user.uid, status: 'OPEN' });
      toast.success('Ticket di assistenza creato');
      setShowSupport(true);
    } catch (err) {
      console.error('Error creating support ticket:', err);
      toast.error('Errore nella creazione del ticket di assistenza');
    } finally {
      setIsCreatingTicket(false);
    }
  };

  useEffect(() => {
    if (profile) {
      setTimeout(() => {
        setEditName(profile.name || '');
        setEditPhone(profile.phone || '');
        setEditBikeModel(profile.bikeModel || '');
        setEditLocationName(profile.locationName || '');
      }, 0);
    }
  }, [profile]);

  useEffect(() => {
    if (showHistory && user) {
      const fetchHistory = async () => {
        setIsHistoryLoading(true);
        try {
          const q = query(
            collection(db, 'sosRequests'),
            where(role === 'MECHANIC' ? 'mechanicId' : 'cyclistId', '==', user?.uid),
            orderBy('createdAt', 'desc'),
            limit(20)
          );
          
          const querySnapshot = await getDocs(q);
          const historyData = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          setHistory(historyData);
        } catch (err) {
          console.warn('Error fetching history:', err);
        } finally {
          setIsHistoryLoading(false);
        }
      };
      fetchHistory();
    }
  }, [showHistory, user, role]);

  useEffect(() => {
    if (showReviews && user && role === 'MECHANIC') {
      const fetchReviews = async () => {
        setIsReviewsLoading(true);
        try {
          const q = query(
            collection(db, 'reviews'),
            where('mechanicId', '==', user?.uid),
            orderBy('createdAt', 'desc'),
            limit(20)
          );
          const snap = await getDocs(q);
          setReviews(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (err) {
          console.warn('Error fetching reviews:', err);
        } finally {
          setIsReviewsLoading(false);
        }
      };
      fetchReviews();
    }
  }, [showReviews, user, role]);

  const amounts = [10, 20, 50, 100];

  const handleTopUpSuccess = async () => {
    if (!user || !selectedAmount) return;
    setPaymentStep('PROCESSING');
    try {
      // Webhook handles everything server-side now.
      await new Promise(resolve => setTimeout(resolve, 3000));
      setPaymentStep('SUCCESS');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user?.uid}`);
      setPaymentStep('SELECT_AMOUNT');
    } finally {
      setIsProcessing(false);
    }
  };

  const startStripeFlow = async () => {
    if (!selectedAmount) return;
    
    // Dev: credit balance locally (no Stripe) so wallet testing works
    if (import.meta.env.DEV) {
      if (!user) return;
      setPaymentStep('PROCESSING');
      setIsProcessing(true);
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          balance: increment(selectedAmount),
          updatedAt: serverTimestamp(),
        });
        await addDoc(collection(db, 'transactions'), {
          userId: user.uid,
          amount: selectedAmount,
          type: 'TOPUP',
          status: 'COMPLETED',
          fromId: 'DEV_SIMULATION',
          createdAt: serverTimestamp(),
        }).catch(() => undefined);
        toast.success(`[Dev] Ricarica di €${selectedAmount} applicata al saldo`);
        setPaymentStep('SUCCESS');
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
        toast.error('Errore ricarica dev');
        setPaymentStep('SELECT_AMOUNT');
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    setIsProcessing(true);
    try {
      const idToken = await user.getIdToken();
      const returnUrl = `${window.location.origin}/profile`;
      const response = await fetch(getCloudFunctionUrl('createCheckoutSession'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
          'X-Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          amount: selectedAmount,
          currency: 'eur',
          type: 'TOPUP',
          returnUrl,
          token: idToken
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('Failed to create checkout session');
      }
    } catch (err) {
      console.error('Checkout Session Error:', err);
      toast.error('Errore durante il pagamento. Riprova più tardi.');
      setPaymentStep('SELECT_AMOUNT');
    } finally {
      setIsProcessing(false);
    }
  };

  const [isResetting, setIsResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const performProductionReset = async () => {
    if (role !== 'ADMIN') return;
    setIsResetting(true);
    try {
      console.log('Starting Production Reset...');
      
      // 1. Clear SOS Requests
      const sosSnap = await getDocs(collection(db, 'sosRequests'));
      for (const docSnap of sosSnap.docs) {
        await deleteDoc(doc(db, 'sosRequests', docSnap.id));
      }
      console.log('SOS Requests cleared');

      // 2. Clear Chats
      const chatSnap = await getDocs(collection(db, 'chats'));
      for (const docSnap of chatSnap.docs) {
        await deleteDoc(doc(db, 'chats', docSnap.id));
      }
      console.log('Chats cleared');

      // 3. Clear Reviews
      const reviewSnap = await getDocs(collection(db, 'reviews'));
      for (const docSnap of reviewSnap.docs) {
        await deleteDoc(doc(db, 'reviews', docSnap.id));
      }
      console.log('Reviews cleared');

      // 4. Delete Users (except ADMINs) and Reset ADMIN Stats
      const userSnap = await getDocs(collection(db, 'users'));
      for (const docSnap of userSnap.docs) {
        const userData = docSnap.data();
        if (userData.role === 'ADMIN') {
          await updateDoc(doc(db, 'users', docSnap.id), {
            balance: 0,
            completedJobs: 0,
            points: 0,
            totalEarnings: 0,
            hasWelcomeGift: true, // Re-enable welcome gift for new production users
            updatedAt: serverTimestamp()
          });
        } else {
          await deleteDoc(doc(db, 'users', docSnap.id));
        }
      }
      console.log('Users cleared (Admins reset)');

      // 5. Clear Support Tickets
      const ticketSnap = await getDocs(collection(db, 'supportTickets'));
      for (const docSnap of ticketSnap.docs) {
        await deleteDoc(doc(db, 'supportTickets', docSnap.id));
      }
      console.log('Support tickets cleared');

      // 6. Clear AI Conversations
      const aiConvSnap = await getDocs(collection(db, 'aiConversations'));
      for (const docSnap of aiConvSnap.docs) {
        await deleteDoc(doc(db, 'aiConversations', docSnap.id));
      }
      console.log('AI Conversations cleared');

      // 7. Clear Mechanic Stats
      const mechSnap = await getDocs(collection(db, 'mechanics'));
      for (const docSnap of mechSnap.docs) {
        await deleteDoc(doc(db, 'mechanics', docSnap.id));
      }
      console.log('Mechanic statistics cleared');

      // 7.1 Clear Events
      const eventsSnap = await getDocs(collection(db, 'events'));
      for (const docSnap of eventsSnap.docs) {
        await deleteDoc(doc(db, 'events', docSnap.id));
      }
      console.log('Events cleared');

      // 7.2 Clear Road Reports
      const roadReportsSnap = await getDocs(collection(db, 'roadReports'));
      for (const docSnap of roadReportsSnap.docs) {
        await deleteDoc(doc(db, 'roadReports', docSnap.id));
      }
      console.log('Road reports cleared');

      // 8. Reset Platform Global Stats
      await setDoc(doc(db, 'platformStats', 'global'), {
        totalFees: 0,
        totalTransactions: 0,
        completedJobs: 0,
        updatedAt: serverTimestamp()
      });
      console.log('Platform stats reset');
      
      // 9. Clear Authentication Emails (Except Admins)
      console.log('Clearing Authentication emails...');
      try {
        const clearAuth = httpsCallable(functions, 'clearAllUsersAuth');
        const result = await clearAuth();
        console.log('Authentication cleared:', result.data);
      } catch (authErr) {
        console.error('Error clearing auth emails:', authErr);
        // We continue even if auth clearing fails, as Firestore is already reset
      }

      toast.success('Reset per la produzione completato con successo!');
      setShowResetConfirm(false);
    } catch (err) {
      console.error('Error during production reset:', err);
      toast.error('Errore durante il reset: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsResetting(false);
    }
  };

  const saveProfile = async () => {
    if (!user) return;
    setIsSavingProfile(true);
    try {
      // 1. Update Firestore
      await updateDoc(doc(db, 'users', user?.uid), {
        name: editName,
        phone: editPhone,
        email: editEmail,
        bikeModel: editBikeModel,
        locationName: editLocationName,
        updatedAt: serverTimestamp()
      });

      // 2. Update Email in Auth if changed (optional check)
      if (editEmail !== auth.currentUser?.email) {
          // This usually requires re-authentication, so we just inform the user
          // Or we can try it
          toast.error("L'email è stata aggiornata in Firestore, ma per cambiarla nelle credenziali di accesso contatta il supporto o usa un nuovo account.");
      }

      setShowEditProfile(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!auth.currentUser?.email) return;
    setIsResettingPassword(true);
    try {
      await sendPasswordResetEmail(auth, auth.currentUser.email);
      toast.success("Email di ripristino password inviata a " + auth.currentUser.email);
    } catch (err) {
      console.error(err);
      toast.error("Errore nell'invio dell'email di ripristino.");
    } finally {
      setIsResettingPassword(false);
    }
  };

  const resetTopUp = () => {
    setShowTopUp(false);
    setTimeout(() => {
      setPaymentStep('SELECT_AMOUNT');
      setSelectedAmount(null);
    }, 300);
  };

  const toggleNotifications = async () => {
    if (!user) return;
    const newValue = !profile?.notificationsEnabled;
    
    // If enabling, request permission
    if (newValue && 'Notification' in window && Notification.permission !== 'granted') {
      setIsRequestingNotification(true);
      const permission = await Notification.requestPermission();
      setIsRequestingNotification(false);
      if (permission !== 'granted') return;
    }

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        notificationsEnabled: newValue,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error('Error toggling notifications:', err);
    }
  };

  return (
    <div className="pb-40">
      {/* Profile Header */}
      <div className="bg-primary pt-[calc(2.5rem+env(safe-area-inset-top))] pb-12 px-8 rounded-b-[3rem] text-center relative">
        <div className="absolute top-6 right-6">
           <button onClick={() => i18n.changeLanguage(i18n.language === 'it' ? 'en' : 'it')}
             className="bg-black/10 px-3 py-2 rounded-xl text-black  font-bold text-xs"
           >
              {i18n.language === 'it' ? 'EN' : 'IT'}
           </button>
        </div>
        <div className="relative inline-block mb-4">
           <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-[1.5rem] sm:rounded-[2rem] border-4 border-white/50 overflow-hidden bg-white shadow-xl relative group">
               <img src={isValidPhotoURL(profile?.photoURL || user?.photoURL) ? (profile?.photoURL || user?.photoURL) : `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.uid}`} alt={t('common.avatar')} className="w-full h-full object-cover transition-opacity group-hover:opacity-80"/>
              <button 
                onClick={() => setShowAvatarPicker(true)}
                className="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity"
              >
                 <Camera size={24}/>
              </button>
           </div>
           <div className="absolute -bottom-2 -right-2 bg-accent text-white p-2 rounded-xl shadow-lg ring-4 ring-primary">
              <Zap size={16} fill="currentColor"/>
           </div>
        </div>
        <h2 className="text-2xl font-black text-black ">{profile?.name || user?.displayName || t('profile.user')}</h2>
        <div className="flex items-center justify-center gap-2 mt-1">
          <p className="text-black/60  text-xs font-bold uppercase tracking-widest italic">{role === 'MECHANIC' ? t('auth.mechanic') : (role === 'PEER_MECHANIC' ? t('auth.peerMechanic') || 'Ciclista Esperto' : t('auth.cyclist'))} // {profile?.plan || (role === 'MECHANIC' ? 'MECHANIC_FREE' : 'BASE')}</p>
          {role === 'MECHANIC' && (profile?.plan as string) === 'PRO' && <Award size={16} className="text-amber-400 fill-amber-400"/>}
          {role === 'MECHANIC' && (profile?.plan as string) === 'CLUB' && <Award size={16} className="text-slate-300 fill-slate-300"/>}
          {role === 'MECHANIC' && (profile?.plan as string) === 'BASE' && <Award size={16} className="text-amber-700 fill-amber-700"/>}
          {role === 'MECHANIC' && (profile?.plan as string) === 'MECHANIC_FREE' && <Shield size={16} className="text-grey/40"/>}
        </div>
        
        <button onClick={() => setShowEditProfile(true)}
          className="mt-4 bg-black/5  text-black  px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-black/5  hover:bg-black/10 transition-all flex items-center gap-2 mx-auto"
        >
          <UserIcon size={12}/> {t('profile.editProfile')}
        </button>
      </div>

      <div className="px-6 mt-6 space-y-6">
        {user && !user.emailVerified && (typeof user.email === 'string' && user.email.trim().length > 0) && !user.isAnonymous && !(user.providerData?.some(p => p.providerId === 'phone') || !!user.phoneNumber) && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="bg-danger/10 border border-danger/20 rounded-[2.5rem] p-6 flex flex-col items-center text-center gap-4">
            <div className="w-12 h-12 bg-danger/20 text-danger rounded-2xl flex items-center justify-center">
              <Mail size={24}/>
            </div>
            <div>
              <p className="text-sm font-black text-danger uppercase italic">{t('profile.emailNotVerified')}</p>
              <p className="text-[10px] text-danger/60 font-bold uppercase tracking-widest mt-1 leading-relaxed">
                Verifica l'email per poter inviare SOS e recensioni. Controlla anche lo spam!
              </p>
            </div>
            <button onClick={sendVerification} disabled={isSendingVerification || verificationSent} className="w-full bg-danger text-white py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:scale-[1.02] active:scale-95 transition-all shadow-lg shadow-danger/20 disabled:opacity-50">
              {isSendingVerification ? <Loader2 className="animate-spin mx-auto" size={16}/> : 
               verificationSent ? 'Email inviata!' : 'Invia Email di Verifica'}
            </button>
          </motion.div>
        )}

        {/* Install PWA Prompt (if available) */}
        {deferredPrompt && (
          <div className="bg-primary/5 border border-primary/20 rounded-[2.5rem] p-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/10 rounded-2xl text-primary">
                <Download size={20}/>
              </div>
              <div>
                <p className="text-[10px] font-black text-primary uppercase tracking-widest italic">{t('auth.pwaTitle')}</p>
                <p className="text-[10px] font-bold text-grey uppercase mt-0.5">Migliora la tua esperienza</p>
              </div>
            </div>
            <button onClick={handleInstallClick} className="bg-primary text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all shadow-lg shadow-primary/20">
              Installa
            </button>
          </div>
        )}

        {/* Availability Toggle - Now for everyone as requested */}
        {onToggleAvailability !== undefined && (
          <div className="bg-white text-black p-6 rounded-[2.5rem] shadow-xl shadow-primary/5 border border-primary/5  transition-colors">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className={`p-3 rounded-2xl transition-colors ${isAvailable ? 'bg-accent/10 text-accent' : 'bg-grey/10  text-grey'}`}>
                  <Zap size={20} fill={isAvailable ? "currentColor" : "none"}/>
                </div>
                <div>
                  <p className="text-[10px] font-black text-grey uppercase tracking-widest italic">{t('profile.onlineStatus')}</p>
                  <p className={`text-sm font-black uppercase tracking-widest transition-colors ${isAvailable ? 'text-accent' : 'text-grey '}`}>
                    {isAvailable ? t('mechanic.online') : t('mechanic.offline')}
                  </p>
                </div>
              </div>
              <button onClick={onToggleAvailability} className={`relative w-12 h-6 rounded-full transition-colors duration-300 focus:outline-none cursor-pointer ${isAvailable ? 'bg-accent' : 'bg-grey/20 '}`}>
                <motion.div animate={{ x: isAvailable ? 26 : 4 }} transition={{ type: "spring", stiffness: 500, damping: 30 }} initial={false} className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-md"/>
              </button>
            </div>
          </div>
        )}

        {/* Wallet Card */}
        <div className="bg-white text-black p-6 rounded-[2.5rem] shadow-xl shadow-primary/5 border border-primary/5  transition-colors">
           <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                 <div className="bg-primary/5  p-3 rounded-2xl text-primary  transition-colors">
                    <Wallet size={20}/>
                 </div>
                 <div>
                    <p className="text-[10px] font-black text-grey  uppercase tracking-widest italic transition-colors">Portafoglio DB Coin</p>
                    <div className="flex items-baseline gap-1">
                      <p className="text-2xl font-black text-primary  transition-colors">⚡{profile?.balance?.toFixed(0) || '0'}</p>
                      <p className="text-[10px] font-bold text-grey/60 uppercase">DBC (= €{profile?.balance?.toFixed(2) || '0.00'})</p>
                    </div>
                 </div>
              </div>
              <div className="flex flex-col gap-2">
                <button onClick={() => setShowTopUp(true)}
                  className="bg-accent text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-transform active:scale-95"
                >
                  {t('profile.topUp')}
                </button>
                <button onClick={() => setShowP2PWallet(true)}
                  className="bg-primary/10 text-primary px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-transform active:scale-95 flex items-center gap-1 justify-center"
                >
                  <QrCode size={12}/> DB Coin P2P
                </button>
                <button onClick={() => setShowTransactionsModal(true)}
                  className="bg-grey/10 text-grey px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-transform active:scale-95 flex items-center gap-1 justify-center"
                >
                  <History size={12}/> Storico
                </button>
                {(role === 'MECHANIC' || role === 'PEER_MECHANIC') && (
                  <button
                    onClick={() => setShowPayout(true)}
                    disabled={!!pendingPayout || (profile?.balance || 0) < 20}
                    className="bg-black/10 text-black px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-transform active:scale-95 disabled:opacity-40"
                  >
                    Prelievo €
                  </button>
                )}
              </div>
           </div>
           {(role === 'MECHANIC' || role === 'PEER_MECHANIC') && pendingPayout && (
             <p className="text-[10px] font-bold text-accent mt-3">
               Prelievo €{pendingPayout.amountEur} in elaborazione.
             </p>
           )}
        </div>

        {/* Gamification Card */}
        <div className="bg-white text-black p-6 rounded-[2.5rem] shadow-xl shadow-primary/5 border border-primary/5  transition-colors mt-6">
           <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-3">
                 <div className="bg-warning/10 p-3 rounded-2xl text-warning">
                    <Star size={20}/>
                 </div>
                 <div>
                    <p className="text-[10px] font-black text-grey  uppercase tracking-widest italic transition-colors">Punti Reputazione</p>
                    <p className="text-2xl font-black text-warning tabular-nums tracking-tight">{formatLoyaltyPoints(profile?.points ?? 0)}</p>
                 </div>
              </div>
              <button id="btn-show-leaderboard" onClick={() => setShowLeaderboard(true)}
                className="bg-warning text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-transform active:scale-95 flex items-center gap-1"
              >
                Classifiche <ChevronRight size={14}/>
              </button>
           </div>

            {/* Daily Bonus */}
            <div className="bg-gradient-to-r from-primary/5 to-accent/5 rounded-2xl p-4 mb-4 border border-primary/10">
               <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                     <Gift size={18} className="text-primary" />
                     <p className="text-[10px] font-black text-primary uppercase tracking-widest">Bonus Giornaliero</p>
                  </div>
                  {dailyStreak > 0 && (
                     <span className="text-[10px] font-black text-accent bg-accent/10 px-2 py-1 rounded-full">🔥 {dailyStreak} giorni</span>
                  )}
               </div>
               <div className="flex items-center gap-3">
                  <button 
                    onClick={claimDailyBonus}
                    disabled={isClaimingDaily}
                    className="flex-1 bg-primary text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isClaimingDaily ? <Loader2 className="animate-spin" size={14} /> : <CalendarCheck size={14} />}
                    Riscuoti +{DAILY_BONUS_POINTS} punti
                  </button>
                  <button 
                    onClick={toggleDailyReminder}
                    className={`p-3 rounded-xl border transition-all ${dailyReminderEnabled ? 'bg-accent/10 border-accent/30 text-accent' : 'bg-white border-grey/10 text-grey'}`}
                  >
                    <Bell size={16} />
                  </button>
               </div>
               <p className="text-[9px] text-grey mt-2 font-bold">
                  {dailyReminderEnabled ? '🔔 Promemoria attivo' : 'Attiva il promemoria per non perdere il bonus'}
               </p>
            </div>

            {/* Badges Grid */}
           <div>
              <p className="text-[10px] font-black text-grey  uppercase tracking-widest mb-3">I Tuoi Badge</p>
              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                 {(() => {
                   const userBadges = profile?.badges || [];
                   return BADGE_CATALOG.map(b => {
                     const isUnlocked = userBadges.some((ub: any) => ub.id === b.id);
                     return (
                       <div key={b.id} className={`shrink-0 flex flex-col items-center justify-center p-3 rounded-2xl border ${isUnlocked ? 'border-warning/50 bg-warning/10' : 'border-grey/10 bg-grey/5 opacity-50 grayscale'}`}>
                         <span className="text-2xl mb-1">{b.icon}</span>
                         <span className="text-[8px] font-bold uppercase w-16 text-center leading-tight">{b.name}</span>
                       </div>
                     );
                   });
                 })()}
              </div>
           </div>
        </div>

        {/* Top Up Modal */}
        <AnimatePresence>
           {showTopUp && (
             <div className="fixed inset-0 z-[100] flex flex-col justify-end sm:justify-center overflow-hidden">
               <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={resetTopUp} className="absolute inset-0 bg-dark/60 backdrop-blur-xl z-[100]"/>
                <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 300 }} className="relative overflow-y-auto w-full max-h-[85vh] sm:max-w-2xl sm:mx-auto bg-white text-black rounded-t-[3rem] sm:rounded-[3rem] p-4 sm:p-8 z-[110] shadow-[0_-20px_50px_-10px_rgba(0,0,0,0.3)] pb-[calc(7rem+env(safe-area-inset-bottom))]">
                 <div className="w-12 h-1.5 bg-grey/10 rounded-full mx-auto mb-4 sm:mb-8"/>
                 
                 <div className="flex justify-between items-center mb-4 sm:mb-6">
                    <h3 className="text-xl sm:text-2xl font-black text-primary uppercase italic">{t('profile.topUpWallet')}</h3>
                    <button onClick={resetTopUp} className="p-2 text-grey">
                       <X size={24}/>
                    </button>
                 </div>

                <AnimatePresence mode="wait">
                   {paymentStep === 'SELECT_AMOUNT' && (
                     <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4 sm:space-y-6">
                       <p className="text-xs text-grey font-bold uppercase tracking-widest">{t('profile.chooseAmount')}</p>
                       <div className="grid grid-cols-2 gap-3 sm:gap-4">
                         {amounts.map(amount => (
                           <button key={amount} onClick={() => setSelectedAmount(amount)}
                             className={`p-4 sm:p-6 rounded-[2rem] border-2 transition-all flex flex-col items-center gap-1 ${selectedAmount === amount ? 'bg-primary/5 border-primary' : 'bg-white text-black shadow-sm border border-grey/10 border-transparent'}`}
                           >
                             <span className="text-xl sm:text-2xl font-black text-primary">⚡{amount}</span>
                             <span className="text-[10px] font-bold text-grey/60">DB Coin (€{amount})</span>
                           </button>
                         ))}
                       </div>
                       <button disabled={!selectedAmount} onClick={() => setPaymentStep('SELECT_METHOD')}
                         className="w-full bg-primary text-white py-4 sm:py-5 rounded-[2rem] font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                       >
                         {t('profile.continue')}
                       </button>
                     </motion.div>
                   )}

                  {paymentStep === 'SELECT_METHOD' && (
                    <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                      <p className="text-xs text-grey  font-bold uppercase tracking-widest">{t('profile.paymentMethods')} (€{selectedAmount})</p>
                      <div className="space-y-3">
                         <button onClick={startStripeFlow} className="w-full bg-white text-black shadow-sm border border-grey/10 p-5 rounded-3xl flex items-center justify-between group hover:bg-primary/5 transition-all">
                            <div className="flex items-center gap-4">
                               <div className="bg-white  p-3 rounded-2xl text-primary shadow-sm">
                                  <CardIcon size={24}/>
                               </div>
                               <span className="font-bold text-black ">{t('profile.creditCard')}</span>
                            </div>
                            <ChevronRight size={20} className="text-grey group-hover:translate-x-1 transition-transform"/>
                          </button>
                       </div>
                      <button onClick={() => setPaymentStep('SELECT_AMOUNT')}
                        className="w-full py-4 text-grey font-bold uppercase tracking-widest text-[10px] hover:underline"
                      >
                        {t('profile.back')}
                      </button>
                    </motion.div>
                  )}

                  {paymentStep === 'PROCESSING' && (
                    <motion.div key="processing" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="py-12 flex flex-col items-center text-center">
                       <div className="w-20 h-20 bg-primary/10 text-primary rounded-[2.5rem] flex items-center justify-center mb-6 animate-spin-slow">
                          <Loader2 size={40} className="animate-spin"/>
                       </div>
                       <h4 className="text-xl font-black text-primary  uppercase italic mb-2">{t('profile.processing')}</h4>
                       <p className="text-xs text-grey mb-6">{t('profile.processingDesc')}</p>
                       <button onClick={() => setPaymentStep('SELECT_AMOUNT')} className="text-grey font-bold uppercase tracking-widest text-[10px] hover:underline">
                          Annulla / Torna indietro
                       </button>
                    </motion.div>
                  )}

                  {paymentStep === 'SUCCESS' && (
                    <motion.div key="success" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="py-12 flex flex-col items-center text-center">
                       <div className="w-20 h-20 bg-accent text-white rounded-[2.5rem] flex items-center justify-center mb-6 shadow-xl shadow-accent/20">
                          <CheckCircle2 size={40}/>
                       </div>
                       <h4 className="text-xl font-black text-accent uppercase italic mb-2">{t('profile.topUpSuccess')}</h4>
                       <p className="text-xs text-grey mb-8">{t('profile.topUpSuccessDesc')}</p>
                       <button onClick={resetTopUp} className="bg-primary text-white px-8 py-4 rounded-[2rem] font-black uppercase tracking-widest text-xs shadow-lg shadow-primary/20">
                         {t('profile.great')}
                       </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {showPayout && (
          <div className="fixed inset-0 z-[100] flex flex-col justify-end sm:justify-center overflow-hidden">
            <motion.div className="absolute inset-0 bg-dark/60 backdrop-blur-xl" onClick={() => setShowPayout(false)} />
            <motion.div className="relative w-full sm:max-w-md sm:mx-auto bg-white text-black rounded-t-[2.5rem] sm:rounded-[2.5rem] p-6 z-[110] shadow-2xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-black uppercase text-primary italic">Prelievo in EUR</h3>
                <button type="button" onClick={() => setShowPayout(false)} className="p-2 text-grey"><X size={20} /></button>
              </div>
              <p className="text-[10px] text-grey font-bold mb-4">1 DB Coin = 1 €. Minimo €20. Il saldo viene bloccato fino all&apos;approvazione admin.</p>
              {role === 'MECHANIC' && profile?.kycStatus !== 'APPROVED' && (
                <p className="text-[10px] text-danger font-bold mb-4 bg-danger/10 p-3 rounded-xl">Completa la verifica KYC (carica documenti) prima di prelevare.</p>
              )}
              <label className="text-[10px] font-black text-grey uppercase">Importo (€)</label>
              <input type="number" min={20} max={profile?.balance || 0} value={payoutAmount} onChange={(e) => setPayoutAmount(Number(e.target.value))} className="w-full mt-1 mb-3 p-3 rounded-xl border border-grey/20 font-bold" />
              <label className="text-[10px] font-black text-grey uppercase">IBAN</label>
              <input value={payoutIban} onChange={(e) => setPayoutIban(e.target.value)} placeholder="IT00 X000 0000 0000 0000 0000 000" className="w-full mt-1 mb-3 p-3 rounded-xl border border-grey/20 font-mono text-sm" />
              <label className="text-[10px] font-black text-grey uppercase">Intestatario conto</label>
              <input value={payoutHolder} onChange={(e) => setPayoutHolder(e.target.value)} className="w-full mt-1 mb-4 p-3 rounded-xl border border-grey/20 font-bold" />
              <button type="button" onClick={submitEurPayout} disabled={isPayoutSubmitting || (role === 'MECHANIC' && profile?.kycStatus !== 'APPROVED')} className="w-full bg-primary text-white py-4 rounded-2xl font-black uppercase text-xs disabled:opacity-50 flex items-center justify-center gap-2">
                {isPayoutSubmitting ? <Loader2 className="animate-spin" size={16} /> : null}
                Richiedi bonifico
              </button>
            </motion.div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
           <div className="bg-white text-black p-5 rounded-[2rem] shadow-sm border border-grey/5  text-center transition-colors">
              <p className="text-[10px] font-bold text-grey  uppercase tracking-tighter mb-1 transition-colors">{t('profile.interventions')}</p>
              <p className="text-lg font-black text-primary  transition-colors">{profile?.completedJobs || 0}</p>
           </div>
           <div className="bg-white text-black p-5 rounded-[2rem] shadow-sm border border-grey/5  text-center transition-colors">
              <p className="text-[10px] font-bold text-grey  uppercase tracking-tighter mb-1 transition-colors">{t('profile.points')}</p>
              <p className="text-lg font-black text-primary tabular-nums tracking-tight transition-colors">{formatLoyaltyPoints(profile?.points ?? 0)}</p>
           </div>
        </div>

        {/* Menu Items */}
        <div className="space-y-2">
            <MenuButton icon={<CreditCard size={18}/>} label={t('profile.paymentMethods')} onClick={() => setShowPaymentMethods(true)} />
           <MenuButton icon={<History size={18}/>} label={'Storico Interventi (PDF)'} onClick={() => setShowInterventionHistory(true)} />
           {role === 'MECHANIC' && (
             <MenuButton icon={<Star size={18}/>} label="Recensioni Ricevute" onClick={() => setShowReviews(true)} />
           )}
           {role === 'MECHANIC' && (
             <MenuButton icon={<Sparkles size={18}/>} label="Piani Abbonamento" onClick={() => setShowPlans(true)} />
           )}
           <MenuButton icon={isCreatingTicket ? <Loader2 size={18} className="animate-spin" /> : <MessageSquare size={18} />} 
             label="Assistenza Clienti" 
             onClick={startSupportTicket} 
           />
           <MenuButton icon={<Shield size={18}/>} label={t('profile.safety')} onClick={() => setShowSafety(true)} />
           <MenuButton icon={<Shield size={18} className="text-accent"/>} label={t('profile.privacyAndLegal')} onClick={() => setShowPrivacy(true)} />
            <MenuButton icon={<Settings size={18}/>} label={t('profile.settings')} onClick={() => setShowSettings(true)} />
            
            <button onClick={async () => {
              try {
                await signOut(auth);
                window.location.href = '/';
              } catch (err) {
                console.error('Logout error:', err);
              }
            }}
              className="w-full bg-danger/5 hover:bg-danger/10 text-danger p-5 rounded-[1.5rem] flex items-center justify-between group shadow-sm border border-danger/10 transition-all mt-4"
            >
               <div className="flex items-center gap-4 text-danger font-bold text-sm italic">
                  <div className="text-danger">
                    <LogOut size={18}/>
                  </div>
                  {t('profile.logout')}
               </div>
               <ChevronRight size={18} className="text-danger/40 transition-transform group-hover:translate-x-1"/>
            </button>
            
            {deferredPrompt && (
             <div className="pt-4 mt-4 border-t border-primary/10">
               <button onClick={handleInstallClick}
                 className="w-full flex items-center gap-4 p-5 bg-primary/5 hover:bg-primary/10 rounded-3xl transition-all border border-primary/20 group"
               >
                 <div className="w-10 h-10 bg-primary/10 rounded-2xl flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                   <Download size={20}/>
                 </div>
                 <div className="text-left">
                   <p className="text-[10px] font-black text-primary uppercase tracking-widest italic">PWA</p>
                   <p className="text-sm font-black text-primary uppercase italic">Installa Applicazione</p>
                 </div>
                 <div className="ml-auto">
                   <ChevronRight size={18} className="text-primary/40"/>
                 </div>
               </button>
             </div>
           )}

           {role === 'ADMIN' && (
             <div className="pt-4 mt-4 border-t border-danger/10">
               <button onClick={() => setShowResetConfirm(true)}
                 className="w-full flex items-center gap-4 p-5 bg-danger/5 hover:bg-danger/10 rounded-3xl transition-all border border-danger/20 group"
               >
                 <div className="w-10 h-10 bg-danger/10 rounded-2xl flex items-center justify-center text-danger group-hover:scale-110 transition-transform">
                   <AlertCircle size={20}/>
                 </div>
                 <div className="text-left">
                   <p className="text-[10px] font-black text-danger uppercase tracking-widest italic">Admin Tools</p>
                   <p className="text-sm font-black text-danger uppercase italic">Reset Produzione</p>
                 </div>
                 <div className="ml-auto">
                   <ChevronRight size={18} className="text-danger/40"/>
                 </div>
               </button>
             </div>
           )}
        </div>

        <AnimatePresence>
          {showAvatarPicker && (
            <div className="fixed inset-0 z-[200] flex flex-col justify-end sm:justify-center overflow-hidden">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAvatarPicker(false)} className="absolute inset-0 bg-dark/60 backdrop-blur-xl z-[200]"/>
              <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 300 }} className="relative overflow-y-auto w-full max-h-[85vh] sm:max-w-2xl sm:mx-auto bg-white text-black rounded-t-[3rem] sm:rounded-[3rem] p-8 z-[210] shadow-2xl pb-[calc(7rem+env(safe-area-inset-bottom))]">
                <div className="w-12 h-1.5 bg-grey/10 rounded-full mx-auto mb-8"/>
                
                <div className="flex justify-between items-center mb-8">
                   <h3 className="text-2xl font-black text-primary uppercase italic">Personalizza Avatar</h3>
                   <button onClick={() => setShowAvatarPicker(false)} className="p-2 text-grey">
                      <X size={24}/>
                   </button>
                </div>

                <div className="space-y-8">
                  {/* Upload Section */}
                  <div>
                    <p className="text-[10px] font-black text-grey uppercase tracking-widest mb-4 italic">Carica Foto</p>
                    <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-grey/20 rounded-[2.5rem] bg-grey/5 hover:bg-grey/10 transition-colors cursor-pointer group">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <Camera size={32} className="text-grey group-hover:scale-110 transition-transform mb-2"/>
                        <p className="text-[10px] font-black text-grey uppercase tracking-widest leading-relaxed">Tocca per caricare</p>
                        <p className="text-[8px] font-medium text-grey/60 uppercase tracking-tighter mt-1">PNG, JPG (MAX. 2MB)</p>
                      </div>
                      <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 2 * 1024 * 1024) {
                          toast.error('Immagine troppo grande (max 2MB).');
                          return;
                        }
                        const reader = new FileReader();
                        reader.onloadend = async () => {
                          const base64String = reader.result as string;
                          try {
                            setIsSavingProfile(true);
                            await updateDoc(doc(db, 'users', user?.uid as string), {
                              photoURL: base64String,
                              updatedAt: serverTimestamp()
                            });
                            setShowAvatarPicker(false);
                          } catch(err) {
                            handleFirestoreError(err, OperationType.UPDATE, 'users');
                          } finally {
                            setIsSavingProfile(false);
                          }
                        };
                        reader.readAsDataURL(file);
                      }} />
                    </label>
                  </div>

                  {/* Preset Avatars */}
                  <div>
                    <p className="text-[10px] font-black text-grey uppercase tracking-widest mb-4 italic">Scegli un Avatar</p>
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
                      {[
                        'Adventure', 'Hero', 'Explorer', 'Mechanic', 'Rider', 'Fixer', 
                        'Legend', 'Champion', 'Spark', 'Turbo', 'Shift', 'Biker'
                      ].map((seed) => {
                        const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`;
                        const isSelected = (profile?.photoURL || user?.photoURL) === avatarUrl;
                        
                        return (
                          <button
                            key={seed}
                            onClick={async () => {
                              try {
                                setIsSavingProfile(true);
                                await updateDoc(doc(db, 'users', user?.uid as string), {
                                  photoURL: avatarUrl,
                                  updatedAt: serverTimestamp()
                                });
                                setShowAvatarPicker(false);
                              } catch(err) {
                                handleFirestoreError(err, OperationType.UPDATE, 'users');
                              } finally {
                                setIsSavingProfile(false);
                              }
                            }}
                            className={`aspect-square rounded-2xl overflow-hidden border-2 transition-all hover:scale-105 active:scale-95 ${isSelected ? 'border-accent ring-4 ring-accent/10 shadow-lg' : 'border-grey/5 bg-grey/5'}`}
                          >
                            <img src={avatarUrl} alt={seed} className="w-full h-full object-cover"/>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* More Styles (Optional) */}
                  <div className="pt-4 border-t border-grey/5">
                    <p className="text-[10px] font-black text-grey uppercase tracking-widest mb-4 italic">Stili Alternativi</p>
                    <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                      {['bottts', 'pixel-art', 'notionists', 'big-smile'].map((style) => {
                        const avatarUrl = `https://api.dicebear.com/7.x/${style}/svg?seed=${user?.uid}`;
                        return (
                          <button
                            key={style}
                            onClick={async () => {
                              try {
                                setIsSavingProfile(true);
                                await updateDoc(doc(db, 'users', user?.uid as string), {
                                  photoURL: avatarUrl,
                                  updatedAt: serverTimestamp()
                                });
                                setShowAvatarPicker(false);
                              } catch(err) {
                                handleFirestoreError(err, OperationType.UPDATE, 'users');
                              } finally {
                                setIsSavingProfile(false);
                              }
                            }}
                            className="w-16 h-16 shrink-0 rounded-2xl bg-grey/5 border border-grey/10 overflow-hidden hover:scale-105 transition-transform"
                          >
                            <img src={avatarUrl} alt={style} className="w-full h-full object-cover"/>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* History Modal */}
        <AnimatePresence>
          {showHistory && (
            <div className="fixed inset-0 z-[120] flex flex-col justify-end sm:justify-center overflow-hidden">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowHistory(false)} className="absolute inset-0 bg-dark/60 backdrop-blur-md z-[120]" />
              <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} className="relative overflow-y-auto w-full max-h-[85vh] sm:max-w-2xl sm:mx-auto bg-white text-black rounded-t-[3rem] sm:rounded-[3rem] p-8 pt-4 z-[130] shadow-2xl pb-[calc(7rem+env(safe-area-inset-bottom))]">
                <div className="w-12 h-1.5 bg-grey/20 rounded-full mx-auto mb-6"/>
                <div className="flex justify-between items-center mb-8">
                  <h3 className="text-2xl font-black text-primary  uppercase italic">{t('profile.history')}</h3>
                  <button onClick={() => setShowHistory(false)} aria-label="Close history" className="p-2 text-grey"><X size={24}/></button>
                </div>
                
                {isHistoryLoading ? (
                  <div className="flex justify-center py-20 text-primary">
                    <div className="w-8 h-8 border-4 border-current border-t-transparent rounded-full animate-spin"/>
                  </div>
                ) : history.length > 0 ? (
                  <div className="space-y-4 pb-12">
                    {history.map((item: any) => (
                      <div key={item.id} className="bg-white text-black shadow-sm border border-grey/10 p-6 rounded-3xl border border-grey/5">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <p className="text-[8px] font-black text-grey uppercase tracking-widest mb-1">
                              {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString() : 'Recent'}
                            </p>
                            <h4 className="text-sm font-black text-black  uppercase italic">
                              {item.issueType ? t(`cyclist.${item.issueType}`) : 'SOS Request'}
                            </h4>
                          </div>
                          <div className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${item.status === 'COMPLETED' ? 'bg-green-100 text-green-600' : 'bg-primary/10 text-primary'}`}>
                            {item.status}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                           <div className="w-6 h-6 rounded-full bg-grey/10 flex items-center justify-center">
                              <Zap size={12} className="text-primary"/>
                           </div>
                           <p className="text-[10px] font-bold text-grey">{item.locationName || 'Intervento Stradale'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
                    <History size={48} className="mb-4"/>
                    <p className="text-xs font-bold uppercase tracking-widest">{t('profile.noHistory')}</p>
                  </div>
                )}
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Reviews Modal */}
        <AnimatePresence>
          {showReviews && (
            <div className="fixed inset-0 z-[120] flex flex-col justify-end sm:justify-center overflow-hidden">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowReviews(false)} className="absolute inset-0 bg-dark/60 backdrop-blur-md z-[120]" />
              <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} className="relative overflow-y-auto w-full max-h-[85vh] sm:max-w-2xl sm:mx-auto bg-white text-black rounded-t-[3rem] sm:rounded-[3rem] p-8 pt-4 z-[130] shadow-2xl pb-[calc(7rem+env(safe-area-inset-bottom))]">
                <div className="w-12 h-1.5 bg-grey/20 rounded-full mx-auto mb-6"/>
                <div className="flex justify-between items-center mb-8">
                   <h3 className="text-2xl font-black text-primary  uppercase italic">Le tue Recensioni</h3>
                   <button onClick={() => setShowReviews(false)} aria-label="Close reviews" className="p-2 text-grey"><X size={24}/></button>
                 </div>
                
<div className="space-y-4 pb-12">
                    {isReviewsLoading ? (
                      <div className="flex justify-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                      </div>
                    ) : reviews.length === 0 ? (
                      <div className="text-center py-12">
                        <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Star size={28} className="text-accent" />
                        </div>
                        <p className="text-sm font-bold text-grey uppercase tracking-widest">Nessuna recensione ancora</p>
                        <p className="text-xs text-grey/60 mt-2">Le recensioni appariranno qui dopo aver completato i primi interventi</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {reviews.map((review: any) => (
                          <div key={review.id} className="bg-white border border-grey/10 rounded-2xl p-4">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                                  <span className="text-xs font-black text-primary uppercase">
                                    {(review.cyclistName || 'C').charAt(0)}
                                  </span>
                                </div>
                                <div>
                                  <p className="text-xs font-bold text-black">{review.cyclistName || 'Ciclista'}</p>
                                  <p className="text-[9px] text-grey font-medium">
                                    {review.createdAt?.toDate ? review.createdAt.toDate().toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-0.5">
                                {Array.from({ length: 5 }).map((_, i) => (
                                  <Star key={i} size={12} className={i < (review.rating || 0) ? 'text-accent fill-accent' : 'text-grey/20'} />
                                ))}
                              </div>
                            </div>
                            {review.text && (
                              <p className="text-xs text-grey leading-relaxed">{review.text}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                 </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showSettings && (
            <div className="fixed inset-0 z-[150] flex flex-col justify-end sm:justify-center overflow-hidden">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowSettings(false)} className="absolute inset-0 bg-dark/60 backdrop-blur-xl z-[150]"/>
              <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 300 }} className="relative overflow-y-auto w-full max-h-[85vh] sm:max-w-2xl sm:mx-auto bg-white text-black rounded-t-[3rem] sm:rounded-[3rem] p-4 sm:p-8 z-[160] shadow-[0_-20px_50px_-10px_rgba(0,0,0,0.3)] pb-[calc(7rem+env(safe-area-inset-bottom))]">
                <div className="w-12 h-1.5 bg-grey/10 rounded-full mx-auto mb-4 sm:mb-8"/>
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl sm:text-2xl font-black text-primary uppercase italic">{t('profile.settings')}</h3>
                  <button onClick={() => setShowSettings(false)} className="p-2 text-grey"><X size={24}/></button>
                </div>
                <div className="space-y-6">
                  <div className="bg-grey/5 p-6 rounded-[2rem]">
                    <h4 className="text-[10px] font-black text-grey uppercase tracking-widest mb-4">{t('profile.notificationPrefs')}</h4>
                    <div className="space-y-3">
                      <PreferenceToggle label={t('profile.prefSOS')} checked={profile?.notificationPreferences?.sosAlerts ?? true} onChange={async (val) => { if (!user) return; await updateDoc(doc(db, 'users', user.uid), { 'notificationPreferences.sosAlerts': val, updatedAt: serverTimestamp() }); }} />
                      {(role === 'MECHANIC' || role === 'PEER_MECHANIC') && (
                        <PreferenceToggle label={t('profile.prefJobs')} checked={profile?.notificationPreferences?.newJobs ?? true} onChange={async (val) => { if (!user) return; await updateDoc(doc(db, 'users', user.uid), { 'notificationPreferences.newJobs': val, updatedAt: serverTimestamp() }); }} />
                      )}
                      <PreferenceToggle label={t('profile.prefCommunity')} checked={profile?.notificationPreferences?.communityUpdates ?? true} onChange={async (val) => { if (!user) return; await updateDoc(doc(db, 'users', user.uid), { 'notificationPreferences.communityUpdates': val, updatedAt: serverTimestamp() }); }} />
                      <PreferenceToggle label={t('profile.prefMarketing')} checked={profile?.notificationPreferences?.marketing ?? false} onChange={async (val) => { if (!user) return; await updateDoc(doc(db, 'users', user.uid), { 'notificationPreferences.marketing': val, updatedAt: serverTimestamp() }); }} />
                    </div>
                  </div>

                  {(role === 'MECHANIC' || role === 'PEER_MECHANIC') && (
                    <div className="bg-grey/5 p-6 rounded-[2rem]">
                      <h4 className="text-[10px] font-black text-grey uppercase tracking-widest mb-4">Meccanico</h4>
                      <div className="space-y-3">
                        <PreferenceToggle label="Mostra disponibilità sulla mappa" checked={profile?.isOnline ?? false} onChange={async (val) => { if (!user) return; await updateDoc(doc(db, 'users', user.uid), { isOnline: val, updatedAt: serverTimestamp() }); }} />
                      </div>
                    </div>
                  )}

                  {role === 'CYCLIST' && (
                    <div className="bg-grey/5 p-6 rounded-[2rem]">
                      <h4 className="text-[10px] font-black text-grey uppercase tracking-widest mb-4">Ciclista</h4>
                      <div className="space-y-3">
                        <PreferenceToggle label="Mostra posizione sulla mappa" checked={profile?.isOnline ?? false} onChange={async (val) => { if (!user) return; await updateDoc(doc(db, 'users', user.uid), { isOnline: val, updatedAt: serverTimestamp() }); }} />
                      </div>
                    </div>
                  )}

                  <div className="bg-grey/5 p-6 rounded-[2rem]">
                    <h4 className="text-[10px] font-black text-grey uppercase tracking-widest mb-4">Account</h4>
                    <button onClick={async () => { if (!user?.email) return; setIsResettingPassword(true); try { await sendPasswordResetEmail(auth, user.email); toast.success('Email di reset inviata!'); } catch (err) { console.error(err); toast.error('Errore nel reset password'); } finally { setIsResettingPassword(false); } }} disabled={isResettingPassword} className="w-full py-4 text-primary text-[10px] font-black uppercase tracking-widest border border-primary/20 rounded-2xl bg-primary/5 hover:bg-primary/10 transition-all disabled:opacity-50">
                      {isResettingPassword ? <Loader2 className="animate-spin mx-auto" size={16}/> : 'Reset Password'}
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showSafety && (
            <div className="fixed inset-0 z-[150] flex flex-col justify-end sm:justify-center overflow-hidden">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowSafety(false)} className="absolute inset-0 bg-dark/60 backdrop-blur-xl z-[150]"/>
              <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 300 }} className="relative overflow-y-auto w-full max-h-[85vh] sm:max-w-2xl sm:mx-auto bg-white text-black rounded-t-[3rem] sm:rounded-[3rem] p-4 sm:p-8 z-[160] shadow-[0_-20px_50px_-10px_rgba(0,0,0,0.3)] pb-[calc(7rem+env(safe-area-inset-bottom))]">
                <div className="w-12 h-1.5 bg-grey/10 rounded-full mx-auto mb-4 sm:mb-8"/>
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl sm:text-2xl font-black text-primary uppercase italic">{t('profile.safety')}</h3>
                  <button onClick={() => setShowSafety(false)} className="p-2 text-grey"><X size={24}/></button>
                </div>
                <div className="space-y-6">
                  <div className="bg-accent/5 p-6 rounded-[2rem] border border-accent/10">
                    <h4 className="text-sm font-black text-accent uppercase italic mb-2">Copertura Assicurativa</h4>
                    <p className="text-xs text-grey font-bold uppercase tracking-widest">DB360 offre una copertura base per tutti gli interventi effettuati tramite la piattaforma. Per maggiori dettagli, contatta il supporto.</p>
                  </div>
                  <div className="bg-primary/5 p-6 rounded-[2rem] border border-primary/10">
                    <h4 className="text-sm font-black text-primary uppercase italic mb-2">Sicurezza SOS</h4>
                    <p className="text-xs text-grey font-bold uppercase tracking-widest">Quando invii un SOS, la tua posizione è condivisa solo con i meccanici disponibili nelle vicinanze. I dati sono crittografati e protetti.</p>
                  </div>
                  <div className="bg-grey/5 p-6 rounded-[2rem]">
                    <h4 className="text-sm font-black text-black uppercase italic mb-2">Consigli di Sicurezza</h4>
                    <ul className="text-xs text-grey font-bold uppercase tracking-widest space-y-2">
                      <li>• Indossa sempre il casco</li>
                      <li>• Usa luci e catarifrangenti di notte</li>
                      <li>• Rispetta il codice della strada</li>
                      <li>• Mantieni la bici in buono stato</li>
                    </ul>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showPlans && (
            <div className="fixed inset-0 z-[120] flex flex-col justify-end sm:justify-center overflow-hidden">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { setShowPlans(false); setPlanUpgradeStep('SELECT'); setSelectedPlanForUpgrade(null); }} className="absolute inset-0 bg-dark/60 backdrop-blur-md z-[120]" />
              <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 300 }} className="relative overflow-y-auto w-full max-h-[85vh] sm:max-w-2xl sm:mx-auto bg-white text-black rounded-t-[3rem] sm:rounded-[3rem] p-4 sm:p-8 z-[130] shadow-2xl pb-[calc(7rem+env(safe-area-inset-bottom))]">
                <div className="w-12 h-1.5 bg-grey/20 rounded-full mx-auto mb-6"/>
                <div className="flex justify-between items-center mb-8">
                   <h3 className="text-2xl font-black text-primary uppercase italic">
                     {planUpgradeStep === 'SELECT' ? 'Piani Abbonamento' : 'Conferma Piano'}
                   </h3>
                   <button onClick={() => { setShowPlans(false); setPlanUpgradeStep('SELECT'); setSelectedPlanForUpgrade(null); }} className="p-2 text-grey"><X size={24}/></button>
                </div>

                {planUpgradeStep === 'SELECT' ? (
                  <div className="space-y-4 pb-12">
                    <p className="text-xs text-grey font-medium mb-6">Scegli il piano migliore per te. Il downgrade sarà attivo dal prossimo ciclo di fatturazione, l'upgrade ha inizio immediato.</p>
                    {plans.map((plan) => (
                      <div key={plan.id} className={`rounded-[2rem] p-6 border-2 transition-all ${profile?.plan === plan.id ? 'border-primary bg-primary/5 shadow-lg' : 'border-grey/10 bg-white'}`}>
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${plan.color}`}>{plan.title}</span>
                            {profile?.plan === plan.id && <span className="ml-2 text-[9px] font-bold text-primary uppercase">Piano Attivo</span>}
                          </div>
                          <div className="text-right">
                            <span className="text-2xl font-black text-primary">€{plan.price}</span>
                            <span className="text-[10px] text-grey font-bold">/mese</span>
                          </div>
                        </div>
                        <ul className="space-y-2 mt-4">
                          {plan.features.map((feature: string, i: number) => (
                            <li key={i} className="flex items-center gap-2 text-xs text-grey">
                              <CheckCircle2 size={14} className="text-primary shrink-0" />
                              <span className="font-medium">{feature}</span>
                            </li>
                          ))}
                        </ul>
                        {profile?.plan === plan.id ? (
                          <div className="mt-4 w-full py-3 text-center text-[10px] font-black uppercase tracking-widest text-primary/50 border border-primary/10 rounded-2xl">
                            Piano Attivo
                          </div>
                        ) : (
                          <button
                            onClick={() => upgradePlan(plan.id)}
                            className="mt-4 w-full py-3 text-center text-[10px] font-black uppercase tracking-widest text-white bg-primary rounded-2xl hover:bg-primary/90 active:scale-95 transition-all"
                          >
                            {plan.id === 'BASE' ? 'Downgrade' : 'Upgrade'}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : planUpgradeStep === 'PAYMENT' && selectedPlanForUpgrade ? (
                  <div className="space-y-6 pb-12">
                    <div className="bg-primary/5 border border-primary/10 rounded-[2rem] p-6 text-center">
                      <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${selectedPlanForUpgrade.color}`}>{selectedPlanForUpgrade.title}</span>
                      <div className="mt-3">
                        <span className="text-4xl font-black text-primary">€{selectedPlanForUpgrade.price}</span>
                        <span className="text-sm text-grey font-bold">/mese</span>
                      </div>
                      <ul className="space-y-2 mt-4 text-left">
                        {selectedPlanForUpgrade.features.map((feature: string, i: number) => (
                          <li key={i} className="flex items-center gap-2 text-xs text-grey">
                            <CheckCircle2 size={14} className="text-primary shrink-0" />
                            <span className="font-medium">{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="bg-warning/5 border border-warning/10 rounded-[2rem] p-4">
                      <p className="text-xs text-warning font-bold">
                        {selectedPlanForUpgrade.id === 'BASE'
                          ? 'Il downgrade sarà attivo dal prossimo ciclo di fatturazione. Continui a godere dei benefici del piano attuale fino alla fine del periodo.'
                          : 'L\'upgrade è immediato. Verrai addebitato solo la differenza proporzionale per il periodo rimanente.'}
                      </p>
                    </div>
                    <button
                      onClick={initStripeUpgrade}
                      disabled={isUpgrading === selectedPlanForUpgrade.id}
                      className="w-full py-4 text-[11px] font-black uppercase tracking-widest text-white bg-primary rounded-2xl hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50"
                    >
                      {isUpgrading === selectedPlanForUpgrade.id ? (
                        <span className="flex items-center justify-center gap-2">
                          <Loader2 size={16} className="animate-spin" /> Reindirizzamento a Stripe...
                        </span>
                      ) : (
                        'Procedi al Pagamento Sicuro'
                      )}
                    </button>
                    <button
                      onClick={() => { setPlanUpgradeStep('SELECT'); setSelectedPlanForUpgrade(null); }}
                      className="w-full py-3 text-[10px] font-bold text-grey uppercase tracking-widest hover:text-black transition-colors"
                    >
                      Torna ai Piani
                    </button>
                  </div>
                ) : planUpgradeStep === 'PROCESSING' ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <Loader2 size={40} className="animate-spin text-primary mb-4" />
                    <p className="text-sm font-bold text-grey uppercase tracking-widest">Elaborazione in corso...</p>
                  </div>
                ) : null}
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showPrivacy && (
            <div className="fixed inset-0 z-[150] flex flex-col justify-end sm:justify-center overflow-hidden">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowPrivacy(false)} className="absolute inset-0 bg-dark/60 backdrop-blur-xl z-[150]"/>
              <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 300 }} className="relative overflow-y-auto w-full max-h-[85vh] sm:max-w-2xl sm:mx-auto bg-white text-black rounded-t-[3rem] sm:rounded-[3rem] p-4 sm:p-8 z-[160] shadow-[0_-20px_50px_-10px_rgba(0,0,0,0.3)] pb-[calc(7rem+env(safe-area-inset-bottom))]">
                <div className="w-12 h-1.5 bg-grey/10 rounded-full mx-auto mb-4 sm:mb-8"/>
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl sm:text-2xl font-black text-primary uppercase italic">{t('profile.privacyAndLegal')}</h3>
                  <button onClick={() => setShowPrivacy(false)} className="p-2 text-grey"><X size={24}/></button>
                </div>
                <div className="space-y-6">
                  <div className="bg-grey/5 p-6 rounded-[2rem] border border-grey/10 space-y-6">
                    <LegalItem label={t('profile.privacyPolicy')} checked={profile?.consents?.privacyPolicy ?? true} isRequired onChange={() => {}} />
                    <LegalItem label={t('profile.termsOfService')} checked={profile?.consents?.termsOfService ?? true} isRequired onChange={() => {}} />
                    <LegalItem label={t('profile.dataProcessing')} checked={profile?.consents?.dataProcessing ?? true} isRequired onChange={() => {}} />
                    <LegalItem label={t('profile.marketingConsent')} checked={profile?.consents?.marketing ?? false} onChange={async (val) => { if (!user) return; await updateDoc(doc(db, 'users', user.uid), { 'consents.marketing': val, updatedAt: serverTimestamp() }); }} />
                    <p className="text-[9px] text-grey font-bold italic mt-4">{t('profile.legalDesc')}</p>
                  </div>
                  <div className="flex flex-col gap-3">
                    <button className="w-full py-4 text-primary text-[10px] font-black uppercase tracking-widest border border-primary/20 rounded-2xl bg-primary/5 hover:bg-primary/10 transition-all">
                      {t('profile.privacyPolicy')}
                    </button>
                    <button className="w-full py-4 text-grey text-[10px] font-black uppercase tracking-widest border border-grey/20 rounded-2xl hover:bg-grey/5 transition-all">
                      {t('profile.termsOfService')}
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showInterventionHistory && (
            <InterventionHistory onClose={() => setShowInterventionHistory(false)} />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showLeaderboard && <LeaderboardView onClose={() => setShowLeaderboard(false)} />}
        </AnimatePresence>

        <AnimatePresence>
          {showSupport && userSupportTicket && (
            <FullScreenPortal>
              <motion.div className="flex flex-col h-full min-h-0">
              <div className="flex items-center justify-between p-4 bg-primary text-white border-b border-primary/20 shrink-0">
                <div className="flex items-center gap-3">
                  <button onClick={() => setShowSupport(false)} className="p-1 rounded-full hover:bg-white/10 transition-colors">
                    <ArrowLeft size={20} />
                  </button>
                  <div>
                    <h3 className="font-black text-sm uppercase">Assistenza Clienti</h3>
                    <p className="text-[9px] text-white/70 uppercase font-bold">Ticket #{userSupportTicket.id.slice(0, 6)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded-full text-[8px] font-black uppercase ${userSupportTicket.status === 'OPEN' ? 'bg-accent/20 text-accent' : userSupportTicket.status === 'CLOSED' ? 'bg-grey/20 text-grey' : 'bg-warning/20 text-warning'}`}>
                    {userSupportTicket.status}
                  </span>
                  {userSupportTicket.status !== 'CLOSED' && (
                    <button 
                      onClick={() => requestConfirm({
                        title: 'Chiudi ticket',
                        message: 'Chiudere questo ticket di assistenza?',
                        variant: 'danger',
                        confirmLabel: 'Chiudi',
                        onConfirm: async () => {
                          try {
                            await updateDoc(doc(db, 'supportTickets', userSupportTicket.id), { 
                              status: 'CLOSED', 
                              updatedAt: serverTimestamp(),
                              closedBy: user?.uid,
                              closedAt: serverTimestamp()
                            });
                            toast.success('Ticket chiuso');
                            setShowSupport(false);
                            setUserSupportTicket(null);
                          } catch (err) {
                            console.error(err);
                            toast.error('Errore nella chiusura del ticket');
                          }
                        },
                      })}
                      className="p-1 rounded-full hover:bg-white/10 transition-colors"
                      title="Chiudi ticket"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              </div>
              {userSupportTicket.status === 'CLOSED' ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                  <div className="w-20 h-20 bg-grey/10 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle2 size={40} className="text-grey" />
                  </div>
                  <h4 className="text-lg font-black text-black uppercase mb-2">Ticket Chiuso</h4>
                  <p className="text-xs text-grey font-bold uppercase tracking-widest mb-6">Questo ticket è stato chiuso</p>
                  <button onClick={() => { setShowSupport(false); setUserSupportTicket(null); }} className="bg-primary text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest">
                    Torna al Profilo
                  </button>
                </div>
              ) : (
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                  <Chat key={userSupportTicket.id} chatId={userSupportTicket.id} otherPartyName="Supporto DB360" isAdminSupport={true} targetUserId="admin" />
                </div>
              )}
              </motion.div>
            </FullScreenPortal>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showFAQ && (
            <FullScreenPortal>
              <motion.div className="flex flex-col h-full min-h-0">
              <div className="flex items-center justify-between p-4 bg-primary text-white border-b border-primary/20 shrink-0">
                <div className="flex items-center gap-3">
                  <button onClick={() => setShowFAQ(false)} className="p-1 rounded-full hover:bg-white/10 transition-colors">
                    <ArrowLeft size={20} />
                  </button>
                  <div>
                    <h3 className="font-black text-sm uppercase">Domande Frequenti</h3>
                    <p className="text-[9px] text-white/70 uppercase font-bold">Prima di contattarci</p>
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
                {[
                  { q: 'Come funziona il SOS?', a: 'Premi il pulsante SOS sulla mappa. I meccanici vicini riceveranno la tua richiesta e potranno accettarla. Vedrai chi ha accettato e il suo percorso verso di te.' },
                  { q: 'Come si pagano gli interventi?', a: 'Puoi pagare con DB Coin (portafoglio interno), carta di credito, PayPal o bonifico. Ricarica il portafoglio dalla sezione "Metodi di Pagamento" nel profilo.' },
                  { q: 'Cosa sono le DB Coin?', a: 'Le DB Coin sono la valuta interna di DoctorBike. 1 DB Coin = 1€. Puoi ricaricarle e usarle per pagare interventi, abbonamenti e servizi.' },
                  { q: 'Come diventa un Meccanico?', a: 'Registrati come meccanico, completa la verifica KYC e inizia ad accettare SOS nella tua zona. I meccanici esperti possono diventare Peer Mechanic.' },
                  { q: 'Come funziona la reputazione?', a: 'Ogni intervento completato ti dà punti reputazione. Le recensioni positive aumentano la tua visibilità sulla mappa e sbloccano badge speciali.' },
                  { q: 'Posso annullare un SOS?', a: 'Sì, puoi annullare un SOS finché non è stato accettato da un meccanico. Dopo l\'accettazione, contatta il meccanico o il supporto.' },
                  { q: 'Come segnalo un problema sulla strada?', a: 'Premi il pulsante "Segnala" sulla mappa per segnalare buche, ostacoli o pericoli. La segnalazione sarà visibile a tutti gli utenti.' },
                  { q: 'Problemi con l\'app?', a: 'Prova a ricaricare la pagina o a chiudere e riaprire l\'app. Se il problema persiste, crea un ticket di assistenza qui sotto.' },
                ].map((faq, i) => (
                  <FAQItem key={i} question={faq.q} answer={faq.a} />
                ))}
                <div className="pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
                  <button 
                    onClick={createTicketFromFAQ}
                    disabled={isCreatingTicket}
                    className="w-full py-4 bg-accent text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:scale-[1.02] active:scale-95 transition-all shadow-lg shadow-accent/20 disabled:opacity-50 flex items-center justify-center gap-2 min-h-[48px]"
                  >
                    {isCreatingTicket ? <Loader2 className="animate-spin" size={16}/> : <MessageSquare size={16}/>}
                    {isCreatingTicket ? 'Creazione ticket...' : 'Non hai trovato risposta? Contattaci'}
                  </button>
                </div>
              </div>
              </motion.div>
            </FullScreenPortal>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showPaymentMethods && (
            <PaymentMethodsModal onClose={() => setShowPaymentMethods(false)} onAddPayment={() => setShowTopUp(true)} />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showP2PWallet && (
              <P2PWalletModal onClose={() => setShowP2PWallet(false)} />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showTransactionsModal && (
             <TransactionsModal onClose={() => setShowTransactionsModal(false)} />
          )}
        </AnimatePresence>

        <ConfirmDialogPortal />
      </div>
    </div>
  );
}

function MenuButton({ icon, label, onClick }: { icon: React.ReactNode, label: string, onClick?: () => void }) {
  return (
    <button onClick={onClick} className="w-full bg-white text-black p-5 rounded-[1.5rem] flex items-center justify-between group shadow-sm border border-grey/5  hover:border-primary/20 transition-all">
       <div className="flex items-center gap-4 text-black  font-bold text-sm italic transition-colors">
          <div className="text-grey  group-hover:text-primary :text-accent transition-colors">
            {icon}
          </div>
          {label}
       </div>
       <ChevronRight size={18} className="text-grey  group-hover:text-primary :text-accent transition-transform group-hover:translate-x-1"/>
    </button>
  );
}

function PreferenceToggle({ label, checked, onChange }: { label: string, checked: boolean, onChange: (val: boolean) => void }) {
  return (
    <div className="bg-white p-5 rounded-[1.5rem] flex items-center justify-between shadow-sm border border-grey/5">
       <span className="text-xs font-bold text-black uppercase">{label}</span>
       <button 
         onClick={() => onChange(!checked)} 
         className={`relative w-10 h-5 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-grey/20'}`}
       >
         <motion.div animate={{ x: checked ? 22 : 2 }} className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-md"/>
       </button>
    </div>
  );
}

function LegalItem({ label, checked, onChange, isRequired = false }: { label: string, checked: boolean, onChange: (val: boolean) => void, isRequired?: boolean }) {
  return (
     <div className="flex items-center gap-4">
        <button 
          onClick={() => !isRequired && onChange(!checked)}
          className={`shrink-0 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors ${checked ? 'bg-accent border-accent text-white' : 'border-grey/30 bg-white'}`}
        >
          {checked && <CheckCircle2 size={16}/>}
        </button>
        <div className="flex-1">
           <p className="text-[11px] font-black text-black uppercase tracking-tight">{label} {isRequired && <span className="text-danger">*</span>}</p>
        </div>
     </div>
  );
}

function PaymentMethodsModal({ onClose, onAddPayment }: { onClose: () => void; onAddPayment: () => void }) {
  const { user, profile } = useAuthStore();
  const [savedMethods, setSavedMethods] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadMethods = async () => {
      if (!user) return;
      setIsLoading(true);
      try {
        const methods = (profile as any)?.paymentMethods || [];
        setSavedMethods(methods);
      } catch (err) {
        console.error('Error loading payment methods:', err);
      } finally {
        setIsLoading(false);
      }
    };
    loadMethods();
  }, [user, profile]);

  const removeMethod = async (id: string) => {
    if (!user) return;
    try {
      const updated = savedMethods.filter(m => m.id !== id);
      await updateDoc(doc(db, 'users', user.uid), { paymentMethods: updated });
      setSavedMethods(updated);
      toast.success('Metodo rimosso');
    } catch (err) {
      console.error(err);
      toast.error('Errore nella rimozione');
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex flex-col justify-end sm:justify-center overflow-hidden">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-dark/60 backdrop-blur-xl z-[150]"/>
      <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 300 }} className="relative overflow-y-auto w-full max-h-[85vh] sm:max-w-2xl sm:mx-auto bg-white text-black rounded-t-[3rem] sm:rounded-[3rem] p-4 sm:p-8 z-[160] shadow-[0_-20px_50px_-10px_rgba(0,0,0,0.3)] pb-[calc(7rem+env(safe-area-inset-bottom))]">
        <div className="w-12 h-1.5 bg-grey/10 rounded-full mx-auto mb-4 sm:mb-8"/>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl sm:text-2xl font-black text-primary uppercase italic">Metodi di Pagamento</h3>
          <button onClick={onClose} className="p-2 text-grey"><X size={24}/></button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin text-primary" size={32}/>
          </div>
        ) : savedMethods.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <CreditCard size={48} className="text-grey/30 mb-4"/>
            <p className="text-sm font-bold text-grey uppercase tracking-widest mb-2">Nessun metodo salvato</p>
            <p className="text-xs text-grey/60">Aggiungi una carta, PayPal o IBAN per pagare più velocemente</p>
          </div>
        ) : (
          <div className="space-y-3 mb-6">
            {savedMethods.map((method) => (
              <div key={method.id} className="bg-grey/5 p-4 rounded-2xl flex items-center justify-between border border-grey/10">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${method.type === 'card' ? 'bg-primary/10 text-primary' : method.type === 'paypal' ? 'bg-blue-500/10 text-blue-500' : 'bg-green-500/10 text-green-500'}`}>
                    {method.type === 'card' ? <CardIcon size={20}/> : method.type === 'paypal' ? <span className="text-lg font-bold">P</span> : <span className="text-xs font-bold">IBAN</span>}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-black">{method.type === 'card' ? `•••• ${method.last4}` : method.type === 'paypal' ? 'PayPal' : method.name}</p>
                    <p className="text-[10px] text-grey uppercase">{method.type === 'card' ? method.brand : method.type}</p>
                  </div>
                </div>
                <button onClick={() => removeMethod(method.id)} className="p-2 text-danger/60 hover:text-danger transition-colors">
                  <X size={16}/>
                </button>
              </div>
            ))}
          </div>
        )}

        <button onClick={onAddPayment} className="w-full py-4 text-primary text-[10px] font-black uppercase tracking-widest border border-primary/20 rounded-2xl bg-primary/5 hover:bg-primary/10 transition-all flex items-center justify-center gap-2">
          <span className="text-lg">+</span> Aggiungi Metodo di Pagamento
        </button>

        <div className="mt-6 pt-6 border-t border-grey/10">
          <p className="text-[10px] text-grey font-bold uppercase tracking-widest text-center mb-4">Oppure ricarica il portafoglio</p>
          <button onClick={() => { onClose(); onAddPayment(); }} className="w-full py-4 bg-accent text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:scale-[1.02] active:scale-95 transition-all shadow-lg shadow-accent/20">
            Ricarica DB Coin
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="bg-grey/5 rounded-2xl border border-grey/10 overflow-hidden">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-4 flex items-center justify-between text-left"
      >
        <span className="text-sm font-black text-black uppercase pr-4">{question}</span>
        <ChevronRight size={18} className={`text-grey transition-transform shrink-0 ${isOpen ? 'rotate-90' : ''}`} />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <p className="px-4 pb-4 text-xs text-grey font-bold leading-relaxed">{answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
