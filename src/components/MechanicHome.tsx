import toast from 'react-hot-toast';
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
  AlertTriangle,
  X,
  Zap,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Logo } from './Logo';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { isFirestoreQuotaError } from '../lib/firestoreErrors';
import { safeStorage } from '../lib/storage';
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
import { KYCVerification } from './KYCVerification';
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

type TabType = 'WORK' | 'PROFILE' | 'CHAT' | 'MAP';

export function MechanicHome() {
  const { user, profile, setQuotaError, setShowAIDoctor, userLocation: storeLocation } = useAuthStore();
  const { isDarkMode, toggleDarkMode } = useThemeStore();
  const [activeTab, setActiveTab] = useState<TabType>('WORK');
  const [allPendingJobs, setAllPendingJobs] = useState<any[]>([]);
  const [activeJobs, setActiveJobs] = useState<any[]>([]);
  const [completedJobsList, setCompletedJobsList] = useState<any[]>([]);
  const [isAvailable, setIsAvailable] = useState(profile?.isOnline || false);
  const [loadingJobId, setLoadingJobId] = useState<string | null>(null);
  const [availabilityMsg, setAvailabilityMsg] = useState<{text: string, isOnline: boolean} | null>(null);
  const [nearbyCyclistsCount, setNearbyCyclistsCount] = useState(0);
  const [showChat, setShowChat] = useState(false);
  const [viewProfileId, setViewProfileId] = useState<string | null>(null);
  const [directChat, setDirectChat] = useState<any>(null);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [mechanicData, setMechanicData] = useState(null as any);
  const [mechanicStatus, setMechanicStatus] = useState<string>(profile?.mechanicStatus || 'FREE');
  const [userLocation, setUserLocation] = useState<any>(null);
  const [recentChats, setRecentChats] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showStats, setShowStats] = useState(false);
  const [userSupportTicket, setUserSupportTicket] = useState<any | null>(null);
  const [earningsData, setEarningsData] = useState<any[]>([]);
  const [activityData, setActivityData] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
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
  }, [user]);

  // Listen for mechanic transactions to build real earnings chart
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'transactions'),
      where('toId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const unsub = onSnapshot(q, (snap) => {
      const txs: any[] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      // Build last 7 days earnings
      const days = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
      const now = new Date();
      const dailyEarnings: Record<string, number> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        dailyEarnings[key] = 0;
      }
      
      txs.forEach(tx => {
        if (tx.createdAt?.seconds) {
          const date = new Date(tx.createdAt.seconds * 1000);
          const key = date.toISOString().split('T')[0];
          if (dailyEarnings[key] !== undefined) {
            dailyEarnings[key] += tx.amount || 0;
          }
        }
      });

      const chartData = Object.entries(dailyEarnings).map(([date, amount]) => ({
        day: days[new Date(date).getDay()],
        amount: Math.round(amount)
      }));
      setEarningsData(chartData);

      // Build activity breakdown from completed SOS
      const sosCount = txs.filter(tx => tx.type === 'ADMIN_DISPUTE_RELEASE' || tx.type === 'SOS_RELEASE').length;
      const refundCount = txs.filter(tx => tx.type?.includes('REFUND')).length;
      const otherCount = txs.filter(tx => !tx.type?.includes('RELEASE') && !tx.type?.includes('REFUND')).length;
      setActivityData([
        { name: 'SOS', value: Math.max(sosCount, 1), color: '#f59e0b' },
        { name: 'Rimborsi', value: Math.max(refundCount, 0), color: '#0ea5e9' },
        { name: 'Altro', value: Math.max(otherCount, 0), color: '#10b981' },
      ]);
    });
    return unsub;
  }, [user]);

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
  const [avgRating, setAvgRating] = useState<number>(5.0);
  const [totalReviews, setTotalReviews] = useState<number>(0);
  const [newSOS, setNewSOS] = useState(null as any);
  const [showNewSOSBanner, setShowNewSOSBanner] = useState(false);

  const effectiveLocation = userLocation || storeLocation;

  const filteredJobs = React.useMemo(() => {
    let jobs = allPendingJobs;
    const now = Date.now();

    if (effectiveLocation) {
      jobs = jobs.filter((job: { lat?: number; lng?: number; createdAt?: any; estimatedPrice?: number }) => {
        if (!job.lat || !job.lng || !job.createdAt) return true;
        
        const createdAt = job.createdAt?.toMillis?.() || job.createdAt?.seconds * 1000 || now;
        const plan = profile?.plan || 'BASE';
        const role = profile?.role || 'CYCLIST';
        
        // HIGH-PRECISION TIERED DISPATCH (Seconds-based)
        const elapsedSec = (now - createdAt) / 1000;
        
        // 1. PRO see it immediately
        if (plan === 'PRO') return true;
        
        // 2. CLUB and EXPERT CYCLISTS (Peer) see it after 8 seconds
        if (elapsedSec < 8) return false;
        if (plan === 'CLUB' || role === 'PEER_MECHANIC') return true;
        
        // 3. BASE (Everyone else) see it after 15 seconds
        if (elapsedSec < 15) return false;
        
        return true;
      }).sort((a: { lat?: number; lng?: number }, b: { lat?: number; lng?: number }) => {
        const distA = calculateDistance(effectiveLocation.lat, effectiveLocation.lng, a.lat, a.lng);
        const distB = calculateDistance(effectiveLocation.lat, effectiveLocation.lng, b.lat, b.lng);
        return distA - distB;
      });
    }
    return jobs;
  }, [allPendingJobs, effectiveLocation, profile?.plan, profile?.role]);

  const updateMechanicStatus = async (newStatus: string) => {
    if (!user) return;
    try {
    const lockState = safeStorage.getItem('fb_tx_lock');
    // eslint-disable-next-line react-hooks/purity
    const isLocked = (window as any).firebaseTransactionInProgress || (lockState && (Date.now() - parseInt(lockState) < 10000));

    if (!isLocked) {
      await updateDoc(doc(db, 'users', user?.uid), {
        mechanicStatus: newStatus,
        updatedAt: serverTimestamp()
      });
    }
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
      const lockState = safeStorage.getItem('fb_tx_lock');
      const isLocked = (window as any).firebaseTransactionInProgress || (lockState && (Date.now() - parseInt(lockState) < 10000));

      if (mechanicStatus === 'BUSY' && !isLocked) {
        await updateDoc(doc(db, 'users', user.uid), {
          mechanicStatus: 'FREE',
          updatedAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error('Error cancelling job:', error);
      toast.error(t('mechanic.cancelError', { defaultValue: 'Errore durante l\'annullamento.' }));
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
      toast.error(t('mechanic.sosTimeoutCancelled', { defaultValue: 'Un SOS è stato annullato per inattività.' }));
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
    } catch (e) { 
      console.error('Error starting direct chat:', e);
      toast.error(t('mechanic.chatOpenError', { defaultValue: "Errore durante l'apertura della chat" }) + ': ' + (e.message || t('common.tryAgain', { defaultValue: 'Riprova più tardi' })));
    }
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
      if (isFirestoreQuotaError(error)) {
        console.warn('Firestore quota limit (Mechanic stats)');
        setQuotaError(true);
      } else if (!auth.currentUser) {
        console.warn('Expected Auth sync error during logout: ', error);
      } else {
        handleFirestoreError(error, OperationType.GET, `mechanics/${user.uid}`);
      }
    });

    return () => unsubStats();
  }, [user, setQuotaError]);

  const isAvailableRef = useRef(isAvailable);
  const mechanicStatusRef = useRef(mechanicStatus);
  const activeJobsCountRef = useRef(activeJobs.length);
  const notificationsEnabledRef = useRef(profile?.notificationsEnabled);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    isAvailableRef.current = isAvailable;
    mechanicStatusRef.current = mechanicStatus;
    activeJobsCountRef.current = activeJobs.length;
    notificationsEnabledRef.current = profile?.notificationsEnabled;
    return () => { isMountedRef.current = false; };
  }, [isAvailable, mechanicStatus, activeJobs.length, profile?.notificationsEnabled]);

  // 2. Listen for pending SOS requests (Dispatcher) - STABILIZED
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
        if (change.type === 'added') {
          const data = change.doc.data();
          
          // Use refs to check current state without re-triggering the effect
          if (isAvailableRef.current && 
              mechanicStatusRef.current === 'FREE' && 
              activeJobsCountRef.current === 0) {
            
            if (notificationsEnabledRef.current) {
              soundService.play('INTERVENTION_MECHANIC');

              if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
                new Notification(t('mechanic.availableJobs'), {
                  body: `${getFaultTypeTranslation(data.faultType)} ${t('common.nearYou')}.`,
                  icon: '/logo192.png'
                });
              }
            }
            
            if (isMountedRef.current) {
              setNewSOS({ id: change.doc.id, ...data });
              setShowNewSOSBanner(true);
            }
          }
        }
      });
      
      setAllPendingJobs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setQuotaError(false);
    }, (error) => {
      if (isFirestoreQuotaError(error)) setQuotaError(true);
      else console.warn('Error listening to SOS requests:', error);
    });

    return () => unsubSos();
  }, [user, setQuotaError, t]); // Removed volatile dependencies

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
      if (!isFirestoreQuotaError(error)) {
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
      const jobs: any[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Separate active from completed (both reviewed and pending review)
      const current = jobs.filter((j: any) => j.status !== 'COMPLETED');
      const finished = jobs.filter((j: any) => j.status === 'COMPLETED').slice(0, 10);
      
      setActiveJobs(current);
      setCompletedJobsList(finished);
    }, (error) => {
      if (!isFirestoreQuotaError(error) && auth.currentUser) {
        handleFirestoreError(error, OperationType.LIST, 'sosRequests (MECHANIC_JOBS)');
      }
    });

    return () => unsubJobs();
  }, [user]);

  const lastCoordsRef = useRef<{lat: number|null, lng: number|null}>({ lat: null, lng: null });

  // 5. Watch Position
  useEffect(() => {
    if (!user || (!isAvailable && activeJobs.length === 0)) return;

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
        // Silently ignore expected watch tracking minor errors
      },
      { enableHighAccuracy: false, timeout: 20000, maximumAge: 10000 }
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
      const now = Date.now();
      let activeCount = 0;
      snapshot.docs.forEach(doc => {
        if (doc.id === user?.uid) return;
        const data = doc.data();
        const lastSeen = data.lastSeenAt instanceof Date ? data.lastSeenAt.getTime() : (data.lastSeenAt?.seconds ? data.lastSeenAt.seconds * 1000 : 0);
        if ((now - lastSeen) < (15 * 60 * 1000)) {
          activeCount++;
        }
      });
      setNearbyCyclistsCount(activeCount);
    }, (error) => {
      if (!isFirestoreQuotaError(error)) {
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
      const chats: any[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setRecentChats(chats);
      
      // Calculate total unread count
      const totalUnread = chats.reduce((acc: number, chat: any) => {
        const nestedUnread = chat.unreadCount?.[user?.uid || ''] || 0;
        const flatUnread = chat[`unreadCount.${user?.uid || ''}`] || 0;
        return acc + nestedUnread + flatUnread;
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
      toast.error(t('mechanic.freePlanOnlineError', { defaultValue: "Il piano FREE non permette di andare online. Attiva il piano BASE o superiore dal tuo Profilo per iniziare a ricevere richieste." }));
      return;
    }

    try {
      const newStatus = !isAvailable;
      setIsAvailable(newStatus); // Optimistic local state
      
      // OPTIMISTIC STORE UPDATE for LIVE feel across app (e.g. Map)
      if (profile) {
        useAuthStore.getState().setProfile({ ...profile, isOnline: newStatus });
      }

      setAvailabilityMsg({text: newStatus ? 'ONLINE' : 'OFFLINE', isOnline: newStatus});
      setTimeout(() => setAvailabilityMsg(null), 3000);
      
      // Update both collections for consistency
      const userRef = doc(db, 'users', user?.uid);
      const mechanicRef = doc(db, 'mechanics', user?.uid);
      
      const userUpdate: Record<string, unknown> = {
        isOnline: newStatus,
        presenceStatus: newStatus ? 'ONLINE' : 'OFFLINE',
        lastSeenAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (!newStatus) {
        userUpdate.lastLat = null;
        userUpdate.lastLng = null;
        userUpdate.location = null;
      }
      const p1 = updateDoc(userRef, userUpdate);
      const p2 = updateDoc(mechanicRef, { isAvailable: newStatus }).catch((e) => console.warn('Availability update failed', e));
      
      await Promise.all([p1, p2]);
    } catch (err) {
      console.error('Error updating availability:', err);
      setIsAvailable(!isAvailable); // Revert
      if (profile) {
        useAuthStore.getState().setProfile({ ...profile, isOnline: !isAvailable });
      }
    }
  };

  const acceptJob = async (jobId: string) => {
    if (!user || loadingJobId) return;
    setLoadingJobId(jobId);
    
    if (profile?.plan === 'MECHANIC_FREE' || (profile?.role === 'MECHANIC' && !profile?.plan)) {
      toast.error(t('mechanic.freePlanAcceptError', { defaultValue: "Il piano FREE non permette di accettare richieste SOS. Attiva il piano BASE o superiore dal tuo Profilo." }));
      setLoadingJobId(null);
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

      const sosSnap = await getDoc(doc(db, 'sosRequests', jobId));
      const cyclistId = sosSnap.exists() ? sosSnap.data()?.cyclistId : null;
      const sortedIds = [user?.uid, cyclistId].sort();
      const actualChatId = `direct_${sortedIds[0]}_${sortedIds[1]}`;

      await addDoc(collection(db, 'chats', actualChatId, 'messages'), {
        senderId: user?.uid,
        content: t('mechanic.enRoute') + "! " + (t('cyclist.eta', { minutes: '10' })),
        type: 'TEXT',
        createdAt: serverTimestamp(),
      });

      toast.success(t('mechanic.jobAccepted', { defaultValue: 'Richiesta accettata con successo! Il ciclista è stato informato.' }));
    } catch (error) {
      if (error.message === 'SOS already accepted or invalid') {
         toast.error(t('mechanic.sosAlreadyAccepted', { defaultValue: "Questa richiesta SOS è già stata presa in carico da un altro meccanico." }));
      } else {
         handleFirestoreError(error, OperationType.UPDATE, `sosRequests/${jobId}`);
      }
    } finally {
      setLoadingJobId(null);
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
      toast.success(t('mechanic.repairCompleted', { defaultValue: 'Riparazione conclusa. In attesa della conferma del ciclista per sbloccare i fondi.' }));
    } catch (err) {
      console.error('Error completing job:', err);
    }
  };

  if (!profile) {
    return <div className="flex-1 flex items-center justify-center bg-white"><Loader2 size={32} className="animate-spin text-primary" /></div>;
  }

  if (profile?.role === 'MECHANIC' && profile?.kycStatus !== 'APPROVED') {
      return <KYCVerification />;
  }

  return (
    <div className="flex flex-col relative bg-white transition-colors duration-500" style={{ height: '100dvh', width: '100%', minHeight: '100dvh' }}>
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
      <div className="relative overflow-hidden" style={{ flex: '1 1 0%', minHeight: 0 }}>
        {/* Main Content Area - Render all tabs but show only active one for instant switching */}
        <div className="absolute inset-0 flex flex-col">
          {/* Support Chat Overlay */}
          <AnimatePresence>
            {showChat && directChat && (
              <motion.div 
                key="chat-job-overlay" 
                initial={{ opacity: 0, x: 20 }} 
                animate={{ opacity: 1, x: 0 }} 
                exit={{ opacity: 0, x: 20 }} 
                className="absolute inset-0 z-[100] flex flex-col bg-white transition-colors"
              >
                <ChatHeader 
                  chatId={directChat.id} 
                  defaultName={directChat.name} 
                  onBack={() => { 
                    setShowChat(false); 
                    setDirectChat(null); 
                  }} 
                  onViewProfile={setViewProfileId}
                />
                <Chat chatId={directChat.id} otherPartyName={directChat.name} isAdminSupport={directChat.isAdminSupport} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Profile Tab */}
          <div className={`absolute inset-0 overflow-y-auto scroll-smooth bg-white z-20 pb-48 transition-opacity duration-300 ${activeTab === 'PROFILE' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
            <div className="bg-primary p-4 flex items-center gap-4 text-black sticky top-0 z-10 transition-colors">
              <button onClick={() => setActiveTab('WORK')} className="hover:bg-black/5 p-2 rounded-full transition-colors"><ArrowLeft size={24}/></button>
              <h3 className="font-bold">{t('profile.title')}</h3>
            </div>
            <ProfileView isAvailable={isAvailable} onToggleAvailability={toggleAvailability}/>
          </div>

          {/* Chat Tab List */}
          <div className={`absolute inset-0 z-20 flex flex-col bg-white pb-[110px] transition-opacity duration-300 ${activeTab === 'CHAT' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
             {directChat && !showChat ? (
                <>
                  <ChatHeader 
                    chatId={directChat.id} 
                    defaultName={directChat.name} 
                    onBack={() => {
                      setDirectChat(null);
                      setShowChat(false);
                    }} 
                    onViewProfile={setViewProfileId}
                  />
                  <Chat chatId={directChat.id} otherPartyName={directChat.name} isAdminSupport={directChat.isAdminSupport} />
                </>
              ) : (
                <>
                  <div className="bg-primary p-4 flex items-center gap-4 text-black transition-colors">
                    <h3 className="font-bold text-sm text-black transition-colors">{t('nav.chat')}</h3>
                  </div>
                  <ChatListView 
                    chats={displayChats} 
                    onSelectChat={(chat: { id: string; fetchedProfileName?: string; otherPartyName?: string; title?: string }) => {
                      setDirectChat({ id: chat.id, name: chat.fetchedProfileName || chat.otherPartyName || chat.title || 'Chat' });
                    }}
                    currentUserId={user?.uid || ''}
                  />
                </>
              )}
          </div>

          {/* Map Tab */}
          <div className={`absolute inset-0 transition-opacity duration-300 ${activeTab === 'MAP' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
             <BicycleMap 
               onStartChat={startDirectChat}
               onViewReportDetails={(report) => {
                 setSelectedReport(report);
               }}
             />
             <div className="absolute top-24 right-4 z-20">
               <button onClick={() => setShowStats(!showStats)} className="w-12 h-12 bg-white rounded-full shadow-lg border border-grey/10 flex items-center justify-center text-primary hover:bg-grey/5 transition-colors">
                 <TrendingUp size={24} />
               </button>
             </div>
             
             <AnimatePresence>
                {showStats && (
                  <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }} className="absolute inset-x-0 bottom-0 top-[120px] bg-white rounded-t-3xl shadow-[0_-10px_40px_-5px_rgba(0,0,0,0.1)] z-30 p-6 overflow-y-auto pb-48">
                     <div className="mb-8 flex items-start justify-between">
                        <div>
                          <h2 className="text-2xl font-black text-primary">{t('mechanic.stats')}</h2>
                          <p className="text-xs font-bold text-grey italic">{t('mechanic.statsSubtitle')}</p>
                        </div>
                        <button onClick={() => setShowStats(false)} className="w-8 h-8 bg-grey/10 rounded-full flex items-center justify-center text-grey hover:text-black">
                          <X size={16} />
                        </button>
                     </div>
                     <div className="grid grid-cols-2 gap-4 mb-6">
                         <div className="bg-primary text-white p-5 rounded-[2.5rem] shadow-xl shadow-primary/20">
                           <div className="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center text-accent mb-4">
                              <Zap size={20} className="fill-accent"/>
                           </div>
                           <p className="text-[10px] font-black opacity-60 uppercase tracking-widest leading-none mb-1">Guadagni DBC</p>
                           <p className="text-2xl font-black">{(profile?.balance ?? mechanicData?.totalEarnings ?? 0).toFixed(0)}</p>
                         </div>
                         <div className="bg-white p-5 rounded-[2.5rem] shadow-sm border border-grey/5">
                            <div className="w-10 h-10 bg-accent/5 rounded-2xl flex items-center justify-center text-accent mb-4">
                               <Star size={20}/>
                            </div>
                            <p className="text-[10px] font-black text-grey uppercase tracking-widest leading-none mb-1">{t('mechanic.rating')}</p>
                            <p className="text-2xl font-black text-primary">{avgRating.toFixed(2)}</p>
                         </div>
                         <div className="bg-accent/10 p-5 rounded-[2.5rem] shadow-sm border border-accent/10">
                            <div className="w-10 h-10 bg-accent/20 rounded-2xl flex items-center justify-center text-accent mb-4">
                               <CheckCircle2 size={20}/>
                            </div>
                            <p className="text-[10px] font-black text-grey uppercase tracking-widest leading-none mb-1">Job Completati</p>
                            <p className="text-2xl font-black text-accent">{mechanicData?.completedJobs ?? profile?.completedJobs ?? 0}</p>
                         </div>
                         <div className="bg-warning/10 p-5 rounded-[2.5rem] shadow-sm border border-warning/10">
                            <div className="w-10 h-10 bg-warning/20 rounded-2xl flex items-center justify-center text-warning mb-4">
                               <Clock size={20}/>
                            </div>
                            <p className="text-[10px] font-black text-grey uppercase tracking-widest leading-none mb-1">In Attesa</p>
                            <p className="text-2xl font-black text-warning">{activeJobs.length}</p>
                         </div>
                     </div>
                     {earningsData.length > 0 && (
                       <div className="mb-6">
                         <h3 className="text-sm font-black text-grey uppercase mb-3">Guadagni Ultimi 7 Giorni</h3>
                          <div className="h-40 bg-grey/5 rounded-2xl p-3">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={earningsData}>
                                <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                                  {earningsData.map((_, i) => <Cell key={i} fill={i === earningsData.length - 1 ? '#f59e0b' : '#f59e0b40'} />)}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                       </div>
                     )}
                     {activityData.length > 0 && (
                       <div>
                         <h3 className="text-sm font-black text-grey uppercase mb-3">Attivita</h3>
                         <div className="flex gap-3">
                           {activityData.map((a, i) => (
                             <div key={i} className="flex-1 bg-grey/5 rounded-xl p-3 text-center">
                               <div className="w-3 h-3 rounded-full mx-auto mb-2" style={{ backgroundColor: a.color }} />
                               <p className="text-[10px] font-black text-grey uppercase">{a.name}</p>
                               <p className="text-lg font-black">{a.value}</p>
                             </div>
                 ))}

                 {completedJobsList.length > 0 && (
                   <div className="mt-8">
                     <h3 className="text-xs font-black text-grey uppercase tracking-widest mb-3 px-1">Job Completati Recenti</h3>
                     <div className="space-y-3">
                       {completedJobsList.map(job => (
                         <div key={job.id} className="bg-success/5 border border-success/10 p-4 rounded-3xl flex justify-between items-center opacity-70">
                            <div className="flex gap-3">
                               <div className="w-10 h-10 bg-success/20 text-success rounded-xl flex items-center justify-center">
                                  <CheckCircle2 size={20} />
                               </div>
                               <div>
                                  <h4 className="font-bold text-black text-xs uppercase">{getFaultTypeTranslation(job.faultType)}</h4>
                                  <p className="text-[9px] font-bold text-grey uppercase">{job.cyclistName || 'Ciclista'} · {job.completedAt ? new Date(job.completedAt.seconds * 1000).toLocaleDateString() : ''}</p>
                               </div>
                            </div>
                            <div className="bg-success/10 text-success px-3 py-1.5 rounded-lg text-[9px] font-black uppercase">
                              +{job.estimatedPrice || 0} DBC
                            </div>
                         </div>
                       ))}
                     </div>
                   </div>
                 )}
              </div>
                       </div>
                     )}
                  </motion.div>
                )}
             </AnimatePresence>
          </div>

          {/* Work Tab (Home) */}
          <div className={`absolute inset-0 overflow-y-auto pb-48 transition-opacity duration-300 ${activeTab === 'WORK' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
             {/* Header */}
             <div className="bg-primary pt-8 pb-12 px-4 sm:pt-12 sm:pb-16 sm:px-6 rounded-b-[3rem] relative transition-colors">
                <div className="flex justify-between items-center mb-4 sm:mb-6">
                  <div className="flex items-center gap-2 sm:gap-3">
                     <button onClick={() => setActiveTab('PROFILE')} className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl border-2 border-white/50 overflow-hidden active:scale-95 transition-transform">
                        <img src={profile?.photoURL || user?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.uid}`} alt="Avatar" className="w-full h-full object-cover"/>
                     </button>
                     <div>
                       <h2 className="text-white font-black text-lg sm:text-xl transition-colors">{t('common.hi')}, {user?.displayName || t('auth.mechanic')}!</h2>
                       <div className="flex items-center gap-3 mt-1">
                            <span className={`text-xs font-black uppercase tracking-[0.2em] transition-colors ${isAvailable ? 'text-accent' : 'text-white/70'}`}>
                              {isAvailable ? t('mechanic.online') : t('mechanic.offline')}
                            </span>
                       </div>
                     </div>
                  </div>
                  {/* ... (rest of header actions) */}
                  <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2 flex-1 sm:flex-none">
                     <button onClick={() => setActiveTab('CHAT')} className="bg-white/10 p-1.5 sm:p-2 rounded-xl text-white transition-all hover:bg-white/20 relative">
                        <MessageSquare size={18} className="sm:size-[20px]"/>
                        {unreadCount > 0 && (
                          <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[8px] font-black rounded-full flex items-center justify-center border-2 border-primary">
                              {unreadCount}
                          </div>
                        )}
                     </button>
                     <button onClick={() => setShowAIDoctor(true)} className="bg-accent text-white p-1.5 sm:p-2 rounded-xl transition-all shadow-lg shadow-accent/20">
                        <Sparkles size={18} className="sm:size-[20px]"/>
                     </button>
                     <button onClick={async () => {
                         if (auth.currentUser) {
                             try {
                               await updateDoc(doc(db, 'users', auth.currentUser.uid), { isOnline: false, updatedAt: serverTimestamp() });
                             } catch (e) { console.error(e); }
                         }
                         signOut(auth);
                     }} className="bg-white/10 p-1.5 sm:p-2 rounded-xl text-white">
                       <Power size={20}/>
                    </button>
                 </div>
               </div>

               <div className="flex items-center gap-5 bg-white/10 border border-white/20 p-5 rounded-[2.5rem] mt-6">
                  <div className="flex -space-x-3">
                     {[1,2,3].map(i => (
                       <div key={i} className="w-10 h-10 rounded-full border-2 border-primary bg-grey overflow-hidden">
                         <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=cyclist-${i}`} alt="Cyclist" />
                       </div>
                     ))}
                  </div>
                  <div>
                     <span className="text-xs font-black italic text-white leading-none uppercase tracking-[0.22em]">{nearbyCyclistsCount} {t('mechanic.nearbyCyclists')}</span>
                  </div>
               </div>

               {isAvailable && (
                 <div className="mt-4 flex gap-1.5">
                   {['FREE', 'BUSY', 'TRAVELING'].map(id => (
                     <button key={id} onClick={() => updateMechanicStatus(id)}
                       className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all border-2 ${
                         mechanicStatus === id ? 'bg-accent text-white border-white/20 shadow-md' : 'bg-white/10 text-white border-white/5'
                        }`}
                     >
                       {t(`mechanic.status${id.charAt(0) + id.slice(1).toLowerCase()}`)}
                     </button>
                   ))}
                 </div>
               )}
             </div>

             <div className="mt-8 px-6 space-y-6">
                {activeJobs.map(job => (
                  <div key={job.id} className="bg-warning/10 border-2 border-warning/30 p-5 rounded-[2.5rem] relative overflow-hidden">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex gap-3">
                         <div className="w-12 h-12 bg-warning text-primary rounded-2xl flex items-center justify-center">
                            <Bike size={24} />
                         </div>
                         <div>
                            <h4 className="font-black text-primary text-sm uppercase">{getFaultTypeTranslation(job.faultType)}</h4>
                            <p className="text-[10px] font-bold text-primary/60 uppercase">{job.mechanicConfirmed ? 'In attesa conferma' : 'Intervento in corso'}</p>
                         </div>
                      </div>
                      <div className="text-lg font-black text-primary">⚡{job.estimatedPrice || 45}</div>
                    </div>
                    <div className="flex gap-2 mt-6">
                      <button onClick={() => { const ids = [job.cyclistId, job.mechanicId].sort(); setDirectChat({ id: `direct_${ids[0]}_${ids[1]}`, name: job.cyclistName || 'Ciclista' }); setShowChat(true); }} className="flex-1 bg-white border-2 border-warning/20 py-3 rounded-xl text-[10px] font-black uppercase">Chat</button>
                      {!job.mechanicConfirmed && (
                        <button onClick={() => completeJob(job.id)} className="flex-[1.5] bg-warning text-primary py-3 rounded-xl text-[10px] font-black uppercase shadow-lg shadow-warning/20">Concludi</button>
                      )}
                    </div>
                  </div>
                ))}

                {isAvailable && filteredJobs.map(job => (
                   <div key={job.id} onClick={() => acceptJob(job.id)} className="bg-danger/5 border-2 border-danger/20 p-5 rounded-[2.5rem] flex justify-between items-center cursor-pointer active:scale-95 transition-all">
                      <div className="flex gap-3">
                         <div className="w-12 h-12 bg-danger text-white rounded-2xl flex items-center justify-center shadow-lg shadow-danger/20">
                            <AlertTriangle size={24} />
                         </div>
                         <div>
                            <h4 className="font-black text-black text-sm uppercase">{getFaultTypeTranslation(job.faultType)}</h4>
                            <p className="text-[10px] font-bold text-grey uppercase">{job.address || 'Vicino a te'}</p>
                         </div>
                      </div>
                      <div className="bg-danger text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest">Accetta</div>
                   </div>
                ))}
             </div>
          </div>
        </div>
      </div>

      {/* Navigation Bottom */}
      <div className="absolute bottom-0 left-0 right-0 bg-white/95 backdrop-blur-2xl border-t border-grey/5 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] z-50 transition-all shadow-[0_-10px_40px_-5px_rgba(0,0,0,0.05)]">
        <div className="flex items-center justify-between px-1 sm:px-4 max-w-xl mx-auto relative">
          <div className="flex-1 flex justify-around items-center">
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

