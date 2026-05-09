import React, { useState, useEffect, useRef } from 'react';
import { 
  Wrench, 
  Settings, 
  User, 
  MessageSquare, 
  Star, 
  TrendingUp, 
  CheckCircle2, 
  Navigation2,
  Clock,
  ArrowRight,
  Power,
  Bell,
  Bike,
  ArrowLeft,
  MapPin as MapIcon,
  Activity,
  DollarSign,
  Sparkles,
  Sun,
  Moon,
  Image as ImageIcon,
  AlertTriangle,
  X,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Logo } from './Logo';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, onSnapshot, doc, getDoc, updateDoc, serverTimestamp, arrayUnion, addDoc, setDoc, limit, orderBy, runTransaction, increment, getDocs } from 'firebase/firestore';
import { useAuthStore } from '../store/useAuthStore';
import { useThemeStore } from '../store/useThemeStore';
import { signOut } from 'firebase/auth';
import { Chat } from './Chat';
import { ProfileView } from './ProfileView';
import { Map as BicycleMap } from './Map';
import { RoadReportDetailModal } from './RoadReportDetailModal';
import { ChatListView } from './ChatListView';
import { ChatHeader } from './ChatHeader';
import { PublicProfileModal } from './PublicProfileModal';
import { useTranslation } from 'react-i18next';
import { soundService } from '../lib/sounds';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip,
  BarChart,
  Bar,
  Cell
} from 'recharts';

const MOCK_EARNINGS_DATA = [
  { day: 'Mon', amount: 45 },
  { day: 'Tue', amount: 80 },
  { day: 'Wed', amount: 65 },
  { day: 'Thu', amount: 120 },
  { day: 'Fri', amount: 90 },
  { day: 'Sat', amount: 150 },
  { day: 'Sun', amount: 130 },
];

const MOCK_ACTIVITY_DATA = [
  { name: 'SOS', value: 45, color: '#f59e0b' },
  { name: 'Maint', value: 30, color: '#0ea5e9' },
  { name: 'Check', value: 25, color: '#10b981' },
];

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

type TabType = 'STATS' | 'WORK' | 'PROFILE' | 'CHAT' | 'MAP';

export function MechanicHome() {
  const { user, profile, setQuotaError, setShowAIDoctor, userLocation: storeLocation } = useAuthStore();
  const { isDarkMode, toggleDarkMode } = useThemeStore();
  const [isAvailable, setIsAvailable] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('WORK');
  const [allPendingJobs, setAllPendingJobs] = useState<any[]>([]);
  const [activeJobs, setActiveJobs] = useState<any[]>([]);
  const [completedJobsList, setCompletedJobsList] = useState<any[]>([]);
  const [mechanicStatus, setMechanicStatus] = useState<string>('FREE');
  const [availabilityMsg, setAvailabilityMsg] = useState<any>(null);
  const [nearbyCyclistsCount, setNearbyCyclistsCount] = useState(0);
  const [showChat, setShowChat] = useState(false);
  const [viewProfileId, setViewProfileId] = useState<string | null>(null);
  const [directChat, setDirectChat] = useState<any>(null);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [mechanicData, setMechanicData] = useState(null as any);
  const [userLocation, setUserLocation] = useState<any>(null);
  const [recentChats, setRecentChats] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

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
  const [avgRating, setAvgRating] = useState<number>(5.0);
  const [totalReviews, setTotalReviews] = useState<number>(0);
  const [newSOS, setNewSOS] = useState(null as any);
  const [showNewSOSBanner, setShowNewSOSBanner] = useState(false);

  const effectiveLocation = userLocation || storeLocation;

  const filteredJobs = React.useMemo(() => {
    let jobs = allPendingJobs;
    const now = Date.now();

    if (effectiveLocation) {
      jobs = jobs.filter((job: any) => {
        if (!job.lat || !job.lng || !job.createdAt) return true;
        
        const dist = calculateDistance(effectiveLocation.lat, effectiveLocation.lng, job.lat, job.lng);
        const createdAt = job.createdAt?.toMillis?.() || job.createdAt?.seconds * 1000 || now;
        const elapsedMin = (now - createdAt) / 60000;
        const plan = profile?.plan || 'BASE';

        // TIERED DISPATCH LOGIC
        // 0-2 min: Dedicated to PRO within 50km
        if (elapsedMin < 2) {
          return plan === 'PRO' && dist <= 50;
        }
        // 2-4 min: Dedicated to PRO within 100km
        if (elapsedMin < 4) {
          return plan === 'PRO' && dist <= 100;
        }
        // 4-6 min: Visible to PRO and CLUB
        if (elapsedMin < 6) {
          return plan === 'PRO' || plan === 'CLUB';
        }
        // 6+ min: Visible to everyone
        return true;
      }).sort((a: any, b: any) => {
        const distA = calculateDistance(effectiveLocation.lat, effectiveLocation.lng, a.lat, a.lng);
        const distB = calculateDistance(effectiveLocation.lat, effectiveLocation.lng, b.lat, b.lng);
        return distA - distB;
      });
    }
    return jobs;
  }, [allPendingJobs, effectiveLocation, profile?.plan]);

  // Force re-filtering every minute to handle time-based escalation
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  const updateMechanicStatus = async (newStatus: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user?.uid), {
        mechanicStatus: newStatus,
        updatedAt: serverTimestamp()
      });
      setMechanicStatus(newStatus);
    } catch (e) {
      console.error('Error updating status:', e);
    }
  };

  const cancelJob = async (jobId: string) => {
    if (!user) return;
    if (!window.confirm(t('mechanic.confirmCancel'))) return;
    try {
      await updateDoc(doc(db, 'sosRequests', jobId), {
        status: 'PENDING',
        mechanicId: null,
        mechanicName: null,
        mechanicPhone: null,
        mechanicConfirmed: false,
        updatedAt: serverTimestamp(),
        logs: arrayUnion({
          action: 'MECHANIC_CANCELLED',
          timestamp: new Date().toISOString(),
          mechanicId: user.uid
        })
      });
      // If the mechanic was BUSY because of this job, set them back to FREE
      if (mechanicStatus === 'BUSY') {
        await updateDoc(doc(db, 'users', user.uid), {
          mechanicStatus: 'FREE',
          updatedAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error('Error cancelling job:', error);
      alert('Errore durante l\'annullamento.');
    }
  };

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
        transaction.update(userRef, {
          balance: increment(estimatedPrice || 15.00),
          updatedAt: serverTimestamp()
        });
        
        transaction.update(sosRef, {
          status: 'CANCELLED',
          cancelReason: 'TIMEOUT',
          paymentStatus: 'REFUNDED',
          updatedAt: serverTimestamp()
        });
      });
      alert('Un SOS è stato annullato per inattività.');
    } catch (e) {
      console.error('Auto-cancel failed:', e);
    }
  };

  useEffect(() => {
    const acceptedJobs = activeJobs.filter(j => j.status === 'ACCEPTED' && j.acceptedAt);
    if (acceptedJobs.length === 0) {
      setSosTimeouts({});
      return;
    }

    const interval = setInterval(() => {
      const now = new Date();
      const newTimeouts: Record<string, number> = {};
      
      acceptedJobs.forEach(job => {
        const acceptedAt = job.acceptedAt instanceof Date 
          ? job.acceptedAt 
          : new Date((job.acceptedAt?.seconds || 0) * 1000);
        
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

  const [selectedPreviewPhoto, setSelectedPreviewPhoto] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<any>(null);

  const startDirectChat = async (otherUserId: string, otherName: string) => {
    if (!user) return;
    const sortedIds = [user?.uid, otherUserId].sort();
    const chatId = `direct_${sortedIds[0]}_${sortedIds[1]}`;
    try {
      await setDoc(doc(db, 'chats', chatId), {
        participants: [user?.uid, otherUserId],
        type: 'DIRECT',
        createdAt: serverTimestamp()
      }, { merge: true });
      setDirectChat({ id: chatId, name: otherName });
      setActiveTab('CHAT');
      setShowChat(true);
    } catch (e) { console.error(e); }
  };
  const { t, i18n } = useTranslation();
  const getFaultTypeTranslation = (faultType: string | undefined) => {
    if (!faultType) return t('cyclist.other');
    const key = `cyclist.${faultType.toLowerCase().replace(/_([a-z])/g, (g) => g[1].toUpperCase())}`;
    return t(key);
  };

  const lastUpdateRef = useRef<number>(0);

  // 1. Listen for mechanic stats and profile
  useEffect(() => {
    if (!user) return;
    
    const unsubStats = onSnapshot(doc(db, 'mechanics', user.uid), (snapshot) => {
      if (snapshot.exists()) {
        setMechanicData(snapshot.data());
      }
      setQuotaError(false);
    }, (error) => {
      if (error.message.includes('Quota exceeded')) {
        console.warn('Firestore Quota exceeded (Mechanic stats)');
        setQuotaError(true);
      } else if (!auth.currentUser) {
        console.warn('Expected Auth sync error during logout: ', error);
      } else {
        handleFirestoreError(error, OperationType.GET, `mechanics/${user.uid}`);
      }
    });

    return () => unsubStats();
  }, [user, setQuotaError]);

  // 2. Listen for pending SOS requests (Dispatcher)
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
        // Optimization: only notify if free and available
        // Note: activeJobs.length dependency is handled by the hook deps
        if (change.type === 'added' && isAvailable && mechanicStatus === 'FREE' && activeJobs.length === 0) {
          const data = change.doc.data();
          
          if (profile?.notificationsEnabled) {
            soundService.play('INTERVENTION_MECHANIC');

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
      setQuotaError(false);
    }, (error) => {
      if (error.message.includes('Quota exceeded')) setQuotaError(true);
      else console.warn('Error listening to SOS requests:', error);
    });

    return () => unsubSos();
  }, [user, isAvailable, mechanicStatus, activeJobs.length, profile?.notificationsEnabled, setQuotaError, t]);

  // 3. Listen for user online status and location
  useEffect(() => {
    if (!user) return;
    
    const unsubUser = onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setIsAvailable(data.isOnline || false);
        setMechanicStatus(data.mechanicStatus || 'FREE');
        if (data.lastLat && data.lastLng) {
          setUserLocation({ lat: data.lastLat, lng: data.lastLng });
        }
      }
    }, (error) => {
      if (!error.message.includes('Quota exceeded')) {
        console.warn('Error listening to user profile:', error);
      }
    });

    return () => unsubUser();
  }, [user]);

  // 4. Listen for active and recently completed jobs
  useEffect(() => {
    if (!user) return;

    const activeQ = query(
      collection(db, 'sosRequests'), 
      where('mechanicId', '==', user.uid),
      where('status', 'in', ['ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'DISPUTED']),
      orderBy('createdAt', 'desc'),
      limit(20)
    );

    const unsubJobs = onSnapshot(activeQ, (snapshot) => {
      const jobs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Separate active from recently completed and reviewed
      const current = jobs.filter((j: any) => j.status !== 'COMPLETED' || !j.isReviewed);
      const finished = jobs.filter((j: any) => j.status === 'COMPLETED' && j.isReviewed).slice(0, 5);
      
      setActiveJobs(current);
      setCompletedJobsList(finished);
    }, (error) => {
      if (!error.message.includes('Quota exceeded') && auth.currentUser) {
        handleFirestoreError(error, OperationType.LIST, 'sosRequests (MECHANIC_JOBS)');
      }
    });

    return () => unsubJobs();
  }, [user]);

  // 5. Watch Position
  useEffect(() => {
    if (!user || (!isAvailable && activeJobs.length === 0)) return;

    const lastCoordsRef = useRef<{lat: number|null, lng: number|null}>({ lat: null, lng: null });

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ lat: latitude, lng: longitude });

        if (activeJobs.length > 0) {
          const now = Date.now();
          if (now - lastUpdateRef.current > 5000) {
            
            // Distance check
            const hasMovedSignificantly = () => {
              if (!lastCoordsRef.current.lat || !lastCoordsRef.current.lng) return true;
              const R = 6371e3;
              const lat1 = lastCoordsRef.current.lat * Math.PI/180;
              const lat2 = latitude * Math.PI/180;
              const deltaLat = (latitude-lastCoordsRef.current.lat) * Math.PI/180;
              const deltaLng = (longitude-lastCoordsRef.current.lng) * Math.PI/180;

              const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
                        Math.cos(lat1) * Math.cos(lat2) *
                        Math.sin(deltaLng/2) * Math.sin(deltaLng/2);
              const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
              return (R * c) > 5;
            };

            if (!hasMovedSignificantly() && (now - lastUpdateRef.current < 60000)) {
               return; // Skip if hasn't moved 5m and less than 1m elapsed
            }

            try {
              await updateDoc(doc(db, 'users', user.uid), {
                lastLat: latitude,
                lastLng: longitude,
                location: { lat: latitude, lng: longitude },
                updatedAt: serverTimestamp()
              });
              lastUpdateRef.current = now;
              lastCoordsRef.current.lat = latitude;
              lastCoordsRef.current.lng = longitude;
            } catch (e) {
              console.warn('Silent location update failure during job', e);
            }
          }
        }
      },
      (error) => {
        console.debug('Mechanic position tracking issue:', error.code);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 }
    );

    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, [user, isAvailable, activeJobs.length > 0]);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'users'),
      where('role', '==', 'CYCLIST'),
      where('isOnline', '==', true),
      limit(10)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      setNearbyCyclistsCount(snapshot.size);
    }, (error) => {
      if (!error.message.includes('Quota exceeded')) {
        console.warn('Error listening to nearby cyclists:', error);
      }
    });
    
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user?.uid),
      orderBy('lastMessageAt', 'desc'),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chats = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setRecentChats(chats);
      
      // Calculate total unread count
      const totalUnread = chats.reduce((acc: number, chat: any) => {
        return acc + (chat.unreadCount?.[user?.uid || ''] || 0);
      }, 0);
      setUnreadCount(totalUnread);
    }, (error) => {
       console.error('Error fetching chats', error);
    });

    return () => unsubscribe();
  }, [user]);

  // Handle Ratings calculation
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'reviews'),
      where('mechanicId', '==', user?.uid),
      limit(100)
    );
    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const ratings = snap.docs.map(d => d.data().rating || 0);
        const sum = ratings.reduce((a, b) => a + b, 0);
        setAvgRating(sum / ratings.length);
        setTotalReviews(ratings.length);
      } else {
        setAvgRating(5.0);
        setTotalReviews(0);
      }
    });
    return () => unsub();
  }, [user]);

  const toggleAvailability = async () => {
    if (!user) return;
    
    if (!isAvailable && (profile?.plan === 'MECHANIC_FREE' || (profile?.role === 'MECHANIC' && !profile?.plan))) {
      alert("Il piano FREE non permette di andare online. Attiva il piano BASE o superiore dal tuo Profilo per iniziare a ricevere richieste.");
      return;
    }

    try {
      const newStatus = !isAvailable;
      setIsAvailable(newStatus); // Optimistic update
      
      setAvailabilityMsg({text: newStatus ? 'ONLINE' : 'OFFLINE', isOnline: newStatus});
      setTimeout(() => setAvailabilityMsg(null), 3000);
      
      // Update both collections for consistency
      const userRef = doc(db, 'users', user?.uid);
      const mechanicRef = doc(db, 'mechanics', user?.uid);
      
      const userUpdate: any = {
        isOnline: newStatus,
        presenceStatus: newStatus ? 'ONLINE' : 'OFFLINE',
        lastSeenAt: serverTimestamp(),
      };
      if (!newStatus) {
        userUpdate.lastLat = null;
        userUpdate.lastLng = null;
        userUpdate.location = null;
      }
      await updateDoc(userRef, userUpdate);
      
      try {
        await updateDoc(mechanicRef, {
          isAvailable: newStatus
        });
      } catch (me) {
        // Doc might not exist
      }
    } catch (err) {
      console.error('Error updating availability:', err);
      setIsAvailable(!isAvailable); // Revert
    }
  };

  const acceptJob = async (jobId: string) => {
    if (!user) return;
    if (profile?.plan === 'MECHANIC_FREE' || (profile?.role === 'MECHANIC' && !profile?.plan)) {
      alert("Il piano FREE non permette di accettare richieste SOS. Attiva il piano BASE o superiore dal tuo Profilo.");
      return;
    }
    try {
      await runTransaction(db, async (transaction) => {
         const sosRef = doc(db, 'sosRequests', jobId);
         const sosSnap = await transaction.get(sosRef);
         if (!sosSnap.exists() || sosSnap.data().status !== 'PENDING') {
            throw new Error('SOS already accepted or invalid');
         }
         
         transaction.update(sosRef, {
            status: 'ACCEPTED',
            mechanicId: user?.uid,
            mechanicPlan: profile?.plan || 'BASE',
            acceptedAt: serverTimestamp(),
         });
         
          const sortedIds = [user?.uid, sosSnap.data().cyclistId].sort();
          const chatId = `direct_${sortedIds[0]}_${sortedIds[1]}`;
          const chatRef = doc(db, 'chats', chatId);
          transaction.set(chatRef, {
             participants: [user?.uid, sosSnap.data().cyclistId],
             lastMessage: t('mechanic.enRoute'),
             lastMessageAt: serverTimestamp(),
             updatedAt: serverTimestamp(),
             type: 'DIRECT'
          }, { merge: true });
      });

      const sortedIds = [user?.uid, activeJobs.length > 0 ? activeJobs[0].cyclistId : (await (await getDoc(doc(db, 'sosRequests', jobId))).data()?.cyclistId)].sort();
      const actualChatId = `direct_${sortedIds[0]}_${sortedIds[1]}`;

      await addDoc(collection(db, 'chats', actualChatId, 'messages'), {
        senderId: user?.uid,
        content: t('mechanic.enRoute') + "! " + (t('cyclist.eta', { minutes: '10' })),
        type: 'TEXT',
        createdAt: serverTimestamp(),
      });

      alert(t('mechanic.jobAccepted', { defaultValue: 'Richiesta accettata con successo! Il ciclista è stato informato.' }));
    } catch (error: any) {
      if (error.message === 'SOS already accepted or invalid') {
         alert("Questa richiesta SOS è già stata presa in carico da un altro meccanico.");
      } else {
         handleFirestoreError(error, OperationType.UPDATE, `sosRequests/${jobId}`);
      }
    }
  };

  const completeJob = async (jobId: string) => {
    if (!user) return;
    try {
      console.log('Marking job as completed by mechanic:', jobId);
      await updateDoc(doc(db, 'sosRequests', jobId), {
        mechanicConfirmed: true,
        status: 'IN_PROGRESS' // still technically open until cyclist confirms
      });
      // Do not clear the active job yet, we wait for cyclist response
      alert('Riparazione conclusa. In attesa della conferma del ciclista per sbloccare i fondi.');
    } catch (err) {
      console.error('Error completing job:', err);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-white overflow-hidden relative transition-colors duration-500">
      {/* New SOS Banner */}
      <AnimatePresence>
        {showNewSOSBanner && newSOS && (
          <motion.div initial={{ opacity: 0, y: -100 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -100 }} className="absolute top-0 left-0 right-0 z-[100] p-6 bg-accent text-white shadow-2xl flex flex-col gap-4 border-b border-white/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-accent shadow-lg animate-bounce">
                  <AlertTriangle size={24} strokeWidth={2.5}/>
                </div>
                <div>
                  <p className="text-[10px] font-black opacity-60 uppercase tracking-[0.2em] mb-0.5">Emergency Dispatch</p>
                  <h3 className="text-lg font-black uppercase tracking-tight leading-none">
                    {t('mechanic.availableJobs')}
                  </h3>
                </div>
              </div>
              <button onClick={() => setShowNewSOSBanner(false)}
                className="p-1 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X size={20}/>
              </button>
            </div>
            
            <div className="bg-white/10 rounded-2xl p-4 flex justify-between items-center border border-white/10">
              <div>
                <p className="text-[8px] font-black uppercase tracking-widest opacity-60 mb-1">Incoming Alert:</p>
                <p className="font-bold text-sm">{getFaultTypeTranslation(newSOS.faultType)}</p>
              </div>
              <button onClick={() => {
                  setShowNewSOSBanner(false);
                  setActiveTab('WORK');
                }}
                className="bg-white text-accent px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all"
              >
                {t('common.viewJob')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content Area */}
      <div className="flex-1 relative overflow-hidden">
        <AnimatePresence mode="wait">
          {showChat && directChat ? (
            <motion.div key="chat-job-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-30 flex flex-col bg-white  pb-[110px] transition-colors">
              <ChatHeader 
                chatId={directChat.id} 
                defaultName={directChat.name} 
                onBack={() => { 
                  setShowChat(false); 
                  setDirectChat(null); 
                }} 
                onViewProfile={setViewProfileId}
              />
              <Chat chatId={directChat.id} otherPartyName={directChat.name}/>
            </motion.div>
          ) : activeTab === 'PROFILE' ? (
            <motion.div key="profile" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 overflow-y-auto scroll-smooth bg-white z-20 pb-48">
              <div className="bg-primary p-4 flex items-center gap-4 text-black  sticky top-0 z-10 transition-colors">
                <button onClick={() => setActiveTab('WORK')} className="hover:bg-black/5 p-2 rounded-full transition-colors"><ArrowLeft size={24}/></button>
                <h3 className="font-bold">{t('profile.title')}</h3>
              </div>
              <ProfileView isAvailable={isAvailable} onToggleAvailability={toggleAvailability}/>
            </motion.div>
          ) : activeTab === 'CHAT' ? (
            <motion.div key="chat-tab" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-20 flex flex-col bg-white pb-[110px]">
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
                  <h3 className="font-bold text-sm text-black  transition-colors">{t('nav.chat')}</h3>
                </div>
              )}
              {directChat ? (
                <Chat chatId={directChat.id} otherPartyName={directChat.name}/>
              ) : (
                <ChatListView chats={displayChats} onSelectChat={(chat: any) => {
                    setDirectChat({ id: chat.id, name: chat.fetchedProfileName || chat.otherPartyName || chat.title || 'Chat' });
                  }}
                  currentUserId={user?.uid || ''}
                />
              )}
            </motion.div>
          ) : activeTab === 'MAP' ? (
            <motion.div key="map" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 pb-48">
               <BicycleMap 
                 onStartChat={startDirectChat}
                 onViewReportDetails={(report) => {
                   setSelectedReport(report);
                 }}
               />
            </motion.div>
          ) : activeTab === 'STATS' ? (
            <motion.div key="stats" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 overflow-y-auto p-6 bg-white pb-48">
              <div className="mb-8 flex items-start justify-between">
                <div>
                  <h2 className="text-3xl font-black text-primary">{t('mechanic.stats')}</h2>
                  <p className="text-sm font-bold text-grey italic">{t('mechanic.statsSubtitle')}</p>
                </div>
                <Logo size="sm" showText={false} className="opacity-80"/>
              </div>

              {/* Top Row Cards */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-primary text-white p-5 rounded-[2.5rem] shadow-xl shadow-primary/20">
                    <div className="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center text-accent mb-4">
                       <Zap size={20} className="fill-accent"/>
                    </div>
                    <p className="text-[10px] font-black opacity-60 uppercase tracking-widest leading-none mb-1">Guadagni DBC</p>
                    <p className="text-2xl font-black">⚡{(profile?.balance ?? mechanicData?.totalEarnings ?? 0).toFixed(0)}</p>
                    <div className="mt-2 flex items-center gap-1 text-[8px] font-bold opacity-60 uppercase">
                       Saldo Attuale
                    </div>
                  </motion.div>
                  
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white p-5 rounded-[2.5rem] shadow-sm border border-grey/5">
                     <div className="w-10 h-10 bg-accent/5 rounded-2xl flex items-center justify-center text-accent mb-4">
                        <Star size={20}/>
                     </div>
                     <p className="text-[10px] font-black text-grey uppercase tracking-widest leading-none mb-1">{t('mechanic.rating')}</p>
                     <p className="text-2xl font-black text-primary">{avgRating.toFixed(2)}</p>
                     <div className="mt-2 flex items-center gap-1 text-[8px] font-bold text-grey uppercase">
                        {t('mechanic.basedOnReviews', { count: totalReviews })}
                     </div>
                  </motion.div>
              </div>

              {/* Earnings Chart */}
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }} className="bg-white p-6 rounded-[3rem] shadow-sm border border-grey/5 mb-6">
                <div className="flex justify-between items-center mb-6">
                   <h3 className="text-xs font-black text-primary uppercase tracking-[0.2em]">{t('mechanic.earningsTrend')}</h3>
                   <span className="text-[10px] font-bold text-grey uppercase">{t('mechanic.last7Days')}</span>
                </div>
                
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={MOCK_EARNINGS_DATA}>
                      <defs>
                        <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/>
                      <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }} dy={10}/>
                      <YAxis hide/>
                      <Tooltip contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '10px', fontWeight: 'bold' }}/>
                      <Area type="monotone" dataKey="amount" stroke="#0ea5e9" strokeWidth={4} fillOpacity={1} fill="url(#colorAmount)"/>
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </motion.div>

              {/* Interventions by Type */}
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.25 }} className="bg-white p-6 rounded-[3rem] shadow-sm border border-grey/5 mb-6">
                <div className="flex justify-between items-center mb-6">
                   <h3 className="text-xs font-black text-primary uppercase tracking-[0.2em]">Tipologia Interventi</h3>
                   <span className="text-[10px] font-bold text-grey uppercase">Distribuzione</span>
                </div>
                
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={MOCK_ACTIVITY_DATA}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/>
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }} dy={10}/>
                      <YAxis hide/>
                      <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '10px', fontWeight: 'bold' }}/>
                      <Bar dataKey="value" radius={[10, 10, 0, 0]}>
                        {MOCK_ACTIVITY_DATA.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </motion.div>

              {/* Detailed Metrics List */}
              <div className="grid grid-cols-1 gap-4">
                 <div className="bg-white text-black p-6 rounded-[2.5rem] shadow-sm border border-grey/5  flex justify-between items-center transition-colors">
                    <div className="flex items-center gap-4">
                       <div className="w-12 h-12 bg-white text-black shadow-sm border border-grey/10 rounded-2xl flex items-center justify-center text-primary  transition-colors">
                          <CheckCircle2 size={24}/>
                       </div>
                       <div>
                          <p className="text-[10px] font-black text-grey  uppercase tracking-widest transition-colors">{t('mechanic.interventions')}</p>
                          <p className="text-xl font-black text-primary  transition-colors">{mechanicData?.completedJobs || 0}</p>
                       </div>
                    </div>
                    <div className="text-right">
                       <span className="text-[10px] font-bold text-accent uppercase">{t('mechanic.allTime')}</span>
                    </div>
                 </div>

                 <div className="bg-white text-black p-6 rounded-[2.5rem] shadow-sm border border-grey/5  flex justify-between items-center transition-colors">
                    <div className="flex items-center gap-4">
                       <div className="w-12 h-12 bg-white text-black shadow-sm border border-grey/10 rounded-2xl flex items-center justify-center text-primary  transition-colors">
                          <Clock size={24}/>
                       </div>
                       <div>
                          <p className="text-[10px] font-black text-grey  uppercase tracking-widest transition-colors">{t('mechanic.hoursOnline')}</p>
                          <p className="text-xl font-black text-primary  transition-colors">{mechanicData?.hoursOnline || 0}h</p>
                       </div>
                    </div>
                    <div className="text-right">
                       <span className="text-[10px] font-bold text-grey  uppercase transition-colors">{t('mechanic.monthlyAvg')}</span>
                    </div>
                 </div>

                 <div className="bg-white text-black p-6 rounded-[2.5rem] shadow-sm border border-grey/5  flex justify-between items-center transition-colors">
                    <div className="flex items-center gap-4">
                       <div className="w-12 h-12 bg-white text-black shadow-sm border border-grey/10 rounded-2xl flex items-center justify-center text-primary  transition-colors">
                          <Activity size={24}/>
                       </div>
                       <div>
                          <p className="text-[10px] font-black text-grey  uppercase tracking-widest transition-colors">{t('mechanic.satisfaction')}</p>
                          <p className="text-xl font-black text-primary  transition-colors">{mechanicData?.satisfaction || 100}%</p>
                       </div>
                    </div>
                    <div className="text-right">
                       <span className="bg-accent/10 text-accent text-[8px] font-black px-2 py-1 rounded uppercase">Premium</span>
                    </div>
                 </div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="work" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 overflow-y-auto pb-48">
              {/* Header */}
              <div className="bg-primary pt-12 pb-16 px-6 rounded-b-[3rem] relative transition-colors">
                <div className="flex justify-between items-center mb-6">
                  <div className="flex items-center gap-3">
                     <button onClick={() => setActiveTab('PROFILE')}
                       className="w-12 h-12 rounded-2xl border-2 border-white/50 overflow-hidden active:scale-95 transition-transform"
                     >
                        <img src={profile?.photoURL || user?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.uid}`} alt="Avatar" className="w-full h-full object-cover"/>
                     </button>
                      <div>
                        <h2 className="text-white font-black text-xl transition-colors">{t('common.hi')}, {user?.displayName || t('auth.mechanic')}!</h2>
                        <div className="flex items-center gap-3 mt-1">
                             <span className={`text-xs font-black uppercase tracking-[0.2em] transition-colors ${isAvailable ? 'text-accent' : 'text-white/70'}`}>
                               {isAvailable ? t('mechanic.online') : t('mechanic.offline')}
                             </span>
                        </div>
                      </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2 flex-1 sm:flex-none">
                     <button onClick={() => setActiveTab('CHAT')}
                       className="bg-white/10 p-2 rounded-xl text-white transition-all hover:bg-white/20 relative"
                     >
                        <MessageSquare size={20}/>
                        {unreadCount > 0 && (
                          <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[8px] font-black rounded-full flex items-center justify-center border-2 border-primary">
                            {unreadCount}
                          </div>
                        )}
                     </button>
                     <button onClick={() => setShowAIDoctor(true)}
                       className="bg-accent text-white p-2 rounded-xl transition-all shadow-lg shadow-accent/20"
                     >
                        <Sparkles size={20}/>
                     </button>
                     <button className="bg-white/10 p-2 rounded-xl text-white">
                        <Bell size={20}/>
                     </button>
                     <button onClick={() => i18n.changeLanguage(i18n.language === 'it' ? 'en' : 'it')}
                       className="bg-white/10 px-3 py-2 rounded-xl text-white font-bold text-xs"
                     >
                        {i18n.language === 'it' ? 'EN' : 'IT'}
                     </button>
                     <button onClick={() => signOut(auth)} className="bg-white/10 p-2 rounded-xl text-white transition-all hover:bg-white/20" title="Logout">
                        <Power size={20}/>
                     </button>
                  </div>
                </div>

                <div className="flex items-center gap-5 bg-white/10 border border-white/20 p-5 rounded-[2.5rem] shadow-inner">
                   <div className="flex -space-x-3">
                      {[1,2,3].map(i => (
                        <div key={i} className="w-10 h-10 rounded-full border-2 border-primary bg-grey overflow-hidden shadow-lg">
                          <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=cyclist-${i}`} alt="Cyclist" referrerPolicy="no-referrer" />
                        </div>
                      ))}
                   </div>
                   <div className="flex flex-col">
                      <span className="text-xs font-black italic text-white leading-none uppercase tracking-[0.22em]">{nearbyCyclistsCount} {t('mechanic.nearbyCyclists')}</span>
                      <span className="text-[9px] font-black text-accent uppercase tracking-[0.1em] mt-1.5">{t('mechanic.activeCommunity')}</span>
                   </div>
                </div>

                {/* Status Selector */}
                {isAvailable && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 flex gap-1.5">
                    {[
                      { id: 'FREE', label: t('mechanic.statusFree'), color: 'bg-accent' },
                      { id: 'BUSY', label: t('mechanic.statusBusy'), color: 'bg-danger' },
                      { id: 'TRAVELING', label: t('mechanic.statusTraveling'), color: 'bg-info' }
                    ].map(stat => (
                      <button key={stat.id} onClick={() => updateMechanicStatus(stat.id)}
                        className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all border-2 ${
                          mechanicStatus === stat.id 
                            ? `${stat.color} text-white border-white/20 shadow-md scale-[1.02]` 
                            : 'bg-white/10 text-white border-white/5 hover:bg-white/20'
                         }`}
                      >
                        {stat.label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </div>

              <div className="mt-4 px-6 pb-48 space-y-8">
                {/* Simplified List View */}
                <div className="space-y-4">
                  {/* ACCEPTED/IN_PROGRESS/COMPLETED JOBS */}
                  {activeJobs.map(job => (
                    <motion.div 
                      key={job.id}
                      layoutId={job.id}
                      whileHover={{ y: -2 }}
                      className={`${job.status === 'COMPLETED' ? 'bg-green-50 border-green-200 shadow-lg shadow-green-500/10' : job.status === 'DISPUTED' ? 'bg-danger/10 border-danger/40 shadow-lg shadow-danger/10' : 'bg-warning/10 border-warning/30 hover:shadow-xl hover:shadow-warning/20'} border-2 p-4 rounded-[2rem] relative overflow-hidden transition-all duration-300`}
                    >
                      <div className={`absolute top-0 right-0 ${job.status === 'COMPLETED' ? 'bg-green-500 text-white' : job.status === 'DISPUTED' ? 'bg-danger text-white' : job.mechanicConfirmed ? 'bg-accent animate-pulse text-white' : 'bg-warning text-primary'} px-3 py-1 rounded-bl-xl font-black text-[10px] uppercase tracking-widest`}>
                        {job.status === 'COMPLETED' ? 'Completato' : job.status === 'DISPUTED' ? 'In Contestazione' : job.mechanicConfirmed ? 'Lavori Finiti' : t('mechanic.activeJob')}
                      </div>
                      
                      <div className="flex justify-between items-start">
                        <div className="flex gap-3">
                          <div className={`w-10 h-10 ${job.status === 'COMPLETED' ? 'bg-green-500 text-white' : job.status === 'DISPUTED' ? 'bg-danger text-white' : 'bg-warning text-primary'} rounded-xl flex items-center justify-center`}>
                            {job.status === 'COMPLETED' ? <CheckCircle2 size={24} /> : job.status === 'DISPUTED' ? <AlertTriangle size={24} /> : <Bike size={24} />}
                          </div>
                          <div>
                            <h4 className="font-black text-primary text-sm uppercase leading-tight">{getFaultTypeTranslation(job.faultType)}</h4>
                            <div className="flex items-center gap-2 mt-0.5">
                              <p className="text-[10px] font-bold text-primary/60 uppercase">
                                {job.status === 'COMPLETED' ? 'Fondi in sblocco' : job.status === 'DISPUTED' ? 'In Revisione Admin' : t('mechanic.activeJob')}
                              </p>
                              {job.cyclistId && (
                                <button 
                                  onClick={() => setViewProfileId(job.cyclistId)}
                                  className="text-[9px] font-black text-accent uppercase underline underline-offset-2 hover:text-accent/80 transition-colors"
                                >
                                  Vedi Ciclista
                                </button>
                              )}
                            </div>
                            {job.description && (
                              <p className="text-[10px] text-primary/80 mt-1 line-clamp-2">{job.description}</p>
                            )}
                          </div>
                        </div>
                        <div className={`${job.status === 'COMPLETED' ? 'bg-green-100 text-green-700' : job.status === 'DISPUTED' ? 'bg-danger/20 text-danger' : 'bg-warning text-primary'} px-2 py-1 rounded-lg text-[10px] font-black`}>
                           ⚡{job.estimatedPrice || 45} DBC
                        </div>
                      </div>

                      {/* Photos Gallery */}
                      {job.photos && job.photos.length > 0 && (
                        <div className="mt-4">
                          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                            {job.photos.map((photo: string, idx: number) => (
                              <button 
                                key={idx}
                                onClick={() => setSelectedPreviewPhoto(photo)}
                                className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 border border-black/5"
                              >
                                <img src={photo} alt="Bike" className="w-full h-full object-cover" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {job.status === 'COMPLETED' ? (
                        <div className="mt-4 bg-white/50 p-3 rounded-2xl border border-green-100 italic">
                          <p className="text-[10px] font-bold text-green-700 flex items-center gap-2">
                             <Sparkles size={14} className="fill-green-700" /> Completato. Presto i soldi verranno aggiunti al tuo wallet.
                          </p>
                        </div>
                      ) : job.status === 'DISPUTED' ? (
                        <div className="mt-4 bg-white/50 p-3 rounded-2xl border border-danger/20 italic">
                          <p className="text-[10px] font-bold text-danger flex items-center gap-2">
                             <AlertTriangle size={14} className="fill-danger" /> Il ciclista ha contestato l'intervento. L'admin sta verificando la situazione.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2 mt-4">
                          <div className="flex gap-2">
                            <button 
                              onClick={() => {
                                setDirectChat({ id: job.id, name: job.cyclistName || t('auth.cyclist') });
                                setShowChat(true);
                              }}
                              className="flex-1 bg-white/50 py-2.5 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black uppercase border border-warning/20"
                            >
                              <MessageSquare size={14} /> Chat
                            </button>
                            <button 
                              onClick={() => !job.mechanicConfirmed && completeJob(job.id)}
                              disabled={job.mechanicConfirmed}
                              className={`flex-1 ${job.mechanicConfirmed ? 'bg-grey/10 text-grey cursor-default' : 'bg-warning text-primary shadow-lg shadow-warning/20'} py-2.5 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black uppercase transition-all`}
                            >
                              {job.mechanicConfirmed ? (
                                <><Clock size={14} className="animate-pulse" /> IN ATTESA</>
                              ) : (
                                <><CheckCircle2 size={14} /> {t('mechanic.complete')}</>
                              )}
                            </button>
                          </div>
                          
                          {(job.status === 'ACCEPTED' || job.status === 'IN_PROGRESS') && (
                            <button 
                              onClick={() => cancelJob(job.id)}
                              className="w-full py-2 text-[9px] font-black uppercase tracking-widest text-primary/40 hover:text-red-500 transition-colors"
                            >
                              Annulla e Rilascia Richiesta
                            </button>
                          )}
                        </div>
                      )}
                    </motion.div>
                  ))}

                  {/* AVAILABLE JOBS (RED) */}
                  {isAvailable && filteredJobs.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-xs font-black text-danger uppercase tracking-[0.2em] px-2">{t('mechanic.availableJobs')}</h3>
                      {filteredJobs.map(job => (
                        <motion.div 
                          key={job.id}
                          layout
                          whileHover={{ y: -2 }}
                          whileTap={{ scale: 0.98 }}
                          className="bg-danger/5 hover:bg-danger/10 border-2 border-danger/20 hover:border-danger/40 hover:shadow-xl hover:shadow-danger/10 p-4 rounded-[2rem] flex flex-col group transition-all duration-300 cursor-pointer"
                          onClick={() => setExpandedJobId(expandedJobId === job.id ? null : job.id)}
                        >
                          <div className="flex justify-between items-center cursor-pointer active:scale-95 transition-all">
                            <div className="flex gap-3">
                              <div className="w-10 h-10 bg-danger text-white rounded-xl flex items-center justify-center shadow-lg shadow-danger/20 shrink-0">
                                <AlertTriangle size={20} />
                              </div>
                              <div>
                                <h4 className="font-black text-black text-sm uppercase leading-tight">{getFaultTypeTranslation(job.faultType)}</h4>
                                <p className="text-[10px] font-bold text-grey uppercase flex items-center gap-1">
                                  <MapIcon size={10} /> {job.lat && job.lng && effectiveLocation ? calculateDistance(effectiveLocation.lat, effectiveLocation.lng, job.lat, job.lng).toFixed(1) + ' km' : t('common.nearYou')}
                                  <span className="mx-1">•</span>
                                  <span className="text-accent flex items-center">⚡{job.estimatedPrice || 15} DBC</span>
                                </p>
                              </div>
                            </div>
                            <div className="bg-danger text-white px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider shrink-0">
                              {expandedJobId === job.id ? 'Chiudi' : 'Dettagli'}
                            </div>
                          </div>
                          
                          <AnimatePresence>
                            {expandedJobId === job.id && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="mt-4 pt-4 border-t border-danger/10 space-y-4">
                                  {job.description && (
                                    <div>
                                      <h5 className="text-[10px] font-black uppercase text-grey tracking-widest mb-1">Descrizione</h5>
                                      <p className="text-sm font-bold text-black">{job.description}</p>
                                    </div>
                                  )}
                                  
                                  {job.photos && job.photos.length > 0 && (
                                    <div>
                                       <h5 className="text-[10px] font-black uppercase text-grey tracking-widest mb-2">Foto</h5>
                                       <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                          {job.photos.map((photo: string, idx: number) => (
                                            <button 
                                              key={idx}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedPreviewPhoto(photo);
                                              }}
                                              className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 border border-black/5"
                                            >
                                              <img src={photo} alt="Danno" className="w-full h-full object-cover" />
                                            </button>
                                          ))}
                                       </div>
                                    </div>
                                  )}

                                  <div className="flex gap-2 isolate pt-2">
                                     <button
                                       onClick={(e) => {
                                         e.stopPropagation();
                                         acceptJob(job.id);
                                       }}
                                       className="flex-1 bg-danger text-white py-3 rounded-xl text-xs font-black uppercase tracking-wider active:scale-95 transition-transform"
                                     >
                                       {t('mechanic.accept')}
                                     </button>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      ))}
                    </div>
                  )}

                  {/* COMPLETED JOBS (GREEN) */}
                  {completedJobsList.length > 0 && (
                    <div className="space-y-3 pt-4 opacity-70">
                      <h3 className="text-xs font-black text-accent uppercase tracking-[0.2em] px-2">Interventi Conclusi</h3>
                      {completedJobsList.map(job => (
                        <div key={job.id} className="bg-accent/5 border-2 border-accent/20 p-4 rounded-3xl flex justify-between items-center bg-white">
                          <div className="flex gap-3">
                            <div className="w-10 h-10 bg-accent text-white rounded-xl flex items-center justify-center">
                              <CheckCircle2 size={20} />
                            </div>
                            <div>
                              <h4 className="font-black text-black text-sm uppercase leading-tight">{getFaultTypeTranslation(job.faultType)}</h4>
                              <p className="text-[10px] font-bold text-grey uppercase">Concluso {new Date(job.createdAt?.seconds * 1000).toLocaleDateString()}</p>
                            </div>
                          </div>
                          <div className="text-xl font-black text-accent">⚡{job.estimatedPrice || 45}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* No active/available jobs state */}
                  {!activeJobs.length && !filteredJobs.length && !completedJobsList.length && (
                    <div className="py-24 text-center">
                       <div className="w-20 h-20 bg-primary/5 rounded-[2rem] flex items-center justify-center mx-auto mb-4">
                          <Activity size={32} className="text-primary/20" />
                       </div>
                       <p className="text-sm font-bold text-grey uppercase tracking-widest">{t('mechanic.noJobs')}</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation Bottom */}
      <div className="absolute bottom-0 left-0 right-0 bg-white/95 backdrop-blur-2xl border-t border-grey/5 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] z-50 transition-all shadow-[0_-10px_40px_-5px_rgba(0,0,0,0.05)]">
        <div className="flex items-center justify-between px-1 sm:px-4 max-w-xl mx-auto relative">
          <div className="flex-1 flex justify-around items-center">
            <NavButton active={activeTab === 'STATS'} icon={<TrendingUp />} label={t('mechanic.stats')} onClick={() => setActiveTab('STATS')} />
            <NavButton active={activeTab === 'MAP'} icon={<MapIcon />} label="Mappa" onClick={() => { setShowChat(false); setActiveTab('MAP'); }} />
            <NavButton active={activeTab === 'WORK'} icon={<Wrench />} 
              label={t('mechanic.work')} 
              onClick={() => { setShowChat(false); setActiveTab('WORK'); }} 
              badge={isAvailable && filteredJobs.length > 0 ? filteredJobs.length : undefined}
            />
          </div>
          
          <div className="w-16 sm:w-20 flex-shrink-0 flex justify-center relative -mt-12 z-20 group">
            {(profile?.plan === 'MECHANIC_FREE' || (profile?.role === 'MECHANIC' && !profile?.plan)) ? (
              <div className="w-16 h-16 rounded-[2rem] flex items-center justify-center bg-grey/10 text-grey/40 border border-grey/20 z-20 relative shadow-inner cursor-not-allowed" title="Attiva un piano dal profilo per andare online">
                <Power size={28} />
              </div>
            ) : (
              <button onClick={toggleAvailability} className={`w-16 h-16 rounded-[2rem] flex items-center justify-center shadow-xl transition-all duration-500 active:scale-95 z-20 relative ${isAvailable ? 'bg-primary text-white scale-110 shadow-primary/40 ring-4 ring-primary/20' : 'bg-grey/20  text-grey  shadow-none border border-white/5 rotate-45'}`}>
                <Power size={28} className={isAvailable ? 'animate-pulse' : ''} />
              </button>
            )}

            <AnimatePresence>
              {availabilityMsg && (
                <motion.div initial={{ opacity: 0, y: 20, scale: 0.8 }} animate={{ opacity: 1, y: -24, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.8 }} className={`absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-lg border border-white/20 z-10 ${availabilityMsg.isOnline ? 'bg-primary text-white shadow-primary/30' : 'bg-danger text-white shadow-danger/30'}`}>
                  {availabilityMsg.text}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex-1 flex justify-around items-center">
            <NavButton active={activeTab === 'CHAT'} icon={<MessageSquare />} 
              label={t('nav.chat')} 
              onClick={() => { setDirectChat(null); setShowChat(false); setActiveTab('CHAT'); }} 
              badge={unreadCount > 0 ? unreadCount : undefined}
            />
            <NavButton active={activeTab === 'PROFILE'} icon={<User />} label={t('nav.profile')} onClick={() => { setShowChat(false); setActiveTab('PROFILE'); }} />
          </div>
        </div>
      </div>
      <PublicProfileModal userId={viewProfileId as string} onClose={() => setViewProfileId(null)} />
      <RoadReportDetailModal report={selectedReport} onClose={() => setSelectedReport(null)} />

      {/* Photo Preview Overlay */}
      <AnimatePresence>
        {selectedPreviewPhoto && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 backdrop-blur-sm"
            onClick={() => setSelectedPreviewPhoto(null)}
          >
            <button className="absolute top-8 right-8 text-white p-2 hover:bg-white/10 rounded-full transition-colors focus:outline-none">
              <X size={32} />
            </button>
            <motion.img 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              src={selectedPreviewPhoto} 
              alt="Preview" 
              className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

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

