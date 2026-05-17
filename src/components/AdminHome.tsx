import toast from 'react-hot-toast';
import React, { useState, useEffect } from 'react';
import { db, auth, functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { collection, query, where, onSnapshot, doc, runTransaction, increment, serverTimestamp, limit, orderBy, setDoc, updateDoc, getDoc, getDocs, deleteDoc } from 'firebase/firestore';
import { 
  ShieldAlert, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Users, 
  Wrench, 
  LogOut, 
  MessageSquare, 
  Map as MapIcon, 
  TrendingUp, 
  DollarSign, 
  BarChart3,
  Search,
  Bike,
  Sparkles,
  Bot,
  Settings,
  ChevronRight,
  Save,
  Loader2,
  X,
  User as UserIcon,
  Eye,
  ExternalLink,
  ArrowRight,
  CreditCard,
  Receipt,
  RotateCcw,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatDistanceToNow } from 'date-fns';
import { it } from 'date-fns/locale';
import { signOut } from 'firebase/auth';
import { Map } from './Map';
import { RoadReportDetailModal } from './RoadReportDetailModal';
import { Chat } from './Chat';
import { ProfileView } from './ProfileView';
import { ManualInvoiceModal } from './ManualInvoiceModal';
import ReactMarkdown from 'react-markdown';

type AdminTab = 'STATS' | 'USERS' | 'MAP' | 'SUPPORT' | 'DISPUTES' | 'AI_ASSISTANCE' | 'REPORTS' | 'PROFILE' | 'FINANCE';

export function AdminHome() {
  const [disputedJobs, setDisputedJobs] = useState<any[]>([]);
  const [roadReports, setRoadReports] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [platformStats, setPlatformStats] = useState<any>(null);
  const [activeSupportChats, setActiveSupportChats] = useState<any[]>([]);
  const [supportTickets, setSupportTickets] = useState<any[]>([]);
  const [aiConversations, setAiConversations] = useState<any[]>([]);
  const [aiGuidelines, setAiGuidelines] = useState('');
  const [isSavingAI, setIsSavingAI] = useState(false);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [financialTransactions, setFinancialTransactions] = useState<any[]>([]);
  const [isRefunding, setIsRefunding] = useState<string | null>(null);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [expandedSupportId, setExpandedSupportId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<AdminTab>('STATS');
  const [supportMode, setSupportMode] = useState<'SOS' | 'DIRECT'>('SOS');
  const [selectedChat, setSelectedChat] = useState<any | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [selectedAIConv, setSelectedAIConv] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [kycFilter, setKycFilter] = useState<'ALL' | 'PENDING'>('ALL');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<any | null>(null);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [selectedUserForInvoice, setSelectedUserForInvoice] = useState<any | null>(null);
  const [sosChatTicket, setSosChatTicket] = useState<any | null>(null);
  const [reportFilter, setReportFilter] = useState<'all' | 'open' | 'resolved' | 'rejected'>('all');
  const [reportSeverityFilter, setReportSeverityFilter] = useState<'all' | 'low' | 'medium' | 'high'>('all');
  const [reportAdminNote, setReportAdminNote] = useState<Record<string, string>>({});
  const [showReportNoteModal, setShowReportNoteModal] = useState<string | null>(null);
  const [aiSearchQuery, setAiSearchQuery] = useState('');

  const openSOSChat = async (sos: any) => {
    setSelectedChat(sos);
    try {
      const existingQ = query(
        collection(db, 'supportTickets'),
        where('sosId', '==', sos.id),
        where('status', '==', 'OPEN'),
        limit(1)
      );
      const existingSnap = await getDocs(existingQ);
      if (!existingSnap.empty) {
        const ticket = { id: existingSnap.docs[0].id, ...existingSnap.docs[0].data() };
        setSosChatTicket(ticket);
        return;
      }

      const ticketRef = doc(collection(db, 'supportTickets'));
      const newTicket = {
        id: ticketRef.id,
        userId: sos.cyclistId,
        userName: sos.cyclistName || 'Ciclista',
        userRole: 'CYCLIST',
        sosId: sos.id,
        status: 'OPEN',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastMessage: `SOS #${sos.id.slice(-6)} - ${sos.faultType || 'Guasto'}`,
        type: 'SOS_SUPPORT'
      };
      await setDoc(ticketRef, newTicket);
      setSosChatTicket({ ...newTicket, id: ticketRef.id });
    } catch (err) {
      console.error('Error creating SOS support ticket:', err);
    }
  };

  useEffect(() => {
    if (!auth.currentUser) return;

    // 1. Listen for platform stats
    const unsubStats = onSnapshot(doc(db, 'platformStats', 'global'), (snap) => {
      if (snap.exists()) setPlatformStats(snap.data());
    });

    // 2. Listen for AI guidelines
    const unsubAiConfig = onSnapshot(doc(db, 'aiConfig', 'guidelines'), (snap) => {
      if (snap.exists()) setAiGuidelines(snap.data().guidelines);
    });

    // 3. Listen for users
    const unsubUsers = onSnapshot(query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(100)), (snap) => {
      setAllUsers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });

    // 4. Listen for support tickets
    const unsubTickets = onSnapshot(query(collection(db, 'supportTickets'), orderBy('updatedAt', 'desc'), limit(50)), (snap) => {
      setSupportTickets(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // 5. Listen for AI conversations
    const unsubAiConvs = onSnapshot(query(collection(db, 'aiConversations'), orderBy('updatedAt', 'desc'), limit(50)), (snap) => {
      setAiConversations(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // 6. Listen for disputed SOS requests
    const unsubDisputes = onSnapshot(query(collection(db, 'sosRequests'), where('status', '==', 'DISPUTED')), (snap) => {
      setDisputedJobs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // 7. Listen for active SOS requests for support monitor
    const unsubSupport = onSnapshot(query(collection(db, 'sosRequests'), where('status', 'in', ['ACCEPTED', 'IN_PROGRESS', 'DISPUTED']), limit(20)), (snap) => {
      setActiveSupportChats(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // 8. Listen for road reports
    const unsubReports = onSnapshot(query(collection(db, 'roadReports'), orderBy('createdAt', 'desc'), limit(50)), (snap) => {
      setRoadReports(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // 9. Listen for subscriptions
    const unsubSubs = onSnapshot(query(collection(db, 'subscriptions'), orderBy('createdAt', 'desc'), limit(100)), (snap) => {
      setSubscriptions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // 10. Listen for financial transactions (SUBSCRIPTION, TOPUP, SOS_PAYMENT)
    const unsubFinTx = onSnapshot(query(collection(db, 'transactions'), orderBy('createdAt', 'desc'), limit(100)), (snap) => {
      setFinancialTransactions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubStats();
      unsubAiConfig();
      unsubUsers();
      unsubTickets();
      unsubAiConvs();
      unsubDisputes();
      unsubSupport();
      unsubReports();
      unsubSubs();
      unsubFinTx();
    };
  }, []);

  const saveAIGuidelines = async () => {
    setIsSavingAI(true);
    try {
      await setDoc(doc(db, 'aiConfig', 'guidelines'), {
        guidelines: aiGuidelines,
        updatedAt: serverTimestamp()
      });
      toast.success('Linee guida AI salvate con successo!');
    } catch (err) {
      console.error(err);
      toast.error('Errore durante il salvataggio');
    } finally {
      setIsSavingAI(false);
    }
  };

  const resolveDispute = async (jobId: string, favorOf: 'CYCLIST' | 'MECHANIC') => {
    if (!window.confirm(`Sei sicuro di voler risolvere in favore del ${favorOf === 'CYCLIST' ? 'ciclista' : 'meccanico'}?`)) return;

    try {
      await runTransaction(db, async (transaction) => {
        const sosRef = doc(db, 'sosRequests', jobId);
        const sosSnap = await transaction.get(sosRef);
        
        if (!sosSnap.exists()) return;
        const jobData = sosSnap.data();
        const price = Number(jobData.estimatedPrice) || 0;
        
        if (favorOf === 'MECHANIC') {
          // Payout to mechanic (net amount)
          if (jobData.mechanicId) {
            const mechRef = doc(db, 'users', jobData.mechanicId);
            const mechStatsRef = doc(db, 'mechanics', jobData.mechanicId);
            const platformStatsRef = doc(db, 'platformStats', 'global');
            
            const [mechStatsSnap, platformSnap, mechanicUserSnap] = await Promise.all([
              transaction.get(mechStatsRef),
              transaction.get(platformStatsRef),
              transaction.get(mechRef)
            ]);
            
            const plan = mechanicUserSnap.exists() ? (mechanicUserSnap.data()?.plan || 'BASE') : 'BASE';
            const feeMultipliers: Record<string, number> = { PRO: 0.05, CLUB: 0.10, BASE: 0.15 };
            const feePercent = feeMultipliers[plan as string] || 0.15;
            const fee = price * feePercent;
            const netAmount = price - fee;
            
            if (mechanicUserSnap.exists()) {
              const txRef = doc(collection(db, 'transactions'));
              const userUpdates: any = { 
                  balance: increment(netAmount),
                  lastTxId: txRef.id
              };
              if (mechanicUserSnap.data()?.role === 'PEER_MECHANIC') {
                  userUpdates.peerMechanicEarnings = increment(netAmount);
                  userUpdates.peerMechanicJobsCompleted = increment(1);
              }
              transaction.update(mechRef, userUpdates);
              
              transaction.set(txRef, {
                  fromId: 'ESCROW',
                  toId: jobData.mechanicId,
                  amount: netAmount,
                  currency: 'DoctorBike Coin',
                  createdAt: serverTimestamp(),
                  type: 'ADMIN_DISPUTE_RELEASE',
                  fee: fee
              });
            }
            
            if (mechStatsSnap.exists()) {
              transaction.update(mechStatsRef, { totalEarnings: increment(netAmount), completedJobs: increment(1) });
            } else {
              transaction.set(mechStatsRef, {
                userId: jobData.mechanicId,
                totalEarnings: netAmount, 
                completedJobs: 1,
                businessName: mechanicUserSnap.exists() ? (mechanicUserSnap.data()?.name || 'Meccanico') : 'Meccanico',
                isAvailable: true
              });
            }

            if (platformSnap.exists()) {
              transaction.update(platformStatsRef, {
                totalFees: increment(fee),
                totalTransactions: increment(price),
                completedJobs: increment(1),
                updatedAt: serverTimestamp()
              });
            } else {
              transaction.set(platformStatsRef, {
                totalFees: fee,
                totalTransactions: price,
                completedJobs: 1,
                updatedAt: serverTimestamp()
              });
            }
            
            transaction.update(sosRef, {
              status: 'COMPLETED',
              paymentStatus: 'RELEASED_ADMIN',
              resolvedAt: serverTimestamp(),
              resolvedBy: 'ADMIN',
              resolvedInFavorOf: 'MECHANIC',
              platformFee: fee,
              mechanicNet: netAmount,
              finalPrice: netAmount,
              isReviewed: true // Marking it as reviewed so mechanic UI hides it properly
            });
          }
        } else {
          // Refund to cyclist
          if (jobData.cyclistId) {
            const cyclistRef = doc(db, 'users', jobData.cyclistId);
            const cyclistSnap = await transaction.get(cyclistRef);
            if (cyclistSnap.exists()) {
              const txRef = doc(collection(db, 'transactions'));
              transaction.update(cyclistRef, { 
                  balance: increment(price),
                  lastTxId: txRef.id
              });
              transaction.set(txRef, {
                  fromId: 'ESCROW',
                  toId: jobData.cyclistId,
                  amount: price,
                  currency: 'DoctorBike Coin',
                  createdAt: serverTimestamp(),
                  type: 'ADMIN_DISPUTE_REFUND'
              });
            }
          }
          
          transaction.update(sosRef, {
            status: 'CANCELLED',
            paymentStatus: 'REFUNDED_ADMIN',
            resolvedAt: serverTimestamp(),
            resolvedBy: 'ADMIN',
            resolvedInFavorOf: 'CYCLIST'
          });
        }
      });
      toast.success('Contestazione risolta con successo.');
      setDisputedJobs(prev => prev.filter(job => job.id !== jobId));

      // Create notification ticket for the affected user
      try {
        const sosSnap = await getDoc(doc(db, 'sosRequests', jobId));
        if (sosSnap.exists()) {
          const sosData = sosSnap.data();
          const notifyUserId = favorOf === 'CYCLIST' ? sosData?.cyclistId : sosData?.mechanicId;
          const notifyUserName = favorOf === 'CYCLIST' ? (sosData?.cyclistName || 'Ciclista') : 'Meccanico';
          const msg = favorOf === 'CYCLIST' 
            ? `La tua disputa per SOS #${jobId.slice(-6)} è stata risolta a tuo favore. Rimborso di €${price} accreditato.`
            : `La disputa per SOS #${jobId.slice(-6)} è stata risolta. Pagamento di €${price} accreditato.`;
          
          const ticketRef = doc(collection(db, 'supportTickets'));
          await setDoc(ticketRef, {
            id: ticketRef.id,
            userId: notifyUserId,
            userName: notifyUserName,
            userRole: favorOf === 'CYCLIST' ? 'CYCLIST' : 'MECHANIC',
            sosId: jobId,
            status: 'OPEN',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            lastMessage: msg,
            type: 'DISPUTE_RESOLUTION'
          });
        }
      } catch (notifyErr) {
        console.error('Failed to create dispute notification ticket:', notifyErr);
      }
    } catch (err) {
      console.error(err);
      toast.error('Errore durante la risoluzione. Controlla i permessi o la connessione.');
    }
  };

  // ⚡ Bolt: Memoize filtered list to prevent O(n) recalculations on every render.
  // ⚡ Bolt: Also hoists search string parsing outside the filter loop.
  // 📊 Impact: O(n) array iteration combined with string processing no longer runs on trivial state updates.
  const filteredUsers = React.useMemo(() => {
    const searchLower = searchQuery.toLowerCase();
    return allUsers.filter(u => {
      const matchesSearch = u.name?.toLowerCase().includes(searchLower) ||
        u.email?.toLowerCase().includes(searchLower) ||
        u.id?.includes(searchQuery);
      const matchesKyc = kycFilter === 'ALL' || u.kycStatus === 'PENDING';
      return matchesSearch && matchesKyc;
    });
  }, [allUsers, searchQuery, kycFilter]);

  const updateUserRole = async (userId: string, newRole: string) => {
    if (!window.confirm(`Cambiare ruolo a ${newRole}?`)) return;
    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole, updatedAt: serverTimestamp() });
      toast.success('Ruolo aggiornato con successo');
    } catch (err) {
      console.error(err);
      toast.error('Errore durante l\'aggiornamento');
    }
  };

  const updateUserPlan = async (userId: string, newPlan: string) => {
    if (!window.confirm(`Assegnare piano ${newPlan}?`)) return;
    try {
      await updateDoc(doc(db, 'users', userId), { plan: newPlan, updatedAt: serverTimestamp() });
      toast.success('Piano aggiornato con successo');
    } catch (err) {
      console.error(err);
      toast.error('Errore durante l\'aggiornamento');
    }
  };

  const tabs = [
    { id: 'STATS', label: 'Statistiche', icon: <TrendingUp size={20} /> },
    { 
      id: 'USERS', 
      label: 'Utenti', 
      icon: <Users size={20} />, 
      badge: allUsers.filter(u => u.kycStatus === 'PENDING').length || allUsers.length,
      badgeColor: allUsers.some(u => u.kycStatus === 'PENDING') ? 'bg-accent' : 'bg-primary'
    },
    { id: 'MAP', label: 'Mappa Live', icon: <MapIcon size={20} /> },
    { id: 'SUPPORT', label: 'Assistenza', icon: <MessageSquare size={20} />, badge: activeSupportChats.length + supportTickets.length },
    { id: 'AI_ASSISTANCE', label: 'AI Assistance', icon: <Sparkles size={20} /> },
    { id: 'DISPUTES', label: 'Contestazioni', icon: <ShieldAlert size={20} />, badge: disputedJobs.length, badgeColor: 'bg-danger' },
    { id: 'REPORTS', label: 'Segnalazioni', icon: <MapIcon size={20} />, badge: roadReports.length },
    { id: 'FINANCE', label: 'Finanze', icon: <DollarSign size={20} /> },
    { id: 'PROFILE', label: 'Profilo', icon: <UserIcon size={20} /> },
  ];

  const handleKycRejection = async (userId: string, paymentIntentId?: string) => {
    const reason = window.prompt("Motivo rifiuto?");
    if (!reason) return;

    try {
      // 1. Update Firestore
      await updateDoc(doc(db, 'users', userId), { 
        kycStatus: 'REJECTED', 
        'kycDocuments.rejectedReason': reason,
        updatedAt: serverTimestamp()
      });

      // 2. If there's a payment, refund it
      if (paymentIntentId) {
        toast.loading("Emissione rimborso in corso...");
        const refundPayment = httpsCallable(functions, 'refundPayment');
        await refundPayment({ paymentIntentId });
      }

      // 3. Send notification email
      try {
        const sendKycEmail = httpsCallable(functions, 'sendKycEmail');
        await sendKycEmail({ userId, status: 'REJECTED', reason });
      } catch (e) {
        console.warn("Email function not deployed yet");
      }

      toast.success(paymentIntentId ? "Utente rifiutato e rimborsato." : "Utente rifiutato.");
    } catch (err: any) {
      console.error("Error rejecting KYC:", err);
      toast.error("Errore durante il rifiuto: " + (err.message || String(err)));
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white text-black border border-grey/10 shadow-sm">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="font-black text-primary uppercase tracking-widest text-xs">Accesso al Sistema Admin...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-grey/5 overflow-hidden font-sans">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-72 bg-white border-r border-grey/10 p-6 shrink-0 relative z-20">
        <div className="flex items-center gap-4 mb-10 px-2">
          <div className="bg-danger/10 p-3 rounded-2xl text-danger shadow-sm">
            <ShieldAlert size={28} />
          </div>
          <div>
            <h1 className="text-xl font-black text-black uppercase tracking-tight">Admin</h1>
            <p className="text-[10px] font-bold text-grey uppercase tracking-widest">Control Panel</p>
          </div>
        </div>

        <nav className="flex-1 space-y-2 overflow-y-auto pr-2 scrollbar-hide">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as AdminTab)}
              className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all ${activeTab === tab.id ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-[1.02]' : 'text-grey hover:bg-grey/5'}`}
            >
              <div className="flex items-center gap-3">
                {tab.icon}
                {tab.label}
              </div>
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-[9px] ${tab.badgeColor || 'bg-primary'} text-white border border-white/10`}>
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="mt-6 pt-6 border-t border-grey/10">
          <button 
            onClick={async () => {
              if (auth.currentUser) {
                  try {
                    await updateDoc(doc(db, 'users', auth.currentUser.uid), {
                      isOnline: false,
                      lastLat: null,
                      lastLng: null,
                      updatedAt: serverTimestamp()
                    });
                  } catch (e) {
                    /* ignore */
                  }
              }
              signOut(auth);
            }}
            className="w-full flex items-center justify-center gap-3 bg-grey/5 hover:bg-danger/10 text-grey hover:text-danger p-4 rounded-2xl border border-grey/10 transition-all font-black text-[10px] uppercase tracking-widest"
          >
            <LogOut size={18} /> Logout Session
          </button>
        </div>
      </aside>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileMenuOpen(false)}
            className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          >
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              onClick={(e) => e.stopPropagation()}
              className="w-4/5 h-full bg-white p-6 shadow-2xl flex flex-col"
            >
              <div className="flex justify-between items-center mb-10">
                <div className="flex items-center gap-3">
                  <div className="bg-danger/10 p-2 rounded-xl text-danger">
                    <ShieldAlert size={24} />
                  </div>
                  <h1 className="text-lg font-black text-black uppercase">Admin</h1>
                </div>
                <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 text-grey">
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 space-y-1 overflow-y-auto">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => { setActiveTab(tab.id as AdminTab); setIsMobileMenuOpen(false); }}
                    className={`w-full flex items-center justify-between px-4 py-4 rounded-xl font-black text-xs uppercase tracking-widest ${activeTab === tab.id ? 'bg-primary text-white' : 'text-grey'}`}
                  >
                    <div className="flex items-center gap-3">
                      {tab.icon}
                      {tab.label}
                    </div>
                    {tab.badge !== undefined && tab.badge > 0 && (
                      <span className={`px-2 py-0.5 rounded-full text-[9px] ${tab.badgeColor || 'bg-primary'} text-white`}>{tab.badge}</span>
                    )}
                  </button>
                ))}
              </div>

              <button 
                onClick={async () => {
                  if (auth.currentUser) {
                      try {
                        await updateDoc(doc(db, 'users', auth.currentUser.uid), {
                          isOnline: false,
                          lastLat: null,
                          lastLng: null,
                          updatedAt: serverTimestamp()
                        });
                      } catch (e) {
                        /* ignore */
                      }
                  }
                  signOut(auth);
                }}
                className="mt-8 w-full p-4 rounded-xl bg-danger/10 text-danger font-black text-xs uppercase"
              >
                Logout
              </button>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Responsive Header */}
        <header className="h-20 bg-white border-b border-grey/10 px-4 md:px-8 flex justify-between items-center shrink-0 z-10">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-2 text-primary hover:bg-primary/5 rounded-xl transition-colors"
            >
              <Settings size={28} />
            </button>
            <div className="hidden lg:block lg:flex-1">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                <h2 className="text-sm font-black text-black uppercase tracking-widest">{tabs.find(t => t.id === activeTab)?.label}</h2>
              </div>
            </div>
            {/* Mobile Title */}
            <div className="lg:hidden">
              <h2 className="text-sm font-black text-black uppercase tracking-tight">{tabs.find(t => t.id === activeTab)?.label}</h2>
            </div>
          </div>

          <div className="flex items-center gap-4">
             <div className="hidden md:flex flex-col items-end mr-4">
               <p className="text-[10px] font-black text-primary uppercase leading-none mb-1">Status Sistema</p>
               <span className="flex items-center gap-1.5 text-[8px] font-bold text-accent uppercase">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                  Live {roadReports.length + activeSupportChats.length} Events
               </span>
             </div>
             <div className="w-10 h-10 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center text-primary group cursor-pointer hover:bg-primary hover:text-white transition-all">
                <UserIcon size={18} />
             </div>
          </div>
        </header>

        {/* Dynamic Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-12 bg-white/40 relative">
          <AnimatePresence mode="wait">
          {activeTab === 'STATS' && (
            <motion.div
              key="stats"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8 max-w-full mx-auto"
            >
              {/* Stats Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white text-black p-8 rounded-[2.5rem] shadow-sm border border-grey/5">
                  <div className="w-12 h-12 bg-accent/10 text-accent rounded-2xl flex items-center justify-center mb-6 shadow-inner">
                    <DollarSign size={24} />
                  </div>
                  <h3 className="text-[10px] font-black text-grey uppercase tracking-[0.2em] mb-2">Entrate Totali (5% Fee)</h3>
                  <div className="text-4xl font-black text-primary italic">⚡{(platformStats?.totalFees || 0).toFixed(0)}</div>
                  <p className="text-[10px] text-grey font-bold mt-4 uppercase">Su ⚡{(platformStats?.totalTransactions || 0).toFixed(0)} transati</p>
                </motion.div>
                
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white text-black p-8 rounded-[2.5rem] shadow-sm border border-grey/5">
                  <div className="w-12 h-12 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-6 shadow-inner">
                    <BarChart3 size={24} />
                  </div>
                  <h3 className="text-[10px] font-black text-grey uppercase tracking-[0.2em] mb-2">Interventi Completati</h3>
                  <div className="text-4xl font-black text-primary italic">{platformStats?.completedJobs || 0}</div>
                  <p className="text-[10px] text-grey font-bold mt-4 uppercase">Totale SOS gestiti dal sistema</p>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-primary p-8 rounded-[2.5rem] shadow-xl shadow-primary/20 text-white col-span-1 sm:col-span-2 xl:col-span-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="w-12 h-12 bg-white/20 text-white rounded-2xl flex items-center justify-center mb-6 shadow-inner">
                        <Users size={24} />
                      </div>
                      <h3 className="text-[10px] font-black text-white/60 uppercase tracking-[0.2em] mb-2">Utenti Totali</h3>
                      <div className="text-4xl font-black italic">{allUsers.length}</div>
                    </div>
                    <div className="text-right space-y-4 pt-2">
                       <div className="bg-white/10 px-4 py-2 rounded-xl backdrop-blur-sm border border-white/10 text-center">
                          <p className="text-[8px] font-black text-white/50 uppercase mb-0.5">Ciclisti</p>
                          <p className="font-black">{allUsers.filter(u => u.role === 'CYCLIST').length}</p>
                       </div>
                       <div className="bg-white/10 px-4 py-2 rounded-xl backdrop-blur-sm border border-white/10 text-center">
                          <p className="text-[8px] font-black text-white/50 uppercase mb-0.5">Meccanici</p>
                          <p className="font-black">{allUsers.filter(u => u.role === 'MECHANIC').length}</p>
                       </div>
                    </div>
                  </div>
                </motion.div>
                
                <motion.div 
                  initial={{ opacity: 0, y: 20 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  transition={{ delay: 0.3 }} 
                  onClick={() => { setActiveTab('USERS'); setKycFilter('PENDING'); }}
                  className="bg-white text-black p-8 rounded-[2.5rem] shadow-sm border-2 border-danger/10 hover:border-danger/30 transition-all cursor-pointer group"
                >
                  <div className="w-12 h-12 bg-danger/10 text-danger rounded-2xl flex items-center justify-center mb-6 shadow-inner group-hover:scale-110 transition-transform">
                    <ShieldAlert size={24} />
                  </div>
                  <h3 className="text-[10px] font-black text-grey uppercase tracking-[0.2em] mb-2">Richieste KYC Pendenti</h3>
                  <div className="text-4xl font-black text-danger italic">
                    {allUsers.filter(u => u.kycStatus === 'PENDING').length}
                  </div>
                  <p className="text-[10px] text-danger font-bold mt-4 uppercase flex items-center gap-1">
                    Da validare subito <ArrowRight size={10} />
                  </p>
                </motion.div>
              </div>

              {/* Recruitment / Growth & Activity */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-white text-black rounded-[3rem] p-8 border border-grey/5 shadow-sm">
                  <h3 className="text-[11px] font-black text-primary uppercase tracking-[0.3em] mb-8 flex items-center gap-3">
                    <Clock size={16} /> Ultimi Utenti Registrati
                  </h3>
                  <div className="space-y-3">
                    {allUsers.filter(u => u.role !== 'MECHANIC' || u.kycStatus === 'APPROVED').slice(0, 6).map(u => (
                      <div key={u.id} className="flex justify-between items-center p-5 bg-white text-black border border-grey/10 shadow-sm rounded-3xl hover:border-primary/20 hover:bg-primary/5 transition-all cursor-default">
                        <div className="flex items-center gap-4">
                          <img 
                            src={u.photoURL || u.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.id}`} 
                            className="w-12 h-12 rounded-2xl border-2 border-primary/20 object-cover"
                            alt="avatar"
                            referrerPolicy="no-referrer"
                          />
                          <div>
                            <p className="font-black text-black uppercase text-sm">{u.name || 'Senza Nome'}</p>
                            <p className="text-[10px] text-grey font-bold tracking-tight">{u.email}</p>
                          </div>
                        </div>
                        <div className="text-right flex flex-col items-end">
                          <span className={`text-[8px] font-black px-3 py-1.5 rounded-full border uppercase ${
                            u.role === 'MECHANIC' ? 'bg-warning/10 text-warning border-warning/20' : 
                            u.kycStatus === 'PENDING' ? 'bg-danger/10 text-danger border-danger/20 animate-pulse' :
                            'bg-primary/10 text-primary border-primary/20'
                          }`}>
                            {u.kycStatus === 'PENDING' ? 'PENDING KYC' : u.role}
                          </span>
                          <p className="text-[8px] text-grey mt-2 italic font-bold">
                            {u.createdAt ? formatDistanceToNow(u.createdAt.toDate(), { locale: it, addSuffix: true }) : 'Tempo fa'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white/40 backdrop-blur-md rounded-[3rem] p-8 border border-grey/5 shadow-sm flex flex-col justify-between">
                   <div>
                     <h3 className="text-[11px] font-black text-primary uppercase tracking-[0.3em] mb-6">Quick Stats</h3>
                     <div className="space-y-6">
                        <div className="flex items-center justify-between">
                           <span className="text-xs font-bold text-grey uppercase tracking-widest">Active SOS</span>
                           <span className="text-lg font-black text-primary">{activeSupportChats.length}</span>
                        </div>
                        <div className="flex items-center justify-between">
                           <span className="text-xs font-bold text-grey uppercase tracking-widest">Open Tickets</span>
                           <span className="text-lg font-black text-accent">{supportTickets.length}</span>
                        </div>
                        <div className="flex items-center justify-between">
                           <span className="text-xs font-bold text-grey uppercase tracking-widest">Reports</span>
                           <span className="text-lg font-black text-danger">{roadReports.length}</span>
                        </div>
                     </div>
                   </div>
                   
                   <div className="mt-12 bg-white p-6 rounded-[2rem] border border-grey/5 shadow-inner">
                      <p className="text-[9px] font-black text-grey uppercase tracking-widest mb-4">Top Region</p>
                      <div className="flex items-center gap-4">
                         <div className="w-12 h-12 bg-accent/10 rounded-2xl flex items-center justify-center text-accent">
                            <MapIcon size={24} />
                         </div>
                         <div>
                            <p className="text-sm font-black uppercase">Italia Settentrionale</p>
                            <p className="text-[10px] font-bold text-grey uppercase">64% Attività</p>
                         </div>
                      </div>
                   </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'USERS' && (
            <motion.div
              key="users"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6 max-w-full mx-auto"
            >
              <div className="flex justify-between items-center mb-8">
                <div className="relative flex-1 max-w-2xl">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-grey" size={20} />
                  <input 
                    type="text"
                    placeholder="Cerca per nome, email o ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white text-black border border-grey/10 rounded-2xl py-4 pl-12 pr-6 text-sm outline-none focus:ring-2 focus:ring-primary transition-all shadow-sm"
                  />
                </div>
                <div className="flex gap-4 items-center">
                  <button 
                    onClick={() => setKycFilter(kycFilter === 'ALL' ? 'PENDING' : 'ALL')}
                    className={`px-6 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-sm flex items-center gap-2 border ${kycFilter === 'PENDING' ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20' : 'bg-white text-grey border-grey/10 hover:bg-grey/5'}`}
                  >
                    <ShieldAlert size={14} />
                    {kycFilter === 'PENDING' ? 'Vedi Tutti' : 'Da Approvare'}
                    {kycFilter === 'ALL' && allUsers.filter(u => u.kycStatus === 'PENDING').length > 0 && (
                      <span className="w-2 h-2 bg-danger rounded-full animate-pulse ml-1" />
                    )}
                  </button>
                  <div className="bg-white text-black px-6 py-4 rounded-2xl border border-grey/5 shadow-sm whitespace-nowrap">
                    <span className="text-[10px] font-black text-grey uppercase block mb-1">Risultati</span>
                    <span className="text-xl font-black text-primary">{filteredUsers.length}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                {filteredUsers.map(u => (
                  <div key={u.id} className="bg-white text-black p-6 rounded-[2.5rem] border border-grey/5 shadow-sm hover:shadow-md transition-shadow group">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-4">
                        <div className="relative">
                          <img 
                            src={u.photoURL || u.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.id}`} 
                            className="w-14 h-14 rounded-2xl border-2 border-primary/20 object-cover"
                            alt="avatar"
                          />
                          <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white  ${u.isOnline ? 'bg-accent animate-pulse' : 'bg-grey'}`} />
                        </div>
                        <div>
                          <h4 className="font-black text-black  uppercase text-lg leading-tight">{u.name || 'Senza Nome'}</h4>
                          <p className="text-xs text-grey font-bold flex items-center gap-1">
                            <Clock size={12} /> Prossimo a: {u.id.slice(0, 8)}...
                          </p>
                        </div>
                      </div>
                      <span className={`text-[9px] font-black px-4 py-2 rounded-2xl border uppercase ${u.role === 'MECHANIC' ? 'bg-warning/10 text-warning border-warning/20' : 'bg-primary/10 text-primary border-primary/20'}`}>
                        {u.role}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <div className="bg-white text-black border border-grey/10 shadow-sm p-3 rounded-2xl text-center">
                        <p className="text-[8px] font-black text-grey uppercase mb-1">Saldo DBC</p>
                        <p className="text-sm font-black text-accent truncate">⚡{(u.balance || 0).toFixed(0)}</p>
                      </div>
                      <div className="bg-white text-black border border-grey/10 shadow-sm p-3 rounded-2xl text-center">
                        <p className="text-[8px] font-black text-grey uppercase mb-1">Piano</p>
                        <p className="text-[10px] font-black text-primary uppercase truncate">{u.plan || 'BASE'}</p>
                      </div>
                      <div className="bg-white text-black border border-grey/10 shadow-sm p-3 rounded-2xl text-center">
                         <p className="text-[8px] font-black text-grey uppercase mb-1">Status</p>
                         <p className={`text-[10px] font-black ${u.isOnline ? 'text-accent' : 'text-grey'} uppercase`}>
                           {u.isOnline ? 'Online' : 'Offline'}
                         </p>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-grey/5 flex flex-wrap gap-2">
                      <div className="w-full mb-1 flex justify-between items-center">
                         <span className="text-[8px] font-black text-grey uppercase tracking-widest">Azioni Rapide</span>
                      </div>
                      
                       {/* Role Management */}
                       <div className="flex gap-1 bg-white text-black border border-grey/10 shadow-sm p-1 rounded-xl">
                         {(['CYCLIST', 'MECHANIC', 'PEER_MECHANIC', 'ADMIN'] as const).map(r => (
                           <button
                             key={r}
                             onClick={() => updateUserRole(u.id, r)}
                             className={`px-2 py-1.5 rounded-lg text-[8px] font-black transition-all ${u.role === r ? 'bg-primary text-white shadow-sm' : 'text-grey hover:bg-grey/10'}`}
                           >
                             {r === 'PEER_MECHANIC' ? 'PEER' : r}
                           </button>
                         ))}
                       </div>

                       {/* Plan Management (for Mechanics & Peer Mechanics) */}
                       {(u.role === 'MECHANIC' || u.role === 'PEER_MECHANIC') && (
                        <div className="w-full mt-2">
                           <div className="flex gap-1 bg-white text-black border border-grey/10 shadow-sm p-1 rounded-xl w-fit">
                             {(['BASE', 'CLUB', 'PRO'] as const).map(p => (
                               <button
                                 key={p}
                                 onClick={() => updateUserPlan(u.id, p)}
                                 className={`px-2 py-1.5 rounded-lg text-[8px] font-black transition-all ${u.plan === p ? 'bg-accent text-white shadow-sm' : 'text-grey hover:bg-grey/10'}`}
                               >
                                 {p}
                               </button>
                             ))}
                           </div>
                        </div>
                      )}

                      {/* KYC Actions */}
                      {u.kycStatus && (
                        <div className="w-full mt-2">
                           <div className="bg-grey/5 p-3 rounded-2xl border border-grey/5">
                              <p className="text-[8px] font-black text-grey uppercase tracking-widest mb-3 flex justify-between">
                                <span>KYC Status</span>
                                <span className={u.kycStatus === 'PENDING' ? 'text-accent' : u.kycStatus === 'APPROVED' ? 'text-primary' : 'text-danger'}>{u.kycStatus}</span>
                              </p>
                              
                              {u.kycStatus === 'PENDING' && (
                                <div className="flex gap-2 mb-3">
                                  <button 
                                    onClick={async () => {
                                      try {
                                        await updateDoc(doc(db, 'users', u.id), { 
                                          kycStatus: 'APPROVED', 
                                          role: 'MECHANIC',
                                          updatedAt: serverTimestamp() 
                                        });
                                        // Send notification email
                                        try {
                                          const sendKycEmail = httpsCallable(functions, 'sendKycEmail');
                                          await sendKycEmail({ userId: u.id, status: 'APPROVED' });
                                        } catch (e) { /* silent fail */ }
                                        toast.success("Meccanico approvato!");
                                      } catch (e) {
                                        toast.error("Errore nell'approvazione");
                                      }
                                    }} 
                                    className="flex-1 bg-primary text-white text-[10px] font-black py-2 rounded-xl uppercase shadow-sm hover:bg-black transition-colors"
                                  >
                                    Approva
                                  </button>
                                  <button 
                                    onClick={() => handleKycRejection(u.id, u.subscriptionPaymentIntentId)}
                                    className="flex-1 bg-danger/10 text-danger text-[10px] font-black py-2 rounded-xl uppercase hover:bg-danger hover:text-white transition-colors"
                                  >
                                    Rifiuta e Rimborsa
                                  </button>
                                </div>
                              )}
                              
                               <div className="space-y-2">
                                 {u.kycDocuments?.vatNumber && (
                                   <div className="bg-white p-2 rounded-lg border border-grey/10">
                                      <p className="text-[7px] font-black text-grey uppercase mb-0.5">P.IVA / CF</p>
                                      <p className="text-[10px] font-bold text-black">{u.kycDocuments.vatNumber}</p>
                                   </div>
                                 )}
                                 <div className="grid grid-cols-1 gap-2">
                                   {u.kycDocuments?.idUrl && (
                                     <a href={u.kycDocuments.idUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between bg-white text-primary hover:bg-primary hover:text-white p-2.5 rounded-xl border border-primary/20 transition-all group/link">
                                       <span className="text-[9px] font-black uppercase tracking-wider">Documento Identità</span>
                                       <ExternalLink size={14} />
                                     </a>
                                   )}
                                   {u.kycDocuments?.businessUrl && (
                                     <a href={u.kycDocuments.businessUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between bg-white text-primary hover:bg-primary hover:text-white p-2.5 rounded-xl border border-primary/20 transition-all group/link">
                                       <span className="text-[9px] font-black uppercase tracking-wider">Visura / P.IVA</span>
                                       <ExternalLink size={14} />
                                     </a>
                                   )}
                                 </div>
                               </div>
                           </div>
                        </div>
                      )}

                      <button 
                        onClick={() => { setSelectedUserForInvoice(u); setIsInvoiceModalOpen(true); }}
                        className="w-full mt-3 flex items-center justify-center gap-2 bg-primary/5 text-primary py-3 rounded-2xl font-black uppercase text-[10px] hover:bg-primary hover:text-white transition-all border border-primary/10"
                      >
                        <Receipt size={14} /> Genera Fattura
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'MAP' && (
            <motion.div
              key="map"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 lg:rounded-[3rem] overflow-hidden border-0 lg:border-8 border-white shadow-2xl"
            >
              <div className="absolute top-4 left-4 md:top-6 md:left-6 z-10 bg-white/90 backdrop-blur-md p-4 md:p-6 rounded-[1.5rem] md:rounded-[2rem] shadow-xl border border-white/20 max-w-[calc(100%-2rem)]">
                <h3 className="text-[10px] md:text-xs font-black text-primary uppercase tracking-[0.2em] mb-2 md:mb-4">Traffic Insights</h3>
                <div className="grid grid-cols-2 md:grid-cols-1 gap-2 md:gap-3">
                   <div className="flex items-center gap-2 md:gap-3">
                     <span className="w-2 md:w-3 h-2 md:h-3 rounded-full bg-warning shadow-[0_0_10px_rgba(245,158,11,0.5)]" />
                     <span className="text-[8px] md:text-[10px] font-bold text-black uppercase">Meccanici</span>
                   </div>
                   <div className="flex items-center gap-2 md:gap-3">
                     <span className="w-2 md:w-3 h-2 md:h-3 rounded-full bg-primary shadow-[0_0_10px_rgba(0,132,125,0.5)]" />
                     <span className="text-[8px] md:text-[10px] font-bold text-black uppercase">Ciclisti</span>
                   </div>
                   <div className="flex items-center gap-2 md:gap-3">
                     <span className="w-2 md:w-3 h-2 md:h-3 rounded-full bg-[#8B5CF6] shadow-[0_0_10px_rgba(139,92,246,0.5)]" />
                     <span className="text-[8px] md:text-[10px] font-bold text-black uppercase">Peer Mechanics</span>
                   </div>
                   <div className="flex items-center gap-2 md:gap-3 border-t border-grey/10 pt-2 md:pt-3">
                     <span className="w-2 md:w-3 h-2 md:h-3 rounded-full bg-accent shadow-[0_0_10px_rgba(234,88,12,0.5)] animate-pulse" />
                     <span className="text-[8px] md:text-[10px] font-bold text-black uppercase">SOS In Corso</span>
                   </div>
                </div>
              </div>
              <Map 
                isAdmin={true} 
                adminUsers={allUsers}
                onViewReportDetails={(report) => setSelectedReport(report)}
                onStartChat={async (userId, userName) => {
                  try {
                    const q = query(
                      collection(db, 'supportTickets'),
                      where('userId', '==', userId),
                      where('status', '==', 'OPEN'),
                      limit(1)
                    );
                    const snap = await getDocs(q);
                    let ticket;
                    if (!snap.empty) {
                      ticket = { id: snap.docs[0].id, ...snap.docs[0].data() };
                    } else {
                      const ticketRef = doc(collection(db, 'supportTickets'));
                      ticket = {
                        id: ticketRef.id,
                        userId,
                        userName,
                        userRole: allUsers.find(u => u.id === userId)?.role || 'USER',
                        status: 'OPEN',
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                        lastMessage: "Chat avviata dall'admin"
                      };
                      await setDoc(ticketRef, ticket);
                    }
                    setSelectedTicket(ticket);
                    setSupportMode('DIRECT');
                    setActiveTab('SUPPORT');
                  } catch (e) {
                    console.error(e);
                    toast.error("Errore all'avvio della chat");
                  }
                }}
              />
            </motion.div>
          )}

          {activeTab === 'SUPPORT' && (
            <motion.div
              key="support"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex h-full flex-col gap-6 max-w-full mx-auto overflow-hidden pb-4"
            >
              {/* Support Mode Selector */}
              <div className="flex gap-4 px-4 bg-white text-black p-4 rounded-[2rem] border border-grey/5 shadow-sm shrink-0">
                <button 
                  onClick={() => { setSupportMode('SOS'); setSelectedChat(null); setSelectedTicket(null); }}
                  className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${supportMode === 'SOS' ? 'bg-primary text-white shadow-lg' : 'bg-grey/5 text-grey hover:bg-grey/10'}`}
                >
                  Sos Support ({activeSupportChats.length})
                </button>
                <button 
                  onClick={() => { setSupportMode('DIRECT'); setSelectedChat(null); setSelectedTicket(null); }}
                  className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${supportMode === 'DIRECT' ? 'bg-accent text-white shadow-lg' : 'bg-grey/5 text-grey hover:bg-grey/10'}`}
                >
                  Direct Chat ({supportTickets.length})
                </button>
              </div>

              <div className="flex-1 flex flex-col lg:flex-row gap-6 overflow-hidden">
                {/* Chat List */}
                <div className={`w-full lg:w-80 flex flex-col gap-4 ${selectedChat || selectedTicket ? 'hidden lg:flex' : 'flex'}`}>
                  <h3 className="text-[11px] font-black text-primary uppercase tracking-[0.3em] mb-2 px-4 flex items-center gap-3">
                    <MessageSquare size={16} /> {supportMode === 'SOS' ? 'Live SOS Feeds' : 'Ticket Assistenza'}
                  </h3>
                  <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin">
                    {supportMode === 'SOS' ? (
                      activeSupportChats.length === 0 ? (
                        <div className="p-8 text-center text-grey italic bg-white text-black rounded-[2rem] border border-grey/5 shadow-sm">
                          Nessun intervento attivo da monitorare
                        </div>
                      ) : (
                        activeSupportChats.map(chat => (
                          <div
                            key={chat.id}
                            className={`w-full overflow-hidden text-left rounded-3xl border-2 transition-all shadow-sm ${expandedSupportId === chat.id ? 'bg-primary border-primary text-white scale-[1.02]' : 'bg-white text-black border-grey/10 hover:border-primary/30'}`}
                          >
                            <button 
                               onClick={() => setExpandedSupportId(expandedSupportId === chat.id ? null : chat.id)}
                               className="w-full text-left p-4 cursor-pointer focus:outline-none flex flex-col items-start gap-2"
                            >
                                <div className="flex justify-between items-start w-full">
                                  <span className={`text-[8px] font-black px-2 py-0.5 rounded-full border uppercase ${chat.status === 'DISPUTED' ? 'bg-danger text-white border-white/20' : (expandedSupportId === chat.id ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary border-primary/20')}`}>
                                    {chat.status}
                                  </span>
                                  <span className={`text-[10px] font-black ${expandedSupportId === chat.id ? 'text-white' : 'text-accent'}`}>⚡{chat.estimatedPrice}</span>
                                </div>
                                <div className="w-full">
                                  <h4 className="font-black uppercase text-xs line-clamp-1">{chat.faultType}</h4>
                                  <p className={`text-[9px] font-bold leading-tight mt-1 opacity-70 ${expandedSupportId === chat.id ? '' : 'italic'}`}>
                                    {chat.cyclistName || 'User'} e Meccanico...
                                  </p>
                                </div>
                            </button>
                            <AnimatePresence>
                               {expandedSupportId === chat.id && (
                                  <motion.div 
                                     initial={{ height: 0, opacity: 0 }}
                                     animate={{ height: 'auto', opacity: 1 }}
                                     exit={{ height: 0, opacity: 0 }}
                                     className="px-4 pb-4 border-t border-white/10"
                                  >
                                     <div className="pt-3 space-y-3">
                                         {chat.description && (
                                            <div>
                                               <span className="text-[9px] uppercase tracking-widest font-black opacity-60 block">Descrizione</span>
                                               <p className="text-xs font-bold leading-relaxed">{chat.description}</p>
                                            </div>
                                         )}
                                         <div className="flex justify-between items-center text-[10px] font-bold uppercase opacity-80 pt-2 border-t border-white/10">
                                            <span>CicLista: {chat.cyclistName || 'N/A'}</span>
                                            <span>Mecc: {chat.mechanicName || 'N/A'}</span>
                                         </div>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              openSOSChat(chat);
                                            }}
                                            className="w-full mt-3 bg-white text-primary py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-grey/10 transition-colors shadow-sm"
                                          >
                                            Apri Chat
                                          </button>
                                     </div>
                                  </motion.div>
                               )}
                            </AnimatePresence>
                          </div>
                        ))
                      )
                    ) : (
                      supportTickets.length === 0 ? (
                        <div className="p-8 text-center text-grey italic bg-white text-black rounded-[2rem] border border-grey/5 shadow-sm">
                          Nessun ticket di assistenza aperto
                        </div>
                      ) : (
                        supportTickets.map(ticket => (
                          <button
                            key={ticket.id}
                            onClick={() => setSelectedTicket(ticket)}
                            className={`w-full text-left p-4 rounded-3xl border-2 transition-all shadow-sm ${selectedTicket?.id === ticket.id ? 'bg-accent border-accent text-white scale-[1.02]' : 'bg-white text-black border-grey/10 hover:border-accent/30'}`}
                          >
                            <div className="flex justify-between items-start mb-2">
                              <span className={`text-[8px] font-black px-2 py-0.5 rounded-full border uppercase ${ticket.status === 'OPEN' ? 'bg-accent text-white border-white/20' : 'bg-grey/10 text-grey border-grey/20'}`}>
                                {ticket.status}
                              </span>
                              <span className="text-[10px] font-black opacity-60">{ticket.userRole}</span>
                            </div>
                            <h4 className="font-black uppercase text-xs line-clamp-1">{ticket.userName}</h4>
                            <p className={`text-[9px] font-bold leading-tight mt-1 opacity-70 ${selectedTicket?.id === ticket.id ? '' : 'italic'}`}>
                              {ticket.lastMessage || 'Inizia conversazione'}
                            </p>
                          </button>
                        ))
                      )
                    )}
                  </div>
                </div>

                {/* Chat View */}
                <div className={`flex-1 bg-white text-black rounded-[3rem] border border-grey/5 shadow-xl relative overflow-hidden flex flex-col ${!selectedChat && !selectedTicket ? 'hidden lg:flex' : 'flex'}`}>
                  {(selectedChat || selectedTicket) && (
                    <button 
                      onClick={() => { setSelectedChat(null); setSelectedTicket(null); }}
                      className="lg:hidden absolute top-6 right-6 z-20 bg-white/20 p-2 rounded-full text-white backdrop-blur-md"
                    >
                      <X size={20} />
                    </button>
                  )}
                   {supportMode === 'SOS' && selectedChat && (
                     <>
                       <div className="bg-primary p-6 flex justify-between items-center text-white shrink-0">
                         <div className="flex items-center gap-4">
                           <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                             <ShieldAlert size={24} />
                           </div>
                           <div>
                             <h3 className="font-black uppercase tracking-tight">Monitoraggio SOS #{selectedChat.id.slice(-6)}</h3>
                             <p className="text-[10px] font-bold text-white/60 uppercase">Intervento di tipo: {selectedChat.faultType}</p>
                           </div>
                         </div>
                         <div className="text-right">
                           <p className="text-2xl font-black italic">€{selectedChat.estimatedPrice}</p>
                         </div>
                       </div>
                       <div className="flex-1 flex flex-col overflow-hidden">
                         {sosChatTicket ? (
                           <Chat chatId={sosChatTicket.id} otherPartyName={selectedChat.cyclistName || 'Ciclista'} isAdminSupport targetUserId={selectedChat.cyclistId} />
                         ) : (
                           <div className="flex-1 flex items-center justify-center text-grey">
                             <p>Creazione chat in corso...</p>
                           </div>
                         )}
                       </div>
                       {selectedChat.status === 'DISPUTED' && (
                         <div className="p-4 bg-danger/5 border-t border-danger/20 flex gap-3 shrink-0">
                           <button 
                             onClick={() => resolveDispute(selectedChat.id, 'CYCLIST')}
                             className="flex-1 bg-white border-2 border-danger text-danger py-3 rounded-2xl font-black text-[10px] uppercase shadow-sm active:scale-95 transition-all"
                           >
                             Rimborsa Ciclista
                           </button>
                           <button 
                             onClick={() => resolveDispute(selectedChat.id, 'MECHANIC')}
                             className="flex-1 bg-danger text-white py-3 rounded-2xl font-black text-[10px] uppercase shadow-lg shadow-danger/20 active:scale-95 transition-all"
                           >
                             Paga Meccanico
                           </button>
                         </div>
                       )}
                     </>
                   )}

                  {supportMode === 'DIRECT' && selectedTicket && (
                    <>
                      <div className="bg-accent p-6 flex justify-between items-center text-white shrink-0">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                            <Users size={24} />
                          </div>
                          <div>
                            <h3 className="font-black uppercase tracking-tight">Supporto Diretto: {selectedTicket.userName}</h3>
                            <p className="text-[10px] font-bold text-white/60 uppercase">Ruolo: {selectedTicket.userRole}</p>
                          </div>
                        </div>
                        <button 
                          onClick={async () => {
                            if(!window.confirm('Chiudere questo ticket?')) return;
                            await updateDoc(doc(db, 'supportTickets', selectedTicket.id), { status: 'CLOSED', updatedAt: serverTimestamp() });
                            setSelectedTicket(null);
                          }}
                          className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all"
                        >
                          Chiudi Ticket
                        </button>
                      </div>
                      <div className="flex-1 flex flex-col overflow-hidden">
                        <Chat chatId={selectedTicket.id} otherPartyName={selectedTicket.userName} isAdminSupport targetUserId={selectedTicket.userId} />
                      </div>
                    </>
                  )}

                  {((supportMode === 'SOS' && !selectedChat) || (supportMode === 'DIRECT' && !selectedTicket)) && (
                    <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-grey transition-colors">
                      <div className="w-32 h-32 bg-white text-black border border-grey/10 shadow-sm rounded-[3.5rem] flex items-center justify-center mb-8 rotate-6">
                        <MessageSquare size={48} className="opacity-20" />
                      </div>
                      <h3 className="text-2xl font-black text-primary uppercase italic mb-2">Support Center</h3>
                      <p className="max-w-xs text-sm font-bold opacity-60">Seleziona {supportMode === 'SOS' ? 'un intervento attivo' : 'una richiesta di assistenza'} per gestire la comunicazione.</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'AI_ASSISTANCE' && (
            <motion.div
              key="ai_assistance"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="space-y-8 max-w-full mx-auto flex flex-col h-full overflow-hidden"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 h-full overflow-y-auto lg:overflow-hidden pb-10">
                {/* Guidelines Section */}
                <div className="lg:col-span-1 space-y-6 flex flex-col h-full">
                  <div className="bg-white text-black p-6 md:p-8 rounded-[3rem] shadow-sm border border-grey/5 flex-1 flex flex-col">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-12 h-12 bg-accent/10 text-accent rounded-2xl flex items-center justify-center shrink-0">
                        <Settings size={24} />
                      </div>
                      <div>
                         <h3 className="font-black text-black  uppercase text-lg">AI Rules</h3>
                         <p className="text-[10px] font-bold text-grey uppercase tracking-widest">System Tuning</p>
                      </div>
                    </div>
                    <p className="text-xs text-grey font-medium leading-relaxed mb-4">
                      Configura il comportamento globale del Doctorbike AI.
                    </p>
                    <textarea 
                      value={aiGuidelines}
                      onChange={(e) => setAiGuidelines(e.target.value)}
                      placeholder="Linee guida..."
                      className="flex-1 w-full min-h-[200px] bg-white text-black border border-grey/10 shadow-sm rounded-3xl p-6 text-sm outline-none focus:ring-2 focus:ring-primary transition-all resize-none font-medium"
                    />
                    <button 
                      onClick={saveAIGuidelines}
                      disabled={isSavingAI}
                      className="w-full mt-4 bg-primary text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20 flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
                    >
                      {isSavingAI ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                      Update
                    </button>
                  </div>
                </div>

                {/* Chat Log History */}
                <div className="lg:col-span-2 xl:col-span-3 flex flex-col lg:flex-row gap-6 h-full overflow-hidden">
                   <div className={`w-full lg:w-80 flex flex-col gap-4 ${selectedAIConv ? 'hidden lg:flex' : 'flex'}`}>
                      <h3 className="text-[11px] font-black text-primary uppercase tracking-[0.3em] mb-2 px-4 flex items-center gap-3 shrink-0">
                         <Bot size={16} /> History Logs
                      </h3>
                      <div className="px-4">
                        <input
                          type="text"
                          value={aiSearchQuery}
                          onChange={(e) => setAiSearchQuery(e.target.value)}
                          placeholder="Cerca conversazioni..."
                          className="w-full px-4 py-2.5 bg-grey/5 border border-grey/10 rounded-xl text-xs outline-none focus:ring-2 focus:ring-primary/50"
                        />
                      </div>
                      <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-thin">
                         {aiConversations
                           .filter(c => {
                             if (!aiSearchQuery) return true;
                             const q = aiSearchQuery.toLowerCase();
                             return (c.userName || '').toLowerCase().includes(q) ||
                                    (c.role || '').toLowerCase().includes(q) ||
                                    (c.messages || []).some((m: any) => (m.text || '').toLowerCase().includes(q));
                           })
                           .length === 0 ? (
                           <div className="p-8 text-center text-grey italic bg-white text-black rounded-[2rem] border border-grey/5 mx-4">
                             Nessuna conversazione trovata
                           </div>
                         ) : (
                           aiConversations
                           .filter(c => {
                             if (!aiSearchQuery) return true;
                             const q = aiSearchQuery.toLowerCase();
                             return (c.userName || '').toLowerCase().includes(q) ||
                                    (c.role || '').toLowerCase().includes(q) ||
                                    (c.messages || []).some((m: any) => (m.text || '').toLowerCase().includes(q));
                           })
                           .map(conv => (
                            <div key={conv.id} className="flex gap-2">
                              <button
                                onClick={() => setSelectedAIConv(conv)}
                                className={`flex-1 text-left p-4 rounded-3xl border-2 transition-all shadow-sm ${selectedAIConv?.id === conv.id ? 'bg-primary border-primary text-white scale-[1.02]' : 'bg-white text-black border-grey/5 text-black  hover:border-primary/30'}`}
                              >
                                <div className="flex justify-between items-start mb-2">
                                  <span className={`text-[8px] font-black px-2 py-0.5 rounded-full border uppercase ${selectedAIConv?.id === conv.id ? 'bg-white/20 text-white' : 'bg-primary/5 text-primary border-primary/20'}`}>
                                    {conv.role}
                                  </span>
                                  <span className="text-[8px] opacity-60 font-bold uppercase">
                                    {conv.updatedAt ? formatDistanceToNow(conv.updatedAt.toDate(), { locale: it }) : ''}
                                  </span>
                                </div>
                                <h4 className="font-black uppercase text-xs truncate">{conv.userName || 'Anonimo'}</h4>
                                <p className={`text-[8px] font-bold mt-1 opacity-70 line-clamp-1 italic`}>
                                  UltimoMsg: {conv.messages[conv.messages.length - 1]?.text}
                                </p>
                              </button>
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (!window.confirm('Eliminare questa conversazione AI?')) return;
                                  try {
                                    await deleteDoc(doc(db, 'aiConversations', conv.id));
                                    if (selectedAIConv?.id === conv.id) setSelectedAIConv(null);
                                    toast.success('Conversazione eliminata');
                                  } catch (err) {
                                    console.error(err);
                                    toast.error('Errore durante l\'eliminazione');
                                  }
                                }}
                                className="shrink-0 self-center p-2 text-grey hover:text-danger hover:bg-danger/10 rounded-xl transition-all"
                                title="Elimina conversazione"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                   </div>

                  {/* Conversation Detail */}
                  <div className="flex-1 bg-white text-black rounded-[3rem] border border-grey/5 shadow-xl flex flex-col overflow-hidden">
                    {selectedAIConv ? (
                      <>
                        <div className="bg-zinc-900 p-6 flex justify-between items-center text-white shrink-0">
                           <div className="flex items-center gap-4">
                             <div className="w-12 h-12 bg-accent/20 rounded-2xl flex items-center justify-center text-accent">
                               <Sparkles size={24} />
                             </div>
                             <div>
                               <h3 className="font-black uppercase italic">{selectedAIConv.userName}</h3>
                               <p className="text-[10px] font-bold text-white/40 uppercase">{selectedAIConv.role} • ID: {selectedAIConv.id.slice(-6)}</p>
                             </div>
                           </div>
                           <button 
                             onClick={() => setSelectedAIConv(null)}
                             className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                           >
                             <X size={20} />
                           </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-8 space-y-6 bg-white text-black border border-grey/10 shadow-sm/50">
                          {selectedAIConv.messages.map((m: any, idx: number) => (
                            <div key={idx} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                               <div className={`max-w-[85%] p-5 rounded-[2rem] text-sm leading-relaxed ${m.sender === 'user' ? 'bg-primary text-white rounded-tr-none' : 'bg-white  text-black  rounded-tl-none shadow-sm border border-grey/10'}`}>
                                  <div className="prose prose-sm prose-invert max-w-none">
                                    <ReactMarkdown>{m.text}</ReactMarkdown>
                                  </div>
                                  <p className={`text-[8px] mt-2 font-black uppercase opacity-40 ${m.sender === 'user' ? 'text-right' : ''}`}>
                                    {m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                  </p>
                               </div>
                            </div>
                          ))}
                        </div>
                        <div className="p-6 bg-white text-black border-t border-grey/10 text-center">
                           <p className="text-[10px] font-black text-grey uppercase tracking-widest italic flex items-center justify-center gap-2">
                             <Bot size={12} /> Log di conversazione analizzato tramite Doctorbike Ai
                           </p>
                        </div>
                      </>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-grey">
                        <div className="w-24 h-24 bg-white text-black border border-grey/10 shadow-sm rounded-full flex items-center justify-center mb-6">
                           <Bot size={40} className="opacity-20" />
                        </div>
                        <h4 className="font-black text-primary uppercase italic text-xl mb-2">Conversation Viewer</h4>
                        <p className="max-w-xs text-xs font-bold opacity-60 uppercase tracking-widest">Seleziona una sessione dalla lista per visualizzare l'intero scambio tra l'utente e l'AI.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'DISPUTES' && (
            <motion.div
              key="disputes"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="space-y-6 max-w-full mx-auto px-2"
            >
              <div className="flex flex-col md:flex-row md:items-center gap-4 mb-8">
                <div className="w-16 h-16 bg-danger/10 text-danger rounded-[1.5rem] md:rounded-[2rem] flex items-center justify-center shadow-lg shadow-danger/5 shrink-0">
                  <ShieldAlert size={32} />
                </div>
                <div>
                  <h2 className="text-2xl md:text-3xl font-black text-black uppercase tracking-tight">Support Cases</h2>
                  <p className="text-xs md:text-sm font-bold text-grey uppercase tracking-widest italic">{disputedJobs.length} interventi da moderare</p>
                </div>
              </div>

              {disputedJobs.length === 0 ? (
                <div className="bg-white text-black rounded-[2rem] md:rounded-[3rem] p-10 md:p-16 text-center border-4 border-dashed border-grey/10 shadow-sm">
                  <CheckCircle size={64} className="mx-auto mb-6 text-accent/20" />
                  <h3 className="text-xl md:text-2xl font-black text-primary uppercase italic">All Clear</h3>
                  <p className="text-[10px] md:text-xs font-bold text-grey uppercase tracking-widest mt-4">Nessuna contestazione attiva.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {disputedJobs.map((job) => (
                    <motion.div 
                      key={job.id} 
                      className="bg-white text-black rounded-[2rem] md:rounded-[3rem] border-2 border-danger shadow-xl overflow-hidden relative cursor-pointer group"
                      onClick={(e) => {
                         const target = e.target as HTMLElement;
                         if (!target.closest('button')) {
                            setExpandedJobId(expandedJobId === job.id ? null : job.id);
                         }
                      }}
                    >
                      <div className="p-6 md:p-8 relative">
                        <div className="hidden md:block absolute top-0 right-0 bg-danger text-white px-6 py-2 rounded-bl-3xl font-black text-[10px] uppercase tracking-widest">Priority</div>
                        
                        <div className="flex flex-col md:flex-row justify-between items-start mb-6 md:mb-8 gap-4">
                          <div>
                            <p className="text-[8px] font-black text-primary uppercase tracking-[0.2em] mb-1">JOB ID: #{job.id.slice(-8)}</p>
                            <h3 className="text-xl md:text-2xl font-black text-black uppercase italic group-hover:text-primary transition-colors">{job.faultType || 'Unknown Issue'}</h3>
                            <div className="flex items-center gap-2 mt-2 text-[10px] font-bold text-grey uppercase">
                              <Clock size={12} /> {job.createdAt ? formatDistanceToNow(job.createdAt.toDate(), { locale: it, addSuffix: true }) : 'recent'}
                            </div>
                          </div>
                          <div className="md:text-right">
                            <p className="text-[9px] font-black text-grey uppercase tracking-widest mb-1">Escrowed Balance</p>
                            <p className="text-3xl md:text-4xl font-black text-accent italic">⚡{(Number(job.estimatedPrice) || 0).toFixed(0)}</p>
                          </div>
                        </div>

                        <AnimatePresence>
                          {expandedJobId === job.id && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="bg-grey/5 p-4 md:p-6 rounded-[1.5rem] md:rounded-[2.5rem] mb-6 md:mb-8 border border-grey/5">
                                <div className="flex items-center justify-between gap-4 mb-4 pb-4 border-b border-grey/10">
                                   <div className="flex items-center gap-2 md:gap-3">
                                     <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary shrink-0">
                                       <Users size={14} />
                                     </div>
                                     <div className="min-w-0">
                                       <p className="text-[8px] font-black text-primary uppercase">User</p>
                                       <p className="text-[10px] md:text-xs font-bold text-black truncate">{job.cyclistName || 'Anonymous'}</p>
                                     </div>
                                   </div>
                                   <div className="flex items-center gap-2 md:gap-3 text-right">
                                     <div className="min-w-0">
                                       <p className="text-[8px] font-black text-warning uppercase">Mechanic</p>
                                       <p className="text-[10px] md:text-xs font-bold text-black truncate">{job.mechanicId?.slice(0, 8)}</p>
                                     </div>
                                     <div className="w-8 h-8 rounded-full bg-warning/20 flex items-center justify-center text-warning shrink-0">
                                       <Wrench size={14} />
                                     </div>
                                   </div>
                                </div>
                                <p className="text-xs md:text-sm font-bold text-black italic leading-relaxed">
                                  "{job.description || 'No description provided.'}"
                                </p>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <div className="flex flex-col sm:flex-row gap-3">
                          <button 
                            onClick={(e) => { e.stopPropagation(); resolveDispute(job.id, 'CYCLIST'); }}
                          className="flex-1 bg-white border-2 border-danger text-danger py-4 rounded-xl font-black flex items-center justify-center gap-3 hover:bg-danger hover:text-white uppercase tracking-widest text-[10px] transition-all shadow-md active:scale-95"
                        >
                          <XCircle size={18} /> Rimborsa Ciclista
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); resolveDispute(job.id, 'MECHANIC'); }}
                          className="flex-1 bg-primary text-white py-4 rounded-xl font-black flex items-center justify-center gap-3 shadow-lg shadow-primary/30 hover:brightness-110 uppercase tracking-widest text-[10px] transition-all active:scale-95"
                        >
                          <CheckCircle size={18} /> Paga Meccanico
                        </button>
                      </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
           {activeTab === 'REPORTS' && (
             <motion.div
               key="reports"
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               exit={{ opacity: 0, y: -20 }}
               className="max-w-6xl mx-auto space-y-6"
             >
               <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                 <h2 className="text-xl font-black text-black  uppercase flex items-center gap-2">
                   <MapIcon className="text-primary" /> Segnalazioni Dissesto
                 </h2>
                 <div className="flex gap-2 flex-wrap">
                   {(['all', 'open', 'resolved', 'rejected'] as const).map(f => (
                     <button
                       key={f}
                       onClick={() => setReportFilter(f)}
                       className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${reportFilter === f ? 'bg-primary text-white' : 'bg-grey/10 text-grey hover:bg-grey/20'}`}
                     >
                       {f === 'all' ? 'Tutti' : f === 'open' ? 'Aperte' : f === 'resolved' ? 'Risolte' : 'Rifiutate'}
                     </button>
                   ))}
                   <div className="w-px h-6 bg-grey/20 self-center mx-1" />
                   {(['all', 'low', 'medium', 'high'] as const).map(s => (
                     <button
                       key={s}
                       onClick={() => setReportSeverityFilter(s)}
                       className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${reportSeverityFilter === s ? 'bg-accent text-white' : 'bg-grey/10 text-grey hover:bg-grey/20'}`}
                     >
                       {s === 'all' ? 'Tutte' : s.charAt(0).toUpperCase() + s.slice(1)}
                     </button>
                   ))}
                 </div>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                 {roadReports
                   .filter(r => reportFilter === 'all' || r.status === reportFilter)
                   .filter(r => reportSeverityFilter === 'all' || r.severity === reportSeverityFilter)
                   .map((report) => (
                   <div key={report.id} className="bg-white text-black rounded-3xl p-6 border border-grey/10 shadow-sm relative overflow-hidden flex flex-col">
                      <div className="flex justify-between items-start mb-4">
                         <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase border ${
                             report.severity === 'high' ? 'bg-danger/10 text-danger border-danger/20' : 
                             report.severity === 'medium' ? 'bg-warning/10 text-warning border-warning/20' : 
                             'bg-primary/10 text-primary border-primary/20'
                         }`}>
                             {report.severity}
                         </span>
                         <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase border ${report.status === 'resolved' ? 'bg-success/10 text-success border-success/20' : report.status === 'rejected' ? 'bg-grey/10 text-grey border-grey/20' : 'bg-accent/10 text-accent border-accent/20'}`}>
                             {report.status}
                         </span>
                      </div>
                      <h3 className="font-black text-lg mb-2 uppercase">{report.category}</h3>
                      <p className="text-sm text-grey mb-4 flex-1">{report.description}</p>
                      {report.adminNote && (
                        <div className="mb-3 p-2 bg-primary/5 rounded-xl border border-primary/10">
                          <p className="text-[10px] font-black text-primary uppercase mb-1">Nota Admin</p>
                          <p className="text-xs text-grey ">{report.adminNote}</p>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-[10px] font-bold text-grey uppercase tracking-widest mb-4">
                         <span>Upvotes: {report.upvotes?.length || 0}</span>
                         <span>{report.createdAt ? new Date(report.createdAt.seconds ? report.createdAt.seconds * 1000 : report.createdAt).toLocaleDateString() : ''}</span>
                      </div>
                      <div className="flex gap-2">
                         {report.status !== 'resolved' && (
                             <button 
                               onClick={async () => {
                                   try {
                                       const note = reportAdminNote[report.id] || '';
                                       await updateDoc(doc(db, 'roadReports', report.id), { status: 'resolved', updatedAt: serverTimestamp(), adminNote: note });
                                       setReportAdminNote(prev => { const n = {...prev}; delete n[report.id]; return n; });
                                   } catch (e) {
                                       console.error(e);
                                   }
                               }}
                               className="flex-1 bg-success/10 hover:bg-success/20 text-success py-3 rounded-2xl font-black uppercase text-[10px] transition-colors"
                             >
                               Risolvi
                             </button>
                         )}
                         {report.status !== 'rejected' && (
                             <button 
                               onClick={async () => {
                                   try {
                                       await updateDoc(doc(db, 'roadReports', report.id), { status: 'rejected', updatedAt: serverTimestamp() });
                                   } catch (e) {
                                       console.error(e);
                                   }
                               }}
                               className="flex-1 bg-danger/10 hover:bg-danger/20 text-danger py-3 rounded-2xl font-black uppercase text-[10px] transition-colors"
                             >
                               Rifiuta
                             </button>
                         )}
                         <button
                           onClick={() => setShowReportNoteModal(report.id)}
                           className="px-3 bg-grey/10 hover:bg-grey/20 text-grey py-3 rounded-2xl font-black uppercase text-[10px] transition-colors"
                           title="Aggiungi nota"
                         >
                           Nota
                         </button>
                      </div>
                   </div>
                 ))}
               </div>
             </motion.div>
           )}

           {/* Report Note Modal */}
           {showReportNoteModal && (
             <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
               <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl">
                 <h3 className="font-black text-lg uppercase mb-4">Nota Admin</h3>
                 <textarea
                   value={reportAdminNote[showReportNoteModal] || ''}
                   onChange={(e) => setReportAdminNote(prev => ({...prev, [showReportNoteModal!]: e.target.value}))}
                   placeholder="Aggiungi una nota interna..."
                   className="w-full h-32 p-3 border border-grey/20 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                 />
                 <div className="flex gap-3 mt-4">
                   <button onClick={() => setShowReportNoteModal(null)} className="flex-1 py-3 rounded-2xl font-black text-[10px] uppercase bg-grey/10 text-grey">Annulla</button>
                   <button onClick={() => setShowReportNoteModal(null)} className="flex-1 py-3 rounded-2xl font-black text-[10px] uppercase bg-primary text-white">Salva</button>
                 </div>
               </div>
             </div>
           )}

          {activeTab === 'FINANCE' && (
            <motion.div
              key="finance"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8 max-w-full mx-auto"
            >
              {/* Financial Summary */}
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-black text-black uppercase tracking-tight">Riepilogo Finanziario</h2>
                <button 
                  onClick={() => { setSelectedUserForInvoice(null); setIsInvoiceModalOpen(true); }}
                  className="bg-primary text-white px-6 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.05] transition-all flex items-center gap-2"
                >
                  <Receipt size={16} /> Nuova Fattura Libera
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-primary p-8 rounded-[2.5rem] shadow-xl shadow-primary/20 text-white">
                   <div className="w-12 h-12 bg-white/20 text-white rounded-2xl flex items-center justify-center mb-6">
                      <DollarSign size={24}/>
                   </div>
                   <h3 className="text-[10px] font-black text-white/60 uppercase tracking-[0.2em] mb-2">Entrate Totali Piattaforma</h3>
                   <div className="text-4xl font-black italic">
                      €{((platformStats?.totalSubscriptionRevenue || 0) + (platformStats?.totalFees || 0)).toFixed(2)}
                   </div>
                   <p className="text-[10px] text-white/40 font-bold mt-4 uppercase">Sub + Commissioni SOS</p>
                </div>

                <div className="bg-white text-black p-8 rounded-[2.5rem] shadow-sm border border-grey/5">
                   <div className="w-12 h-12 bg-accent/10 text-accent rounded-2xl flex items-center justify-center mb-6">
                      <Sparkles size={24}/>
                   </div>
                   <h3 className="text-[10px] font-black text-grey uppercase tracking-[0.2em] mb-2">Ricavo Abbonamenti</h3>
                   <div className="text-4xl font-black text-primary italic">
                      €{(platformStats?.totalSubscriptionRevenue || 0).toFixed(2)}
                   </div>
                   <p className="text-[10px] text-grey font-bold mt-4 uppercase">Piani BASE, CLUB, PRO</p>
                </div>

                <div className="bg-white text-black p-8 rounded-[2.5rem] shadow-sm border border-grey/5">
                   <div className="w-12 h-12 bg-warning/10 text-warning rounded-2xl flex items-center justify-center mb-6">
                      <TrendingUp size={24}/>
                   </div>
                   <h3 className="text-[10px] font-black text-grey uppercase tracking-[0.2em] mb-2">Commissioni SOS</h3>
                   <div className="text-4xl font-black text-primary italic">
                      €{(platformStats?.totalFees || 0).toFixed(2)}
                   </div>
                   <p className="text-[10px] text-grey font-bold mt-4 uppercase">5%, 10%, 15% su interventi</p>
                </div>

                {/* MY SHARE / PROFIT CARD */}
                <div className="bg-black text-white p-8 rounded-[2.5rem] shadow-2xl shadow-black/20 md:col-span-3">
                   <div className="flex justify-between items-start">
                     <div>
                       <h3 className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mb-4 flex items-center gap-2">
                         <ShieldAlert size={12} className="text-primary"/> Guadagno Netto Piattaforma (Il Tuo Share)
                       </h3>
                       <div className="text-6xl font-black italic text-primary">
                          €{((platformStats?.totalSubscriptionRevenue || 0) + (platformStats?.totalFees || 0)).toFixed(2)}
                       </div>
                       <p className="text-[10px] text-white/40 font-bold mt-6 uppercase tracking-widest leading-relaxed">
                          Include commissioni piani (15% Base, 10% Club, 5% Pro) <br/>
                          + Fee fissata del 5% per interventi ciclisti esperti
                       </p>
                     </div>
                     <div className="text-right">
                        <p className="text-[8px] font-black text-white/30 uppercase mb-2">Transazioni Totali</p>
                        <p className="text-2xl font-black italic">#{financialTransactions.length}</p>
                     </div>
                   </div>
                </div>
              </div>

              {/* Detailed Lists */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                {/* Subscriptions List */}
                <div className="bg-white rounded-[2.5rem] p-8 border border-grey/5 shadow-sm overflow-hidden flex flex-col">
                  <div className="flex justify-between items-center mb-8">
                    <h3 className="text-[11px] font-black text-primary uppercase tracking-[0.3em] flex items-center gap-3">
                      <CreditCard size={18}/> Storico Abbonamenti
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="text-[10px] font-black text-grey uppercase tracking-widest border-b border-grey/5">
                          <th className="pb-4 text-left">Utente</th>
                          <th className="pb-4 text-left">Piano</th>
                          <th className="pb-4 text-left">Importo</th>
                          <th className="pb-4 text-left">Data</th>
                          <th className="pb-4 text-right">Azioni</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-grey/5">
                        {subscriptions.map(sub => (
                          <tr key={sub.id} className="text-xs">
                            <td className="py-4">
                              <p className="font-black text-black">{sub.userName || 'Utente'}</p>
                              <p className="text-[9px] text-grey truncate w-24 font-bold">{sub.userId?.slice(0,8)}</p>
                            </td>
                            <td className="py-4">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                                sub.planId === 'PRO' ? 'bg-amber-100 text-amber-600' : 
                                sub.planId === 'CLUB' ? 'bg-slate-100 text-slate-600' : 
                                'bg-grey/10 text-grey'
                              }`}>
                                {sub.planId}
                              </span>
                            </td>
                            <td className="py-4 font-black text-primary">€{sub.amount}</td>
                            <td className="py-4 text-grey font-bold">
                              {sub.createdAt?.toDate ? sub.createdAt.toDate().toLocaleDateString() : 'N/D'}
                            </td>
                            <td className="py-4 text-right">
                              <div className="flex justify-end gap-2">
                                <button 
                                  title="Invia Fattura"
                                  onClick={() => {
                                    setSelectedUserForInvoice({ id: sub.userId, name: sub.userName, email: sub.userEmail });
                                    setIsInvoiceModalOpen(true);
                                  }}
                                  className="p-2 bg-primary/5 text-primary rounded-xl hover:bg-primary/10"
                                >
                                  <Receipt size={14}/>
                                </button>
                                {sub.status !== 'REFUNDED' && (
                                  <button 
                                    title="Rimborsa"
                                    onClick={async () => {
                                      if (!window.confirm("Sicuro di voler rimborsare questo abbonamento?")) return;
                                      setIsRefunding(sub.id);
                                      try {
                                        if (sub.stripePaymentIntentId) {
                                          const refundPayment = httpsCallable(functions, 'refundPayment');
                                          await refundPayment({ 
                                            paymentIntentId: sub.stripePaymentIntentId, 
                                            reason: 'requested_by_customer' 
                                          });
                                        } else {
                                          await updateDoc(doc(db, 'subscriptions', sub.id), { status: 'REFUNDED', updatedAt: serverTimestamp() });
                                          await updateDoc(doc(db, 'platformStats', 'global'), { totalSubscriptionRevenue: increment(-sub.amount) });
                                        }
                                        toast.success("Abbonamento rimborsato.");
                                      } catch (e) {
                                        console.error("Refund error:", e);
                                        toast.error("Errore nel rimborso.");
                                      } finally {
                                        setIsRefunding(null);
                                      }
                                    }}
                                    className="p-2 bg-danger/5 text-danger rounded-xl hover:bg-danger/10"
                                  >
                                    <RotateCcw size={14} className={isRefunding === sub.id ? 'animate-spin' : ''}/>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Transactions/Commissions List */}
                <div className="bg-white rounded-[2.5rem] p-8 border border-grey/5 shadow-sm overflow-hidden flex flex-col">
                   <div className="flex justify-between items-center mb-8">
                    <h3 className="text-[11px] font-black text-primary uppercase tracking-[0.3em] flex items-center gap-3">
                      <TrendingUp size={18}/> Transazioni SOS & Fee
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="text-[10px] font-black text-grey uppercase tracking-widest border-b border-grey/5">
                          <th className="pb-4 text-left">Tipo</th>
                          <th className="pb-4 text-left">Meccanico</th>
                          <th className="pb-4 text-left">Totale</th>
                          <th className="pb-4 text-left">Fee Admin</th>
                          <th className="pb-4 text-right">Data</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-grey/5">
                        {financialTransactions.map(tx => (
                          <tr key={tx.id} className="text-xs">
                            <td className="py-4">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                                tx.type === 'SOS_PAYMENT' ? 'bg-danger/10 text-danger' : 
                                tx.type === 'SUBSCRIPTION' ? 'bg-primary/10 text-primary' : 
                                'bg-grey/10 text-grey'
                              }`}>
                                {tx.type?.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="py-4">
                              <p className="font-bold text-black">{tx.userName || 'N/D'}</p>
                              <p className="text-[8px] text-grey uppercase">{tx.description?.slice(0, 30)}...</p>
                            </td>
                            <td className="py-4 font-black">€{tx.amount?.toFixed(2)}</td>
                            <td className="py-4 font-black text-accent">
                               {tx.fee ? `€${tx.fee.toFixed(2)}` : '€0.00'}
                            </td>
                            <td className="py-4 text-right text-grey font-bold">
                              {tx.createdAt?.toDate ? tx.createdAt.toDate().toLocaleDateString() : 'N/D'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'PROFILE' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-2xl mx-auto"
            >
              <ProfileView />
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </main>
      <AnimatePresence>
        {selectedReport && (
          <RoadReportDetailModal 
            report={selectedReport} 
            onClose={() => setSelectedReport(null)} 
          />
        )}
      </AnimatePresence>

      <ManualInvoiceModal 
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        user={selectedUserForInvoice}
      />
    </div>
  );
}
