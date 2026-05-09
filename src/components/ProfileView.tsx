import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useThemeStore } from '../store/useThemeStore';
import { signOut, sendEmailVerification, sendPasswordResetEmail } from 'firebase/auth';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, updateDoc, serverTimestamp, collection, query, where, orderBy, limit, getDocs, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { UserPlan } from '../types';
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
  MapPin as MapIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { increment } from 'firebase/firestore';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { StripePaymentForm } from './StripePaymentForm';
import { Chat } from './Chat';
import { LeaderboardView } from './LeaderboardView';
import { InterventionHistory } from './InterventionHistory';

import { P2PWalletModal } from './P2PWalletModal';

const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripeKey && stripeKey.startsWith('pk_') 
  ? loadStripe(stripeKey) 
  : null;

export interface ProfileViewProps {
  isAvailable?: boolean;
  onToggleAvailability?: () => void;
}

export function ProfileView({ isAvailable, onToggleAvailability }: ProfileViewProps) {
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
  const [userSupportTicket, setUserSupportTicket] = useState<any | null>(null);
  const [isCreatingTicket, setIsCreatingTicket] = useState(false);
  
  // Payment state
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [paymentStep, setPaymentStep] = useState<'SELECT_AMOUNT' | 'SELECT_METHOD' | 'STRIPE' | 'PROCESSING' | 'SUCCESS'>('SELECT_AMOUNT');
  const [isProcessing, setIsProcessing] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  // Profile edit state
  const [editName, setEditName] = useState(profile?.name || '');
  const [editPhone, setEditPhone] = useState(profile?.phone || '');
  const [editEmail, setEditEmail] = useState(auth.currentUser?.email || '');
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
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);

  const sendVerification = async () => {
    if (!auth.currentUser) return;
    setIsSendingVerification(true);
    try {
      await sendEmailVerification(auth.currentUser);
      setVerificationSent(true);
      setTimeout(() => setVerificationSent(false), 5000);
    } catch (err) {
      console.error('Error sending verification:', err);
      alert('Errore nell\'invio della verifica: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSendingVerification(false);
    }
  };

  const plans = [
    { id: 'BASE', title: 'BASE', price: 29, features: ['Visibilità standard', 'Commissione 15%', 'Supporto base', 'Badge Certificato BRONZO'], color: 'bg-grey/10 text-grey' },
    { id: 'CLUB', title: 'CLUB', price: 59, features: ['Meccanico in primo piano', 'Commissione 10%', 'Creazione eventi social', 'Badge Certificato ARGENTO'], color: 'bg-slate-300 text-slate-700' },
    { id: 'PRO', title: 'PRO', price: 99, features: ['Visibilità prioritaria', 'Commissione 5%', 'Dashboard statistiche', 'Badge Certificato ORO'], color: 'bg-amber-400 text-amber-900' }
  ];

  const processPayment = async (planId: string) => {
    // Simulate payment processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    return true; // Simulate success
  };

  const upgradePlan = async (planId: string) => {
    if (!user) return;
    const plan = plans.find(p => p.id === planId);
    setSelectedPlanForUpgrade(plan);
    setPlanUpgradeStep('PAYMENT');
  };

  const initStripeUpgrade = async () => {
    if (!user || !selectedPlanForUpgrade) return;
    setPlanUpgradeStep('PROCESSING');
    setIsUpgrading(selectedPlanForUpgrade.id);
    try {
      const response = await fetch('/api/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: selectedPlanForUpgrade.price, metadata: { userId: user?.uid, planId: selectedPlanForUpgrade.id } }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setClientSecret(data.clientSecret);
      setPlanUpgradeStep('STRIPE');
    } catch (err) {
      console.error(err);
      alert("Errore durante l'inizializzazione del pagamento");
      setPlanUpgradeStep('PAYMENT');
    } finally {
      setIsUpgrading(null);
    }
  };

  const finalizeUpgrade = async () => {
    if (!user || !selectedPlanForUpgrade) return;
    setPlanUpgradeStep('PROCESSING');
    try {
      await updateDoc(doc(db, 'users', user.uid), { 
        plan: selectedPlanForUpgrade.id as UserPlan, 
        updatedAt: serverTimestamp() 
      });
      setPlanUpgradeStep('SUCCESS');
    } catch (err) {
      console.error(err);
      alert("Errore durante il salvataggio del piano");
      setPlanUpgradeStep('STRIPE');
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
      });
      return unsub;
    }
  }, [user]);

  const startSupportTicket = async () => {
    if (!user || userSupportTicket) {
      if (userSupportTicket) setShowSupport(true);
      return;
    }
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
      setShowSupport(true);
    } catch (err) {
      console.error('Error creating support ticket:', err);
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
    if (!user || !selectedAmount) {
      console.warn('Missing user or selectedAmount for top up');
      setPaymentStep('SELECT_AMOUNT');
      return;
    }
    
    setIsProcessing(true);
    setPaymentStep('PROCESSING');
    
    try {
      await updateDoc(doc(db, 'users', user?.uid), {
        balance: increment(selectedAmount),
        updatedAt: serverTimestamp()
      });
      
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
    
    // Explicit simulation check: if key is invalid or missing
    if (!stripePromise) {
      console.log('Simulating payment (Sandbox Mode)...');
      setPaymentStep('PROCESSING');
      // Use a shorter timeout for better UX in simulation
      setTimeout(() => {
        handleTopUpSuccess();
      }, 1500);
      return;
    }

    setIsProcessing(true);
    try {
      const response = await fetch('/api/create-payment-intent', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ 
          amount: selectedAmount,
          metadata: { userId: user?.uid }
        }),
      });
      
      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          errorData = { error: `Server error: ${response.status}` };
        }
        throw new Error(errorData.error || 'Failed to create payment intent');
      }
      
      const text = await response.text();
      if (!text) {
        throw new Error('Empty response from server');
      }
      
      const data = JSON.parse(text);
      if (data.clientSecret) {
        setClientSecret(data.clientSecret);
        setPaymentStep('STRIPE');
      } else {
        throw new Error(data.error || 'Failed to create payment intent');
      }
    } catch (err) {
      console.error('Stripe Flow Error:', err);
      // Fallback to simulation for demo purposes if backend fails
      console.log('Falling back to simulation mode due to error');
      setPaymentStep('PROCESSING');
      setTimeout(() => {
        handleTopUpSuccess();
      }, 1500);
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

      // 4. Reset User Balances and Profile Stats
      const userSnap = await getDocs(collection(db, 'users'));
      for (const docSnap of userSnap.docs) {
        await updateDoc(doc(db, 'users', docSnap.id), {
          balance: 0,
          completedJobs: 0,
          points: 0,
          totalEarnings: 0,
          hasWelcomeGift: true, // Re-enable welcome gift for new production users
          updatedAt: serverTimestamp()
        });
      }
      console.log('User balances reset');

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

      // 8. Reset Platform Global Stats
      await setDoc(doc(db, 'platformStats', 'global'), {
        totalFees: 0,
        totalTransactions: 0,
        completedJobs: 0,
        updatedAt: serverTimestamp()
      });
      console.log('Platform stats reset');

      alert('Reset per la produzione completato con successo!');
      setShowResetConfirm(false);
    } catch (err) {
      console.error('Error during production reset:', err);
      alert('Errore durante il reset: ' + (err instanceof Error ? err.message : String(err)));
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
        bikeModel: editBikeModel,
        locationName: editLocationName,
        updatedAt: serverTimestamp()
      });

      // 2. Update Email in Auth if changed (optional check)
      if (editEmail !== auth.currentUser?.email) {
          // This usually requires re-authentication, so we just inform the user
          // Or we can try it
          alert("L'email è stata aggiornata in Firestore, ma per cambiarla nelle credenziali di accesso contatta il supporto o usa un nuovo account.");
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
      alert("Email di ripristino password inviata a " + auth.currentUser.email);
    } catch (err) {
      console.error(err);
      alert("Errore nell'invio dell'email di ripristino.");
    } finally {
      setIsResettingPassword(false);
    }
  };

  const resetTopUp = () => {
    setShowTopUp(false);
    setTimeout(() => {
      setPaymentStep('SELECT_AMOUNT');
      setSelectedAmount(null);
      setClientSecret(null);
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
              <img src={profile?.photoURL || user?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.uid}`} alt={t('common.avatar')} className="w-full h-full object-cover transition-opacity group-hover:opacity-80"/>
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
        {user && !user.emailVerified && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="bg-danger/10 border border-danger/20 rounded-[2.5rem] p-6 flex flex-col items-center text-center gap-4">
            <div className="w-12 h-12 bg-danger/20 text-danger rounded-2xl flex items-center justify-center">
              <Mail size={24}/>
            </div>
            <div>
              <p className="text-sm font-black text-danger uppercase italic">Email non verificata</p>
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
              </div>
           </div>
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
                    <p className="text-2xl font-black text-warning">{profile?.points || 0}</p>
                 </div>
              </div>
              <button id="btn-show-leaderboard" onClick={() => setShowLeaderboard(true)}
                className="bg-warning text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-transform active:scale-95 flex items-center gap-1"
              >
                Classifiche <ChevronRight size={14}/>
              </button>
           </div>

           {/* Badges Grid */}
           <div>
              <p className="text-[10px] font-black text-grey  uppercase tracking-widest mb-3">I Tuoi Badge</p>
              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                 {(() => {
                   const BADGE_TYPES = [
                     { id: 'first_sos', icon: '🆘', name: 'Primo SOS' },
                     { id: 'rescuer_5', icon: '🦸', name: 'Eroe' },
                     { id: 'community_hero', icon: '🌟', name: 'Hero' },
                   ];
                   const userBadges = profile?.badges || [];
                   return BADGE_TYPES.map(b => {
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
              <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 300 }} className="relative overflow-y-auto w-full max-h-[85vh] sm:max-w-2xl sm:mx-auto bg-white text-black rounded-t-[3rem] sm:rounded-[3rem] p-8 z-[110] shadow-[0_-20px_50px_-10px_rgba(0,0,0,0.3)] pb-safe">
                <div className="w-12 h-1.5 bg-grey/10 rounded-full mx-auto mb-8"/>
                
                <div className="flex justify-between items-center mb-6">
                   <h3 className="text-2xl font-black text-primary  uppercase italic">{t('profile.topUpWallet')}</h3>
                   <button onClick={resetTopUp} className="p-2 text-grey">
                      <X size={24}/>
                   </button>
                </div>

                <AnimatePresence mode="wait">
                  {paymentStep === 'SELECT_AMOUNT' && (
                    <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                      <p className="text-xs text-grey  font-bold uppercase tracking-widest">{t('profile.chooseAmount')}</p>
                      <div className="grid grid-cols-2 gap-4">
                        {amounts.map(amount => (
                          <button key={amount} onClick={() => setSelectedAmount(amount)}
                            className={`p-6 rounded-[2rem] border-2 transition-all flex flex-col items-center gap-1 ${selectedAmount === amount ? 'bg-primary/5 border-primary' : 'bg-white text-black shadow-sm border border-grey/10 border-transparent'}`}
                          >
                            <span className="text-2xl font-black text-primary ">⚡{amount}</span>
                            <span className="text-[10px] font-bold text-grey/60">DB Coin (€{amount})</span>
                          </button>
                        ))}
                      </div>
                      <button disabled={!selectedAmount} onClick={() => setPaymentStep('SELECT_METHOD')}
                        className="w-full bg-primary text-white py-5 rounded-[2rem] font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
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
                         {!stripePromise && (
                            <div className="bg-warning/10 p-4 rounded-xl flex items-center gap-3 text-warning text-[10px] font-bold transition-all">
                               <AlertCircle size={16}/>
                               <span>{t('profile.simulationMode')}</span>
                            </div>
                         )}
                      </div>
                      <button onClick={() => setPaymentStep('SELECT_AMOUNT')}
                        className="w-full py-4 text-grey font-bold uppercase tracking-widest text-[10px] hover:underline"
                      >
                        {t('profile.back')}
                      </button>
                    </motion.div>
                  )}

                  {paymentStep === 'STRIPE' && clientSecret && (
                    <motion.div key="stripe-step" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                      <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
                        <StripePaymentForm amount={selectedAmount || 0} onSuccess={handleTopUpSuccess} onCancel={() => setPaymentStep('SELECT_METHOD')}
                        />
                      </Elements>
                    </motion.div>
                  )}

                  {paymentStep === 'PROCESSING' && (
                    <motion.div key="processing" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="py-12 flex flex-col items-center text-center">
                       <div className="w-20 h-20 bg-primary/10 text-primary rounded-[2.5rem] flex items-center justify-center mb-6 animate-spin-slow">
                          <Loader2 size={40} className="animate-spin"/>
                       </div>
                       <h4 className="text-xl font-black text-primary  uppercase italic mb-2">{t('profile.processing')}</h4>
                       <p className="text-xs text-grey">{t('profile.processingDesc')}</p>
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

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
           <div className="bg-white text-black p-5 rounded-[2rem] shadow-sm border border-grey/5  text-center transition-colors">
              <p className="text-[10px] font-bold text-grey  uppercase tracking-tighter mb-1 transition-colors">{t('profile.interventions')}</p>
              <p className="text-lg font-black text-primary  transition-colors">3</p>
           </div>
           <div className="bg-white text-black p-5 rounded-[2rem] shadow-sm border border-grey/5  text-center transition-colors">
              <p className="text-[10px] font-bold text-grey  uppercase tracking-tighter mb-1 transition-colors">{t('profile.points')}</p>
              <p className="text-lg font-black text-primary  transition-colors">1,240</p>
           </div>
        </div>

        {/* Menu Items */}
        <div className="space-y-2">
           <MenuButton icon={<CreditCard size={18}/>} label={t('profile.paymentMethods')} onClick={() => setShowTopUp(true)} />
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
              <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 300 }} className="relative overflow-y-auto w-full max-h-[85vh] sm:max-w-2xl sm:mx-auto bg-white text-black rounded-t-[3rem] sm:rounded-[3rem] p-8 z-[210] shadow-2xl pb-safe">
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
                        <p className="text-[8px] font-medium text-grey/60 uppercase tracking-tighter mt-1">PNG, JPG (MAX. 1MB)</p>
                      </div>
                      <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 1024 * 1024) {
                          alert('Immagine troppo grande (max 1MB).');
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
              <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} className="relative overflow-y-auto w-full max-h-[85vh] sm:max-w-2xl sm:mx-auto bg-white text-black rounded-t-[3rem] sm:rounded-[3rem] p-8 pt-4 z-[130] shadow-2xl pb-safe">
                <div className="w-12 h-1.5 bg-grey/20 rounded-full mx-auto mb-6"/>
                <div className="flex justify-between items-center mb-8">
                  <h3 className="text-2xl font-black text-primary  uppercase italic">{t('profile.history')}</h3>
                  <button onClick={() => setShowHistory(false)} className="p-2 text-grey"><X size={24}/></button>
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
              <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} className="relative overflow-y-auto w-full max-h-[85vh] sm:max-w-2xl sm:mx-auto bg-white text-black rounded-t-[3rem] sm:rounded-[3rem] p-8 pt-4 z-[130] shadow-2xl pb-safe">
                <div className="w-12 h-1.5 bg-grey/20 rounded-full mx-auto mb-6"/>
                <div className="flex justify-between items-center mb-8">
                  <h3 className="text-2xl font-black text-primary  uppercase italic">Le tue Recensioni</h3>
                  <button onClick={() => setShowReviews(false)} className="p-2 text-grey"><X size={24}/></button>
                </div>
                
                {isReviewsLoading ? (
                  <div className="flex justify-center py-20 text-primary">
                    <Loader2 className="w-8 h-8 animate-spin"/>
                  </div>
                ) : reviews.length > 0 ? (
                  <div className="space-y-4 pb-12">
                    {reviews.map((review: any) => (
                      <div key={review.id} className="bg-white text-black shadow-sm border border-grey/10 p-6 rounded-3xl border border-grey/5">
                        <div className="flex justify-between items-center mb-3">
                           <div className="flex gap-0.5">
                              {[1,2,3,4,5].map(s => (
                                <Star key={s} size={14} className={s <= (review.rating || 0) ? 'text-accent fill-accent' : 'text-grey/20'} />
                              ))}
                           </div>
                           <p className="text-[8px] font-black text-grey uppercase tracking-widest leading-none">
                             {review.createdAt?.toDate?.()?.toLocaleDateString() || 'N/D'}
                           </p>
                        </div>
                        {review.comment && (
                          <div className="flex gap-3">
                             <MessageSquare size={16} className="text-primary/20 shrink-0"/>
                             <p className="text-xs text-grey italic leading-relaxed">"{review.comment}"</p>
                          </div>
                        )}
                        <div className="mt-4 flex items-center gap-2">
                           <div className="w-5 h-5 rounded-full overflow-hidden bg-white">
                              <img src="{`https://api.dicebear.com/7.x/avataaars/svg?seed=${review.cyclistId}`}" alt="User"/>
                           </div>
                           <span className="text-[10px] font-bold text-black/40  uppercase">Ciclista</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
                    <Star size={48} className="mb-4"/>
                    <p className="text-xs font-bold uppercase tracking-widest">Ancora nessuna recensione</p>
                  </div>
                )}
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Safety Modal */}
        <AnimatePresence>
          {showSafety && (
            <div className="fixed inset-0 z-[120] flex flex-col justify-end sm:justify-center overflow-hidden">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowSafety(false)} className="absolute inset-0 bg-dark/60 backdrop-blur-md z-[120]" />
              <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} className="relative overflow-y-auto w-full max-h-[85vh] sm:max-w-2xl sm:mx-auto bg-white text-black rounded-t-[3rem] sm:rounded-[3rem] p-8 pt-4 z-[130] shadow-2xl pb-safe">
                <div className="w-12 h-1.5 bg-grey/20 rounded-full mx-auto mb-6"/>
                <div className="flex justify-between items-center mb-8">
                  <h3 className="text-2xl font-black text-primary  uppercase italic">{t('profile.safety')}</h3>
                  <button onClick={() => setShowSafety(false)} className="p-2 text-grey"><X size={24}/></button>
                </div>
                
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-20 h-20 bg-primary/10 rounded-[2.5rem] flex items-center justify-center text-primary mb-6">
                    <Shield size={40}/>
                  </div>
                  <h4 className="text-xl font-black text-black  uppercase italic mb-2">Coming Soon</h4>
                  <p className="text-xs text-grey font-bold uppercase tracking-widest max-w-[200px] leading-relaxed">
                    Stiamo lavorando per portare l'assicurazione direttamente sulla tua bici.
                  </p>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Support Ticket Modal... (existing) */}

        {/* Plans Modal */}
        <AnimatePresence>
          {showPlans && (
            <div className="fixed inset-0 z-[120] flex flex-col justify-end sm:justify-center overflow-hidden">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowPlans(false)} className="absolute inset-0 bg-dark/60 backdrop-blur-md z-[120]" />
              <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} className="relative overflow-y-auto w-full max-h-[90vh] sm:max-w-2xl sm:mx-auto bg-white text-black rounded-t-[3rem] sm:rounded-[3rem] p-8 pt-4 z-[130] shadow-2xl pb-safe">
                <div className="w-12 h-1.5 bg-grey/20 rounded-full mx-auto mb-6"/>
                <div className="flex justify-between items-center mb-8">
                  <h3 className="text-2xl font-black text-primary  uppercase italic">Piani Doctorbike</h3>
                  <button onClick={() => setShowPlans(false)} className="p-2 text-grey"><X size={24}/></button>
                </div>

                <div className="space-y-6 pb-12">
                {planUpgradeStep === 'SELECT' && (
                  <div className="space-y-6 pb-12">
                     <div className="p-6 bg-primary/5 rounded-3xl border border-primary/10">
                        <p className="text-xs font-bold text-black  leading-relaxed italic">
                          "Evolvi la tua officina digitale. Più visibilità, meno commissioni, più successo."
                        </p>
                     </div>
                     
                     <div className="grid grid-cols-1 gap-4">
                        {plans.map((p) => (
                          <div key={p.id} className={`p-6 rounded-[2.5rem] border-2 transition-all relative overflow-hidden ${profile?.plan === p.id ? 'border-primary ring-4 ring-primary/10' : 'border-grey/10'}`}>
                             {profile?.plan === p.id && (
                               <div className="absolute top-0 right-0 bg-primary text-white px-6 py-2 rounded-bl-3xl font-black text-[10px] uppercase">Piano Attuale</div>
                             )}
                             <div className="flex justify-between items-start mb-4">
                                <div>
                                   <h4 className="text-2xl font-black text-primary uppercase italic">{p.title}</h4>
                                   <p className="text-xl font-black text-accent">{p.price}</p>
                                </div>
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${p.color}`}>
                                   <Sparkles size={24}/>
                                </div>
                             </div>
                             <ul className="space-y-3 mb-8">
                                {p.features.map(f => (
                                  <li key={f} className="flex items-center gap-3 text-xs font-bold text-grey">
                                     <div className="w-2 h-2 bg-accent rounded-full"/>
                                     {f}
                                  </li>
                                ))}
                             </ul>
                             {profile?.plan !== p.id && (
                               <button onClick={() => upgradePlan(p.id)}
                                 disabled={isUpgrading !== null}
                                 className="w-full bg-primary text-white py-4 rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-lg shadow-primary/20 active:scale-95 transition-all disabled:opacity-50"
                               >
                                 Attiva {p.title}
                               </button>
                             )}
                          </div>
                        ))}
                     </div>
                  </div>
                )}

                {planUpgradeStep === 'PAYMENT' && selectedPlanForUpgrade && (
                  <div className="py-8 space-y-6">
                    <div className="bg-white text-black shadow-sm border border-grey/10 p-6 rounded-3xl border border-grey/10 text-center">
                      <p className="text-xs font-bold text-grey uppercase mb-1">Riepilogo Ordine</p>
                      <h4 className="text-xl font-black text-primary">Piano {selectedPlanForUpgrade.title}</h4>
                      <p className="text-accent font-black">{selectedPlanForUpgrade.price}</p>
                    </div>

                    <div className="space-y-4">
                       <h5 className="text-[10px] font-black uppercase tracking-widest text-grey">Metodo di Pagamento</h5>
                       <div className="bg-white  p-6 rounded-3xl border-2 border-primary shadow-sm space-y-4">
                          <div className="flex items-center justify-between pb-4 border-b border-grey/5">
                             <div className="flex items-center gap-3">
                                <CardIcon size={20} className="text-primary"/>
                                <span className="text-sm font-bold">Carta di Credito (Simulata)</span>
                             </div>
                             <CheckCircle2 size={16} className="text-accent"/>
                          </div>
                          
                          <div className="space-y-3">
                             <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-2 bg-white text-black shadow-sm border border-grey/10 p-4 rounded-xl text-xs font-bold text-grey/40">
                                   4242 4242 4242 4242
                                </div>
                                <div className="bg-white text-black shadow-sm border border-grey/10 p-4 rounded-xl text-xs font-bold text-grey/40">
                                   MM/AA
                                </div>
                                <div className="bg-white text-black shadow-sm border border-grey/10 p-4 rounded-xl text-xs font-bold text-grey/40">
                                   CVC
                                </div>
                             </div>
                          </div>
                       </div>
                    </div>

                    <div className="flex gap-4">
                       <button onClick={() => setPlanUpgradeStep('SELECT')}
                         className="flex-1 py-4 text-grey font-black uppercase text-[10px]"
                       >
                         Indietro
                       </button>
                       <button onClick={initStripeUpgrade} className="flex-[2] bg-primary text-white py-4 rounded-[2rem] font-black uppercase text-[10px] shadow-xl shadow-primary/20 active:scale-95 transition-all">
                         Paga e Attiva
                       </button>
                    </div>
                  </div>
                )}

                {planUpgradeStep === 'STRIPE' && clientSecret && (
                  <div className="py-8 space-y-6">
                    <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
                        <StripePaymentForm amount={selectedPlanForUpgrade.price} onSuccess={finalizeUpgrade} onCancel={() => setPlanUpgradeStep('PAYMENT')}
                        />
                    </Elements>
                  </div>
                )}

                {planUpgradeStep === 'PROCESSING' && (
                  <div className="py-20 flex flex-col items-center text-center">
                    <Loader2 className="w-12 h-12 text-primary animate-spin mb-4"/>
                    <h4 className="text-xl font-black text-primary uppercase italic">Elaborazione...</h4>
                    <p className="text-xs text-grey italic">Stiamo configurando i tuoi super-poteri da meccanico.</p>
                  </div>
                )}

                {planUpgradeStep === 'SUCCESS' && (
                  <div className="py-12 flex flex-col items-center text-center">
                    <div className="w-20 h-20 bg-accent text-white rounded-[2.5rem] flex items-center justify-center mb-6 shadow-xl shadow-accent/20">
                       <CheckCircle2 size={40}/>
                    </div>
                    <h4 className="text-2xl font-black text-accent uppercase italic mb-2">Benvenuto nel Club!</h4>
                    <p className="text-sm text-grey font-bold italic mb-8 px-8">Il tuo piano è stato attivato con successo. Tutte le funzionalità sono ora disponibili.</p>
                    <button onClick={() => {
                        setShowPlans(false);
                        setTimeout(() => setPlanUpgradeStep('SELECT'), 500);
                      }}
                      className="bg-primary text-white px-12 py-4 rounded-[2rem] font-black uppercase tracking-widest text-xs shadow-lg shadow-primary/20"
                    >
                      Inizia ora
                    </button>
                  </div>
                )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {showSupport && userSupportTicket && (
            <div className="fixed inset-0 z-[120] flex flex-col justify-end sm:justify-center overflow-hidden">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowSupport(false)} className="absolute inset-0 bg-dark/60 backdrop-blur-md z-[120]" />
              <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} className="relative flex flex-col w-full h-[90vh] sm:max-w-2xl sm:mx-auto bg-white text-black rounded-t-[3rem] sm:rounded-t-[3rem] z-[130] shadow-2xl pb-safe overflow-hidden">
                <div className="w-12 h-1.5 bg-grey/20 rounded-full mx-auto my-4 shrink-0"/>
                <div className="flex justify-between items-center px-8 mb-4 shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-accent/10 text-accent rounded-xl flex items-center justify-center">
                      <MessageSquare size={20}/>
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-primary  uppercase italic">Assistenza Clienti</h3>
                      <p className="text-[10px] font-bold text-grey uppercase tracking-widest">Chat Diretta con Admin</p>
                    </div>
                  </div>
                  <button onClick={() => setShowSupport(false)} className="p-2 text-grey"><X size={24}/></button>
                </div>
                
                <div className="flex-1 overflow-hidden flex flex-col">
                  <Chat chatId={userSupportTicket.id} otherPartyName="Doctorbike Admin" isAdminSupport/>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {showSettings && (
            <div className="fixed inset-0 z-[120] flex flex-col justify-end sm:justify-center overflow-hidden">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowSettings(false)} className="absolute inset-0 bg-dark/60 backdrop-blur-md z-[120]" />
              <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} className="relative overflow-y-auto w-full max-h-[85vh] sm:max-w-2xl sm:mx-auto bg-white text-black rounded-t-[3rem] sm:rounded-[3rem] p-8 pt-4 z-[130] shadow-2xl pb-safe">
                <div className="w-12 h-1.5 bg-grey/20 rounded-full mx-auto mb-6"/>
                <div className="flex justify-between items-center mb-8">
                  <h3 className="text-2xl font-black text-primary  uppercase italic">{t('profile.settings')}</h3>
                  <button onClick={() => setShowSettings(false)} className="p-2 text-grey"><X size={24}/></button>
                </div>
                
                <div className="space-y-4">
                  <div className="bg-white text-black shadow-sm border border-grey/10 p-6 rounded-3xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                       <Bell size={18} className="text-accent"/>
                       <span className="font-bold text-black  uppercase text-xs italic">{t('profile.notificationsSOS')}</span>
                    </div>
                    <button onClick={toggleNotifications} disabled={isRequestingNotification} className={`relative w-12 h-6 rounded-full transition-colors ${profile?.notificationsEnabled ? 'bg-accent' : 'bg-grey/20'}`}>
                      <motion.div animate={{ x: profile?.notificationsEnabled ? 26 : 4 }} className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-md"/>
                    </button>
                  </div>

                  <div className="bg-white text-black shadow-sm border border-grey/10 p-6 rounded-3xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                       <div className="w-5 h-5 flex items-center justify-center font-black text-[10px] text-primary  bor der border-current rounded-md italic">文</div>
                       <span className="font-bold text-black  uppercase text-xs italic">{t('profile.language')}</span>
                    </div>
                    <button onClick={() => i18n.changeLanguage(i18n.language === 'it' ? 'en' : 'it')}
                       className="bg-white text-black px-4 py-2 rounded-xl text-black  font-black text-[10px] uppercase tracking-widest shadow-sm"
                    >
                       {i18n.language === 'it' ? 'English' : 'Italiano'}
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {showEditProfile && (
            <div className="fixed inset-0 z-[120] flex flex-col justify-end sm:justify-center overflow-hidden">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowEditProfile(false)} className="absolute inset-0 bg-dark/60 backdrop-blur-md z-[120]" />
              <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} className="relative overflow-y-auto w-full max-h-[85vh] sm:max-w-2xl sm:mx-auto bg-white text-black rounded-t-[3rem] sm:rounded-[3rem] p-8 pt-4 z-[130] shadow-2xl pb-safe">
                <div className="w-12 h-1.5 bg-grey/20 rounded-full mx-auto mb-6"/>
                <div className="flex justify-between items-center mb-8">
                  <h3 className="text-2xl font-black text-primary  uppercase italic">{t('profile.editProfile')}</h3>
                  <button onClick={() => setShowEditProfile(false)} className="p-2 text-grey"><X size={24}/></button>
                </div>
                
                <div className="space-y-4">
                   <div className="space-y-1">
                      <label className="text-[10px] font-black text-grey uppercase tracking-widest ml-2">{t('profile.fullName')}</label>
                      <div className="bg-white text-black shadow-sm border border-grey/10 rounded-2xl p-4 flex items-center gap-3">
                         <UserIcon size={18} className="text-grey"/>
                         <input value={editName} onChange={(e) => setEditName(e.target.value)} className="bg-transparent border-none outline-none flex-1 font-bold text-sm text-black " placeholder="Name" />
                      </div>
                   </div>
                   <div className="space-y-1">
                      <label className="text-[10px] font-black text-grey uppercase tracking-widest ml-2">Email</label>
                      <div className="bg-white text-black shadow-sm border border-grey/10 rounded-2xl p-4 flex items-center gap-3">
                         <Mail size={18} className="text-grey"/>
                         <input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="bg-transparent border-none outline-none flex-1 font-bold text-sm text-black " placeholder="email" />
                      </div>
                   </div>
                   <div className="space-y-1">
                      <label className="text-[10px] font-black text-grey uppercase tracking-widest ml-2">{t('profile.phone')}</label>
                      <div className="bg-white text-black shadow-sm border border-grey/10 rounded-2xl p-4 flex items-center gap-3">
                         <Phone size={18} className="text-grey"/>
                         <input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className="bg-transparent border-none outline-none flex-1 font-bold text-sm text-black " placeholder="+39 000 0000000" />
                      </div>
                   </div>
                   <div className="space-y-1">
                      <label className="text-[10px] font-black text-grey uppercase tracking-widest ml-2">{t('profile.bikeModel')}</label>
                      <div className="bg-white text-black shadow-sm border border-grey/10 rounded-2xl p-4 flex items-center gap-3">
                         <BikeIcon size={18} className="text-grey"/>
                         <input value={editBikeModel} onChange={(e) => setEditBikeModel(e.target.value)} className="bg-transparent border-none outline-none flex-1 font-bold text-sm text-black " placeholder="E.g. Scott Addict" />
                      </div>
                   </div>

                   <div className="space-y-1">
                      <label className="text-[10px] font-black text-grey uppercase tracking-widest ml-2">Posizione / Zona</label>
                      <div className="bg-white text-black shadow-sm border border-grey/10 rounded-2xl p-4 flex items-center gap-3">
                         <MapIcon size={18} className="text-grey"/>
                         <input value={editLocationName} onChange={(e) => setEditLocationName(e.target.value)} className="bg-transparent border-none outline-none flex-1 font-bold text-sm text-black " placeholder="E.g. Milano, centro" />
                         <button 
                           onClick={async () => {
                             if (!navigator.geolocation) return;
                             navigator.geolocation.getCurrentPosition(async (pos) => {
                               const { latitude, longitude } = pos.coords;
                               try {
                                 const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`);
                                 const data = await res.json();
                                 if (data.display_name) {
                                   const parts = data.display_name.split(',');
                                   const city = parts[0] || parts[1] || 'Sconosciuto';
                                   setEditLocationName(city.trim());
                                 }
                               } catch (err) {
                                 console.error('Reverse geocoding failed', err);
                               }
                             });
                           }}
                           className="p-2 bg-primary/10 text-primary rounded-xl hover:bg-primary/20 transition-colors"
                           title="Rileva posizione"
                         >
                            <Zap size={14}/>
                         </button>
                      </div>
                   </div>

                   <div className="pt-4 border-t border-grey/10">
                      <label className="text-[10px] font-black text-grey uppercase tracking-widest ml-2">Sicurezza</label>
                      <button onClick={handlePasswordReset} 
                        disabled={isResettingPassword}
                        className="w-full mt-2 bg-grey/5 border border-grey/10 p-4 rounded-2xl flex items-center justify-between text-black active:scale-95 transition-all text-left"
                      >
                        <div className="flex items-center gap-3">
                           <Shield size={18} className="text-grey"/>
                           <span className="text-sm font-bold">Cambia Password</span>
                        </div>
                        {isResettingPassword ? <Loader2 size={16} className="animate-spin" /> : <ChevronRight size={18} className="text-grey"/>}
                      </button>
                   </div>
                </div>

                <button onClick={saveProfile} disabled={isSavingProfile} className="w-full mt-8 bg-accent text-white py-5 rounded-[2rem] font-black uppercase tracking-widest text-xs shadow-xl shadow-accent/20 flex items-center justify-center gap-2">
                   {isSavingProfile ? <Loader2 className="animate-spin" size={20}/> : <Save size={18}/>}
                   {isSavingProfile ? t('profile.saving') : t('profile.saveChanges')}
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <button onClick={() => signOut(auth)}
           className="w-full flex items-center justify-center gap-2 p-5 bg-danger/5 text-danger rounded-[2rem] font-black uppercase tracking-widest text-[10px] hover:bg-danger/10 transition-colors"
        >
           <LogOut size={16}/> {t('profile.signOut')}
        </button>

        {/* Production Reset Confirmation */}
        <AnimatePresence>
          {showResetConfirm && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => !isResetting && setShowResetConfirm(false)}
                className="absolute inset-0 bg-dark/80 backdrop-blur-md"
              />
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-sm bg-white text-black rounded-[40px] p-8 text-center shadow-2xl overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-2 bg-danger"/>
                <div className="w-20 h-20 bg-danger/10 text-danger rounded-3xl flex items-center justify-center mx-auto mb-6">
                  <AlertCircle size={40}/>
                </div>
                
                <h3 className="text-2xl font-black text-black  uppercase italic mb-4">Reset Produzione?</h3>
                <p className="text-grey text-xs font-bold uppercase tracking-widest leading-relaxed mb-8">
                  Questa azione è <span className="text-danger italic">irreversibile</span>. <br/>
                  - Elimina tutti i SOS <br/>
                  - Azzera i Wallet di tutti gli utenti <br/>
                  - Pulisce chat e recensioni
                </p>

                <div className="space-y-3">
                  <button disabled={isResetting} onClick={performProductionReset} className="w-full bg-danger text-white py-5 rounded-3xl font-black uppercase tracking-widest text-xs shadow-xl shadow-danger/20 flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-50">
                    {isResetting ? (
                      <>RESETTING... <Loader2 size={18} className="animate-spin"/></>
                    ) : (
                      <>CONFERMA RESET TOTALE</>
                    )}
                  </button>
                  <button disabled={isResetting} onClick={() => setShowResetConfirm(false)}
                    className="w-full py-4 text-grey font-black uppercase tracking-widest text-[10px] hover:underline"
                  >
                    Annulla
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showLeaderboard && (
            <LeaderboardView onClose={() => setShowLeaderboard(false)} />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showInterventionHistory && (
             <InterventionHistory onClose={() => setShowInterventionHistory(false)} />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showPrivacy && (
            <div className="fixed inset-0 z-[120] flex flex-col justify-end sm:justify-center overflow-hidden">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowPrivacy(false)} className="absolute inset-0 bg-dark/60 backdrop-blur-md z-[120]" />
              <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} className="relative overflow-y-auto w-full max-h-[85vh] sm:max-w-2xl sm:mx-auto bg-white text-black rounded-t-[3rem] sm:rounded-[3rem] p-8 pt-4 z-[130] shadow-2xl pb-safe">
                <div className="w-12 h-1.5 bg-grey/20 rounded-full mx-auto mb-6"/>
                <div className="flex justify-between items-center mb-8">
                  <h3 className="text-2xl font-black text-primary uppercase italic">{t('profile.privacyAndLegal')}</h3>
                  <button onClick={() => setShowPrivacy(false)} className="p-2 text-grey"><X size={24}/></button>
                </div>
                
                <div className="space-y-8 pb-12">
                   {/* Notifications Section */}
                   <section>
                      <h4 className="text-[10px] font-black text-grey uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                        <Bell size={14} className="text-primary"/> {t('profile.notificationPrefs')}
                      </h4>
                      <div className="space-y-3">
                         <PreferenceToggle 
                            label={t('profile.prefSOS')} 
                            checked={profile?.notificationPreferences?.sosAlerts ?? true} 
                            onChange={async (val) => {
                               if (!user) return;
                               await updateDoc(doc(db, 'users', user.uid), {
                                  'notificationPreferences.sosAlerts': val,
                                  updatedAt: serverTimestamp()
                               });
                            }}
                         />
                         <PreferenceToggle 
                            label={t('profile.prefJobs')} 
                            checked={profile?.notificationPreferences?.newJobs ?? true} 
                            onChange={async (val) => {
                               if (!user) return;
                               await updateDoc(doc(db, 'users', user.uid), {
                                  'notificationPreferences.newJobs': val,
                                  updatedAt: serverTimestamp()
                               });
                            }}
                         />
                         <PreferenceToggle 
                            label={t('profile.prefCommunity')} 
                            checked={profile?.notificationPreferences?.communityUpdates ?? true} 
                            onChange={async (val) => {
                               if (!user) return;
                               await updateDoc(doc(db, 'users', user.uid), {
                                  'notificationPreferences.communityUpdates': val,
                                  updatedAt: serverTimestamp()
                               });
                            }}
                         />
                         <PreferenceToggle 
                            label={t('profile.prefMarketing')} 
                            checked={profile?.notificationPreferences?.marketing ?? false} 
                            onChange={async (val) => {
                               if (!user) return;
                               await updateDoc(doc(db, 'users', user.uid), {
                                  'notificationPreferences.marketing': val,
                                  updatedAt: serverTimestamp()
                               });
                            }}
                         />
                      </div>
                   </section>

                   {/* Legal Section */}
                   <section>
                      <h4 className="text-[10px] font-black text-grey uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                        <Shield size={14} className="text-accent"/> {t('profile.privacyAndLegal')}
                      </h4>
                      <div className="bg-grey/5 p-6 rounded-[2rem] border border-grey/10 space-y-6">
                         <LegalItem 
                            label={t('profile.privacyPolicy')} 
                            checked={profile?.consents?.privacyPolicy ?? true} 
                            isRequired
                            onChange={() => {}} // Mandatory check
                         />
                         <LegalItem 
                            label={t('profile.termsOfService')} 
                            checked={profile?.consents?.termsOfService ?? true} 
                            isRequired
                            onChange={() => {}}
                         />
                         <LegalItem 
                            label={t('profile.dataProcessing')} 
                            checked={profile?.consents?.dataProcessing ?? true} 
                            isRequired
                            onChange={() => {}}
                         />
                         <LegalItem 
                            label={t('profile.marketingConsent')} 
                            checked={profile?.consents?.marketing ?? false} 
                            onChange={async (val) => {
                               if (!user) return;
                               await updateDoc(doc(db, 'users', user.uid), {
                                  'consents.marketing': val,
                                  updatedAt: serverTimestamp()
                               });
                            }}
                         />
                         <p className="text-[9px] text-grey font-bold italic mt-4">{t('profile.legalDesc')}</p>
                      </div>
                   </section>

                   <div className="pt-4 flex flex-col gap-3">
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
          {showP2PWallet && (
             <P2PWalletModal onClose={() => setShowP2PWallet(false)} />
          )}
        </AnimatePresence>
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
