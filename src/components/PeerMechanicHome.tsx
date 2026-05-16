import toast from 'react-hot-toast';
import React, { useState, useEffect } from 'react';
import { 
  Wrench, 
  Settings, 
  User, 
  Navigation2, 
  CheckCircle2, 
  MessageSquare, 
  MessageCircle, 
  Power, 
  Bike, 
  ArrowLeft, 
  Sparkles, 
  Clock, 
  Zap, 
  AlertTriangle, 
  X, 
  ArrowRight 
} from 'lucide-react';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, getDocs, runTransaction, arrayUnion, orderBy, limit, increment } from 'firebase/firestore';
import { useAuthStore } from '../store/useAuthStore';
import { ProfileView } from './ProfileView';
import { Map as BicycleMap } from './Map';
import { RoadReportDetailModal } from './RoadReportDetailModal';
import { ChatListView } from './ChatListView';
import { ChatHeader } from './ChatHeader';
import { PublicProfileModal } from './PublicProfileModal';
import { SocialView } from './SocialView';
import { Chat } from './Chat';
import { motion, AnimatePresence } from 'motion/react';
import { soundService } from '../lib/sounds';
import { useTranslation } from 'react-i18next';

export function PeerMechanicHome() {
  const { user, profile, setShowAIDoctor, addToast } = useAuthStore();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'WORK' | 'MAP' | 'PROFILE' | 'CHAT' | 'COMMUNITY'>('WORK');
  const [activeJobs, setActiveJobs] = useState<any[]>([]);
  const [allPendingJobs, setAllPendingJobs] = useState<any[]>([]);
  
  const [showChat, setShowChat] = useState(false);
  const [viewProfileId, setViewProfileId] = useState<string | null>(null);
  const [directChat, setDirectChat] = useState<{ id: string, name: string } | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedReport, setSelectedReport] = useState<any | null>(null);
  const [newSOS, setNewSOS] = useState<any>(null);
  const [showNewSOSBanner, setShowNewSOSBanner] = useState(false);

  const isAvailable = profile?.peerMechanicEnabled || false;

  const getFaultTypeTranslation = (faultType: string | undefined) => {
    if (!faultType) return t('cyclist.other');
    const key = `cyclist.${faultType.toLowerCase().replace(/_([a-z])/g, (g) => g[1].toUpperCase())}`;
    return t(key);
  };

  const startDirectChat = async (otherUserId: string, otherName: string) => {
    if (!user) return;
    const sortedIds = [user.uid, otherUserId].sort();
    const chatId = `direct_${sortedIds[0]}_${sortedIds[1]}`;
    setDirectChat({ id: chatId, name: otherName });
    setShowChat(true);
    setActiveTab('CHAT');
  };

  useEffect(() => {
    if (!user) return;
    
    const sosQuery = query(
      collection(db, 'sosRequests'), 
      where('status', '==', 'PENDING'),
      orderBy('createdAt', 'desc'),
      limit(20)
    );

    const unsubSos = onSnapshot(sosQuery, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        // Notify peer mechanic if enabled and no active jobs
        if (change.type === 'added' && isAvailable && activeJobs.length === 0) {
          const data = change.doc.data();
          
          if (profile?.notificationsEnabled) {
            soundService.play('INTERVENTION_PEER');

            if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
              new Notification(t('mechanic.availableJobs'), {
                body: `${getFaultTypeTranslation(data.faultType)} ${t('common.nearYou')}.`,
                icon: '/logo192.png'
              });
            }
          }
          
          setNewSOS({ id: change.doc.id, ...data });
          setShowNewSOSBanner(true);
        }
      });
      
      setAllPendingJobs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'sosRequests (PEER_DISPATCHER)');
    });
    
    const activeQ = query(collection(db, 'sosRequests'), where('mechanicId', '==', user.uid), where('status', 'in', ['ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'DISPUTED']));
    const unsubB = onSnapshot(activeQ, (snapshot) => {
        setActiveJobs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, error => {
        handleFirestoreError(error, OperationType.LIST, 'sosRequests');
    });

    return () => {
        unsubSos();
        unsubB();
    }
  }, [user, isAvailable, activeJobs.length, profile?.notificationsEnabled, t]);

  const [sosTimeouts, setSosTimeouts] = useState<Record<string, number>>({});

  const autoCancelJob = async (jobId: string, cyclistId: string, estimatedPrice: number) => {
    try {
      const sosRef = doc(db, 'sosRequests', jobId);
      const userRef = doc(db, 'users', cyclistId);

      await runTransaction(db, async (transaction) => {
        const sosSnap = await transaction.get(sosRef);
        if (!sosSnap.exists()) return;
        
        const data = sosSnap.data();
        if (data.status !== 'ACCEPTED') return;

        // Refund cyclist
        const txRef = doc(collection(db, 'transactions'));
        transaction.update(userRef, {
          balance: increment(estimatedPrice || 15.00),
          updatedAt: serverTimestamp(),
          lastTxId: txRef.id
        });
        
        transaction.set(txRef, {
            fromId: 'ESCROW',
            toId: data.cyclistId,
            amount: estimatedPrice || 15.00,
            currency: 'DoctorBike Coin',
            createdAt: serverTimestamp(),
            type: 'SOS_REFUND_TIMEOUT_MECHANIC'
        });
        
        transaction.update(sosRef, {
          status: 'CANCELLED',
          cancelReason: 'TIMEOUT',
          paymentStatus: 'REFUNDED',
          updatedAt: serverTimestamp()
        });
      });
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      addToast && addToast({ title: 'Attenzione', message: 'Un SOS è stato annullato per inattività.', type: 'warning' });
    } catch (e) {
      console.error('Auto-cancel failed:', e);
    }
  };

  useEffect(() => {
    const acceptedJobs = activeJobs.filter(j => j.status === 'ACCEPTED' && j.acceptedAt);
    if (acceptedJobs.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSosTimeouts({});
      return;
    }

    const interval = setInterval(() => {
      const now = new Date();
      const newTimeouts: Record<string, number> = {};
      
      acceptedJobs.forEach(job => {
        const acceptedAt = job.acceptedAt instanceof Date 
          ? job.acceptedAt 
          : new Date((job.acceptedAt.seconds || 0) * 1000);
        
        const diffSeconds = Math.floor((now.getTime() - acceptedAt.getTime()) / 1000);
        const remaining = 600 - diffSeconds;

        if (remaining <= 0) {
          autoCancelJob(job.id, job.cyclistId, job.estimatedPrice || 15.00);
        } else {
          newTimeouts[job.id] = remaining;
        }
      });
      
      setSosTimeouts(newTimeouts);
    }, 1000);

    return () => clearInterval(interval);
  }, [activeJobs]);

  const [recentChats, setRecentChats] = useState<any[]>([]);

  const displayChats = React.useMemo(() => {
    const list = [...recentChats];
    
    activeJobs.forEach(job => {
        if (!user) return;
        const sortedIds = [user.uid, job.cyclistId].sort();
        const chatId = `direct_${sortedIds[0]}_${sortedIds[1]}`;
        if (!list.find(c => c.id === chatId)) {
            list.push({
                id: chatId,
                type: 'DIRECT',
                participants: [user.uid, job.cyclistId],
                otherPartyName: job.cyclistName || 'Ciclista',
                title: job.cyclistName || 'Ciclista',
                lastMessage: 'Attendi / In via di risoluzione',
                // eslint-disable-next-line react-hooks/purity
                lastMessageAt: job.updatedAt || job.createdAt || { seconds: Date.now() / 1000 },
                unreadCount: {}
            });
        }
    });

    return list.sort((a,b) => {
        const tA = Math.floor(a.lastMessageAt?.seconds || a.createdAt?.seconds || 0);
        const tB = Math.floor(b.lastMessageAt?.seconds || b.createdAt?.seconds || 0);
        return tB - tA;
    });
  }, [recentChats, activeJobs, user]);

  useEffect(() => {
    if (!user) return;
    const unsubChats = onSnapshot(
      query(
        collection(db, 'chats'),
        where('participants', 'array-contains', user.uid),
      ),
      (snapshot) => {
        const chats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        chats.sort((a: any, b: any) => (b.lastMessageAt?.seconds || 0) - (a.lastMessageAt?.seconds || 0));
        setRecentChats(chats);
        const totalUnread = chats.reduce((acc: number, chat: any) => {
          const nestedUnread = chat.unreadCount?.[user.uid] || 0;
          const flatUnread = chat[`unreadCount.${user.uid}`] || 0;
          return acc + nestedUnread + flatUnread;
        }, 0);
        setUnreadCount(totalUnread);
      },
      (error) => console.error('Error listening to chats:', error)
    );
    return () => unsubChats();
  }, [user]);

  const toggleAvailability = async () => {
    if (!user) return;
    try {
      const newStatus = !isAvailable;
      
      // OPTIMISTIC STORE UPDATE for LIVE feel across app (e.g. Map)
      if (profile) {
        useAuthStore.getState().setProfile({ ...profile, peerMechanicEnabled: newStatus, isOnline: newStatus });
      }

      const updateData: any = {
        peerMechanicEnabled: newStatus,
        isOnline: newStatus,
        updatedAt: serverTimestamp()
      };
      if (!newStatus) {
        updateData.lastLat = null;
        updateData.lastLng = null;
        updateData.location = null;
      }
      await updateDoc(doc(db, 'users', user.uid), updateData);
    } catch (e) {
      console.error(e);
      // Revert
      if (profile) {
        useAuthStore.getState().setProfile({ ...profile, peerMechanicEnabled: isAvailable, isOnline: isAvailable });
      }
      handleFirestoreError(e, OperationType.UPDATE, `users/${user.uid}`);
    }
  }

  const completeJob = async (jobId: string) => {
    if (!user) return;
    console.log('Completing job:', jobId);
    try {
      await updateDoc(doc(db, 'sosRequests', jobId), {
        status: 'IN_PROGRESS',
        mechanicConfirmed: true,
        updatedAt: serverTimestamp()
      });
      toast.error('Riparazione conclusa. In attesa della conferma del ciclista per sbloccare i fondi.');
    } catch (err) {
      console.error('Error completing job:', err);
      handleFirestoreError(err, OperationType.UPDATE, `sosRequests/${jobId}`);
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-white text-black   transition-colors duration-500 pt-safe pb-safe">
      <div className="flex-1 overflow-hidden relative">
        <AnimatePresence>
          {showNewSOSBanner && newSOS && (
            <motion.div 
               initial={{ opacity: 0, y: -100 }}
               animate={{ opacity: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.95 }}
               className="fixed top-6 left-6 right-6 z-[1000] bg-danger text-white p-6 rounded-[2.5rem] shadow-2xl border-4 border-white flex items-center justify-between gap-4"
            >
               <div className="flex items-center gap-4">
                 <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center animate-pulse shrink-0">
                    <AlertTriangle size={24} />
                 </div>
                 <div>
                    <h4 className="text-sm font-black uppercase tracking-tighter">Nuova Emergenza Vicina!</h4>
                    <p className="text-[10px] font-black opacity-80 uppercase italic tracking-widest">
                       {getFaultTypeTranslation(newSOS.faultType)}
                    </p>
                 </div>
               </div>
               <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setShowNewSOSBanner(false)}
                    className="p-3 bg-white/10 hover:bg-white/20 rounded-2xl transition-colors"
                  >
                     <X size={20} />
                  </button>
                  <button 
                    onClick={() => {
                        setShowNewSOSBanner(false);
                        setActiveTab('WORK');
                        // Scroll or focus logic if needed
                    }}
                    className="bg-white text-danger px-6 py-3 rounded-2xl font-black uppercase text-[10px] flex items-center gap-2"
                  >
                     Vedi <ArrowRight size={14}/>
                  </button>
               </div>
            </motion.div>
          )}
        </AnimatePresence>

        {activeTab === 'WORK' && (
            <div className="absolute inset-0 overflow-y-auto scroll-smooth bg-white text-black border border-grey/10 shadow-sm transition-colors z-20 pb-[calc(2rem+env(safe-area-inset-bottom)+110px)]">
                <div className="p-6 w-full max-w-7xl mx-auto space-y-6">
                    <div className="flex justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-grey/10">
                        <div>
                            <h2 className="text-xl font-black uppercase">Ciclista Esperto</h2>
                            <p className="text-sm font-bold text-grey">Disponibilità per emergenze</p>
                        </div>
                        <button 
                            onClick={toggleAvailability}
                            className={`p-4 rounded-2xl flex items-center justify-center transition-all shadow-lg active:scale-95 ${
                            isAvailable 
                                ? 'bg-green-500 text-white shadow-green-500/20' 
                                : 'bg-grey/10 text-grey shadow-black/5'
                            }`}
                        >
                            <Power size={24} />
                        </button>
                    </div>

                <div className="bg-white p-6 rounded-3xl shadow-sm border border-grey/10">
                    <h3 className="text-sm font-black uppercase text-grey mb-4">Guadagni e Statistiche</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-grey/5 p-4 rounded-2xl">
                            <p className="text-xs font-bold text-grey">Guadagni Totali</p>
                            <p className="text-2xl font-black text-accent mt-1">⚡{profile?.peerMechanicEarnings?.toFixed(0) || '0'}</p>
                        </div>
                        <div className="bg-grey/5 p-4 rounded-2xl">
                            <p className="text-xs font-bold text-grey">Interventi</p>
                            <p className="text-2xl font-black text-accent mt-1">{profile?.peerMechanicJobsCompleted || 0}</p>
                        </div>
                    </div>
                    <div className="mt-4">
                        <p className="text-xs font-bold text-grey mb-2">Competenze (Tariffa: ⚡{profile?.peerMechanicRate}/intervento)</p>
                        <div className="flex flex-wrap gap-2">
                            {profile?.peerMechanicSkills?.map((skill: string) => (
                                <span key={skill} className="bg-accent/10 text-accent px-3 py-1 rounded-full text-xs font-bold border border-accent/20">
                                    {skill}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <h3 className="text-sm font-black uppercase text-grey">Richieste Attive</h3>
                    {activeJobs.length === 0 && <p className="text-xs text-grey font-bold">Nessun lavoro attivo.</p>}
                    {activeJobs.map(job => (
                        <div key={job.id} className={`${job.status === 'COMPLETED' ? 'bg-green-50/50 border-green-200' : job.status === 'DISPUTED' ? 'bg-danger/10 border-danger/40' : 'bg-accent/10 border-accent/20'} border p-4 rounded-3xl relative overflow-hidden transition-colors`}>
                            <div className={`absolute top-0 right-0 ${job.status === 'COMPLETED' ? 'bg-green-500' : job.status === 'DISPUTED' ? 'bg-danger' : job.mechanicConfirmed ? 'bg-accent animate-pulse' : 'bg-accent'} text-white px-3 py-1 rounded-bl-xl font-black text-[10px] uppercase tracking-widest`}>
                                {job.status === 'COMPLETED' ? 'Completato' : job.status === 'DISPUTED' ? 'In Contestazione' : job.mechanicConfirmed ? 'Concluso' : 'In Corso'}
                            </div>
                            <div className="flex justify-between items-start">
                              <p className="font-bold">{getFaultTypeTranslation(job.faultType)}</p>
                              {sosTimeouts[job.id] !== undefined && (
                                <div className="flex items-center gap-1.5 px-3 py-1 bg-danger/10 border border-danger/20 rounded-full animate-pulse mr-16">
                                  <Clock size={12} className="text-danger" />
                                  <span className="text-[10px] font-black text-danger uppercase tracking-widest">
                                    {Math.floor(sosTimeouts[job.id] / 60)}:{(sosTimeouts[job.id] % 60).toString().padStart(2, '0')}
                                  </span>
                                </div>
                              )}
                            </div>
                            <p className="text-xs mt-2">{job.description}</p>
                            
                            {job.status === 'COMPLETED' ? (
                                <div className="mt-4 bg-white/50 p-3 rounded-2xl border border-green-100 italic">
                                    <p className="text-[10px] font-bold text-green-700 flex items-center gap-2">
                                        <Sparkles size={14} /> Completato. Presto i soldi verranno aggiunti al tuo wallet.
                                    </p>
                                </div>
                            ) : job.status === 'DISPUTED' ? (
                                <div className="mt-4 bg-white/50 p-3 rounded-2xl border border-danger/20 italic">
                                    <p className="text-[10px] font-bold text-danger flex items-center gap-2">
                                        <AlertTriangle size={14} /> Il ciclista ha contestato l'intervento. L'admin sta verificando la situazione.
                                    </p>
                                </div>
                            ) : (
                                <div className="mt-4 flex gap-2">
                                    <button className="flex-1 bg-white border border-accent/20 text-accent py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2 active:scale-95 transition-all" onClick={() => setActiveTab('MAP')}>
                                        <Navigation2 size={14} /> Mappa
                                    </button>
                                    <button className="flex-1 bg-white border border-accent/20 text-accent py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2 active:scale-95 transition-all" onClick={() => {
                                        const sortedIds = [user?.uid, job.cyclistId].sort();
                                        const chatId = `direct_${sortedIds[0]}_${sortedIds[1]}`;
                                        setDirectChat({ id: chatId, name: job.cyclistName || 'Ciclista' });
                                        setShowChat(true);
                                        setActiveTab('CHAT');
                                    }}>
                                        <MessageSquare size={14} /> Chat
                                    </button>
                                    <button 
                                      className={`flex-1 ${job.mechanicConfirmed ? 'bg-grey/10 text-grey cursor-default' : 'bg-accent text-white shadow-lg shadow-accent/20'} py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2 active:scale-95 transition-all`} 
                                      onClick={() => !job.mechanicConfirmed && completeJob(job.id)}
                                      disabled={job.mechanicConfirmed}
                                    >
                                        {job.mechanicConfirmed ? (
                                          <><Clock size={14} className="animate-pulse" /> In attesa di conferma dal ciclista</>
                                        ) : (
                                          <><CheckCircle2 size={14} /> Completa</>
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <div className="space-y-4">
                    <h3 className="text-sm font-black uppercase text-grey">Nelle vicinanze ({profile?.peerMechanicRadius || 10} km)</h3>
                    {allPendingJobs.length === 0 && <p className="text-xs text-grey font-bold">Nessuna emergenza in zona.</p>}
                    {/* Simplified mapping for new jobs */}
                    {allPendingJobs.filter(j => j.status === 'PENDING').map(job => (
                         <div key={job.id} className="bg-white p-4 rounded-3xl shadow-sm border border-grey/10">
                            <div className="flex justify-between items-start">
                              <p className="font-bold">{getFaultTypeTranslation(job.faultType)}</p>
                              <span className="text-accent font-black text-xs bg-accent/10 px-2 py-1 rounded-lg">⚡{job.estimatedPrice || 15} DBC</span>
                            </div>
                            <p className="text-xs mt-2">{job.description}</p>
                            <button className="w-full mt-4 bg-primary text-white py-3 rounded-xl text-xs font-bold uppercase transition-transform active:scale-95" onClick={async () => {
                                try {
                                    await runTransaction(db, async (transaction) => {
                                      const sosRef = doc(db, 'sosRequests', job.id);
                                      const sosSnap = await transaction.get(sosRef);
                                      if (!sosSnap.exists() || sosSnap.data().status !== 'PENDING') {
                                         throw new Error('SOS already accepted or invalid');
                                      }
                                      
                                      const sortedIds = [user?.uid, job.cyclistId].sort();
                                      const chatId = `direct_${sortedIds[0]}_${sortedIds[1]}`;
                                      const chatRef = doc(db, 'chats', chatId);

                                      transaction.update(sosRef, {
                                          mechanicId: user?.uid,
                                          mechanicName: profile?.name || user?.displayName || 'Peer Mechanic',
                                          status: 'ACCEPTED',
                                          acceptedAt: serverTimestamp(),
                                          updatedAt: serverTimestamp()
                                      });

                                      transaction.set(chatRef, {
                                          participants: [user?.uid, job.cyclistId],
                                          type: 'DIRECT',
                                          updatedAt: serverTimestamp()
                                      }, { merge: true });
                                    });
                                    toast.error(t('mechanic.jobAccepted', { defaultValue: 'Richiesta accettata con successo! Il ciclista è stato informato.' }));
                                } catch(e: any) {
                                  if (e.message === 'SOS already accepted or invalid') {
                                     toast.error("Questa richiesta SOS è già stata presa in carico da un altro utente.");
                                  } else {
                                     handleFirestoreError(e, OperationType.UPDATE, `sosRequests/${job.id}`);
                                  }
                                }
                            }}>
                                Accetta Intervento
                            </button>
                        </div>
                    ))}
                </div>
                </div>
            </div>
        )}
        {activeTab === 'MAP' && (
           <>
            <BicycleMap 
              onStartChat={startDirectChat} 
              onViewReportDetails={(report) => setSelectedReport(report)}
            />
            <div className="absolute top-[calc(env(safe-area-inset-top)+1rem)] right-4 z-40 flex flex-col gap-3">
              <button 
                onClick={() => setActiveTab('COMMUNITY')}
                className="bg-primary text-black p-3 rounded-2xl shadow-xl shadow-primary/30 flex justify-center items-center hover:scale-105 active:scale-95 transition-all outline-none"
                title={t('nav.social', { defaultValue: 'Community' })}
              >
                <Bike size={24} />
              </button>
              <button 
                onClick={() => setShowAIDoctor(true)}
                className="bg-accent text-white p-3 rounded-2xl shadow-xl shadow-accent/30 flex justify-center items-center hover:scale-105 active:scale-95 transition-all outline-none relative group"
                title={t('ai.assistant', { defaultValue: 'AI Assistant' })}
              >
                <Sparkles size={24} />
              </button>
            </div>
           </>
        )}
        {activeTab === 'COMMUNITY' && (
            <motion.div 
               key="community-tab" 
               initial={{ opacity: 0 }} 
               animate={{ opacity: 1 }} 
               exit={{ opacity: 0 }} 
               className="absolute inset-0 z-10 bg-white text-black"
            >
                <SocialView onStartChat={startDirectChat} />
                <div className="absolute top-[calc(env(safe-area-inset-top)+1rem)] right-4 z-40 flex flex-col gap-3">
                  <button 
                    onClick={() => setShowAIDoctor(true)}
                    className="bg-accent text-white p-3 rounded-2xl shadow-xl shadow-accent/30 flex justify-center items-center hover:scale-105 active:scale-95 transition-all outline-none relative group"
                    title={t('ai.assistant', { defaultValue: 'AI Assistant' })}
                  >
                    <Sparkles size={24} />
                  </button>
                </div>
            </motion.div>
        )}
        {activeTab === 'PROFILE' && (
            <motion.div 
              key="profile-tab" 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="absolute inset-0 overflow-y-auto scroll-smooth bg-white text-black border border-grey/10 shadow-sm pb-[calc(2rem+env(safe-area-inset-bottom)+110px)] transition-colors z-20"
            >
              <ProfileView isAvailable={isAvailable} onToggleAvailability={toggleAvailability} />
            </motion.div>
        )}
        {activeTab === 'CHAT' && (
            <motion.div key="chat-tab" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-20 flex flex-col bg-white  pb-[110px]">
              {directChat ? (
                <ChatHeader 
                  chatId={directChat.id} 
                  defaultName={directChat.name} 
                  onBack={() => {
                    setDirectChat(null);
                    setShowChat(false);
                  }} 
                  onViewProfile={setViewProfileId}
                />
              ) : (
                <div className="bg-primary p-4 flex items-center gap-4 text-black  transition-colors">
                  <h3 className="font-bold text-black  transition-colors">{t('nav.chat')}</h3>
                </div>
              )}
              <div className="flex-1 overflow-hidden relative">
                {directChat ? (
                  <Chat
                    chatId={directChat.id}
                    otherPartyName={directChat.name}
                  />
                ) : (
                  <div className="h-full overflow-y-auto">
                    <ChatListView 
                      chats={displayChats}
                      currentUserId={user?.uid || ''}
                      onSelectChat={(chat: any) => setDirectChat({ id: chat.id, name: chat.fetchedProfileName || chat.otherPartyName || chat.title || 'Chat' })}
                    />
                  </div>
                )}
              </div>
            </motion.div>
        )}
      </div>

      <nav className="absolute bottom-0 left-0 right-0 bg-white/95  backdrop-blur-2xl border-t border-grey/5  pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] z-50 transition-all shadow-[0_-10px_40px_-5px_rgba(0,0,0,0.05)]">
        <div className="flex items-center justify-between px-1 sm:px-4 max-w-xl mx-auto relative">
          {/* Left Side (Flex 1) */}
          <div className="flex-1 flex justify-around items-center">
              <NavButton active={activeTab === 'MAP'} icon={<Navigation2 />} label={t('map.locate')} onClick={() => { setShowChat(false); setActiveTab('MAP'); }} />
              <NavButton active={activeTab === 'WORK'} icon={<Wrench />} label={t('mechanic.work')} onClick={() => { setShowChat(false); setActiveTab('WORK'); }} />
          </div>
          
          {/* Center Area Fixed */}
          <div className="w-16 sm:w-20 flex-shrink-0 flex justify-center relative -mt-12 z-10 group">
              <button 
                onClick={toggleAvailability}
                className={`w-16 h-16 rounded-[3rem] flex items-center justify-center shadow-2xl transition-all duration-500 active:scale-95 ${isAvailable ? 'bg-primary text-white scale-110 shadow-primary/40 ring-4 ring-primary/20' : 'bg-white text-black text-grey shadow-none border border-grey/10'}`}
              >
                {isAvailable ? <Bike className="animate-bounce" size={28} /> : <Power size={28} />}
              </button>
              <div className={`absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity ${isAvailable ? 'bg-primary text-white' : 'bg-grey text-white'}`}>
                {isAvailable ? t('mechanic.online') : t('mechanic.offline')}
              </div>
          </div>

          {/* Right Side (Flex 1) */}
          <div className="flex-1 flex justify-around items-center">
              <NavButton 
                active={activeTab === 'CHAT' || showChat} 
                icon={<MessageSquare />} 
                label={t('nav.chat')} 
                onClick={() => { setDirectChat(null); setShowChat(false); setActiveTab('CHAT'); }} 
                badge={unreadCount > 0 ? unreadCount : undefined}
              />
              <NavButton active={activeTab === 'PROFILE'} icon={<User />} label={t('nav.profile')} onClick={() => { setShowChat(false); setActiveTab('PROFILE'); }} />
          </div>
        </div>
      </nav>
      <PublicProfileModal userId={viewProfileId as string} onClose={() => setViewProfileId(null)} />
      <AnimatePresence>
        {selectedReport && (
          <RoadReportDetailModal 
            report={selectedReport} 
            onClose={() => setSelectedReport(null)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

type TabType = 'WORK' | 'MAP' | 'PROFILE' | 'CHAT' | 'COMMUNITY';

function NavButton({ active, icon, label, onClick, badge }: { active: boolean, icon: React.ReactNode, label: string, onClick?: () => void, badge?: number }) {
  return (
    <motion.button 
      whileTap={{ scale: 0.9 }}
      onClick={onClick} 
      className={`flex flex-col items-center justify-center py-2 px-1 sm:px-2 gap-1 relative flex-1 min-w-0 ${active ? 'text-primary' : 'text-grey hover:text-black'}`}
    >
      <div className="relative flex-shrink-0 mb-0.5">
        <motion.div
           animate={{ y: active ? -4 : 0, scale: active ? 1.1 : 1 }}
           transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        >
          {React.cloneElement(icon as React.ReactElement<any>, { size: active ? 22 : 20, strokeWidth: active ? 2.5 : 2 })}
          {badge !== undefined && badge > 0 && (
            <div className="absolute -top-1.5 -right-2 w-4 h-4 bg-red-500 text-white text-[8px] font-black rounded-full flex items-center justify-center border-2 border-white shadow-sm">
               {badge > 9 ? '9+' : badge}
            </div>
          )}
        </motion.div>
      </div>
      <span className={`text-[8px] sm:text-[9px] font-black uppercase tracking-widest transition-opacity duration-300 truncate w-full text-center ${active ? 'opacity-100' : 'opacity-70'}`}>{label}</span>
      {active && (
        <motion.div 
          layoutId="navIndicator" 
          className="absolute -bottom-2 w-8 h-1 bg-primary rounded-t-full shadow-[0_-2px_8px_rgba(var(--color-primary),0.5)]" 
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        />
      )}
    </motion.button>
  );
}
