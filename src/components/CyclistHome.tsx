import toast from 'react-hot-toast';
import React, { useState, useEffect, useRef } from 'react';
import imageCompression from 'browser-image-compression';
import { Map } from './Map';
import { 
  Bell, 
  MapPin, 
  Settings, 
  Shield, 
  MessageCircle, 
  User,
  Bike,
  Plus,
  Eye,
  EyeOff,
  Wrench,
  AlertCircle,
  X,
  Navigation2,
  Clock,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Camera,
  Send,
  Moon,
  Sun,
  Power,
  Calendar,
  Users,
  Loader2,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuthStore } from '../store/useAuthStore';
import { useThemeStore } from '../store/useThemeStore';
import { auth, db, handleFirestoreError, OperationType, functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  updateDoc,
  setDoc,
  limit,
  orderBy,
  arrayUnion,
  arrayRemove,
  increment,
  getDocs,
  runTransaction,
  startAt,
  endAt
} from 'firebase/firestore';
import { geohashQueryBounds, distanceBetween } from 'geofire-common';
import { Chat } from './Chat';
import { SocialView } from './SocialView';
import { ProfileView } from './ProfileView';
import { ChatListView } from './ChatListView';
import { ChatHeader } from './ChatHeader';
import { PublicProfileModal } from './PublicProfileModal';
import { useTranslation } from 'react-i18next';
import { Logo } from './Logo';
import { soundService } from '../lib/sounds';

import { ReviewModal } from './ReviewModal';
import { RoadReportModal } from './RoadReportModal';
import { RoadReportDetailModal } from './RoadReportDetailModal';
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';

function SOSLocationSelector({ setLoc, userLoc }: { setLoc: (pos: [number, number]) => void, userLoc: [number, number] | null }) {
  const map = useMap();
  const [init, setInit] = useState(false);
  
  useEffect(() => {
    // Recalculate size when component mounts, continuously during animation
    const interval = setInterval(() => {
      map.invalidateSize();
    }, 100);
    
    if (userLoc && !init) {
      map.setView(userLoc, 17);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInit(true);
    }
    
    const timeout = setTimeout(() => {
      clearInterval(interval);
    }, 1000);
    
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [map, userLoc, init]);

  useMapEvents({
    moveend() {
      const center = map.getCenter();
      setLoc([center.lat, center.lng]);
    }
  });

  const [isLocating, setIsLocating] = useState(false);

  const handleLocate = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsLocating(true);

    const tryIPFallback = async () => {
       try {
          const res = await fetch('https://get.geojs.io/v1/ip/geo.json');
          if (res.ok) {
             const data = await res.json();
             if (data.latitude && data.longitude) {
                const newPos: [number, number] = [parseFloat(data.latitude), parseFloat(data.longitude)];
                map.setView(newPos, 17);
                setLoc(newPos);
                setIsLocating(false);
                return true;
             }
          }
       // eslint-disable-next-line no-empty
       } catch (e) {}
       return false;
    };

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (p) => {
           const newPos: [number, number] = [p.coords.latitude, p.coords.longitude];
           map.setView(newPos, 17);
           setLoc(newPos);
           setIsLocating(false);
        },
        async () => {
           const ipSuccess = await tryIPFallback();
           if (!ipSuccess) {
              toast.error("Impossibile ottenere la posizione esatta. Trascina la mappa manualmente.");
              if (userLoc) map.setView(userLoc, 17);
              setIsLocating(false);
           }
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    } else {
       const ipSuccess = await tryIPFallback();
       if (!ipSuccess && userLoc) map.setView(userLoc, 17);
       setIsLocating(false);
    }
  };

  return (
    <div className="absolute bottom-4 right-4 z-[1000]">
      <button 
        onClick={handleLocate}
        disabled={isLocating}
        className="bg-white p-3 rounded-full shadow-lg border-2 border-primary text-primary hover:bg-primary/10 active:scale-90 transition-all font-bold text-xs flex items-center justify-center gap-2"
        title="La mia posizione"
      >
        {isLocating ? <Loader2 size={24} className="animate-spin text-primary" /> : <Navigation2 size={24} className="fill-primary" />}
      </button>
    </div>
  );
}

// Helper to calculate distance
const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
    ; 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
  return R * c; // Distance in km
};

export function CyclistHome() {
  const { user, profile, setQuotaError, setShowAIDoctor, userLocation } = useAuthStore();
  const { isDarkMode, toggleDarkMode } = useThemeStore();
  const { t, i18n } = useTranslation();
  
  const [onlineMsg, setOnlineMsg] = useState<{ text: string; isOnline: boolean } | null>(null);

  const getFaultTypeTranslation = (faultType: string | undefined) => {
    if (!faultType) return t('cyclist.other');
    const key = `cyclist.${faultType.toLowerCase().replace(/_([a-z])/g, (g) => g[1].toUpperCase())}`;
    return t(key);
  };

  const faultTypes = [
    { id: 'FLAT_TIRE', label: t('cyclist.flatTire'), icon: <Wrench size={20} /> },
    { id: 'CHAIN_BREAK', label: t('cyclist.chainBreak'), icon: <AlertCircle size={20} /> },
    { id: 'BRAKE_ISSUE', label: t('cyclist.brakeIssue'), icon: <Navigation2 size={20} /> },
    { id: 'GEAR_ADJUST', label: t('cyclist.gearAdjust'), icon: <Settings size={20} /> },
    { id: 'WHEEL_TRUE', label: t('cyclist.wheelTrue'), icon: <AlertCircle size={20} /> },
    { id: 'OTHER', label: t('cyclist.other'), icon: <Plus size={20} /> },
  ];

  const [selectedFaultType, setSelectedFaultType] = useState<string | null>(null);
  const [showSOSForm, setShowSOSForm] = useState(false);
  const [sosStep, setSosStep] = useState(1);
  const [isCreatingSOS, setIsCreatingSOS] = useState(false);
  const [activeSOS, setActiveSOS] = useState<any>(null);
  const [isSOSMinimized, setIsSOSMinimized] = useState(false);
  const [sosDescription, setSosDescription] = useState('');
  const [sosLocation, setSosLocation] = useState<[number, number] | null>(null);
  const [sosTimeoutSeconds, setSosTimeoutSeconds] = useState<number | null>(null);
  const hasAutoLocatedSOS = useRef(false);

  useEffect(() => {
    if (!showSOSForm) {
      hasAutoLocatedSOS.current = false;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSosLocation(null);
      return;
    }
    
    if (!hasAutoLocatedSOS.current) {
      if (userLocation) {
        setSosLocation([userLocation.lat, userLocation.lng]);
        hasAutoLocatedSOS.current = true;
      } else if (!sosLocation) {
        setSosLocation([45.4642, 9.1900]); // Default Milan
      }
    }
  }, [showSOSForm, userLocation, sosLocation]);

  const [showRoadReportModal, setShowRoadReportModal] = useState(false);
  const [activeTab, setActiveTab] = useState('MAP');
  const [showChat, setShowChat] = useState(false);
  const [viewProfileId, setViewProfileId] = useState<string | null>(null);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [tempDescription, setTempDescription] = useState('');
  const [nearbyCount, setNearbyCount] = useState(0);
  const [nearbyCyclistsCount, setNearbyCyclistsCount] = useState(0);
  const [trackedMechanic, setTrackedMechanic] = useState<any>(null);
  const [eta, setEta] = useState<number | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [directChat, setDirectChat] = useState<{ id: string, name: string, isAdminSupport?: boolean } | null>(null);
  const [focusedPos, setFocusedPos] = useState<[number, number] | null>(null);
  const [selectedEventDetails, setSelectedEventDetails] = useState<any | null>(null);
  const [selectedReport, setSelectedReport] = useState<any | null>(null);

  const handleFocusOnEvent = (lat: number, lng: number) => {
    setFocusedPos([lat, lng]);
    setActiveTab('MAP');
  };
  const [isUploading, setIsUploading] = useState(false);
  const [showSOSDetails, setShowSOSDetails] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [sosPhotos, setSosPhotos] = useState<string[]>([]);
  const [nearestMechanic, setNearestMechanic] = useState<any>(null);
  const [isFinishing, setIsFinishing] = useState(false);
  const [showInsufficientFunds, setShowInsufficientFunds] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [completedJobToReview, setCompletedJobToReview] = useState<any>(null);

  const [recentChats, setRecentChats] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [userSupportTicket, setUserSupportTicket] = useState<any | null>(null);

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

  const displayChats = React.useMemo(() => {
    const list = [...recentChats];
    if (activeSOS && activeSOS.mechanicId) {
       const sortedIds = [user?.uid || '', activeSOS.mechanicId].sort();
       const chatId = `direct_${sortedIds[0]}_${sortedIds[1]}`;
       if (!list.find(c => c.id === chatId)) {
           list.push({
               id: chatId,
               type: 'DIRECT',
               participants: [user?.uid, activeSOS.mechanicId],
               otherPartyName: activeSOS.mechanicName || 'Meccanico',
               title: activeSOS.mechanicName || 'Meccanico',
               lastMessage: 'SOS Accettato. Entra in chat.',
               // eslint-disable-next-line react-hooks/purity
               lastMessageAt: activeSOS.updatedAt || activeSOS.createdAt || { seconds: Date.now()/1000 },
               unreadCount: {}
           });
       }
    }
    return list.sort((a,b) => {
        const timeA = a.lastMessageAt?.seconds || a.createdAt?.seconds || 0;
        const timeB = b.lastMessageAt?.seconds || b.createdAt?.seconds || 0;
        return timeB - timeA;
    });
  }, [recentChats, activeSOS, user?.uid]);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user?.uid),
      limit(20)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRecentChats(chats);
      
      const totalUnread = chats.reduce((acc, chat: any) => {
        const nestedUnread = chat.unreadCount?.[user?.uid] || 0;
        const flatUnread = chat[`unreadCount.${user?.uid}`] || 0;
        return acc + nestedUnread + flatUnread;
      }, 0);
      setUnreadCount(totalUnread);
    }, (error) => {
      if (error.message?.includes('Quota exceeded') || error.message?.includes('quota limits')) {
        setQuotaError(true);
      } else {
        console.warn('Error fetching recent chats:', error);
      }
    });
    return () => unsubscribe();
  }, [user]);

  const [rawMechanics, setRawMechanics] = useState<any[]>([]);
  const [isBackground, setIsBackground] = useState(false);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsBackground(document.visibilityState === 'hidden');
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => {
    if (!user || isBackground) return;

    // Geohashing Unified Query for Mechanics & Cyclists (Radius: 20km)
    if (!userLocation) return;
    
    const radiusInM = 20000;
    const bounds = geohashQueryBounds([userLocation.lat, userLocation.lng], radiusInM);
    const unsubs: any[] = [];
    
    const localMechanics: Record<string, any> = {};
    let localCyclistsCount = 0;

    for (const b of bounds) {
      const qUsers = query(
        collection(db, 'users'),
        where('isOnline', '==', true),
        orderBy('geohash'),
        startAt(b[0]),
        endAt(b[1])
      );

      const unsub = onSnapshot(qUsers, (snapshot) => {
        let activeCyclists = 0;
        
        snapshot.docs.forEach(docSnap => {
          const u = { id: docSnap.id, ...docSnap.data() } as any;
          if (u.id === user?.uid) return;
          
          if (!u.lastLat || !u.lastLng) {
            delete localMechanics[u.id];
            return;
          }

          // Distance check
          const dist = distanceBetween([u.lastLat, u.lastLng], [userLocation.lat, userLocation.lng]) * 1000;
          if (dist > radiusInM) {
            delete localMechanics[u.id];
            return;
          }

          const lastSeen = u.lastSeenAt instanceof Date ? u.lastSeenAt.getTime() : (u.lastSeenAt?.seconds ? u.lastSeenAt.seconds * 1000 : 0);
          const now = Date.now();
          const isRecent = (now - lastSeen) < (15 * 60 * 1000);
          
          if (!isRecent) {
             delete localMechanics[u.id];
             return;
          }

          if (u.role === 'CYCLIST') {
            activeCyclists++;
          } else if (['MECHANIC', 'PEER_MECHANIC'].includes(u.role)) {
            localMechanics[u.id] = u;
          }
        });
        
        // Handle removals
        snapshot.docChanges().forEach(change => {
           if (change.type === 'removed') {
              delete localMechanics[change.doc.id];
           }
        });

        setRawMechanics(Object.values(localMechanics));
        localCyclistsCount = activeCyclists;
        setNearbyCyclistsCount(localCyclistsCount);
        setQuotaError(false);
      }, (error) => {
        if (error.message.includes('Quota exceeded')) setQuotaError(true);
        else console.warn('Error listening to users via geohash:', error);
      });
      unsubs.push(unsub);
    }

    return () => {
      unsubs.forEach(u => u());
    };
  }, [user, setQuotaError, isBackground]); // CRITICAL: Removed userLocation to prevent quota burn on small movements

  // Calculate nearest mechanic without hitting database
  useEffect(() => {
    if (!user) return;
    const now = Date.now();
    let activeCount = 0;
    let minDoc: any = null;
    let minDistance = Infinity;

    rawMechanics.forEach(data => {
      if (data.id === user?.uid) return;
      const lastSeen = data.lastSeenAt instanceof Date ? data.lastSeenAt.getTime() : (data.lastSeenAt?.seconds ? data.lastSeenAt.seconds * 1000 : 0);
      if ((now - lastSeen) < (15 * 60 * 1000)) {
        activeCount++;
        if (userLocation && data.lastLat && data.lastLng) {
          const d = getDistance(userLocation.lat, userLocation.lng, data.lastLat, data.lastLng);
          if (d < minDistance) {
            minDistance = d;
            minDoc = { ...data, distance: d };
          }
        } else if (!minDoc) {
           minDoc = { ...data, distance: 0 };
        }
      }
    });
    
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNearbyCount(activeCount);
    setNearestMechanic(minDoc);
  }, [rawMechanics, user, userLocation]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, isForNewSOS: boolean = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      toast.error("L'immagine è troppo grande (Max 15MB).");
      return;
    }

    setIsUploading(true);
    
    try {
      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      };
      
      const compressedFile = await imageCompression(file, options);
      
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = reader.result as string;
        try {
          if (isForNewSOS) {
            setSosPhotos(prev => [...prev, base64String]);
          } else if (activeSOS) {
            await updateDoc(doc(db, 'sosRequests', activeSOS.id), {
              photos: arrayUnion(base64String),
              updatedAt: serverTimestamp()
            });
          }
        } catch (err) {
          console.error(err);
        } finally {
          setIsUploading(false);
        }
      };
      reader.readAsDataURL(compressedFile);
    } catch (error) {
      console.error('Error compressing image:', error);
      toast.error("Errore durante la compressione dell'immagine");
      setIsUploading(false);
    }
  };

  const startDirectChat = async (otherUserId: string, otherName: string) => {
    if (!user) return;
    
    // Generate a unique chatId for two users (sorted to be consistent)
    const sortedIds = [user?.uid, otherUserId].sort();
    const chatId = `direct_${sortedIds[0]}_${sortedIds[1]}`;
    
    // Check/Create chat document
    try {
      await setDoc(doc(db, 'chats', chatId), {
        participants: [user?.uid, otherUserId],
        type: 'DIRECT',
        createdAt: serverTimestamp()
      }, { merge: true });
      
      setDirectChat({ id: chatId, name: otherName });
      setShowChat(true);
    } catch (e: any) {
      console.error('Error starting direct chat:', e);
      toast.error('Errore durante l\'apertura della chat: ' + (e.message || 'Riprova più tardi'));
    }
  };

  // Helper removed from here, moved outside




  const finalizeJob = async () => {
    console.log('FinalizeJob clicked! activeSOS:', activeSOS?.id);
    if (!activeSOS || !user) return;
    
    setIsFinishing(true);
    try {
      console.log('Calling completeSOS Cloud Function...');
      const completeSOS = httpsCallable(functions, 'completeSOS');
      await completeSOS({ sosId: activeSOS.id });
      
      console.log('Cloud Function success, showing review modal...');
      toast.success('Riparazione confermata! Grazie per aver usato DoctorBike.');
      setCompletedJobToReview(activeSOS);
      setShowReviewModal(true);
      setShowCompletionOverlay(false);
    } catch (error: any) {
      console.error('Error finalizing job:', error);
      // Extra check for known status error
      if (error.message?.includes("L'SOS non è in uno stato valido")) {
         toast.error("Attendi che il meccanico sia arrivato o abbia iniziato l'intervento.");
      } else {
         toast.error('Errore durante la conferma: ' + (error.message || String(error)));
      }
    } finally {
      setIsFinishing(false);
    }
  };

  const [showCompletionOverlay, setShowCompletionOverlay] = useState(false);
  const prevSOSStatus = useRef<string | null>(null);
  const [showAcceptedToast, setShowAcceptedToast] = useState(false);

  useEffect(() => {
    if (activeSOS) {
      if (activeSOS.status === 'ACCEPTED' && prevSOSStatus.current === 'PENDING') {
        soundService.play('SOS_ALERT');
        setShowAcceptedToast(true);
        setTimeout(() => setShowAcceptedToast(false), 8000);
      }
      prevSOSStatus.current = activeSOS.status;
    } else {
      prevSOSStatus.current = null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowAcceptedToast(false);
    }
  }, [activeSOS]);

  useEffect(() => {
    if (activeSOS?.mechanicConfirmed && activeSOS?.status !== 'COMPLETED') {
      setShowCompletionOverlay(true);
    } else {
      setShowCompletionOverlay(false);
    }
  }, [activeSOS?.mechanicConfirmed, activeSOS?.status]);

  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveSOS(null);
      return;
    }
    
    const q = query(
      collection(db, 'sosRequests'), 
      where('cyclistId', '==', user.uid),
      where('status', 'in', ['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'DISPUTED']),
      orderBy('createdAt', 'desc'),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const currentSOS = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as any;
        
        if (currentSOS.status === 'COMPLETED' && currentSOS.isReviewed) {
          setActiveSOS(null);
          return;
        }

        setActiveSOS(currentSOS);
        
        // If it IS COMPLETED but not reviewed, show review modal
        if (currentSOS.status === 'COMPLETED' && !currentSOS.isReviewed) {
          setCompletedJobToReview(currentSOS);
          setShowReviewModal(true);
        }
      } else {
        setActiveSOS(null);
      }
    }, (error) => {
      if (!error.message.includes('Quota exceeded')) {
        console.warn('Error listening to SOS:', error);
      }
    });

    return () => unsubscribe();
  }, [user]);

  // Track the mechanic assigned to the SOS
  useEffect(() => {
    if (!user) return;
    if (activeSOS?.mechanicId && (activeSOS.status === 'ACCEPTED' || activeSOS.status === 'IN_PROGRESS')) {
      const unsubMechanic = onSnapshot(doc(db, 'users', activeSOS.mechanicId), (snapshot) => {
        if (snapshot.exists()) {
          const mechData = snapshot.data();
          setTrackedMechanic(mechData);
          
          // Calculate ETA and Distance
          if (mechData.lastLat && mechData.lastLng && activeSOS.lat && activeSOS.lng) {
            const dist = getDistance(mechData.lastLat, mechData.lastLng, activeSOS.lat, activeSOS.lng);
            setDistance(dist);
            // Assume 30km/h average city speed -> 0.5km per minute
            const estimatedMinutes = Math.max(1, Math.round(dist / 0.5));
            setEta(estimatedMinutes);
          }
        }
      }, (error) => {
        if (error.message.includes('Quota exceeded')) {
          console.warn('Firestore Quota exceeded (Mechanic tracking)');
        } else if (!auth.currentUser) {
          console.warn('Expected Auth sync error during logout: ', error);
        } else {
          handleFirestoreError(error, OperationType.GET, `users/${activeSOS.mechanicId}`);
        }
      });
      return () => unsubMechanic();
    } else {
       
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTrackedMechanic(null);
       
      setEta(null);
       
      setDistance(null);
    }
  }, [activeSOS?.mechanicId, activeSOS?.status, activeSOS?.lat, activeSOS?.lng, setDistance, setEta, setTrackedMechanic]);

  const handleSOSRequest = async (faultType: string) => {
    if (isCreatingSOS) return;
    if (!user) {
      toast.error("Devi effettuare l'accesso per richiedere un SOS.");
      return;
    }
    if (!profile) {
      toast.error("Profilo non caricato. Ricarica l'app o verifica la tua connessione.");
      return;
    }
    
    setIsCreatingSOS(true);
    (window as any).firebaseTransactionInProgress = true;
    localStorage.setItem('fb_tx_lock', Date.now().toString());
    
    // Give a small window for any pending background location updates to finish
    // before we start the optimistic transaction snapshot
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const basePrice = nearestMechanic?.sosPrice || 15;
    let price = basePrice;
    
    let discountRate = profile?.firstInterventionDiscount;
    if (discountRate === undefined || discountRate === null) {
      discountRate = (profile?.completedJobs === 0) ? 0.5 : 0;
    }
    
    let appliedDiscount = false;

    if (discountRate > 0 && discountRate <= 1) {
      price = Math.max(0, basePrice - (basePrice * discountRate));
      appliedDiscount = true;
    }

    if ((profile?.balance || 0) < price) {
      setShowInsufficientFunds(true);
      setIsCreatingSOS(false);
      return;
    }

    try {
      let lat = 45.4642; // Default Milan
      let lng = 9.1900;

      if (sosLocation) {
        lat = sosLocation[0];
        lng = sosLocation[1];
      }

      const sosRef = doc(collection(db, 'sosRequests'));
      const userRef = doc(db, 'users', user.uid);
      const txRef = doc(collection(db, 'transactions'));

      await runTransaction(db, async (transaction) => {
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists()) throw new Error('User not found');
        
        const userData = userSnap.data();
        
        // IDEMPOTENCY CHECK: If this transaction ID was already processed, skip
        if (userData.lastTxId === txRef.id) {
          console.log("Transaction already processed, skipping balance decrement.");
          return;
        }

        const currentBalance = userData.balance || 0;
        
        // 1. Deduct balance from cyclist
        const updateData: any = {
          updatedAt: serverTimestamp(),
          lastTxId: txRef.id
        };
        
        // Only decrement if we haven't already (double-safety with lastTxId check above)
        if (userData.lastTxId !== txRef.id) {
          if (currentBalance < price) throw new Error('Insufficient balance');
          updateData.balance = increment(-price);
        }

        if (appliedDiscount) {
            updateData.firstInterventionDiscount = 0;
        }

        transaction.update(userRef, updateData);
        
        transaction.set(txRef, {
            fromId: user?.uid,
            toId: 'ESCROW',
            amount: price,
            currency: 'DoctorBike Coin',
            createdAt: serverTimestamp(),
            type: 'SOS_PAYMENT',
            sosId: sosRef.id // Link to SOS request
        });

        // 2. Create the SOS request
        transaction.set(sosRef, {
          cyclistId: user?.uid,
          cyclistName: user?.displayName || 'Cyclist',
          description: sosDescription,
          photos: sosPhotos,
          status: 'PENDING',
          mechanicId: null,
          faultType,
          lat,
          lng,
          estimatedPrice: price,
          originalPrice: basePrice, 
          hasDiscount: appliedDiscount,
          paymentStatus: 'ESCROW', // Fix: match the log's expectation of ESCROW
          createdAt: serverTimestamp(),
        });
      });

      setShowSOSForm(false);
      setSosDescription('');
      setSosPhotos([]);
      setSelectedFaultType(null);
    } catch (err) {
      console.error(err);
      if ((err as Error).message === 'Insufficient balance') {
        setShowInsufficientFunds(true);
      } else {
        handleFirestoreError(err, OperationType.WRITE, 'sosRequests/creation');
      }
    } finally {
      setIsCreatingSOS(false);
      (window as any).firebaseTransactionInProgress = false;
      localStorage.removeItem('fb_tx_lock');
    }
  };

  const autoCancelSOS = async () => {
    if (!activeSOS || !user) return;
    try {
      const sosRef = doc(db, 'sosRequests', activeSOS.id);
      const userRef = doc(db, 'users', user.uid);

      await runTransaction(db, async (transaction) => {
        const sosSnap = await transaction.get(sosRef);
        if (!sosSnap.exists()) return;
        
        const data = sosSnap.data();
        if (data.status !== 'ACCEPTED') return;

        const refundAmount = data.estimatedPrice || 15.00;
        const txRef = doc(collection(db, 'transactions'));
        
        transaction.update(userRef, {
          balance: increment(refundAmount),
          updatedAt: serverTimestamp(),
          lastTxId: txRef.id
        });
        
        transaction.set(txRef, {
            fromId: 'ESCROW',
            toId: user?.uid,
            amount: refundAmount,
            currency: 'DoctorBike Coin',
            createdAt: serverTimestamp(),
            type: 'SOS_REFUND_TIMEOUT'
        });
        
        transaction.update(sosRef, {
          status: 'CANCELLED',
          cancelReason: 'TIMEOUT',
          paymentStatus: 'REFUNDED',
          updatedAt: serverTimestamp()
        });
      });
    } catch (e) {
      console.error('Auto-cancel error:', e);
    }
  };

  useEffect(() => {
    if (activeSOS?.status === 'ACCEPTED' && activeSOS?.acceptedAt) {
      const acceptedAt = activeSOS.acceptedAt instanceof Date 
        ? activeSOS.acceptedAt 
        : new Date((activeSOS.acceptedAt.seconds || 0) * 1000);
      
      const updateTimeout = () => {
        const now = new Date();
        const diffSeconds = Math.floor((now.getTime() - acceptedAt.getTime()) / 1000);
        const remaining = 600 - diffSeconds; // 10 minutes

        if (remaining <= 0) {
          setSosTimeoutSeconds(0);
          autoCancelSOS();
        } else {
          setSosTimeoutSeconds(remaining);
        }
      };

      updateTimeout();
      const interval = setInterval(updateTimeout, 1000);
      return () => clearInterval(interval);
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSosTimeoutSeconds(null);
    }
  }, [activeSOS?.status, activeSOS?.acceptedAt]);

  const [isCancelling, setIsCancelling] = useState(false);

  const cancelSOS = async () => {
    if (!activeSOS || !user) return;
    setIsCancelling(true);
    (window as any).firebaseTransactionInProgress = true;
    localStorage.setItem('fb_tx_lock', Date.now().toString());
    try {
      const sosRef = doc(db, 'sosRequests', activeSOS.id);
      const userRef = doc(db, 'users', user.uid);

      await runTransaction(db, async (transaction) => {
        const sosSnap = await transaction.get(sosRef);
        if (!sosSnap.exists()) throw new Error('SOS not found');
        
        const data = sosSnap.data();
        if (data.status !== 'PENDING') {
          throw new Error('Cannot cancel an accepted request');
        }

        // Refund the escrowed amount
        const refundAmount = data.estimatedPrice || 15.00;
        const txRef = doc(collection(db, 'transactions'));
        
        transaction.update(userRef, {
          balance: increment(refundAmount),
          updatedAt: serverTimestamp(),
          lastTxId: txRef.id
        });
        
        transaction.set(txRef, {
            fromId: 'ESCROW',
            toId: user?.uid,
            amount: refundAmount,
            currency: 'DoctorBike Coin',
            createdAt: serverTimestamp(),
            type: 'SOS_REFUND_CANCEL'
        });
        
        transaction.update(sosRef, {
          status: 'CANCELLED',
          paymentStatus: 'REFUNDED',
          updatedAt: serverTimestamp()
        });
      });

      setShowSOSDetails(false);
      setActiveSOS(null);
    } catch (err: any) {
      console.error('Error cancelling SOS:', err);
      if (err.message === 'Cannot cancel an accepted request') {
        toast.error('Non puoi annullare una richiesta già presa in carico da un meccanico.');
      }
    } finally {
      setIsCancelling(false);
      (window as any).firebaseTransactionInProgress = false;
      localStorage.removeItem('fb_tx_lock');
    }
  };

  const [isJoiningEventId, setIsJoiningEventId] = useState<string | null>(null);

  const toggleJoin = async (event: any) => {
    if (!user) return;
    const isJoined = event.participants?.includes(user?.uid);
    setIsJoiningEventId(event.id);

    try {
      if (isJoined) {
        await updateDoc(doc(db, 'events', event.id), {
          participants: arrayRemove(user?.uid),
          participantCount: increment(-1)
        });
        await updateDoc(doc(db, 'chats', event.id), {
          participants: arrayRemove(user?.uid)
        });
        
        // Update local selected state
        if (selectedEventDetails?.id === event.id) {
           setSelectedEventDetails({
             ...selectedEventDetails,
             participants: selectedEventDetails.participants.filter((id: string) => id !== user.uid),
             participantCount: Math.max(0, selectedEventDetails.participantCount - 1)
           });
        }
      } else {
        if (event.participantCount >= event.maxParticipants) {
          toast.error('Gruppo Pieno');
          setIsJoiningEventId(null);
          return;
        }
        await updateDoc(doc(db, 'events', event.id), {
          participants: arrayUnion(user?.uid),
          participantCount: increment(1)
        });
        await updateDoc(doc(db, 'chats', event.id), {
          participants: arrayUnion(user?.uid)
        });
        
        // Update local selected state
        if (selectedEventDetails?.id === event.id) {
           setSelectedEventDetails({
             ...selectedEventDetails,
             participants: [...(selectedEventDetails.participants || []), user.uid],
             participantCount: selectedEventDetails.participantCount + 1
           });
        }
        
        // Open chat
        setDirectChat({ id: event.id, name: event.title });
        setShowChat(true);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsJoiningEventId(null);
    }
  };

  const toggleOnline = async () => {
    if (!user || !profile) return;
    try {
      const newStatus = !profile.isOnline;
      
      // OPTIMISTIC UPDATE for LIVE feel
      useAuthStore.getState().setProfile({ ...profile, isOnline: newStatus });
      
      setOnlineMsg({text: newStatus ? 'ONLINE' : 'OFFLINE', isOnline: newStatus});
      setTimeout(() => setOnlineMsg(null), 3000);

      const updateData: any = {
        isOnline: newStatus,
        updatedAt: serverTimestamp()
      };
      if (!newStatus) {
        updateData.lastLat = null;
        updateData.lastLng = null;
        updateData.location = null;
      }
      await updateDoc(doc(db, 'users', user?.uid), updateData);
    } catch (err) {
      console.error(err);
      // Revert if failed
      useAuthStore.getState().setProfile({ ...profile, isOnline: profile.isOnline });
    }
  };

  return (
    <div className="flex flex-col relative bg-white transition-colors duration-500" style={{ height: '100dvh', width: '100%', minHeight: '100dvh' }}>
      <AnimatePresence>
        {showAcceptedToast && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="absolute top-4 left-4 right-4 z-50 bg-accent text-white p-4 rounded-2xl shadow-2xl flex items-start gap-4 border border-white/20"
          >
            <div className="bg-white/20 p-2 rounded-xl mt-1">
               <Navigation2 className="text-white" size={24} />
            </div>
            <div className="flex-1">
               <h4 className="font-black text-sm uppercase tracking-widest">{t('cyclist.sosAccepted', { defaultValue: 'Richiesta SOS Accettata!' })}</h4>
               <p className="text-xs font-bold text-white/80 mt-1">
                 Il meccanico {activeSOS?.mechanicName || ''} sta arrivando.
                 {eta && ` Tempo stimato: ~${eta} min.`}
               </p>
            </div>
            <button onClick={() => setShowAcceptedToast(false)} className="text-white/80 hover:text-white mt-1">
               <X size={20} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HUD & Top UI */}
      {activeTab === 'MAP' && (
        <div className="absolute top-0 left-0 right-0 z-10 p-4 pt-[calc(1rem+env(safe-area-inset-top))] pointer-events-none">
          <div className="flex justify-between items-start">
            <div className="flex flex-col gap-3">
              <div className="pointer-events-auto flex items-center gap-3 bg-white/90  backdrop-blur-md px-2.5 py-2 rounded-2xl shadow-lg transition-colors border border-grey/10  w-fit">
                <button onClick={() => setActiveTab('PROFILE')} className="bg-white rounded-full p-0.5 shadow-sm border-2 border-primary/20 overflow-hidden w-9 h-9 shrink-0">
                  <img src={profile?.photoURL || user?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.uid}`} alt="Avatar" className="w-full h-full object-cover" />
                </button>
                <div className="min-w-0 pr-2 hidden sm:block">
                  <h4 className="text-[9px] font-black uppercase text-grey  leading-none mb-0.5">{t('nav.profile')}</h4>
                  <p className="text-xs font-bold text-black  truncate max-w-[80px]">{user?.displayName || 'Cyclist'}</p>
                </div>
              </div>

              <div className="flex flex-col items-start gap-2 pointer-events-auto">
                 <div className="relative bg-white/90  backdrop-blur-md rounded-2xl p-2 shadow-lg transition-colors flex flex-col items-center gap-3 w-fit border border-grey/10 ">
                    <AnimatePresence>
                      {onlineMsg && (
                        <motion.div 
                          initial={{ opacity: 0, x: 20, scale: 0.8 }} 
                          animate={{ opacity: 1, x: 0, scale: 1 }} 
                          exit={{ opacity: 0, x: 10, scale: 0.8 }} 
                          className={`absolute left-full ml-3 whitespace-nowrap text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-lg border border-white/20 z-10 ${onlineMsg.isOnline ? 'bg-accent text-white shadow-accent/30' : 'bg-grey text-white shadow-grey/30'}`}
                        >
                          {onlineMsg.text}
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <button onClick={toggleOnline} className="text-primary transition-colors p-1.5" title="Ghost Mode">
                      {!profile?.isOnline ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                    <div className="w-8 h-px bg-grey/20 " />
                    <button 
                      onClick={toggleOnline} 
                      className={`flex flex-col items-center gap-1.5 px-2 py-2 rounded-xl text-[7px] font-black uppercase tracking-widest transition-all ${profile?.isOnline ? 'bg-accent/10 text-accent' : 'bg-grey/10 text-grey '}`}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full ${profile?.isOnline ? 'bg-accent animate-pulse' : 'bg-grey'}`} />
                      {profile?.isOnline ? t('mechanic.online') : t('mechanic.offline')}
                    </button>
                 </div>
              </div>
              
              <div className="flex flex-col gap-2 pointer-events-auto">
                <div className="bg-white/80  backdrop-blur-sm px-3 py-1.5 rounded-full shadow-md flex items-center gap-2 transition-colors w-fit border border-grey/5">
                   <span className={`w-2 h-2 rounded-full ${nearbyCount > 0 ? 'bg-accent animate-pulse' : 'bg-danger'}`} />
                   <span className="text-[9px] font-bold uppercase tracking-tight text-black ">{nearbyCount} {t('cyclist.nearTip')}</span>
                </div>
                <div className="bg-white/80  backdrop-blur-sm px-3 py-1.5 rounded-full shadow-md flex items-center gap-2 transition-colors w-fit border border-grey/5">
                   <span className={`w-2 h-2 rounded-full ${nearbyCyclistsCount > 0 ? 'bg-primary animate-pulse' : 'bg-danger'}`} />
                   <span className="text-[9px] font-bold uppercase tracking-tight text-black ">{nearbyCyclistsCount} {t('cyclist.nearCyclists')}</span>
                </div>
              </div>
            </div>
            
            <div className="flex flex-col items-end gap-3 pointer-events-auto">
               <Logo size="sm" className="pointer-events-auto bg-white/80  backdrop-blur-md px-3 py-2 rounded-2xl shadow-lg shadow-primary/5" />
               
               <div className="bg-white/90  backdrop-blur-md rounded-2xl p-2 shadow-lg transition-colors flex flex-col items-center gap-3 w-fit border border-grey/10 ">                 
                 <button 
                   onClick={() => setShowAIDoctor(true)}
                   className="bg-accent text-white rounded-xl p-2.5 shadow-lg relative group transition-transform active:scale-90"
                 >
                    <Sparkles size={18} />
                 </button>
                 
                 <div className="w-8 h-px bg-grey/20 " />

                 <button 
                   onClick={() => i18n.changeLanguage(i18n.language === 'it' ? 'en' : 'it')}
                   className="p-1 px-2 text-primary font-bold text-[10px] bg-grey/5 rounded-lg"
                 >
                    {i18n.language === 'it' ? 'EN' : 'IT'}
                 </button>
               </div>

               <button className="bg-white text-black rounded-full p-2.5 shadow-lg text-primary  border border-grey/10">
                  <Bell size={18} />
               </button>
            </div>
          </div>
        </div>
      )}

      {/* Main View */}
      <div className="relative overflow-hidden" style={{ flex: '1 1 0%', minHeight: 0 }}>
        {/* Main Content Area - Render all tabs but show only active one for instant switching */}
        <div className="absolute inset-0 overflow-hidden">
          {/* SOS Overlay Chat / Direct Chat View */}
          <AnimatePresence>
            {showChat && directChat && (
              <motion.div 
                key="chat-sos-overlay"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="absolute inset-0 z-30 flex flex-col bg-white pb-[110px]"
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

          {/* Map Tab */}
          <div className={`absolute inset-0 transition-opacity duration-300 ${activeTab === 'MAP' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
            <Map 
                mechanicToTrackId={activeSOS?.mechanicId} 
                onStartChat={startDirectChat}
                onViewEventDetails={(event) => setSelectedEventDetails(event)}
                onViewReportDetails={(report) => {
                  setSelectedReport(report);
                }}
                center={focusedPos || undefined}
              />
          </div>

          {/* Social / Community Tab */}
          <div className={`absolute inset-0 overflow-y-auto transition-opacity duration-300 ${activeTab === 'COMMUNITY' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
            <SocialView 
              onStartChat={startDirectChat} 
              onFocusEvent={handleFocusOnEvent} 
              onViewEventDetails={(event) => setSelectedEventDetails(event)}
            />
          </div>

          {/* Profile Tab */}
          <div className={`absolute inset-0 overflow-y-auto scroll-smooth bg-white text-black border border-grey/10 shadow-sm pb-48 transition-opacity duration-300 ${activeTab === 'PROFILE' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
            <ProfileView isAvailable={profile?.isOnline} onToggleAvailability={toggleOnline} />
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
                    }} 
                    onViewProfile={setViewProfileId}
                  />
                  <Chat chatId={directChat.id} otherPartyName={directChat.name} isAdminSupport={directChat.isAdminSupport} />
                </>
              ) : (
                <>
                  <div className="bg-primary p-4 flex items-center gap-4 text-white">
                    <h3 className="font-bold text-sm">{t('nav.chat')}</h3>
                  </div>
                  <ChatListView 
                    chats={displayChats} 
                    onSelectChat={(chat: any) => {
                      setDirectChat({ id: chat.id, name: chat.fetchedProfileName || chat.otherPartyName || chat.title || 'Chat' });
                    }}
                    currentUserId={user?.uid || ''}
                  />
                </>
              )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {selectedEventDetails && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center px-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedEventDetails(null)}
              className="absolute inset-0 bg-dark/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white text-black w-full max-w-[calc(100vw-2rem)] sm:max-w-md rounded-[2rem] sm:rounded-[3rem] p-6 sm:p-8 relative shadow-2xl transition-colors mx-auto"
            >
              <button 
                onClick={() => setSelectedEventDetails(null)}
                className="absolute top-6 right-6 text-grey hover:text-black :text-white transition-colors"
              >
                <X size={24} />
              </button>

              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                  <Calendar size={32} />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-black  transition-colors uppercase tracking-tight">{selectedEventDetails.title}</h3>
                  <p className="text-xs text-grey italic">{selectedEventDetails.organizerName ? `Organizzato da ${selectedEventDetails.organizerName}` : 'Evento di gruppo'}</p>
                </div>
              </div>

              <div className="space-y-4 mb-8">
                <div className="flex items-center gap-3 text-sm text-black  font-bold transition-colors">
                  <Clock size={18} className="text-primary" />
                  {new Date(selectedEventDetails.startAt).toLocaleString()}
                </div>
                <div className="flex items-center gap-3 text-sm text-black  font-bold transition-colors">
                  <MapPin size={18} className="text-primary" />
                  {selectedEventDetails.address || 'Posizione non specificata'}
                </div>
                <div className="flex items-center gap-3 text-sm text-black  font-bold transition-colors">
                  <Users size={18} className="text-primary" />
                  {selectedEventDetails.participantCount} / {selectedEventDetails.maxParticipants} Partecipanti
                </div>
                {selectedEventDetails.targetLevel && (
                  <div className="flex items-center gap-3 text-sm text-black  font-bold transition-colors">
                    <Bike size={18} className="text-primary" />
                    Livello Richiesto: {selectedEventDetails.targetLevel}
                  </div>
                )}
                {selectedEventDetails.description && (
                  <div className="mt-4 p-4 bg-white text-black border border-grey/10 shadow-sm rounded-2xl">
                    <p className="text-xs text-grey  leading-relaxed italic">{selectedEventDetails.description}</p>
                  </div>
                )}
              </div>

              {selectedEventDetails.participants?.includes(user?.uid) ? (
                <div className="flex flex-col sm:flex-row gap-3">
                  <button 
                    onClick={() => {
                      setDirectChat({ id: selectedEventDetails.id, name: selectedEventDetails.title });
                      setShowChat(true);
                      setSelectedEventDetails(null);
                    }}
                    className="flex-1 bg-primary text-white font-black py-4 rounded-2xl shadow-xl shadow-primary/20 flex items-center justify-center gap-2 text-xs sm:text-sm"
                  >
                    <MessageCircle size={20} className="shrink-0" /> CHAT GRUPPO
                  </button>
                  <button 
                    onClick={() => {
                      toggleJoin(selectedEventDetails);
                    }}
                    disabled={isJoiningEventId === selectedEventDetails.id}
                    className="flex-shrink-0 px-6 py-4 sm:py-0 bg-red-50 text-red-500 font-bold rounded-2xl text-xs sm:text-sm shadow-sm transition-transform active:scale-95 disabled:opacity-50"
                  >
                    {isJoiningEventId === selectedEventDetails.id ? 'ATTENDI...' : 'ABBANDONA'}
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => {
                    toggleJoin(selectedEventDetails);
                  }}
                  disabled={selectedEventDetails.participantCount >= selectedEventDetails.maxParticipants || isJoiningEventId === selectedEventDetails.id}
                  className="w-full bg-primary text-white font-black py-4 rounded-2xl shadow-xl shadow-primary/20 disabled:bg-grey/20 disabled:shadow-none transition-transform active:scale-95"
                >
                  {isJoiningEventId === selectedEventDetails.id ? 'ATTENDI...' : selectedEventDetails.participantCount >= selectedEventDetails.maxParticipants ? 'GRUPPO PIENO' : 'PARTECIPA ORA'}
                </button>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* SOS HUD - Minimal view */}
      <AnimatePresence>
        {activeSOS && !showSOSDetails && (
          <motion.div 
            initial={{ y: 40, opacity: 0, scale: 0.95 }}
            animate={{ 
              y: 0, 
              x: 0,
              scale: isSOSMinimized ? 0.9 : 1,
              opacity: 1 
            }}
            exit={{ y: 40, opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className={`fixed ${isSOSMinimized ? 'bottom-64 right-4 w-12 h-12' : 'bottom-28 left-4 right-4'} origin-bottom-right z-20 flex flex-col gap-3 pointer-events-auto transition-all duration-500`}
          >
            {/* Status Card */}
            <div 
              onClick={() => isSOSMinimized ? setIsSOSMinimized(false) : setShowSOSDetails(true)}
              className={`glass-card !bg-primary text-black border-none shadow-2xl flex flex-col p-4 cursor-pointer hover:scale-[1.05] active:scale-95 transition-all w-full h-full ${isSOSMinimized ? 'rounded-xl justify-center items-center p-0' : 'rounded-[2rem]'}`}
            >
              <div className={`flex items-center w-full h-full ${isSOSMinimized ? 'justify-center' : 'justify-between'}`}>
                <div className={`flex items-center gap-3 ${isSOSMinimized ? 'w-full h-full justify-center' : ''}`}>
                  <div className={`${isSOSMinimized ? 'w-full h-full rounded-xl bg-transparent text-black' : 'w-10 h-10 rounded-xl bg-black/10 text-black'} flex items-center justify-center ${activeSOS.status === 'ACCEPTED' || activeSOS.status === 'IN_PROGRESS' ? (isSOSMinimized ? 'text-black' : 'bg-accent text-white shadow-lg shadow-accent/20') : activeSOS.status === 'COMPLETED' ? (isSOSMinimized ? 'text-black' : 'bg-green-500 text-white shadow-lg shadow-green-500/20') : activeSOS.status === 'DISPUTED' ? (isSOSMinimized ? 'text-black' : 'bg-danger text-white shadow-lg shadow-danger/20') : (isSOSMinimized ? 'text-black' : 'animate-pulse')}`}>
                    {activeSOS.status === 'ACCEPTED' || activeSOS.status === 'IN_PROGRESS' ? <Navigation2 size={20} className="animate-bounce" /> : activeSOS.status === 'COMPLETED' ? <Sparkles size={20} /> : activeSOS.status === 'DISPUTED' ? <AlertTriangle size={20} className="animate-pulse" /> : <Clock size={20} />}
                  </div>
                  {!isSOSMinimized && (
                    <div>
                      <h4 className="font-black text-xs uppercase tracking-tight">
                        {activeSOS.status === 'PENDING' 
                          ? (nearbyCount > 0 ? t('cyclist.searching') : t('cyclist.noMechanics')) 
                          : activeSOS.status === 'COMPLETED'
                          ? 'Intervento Completato'
                          : activeSOS.status === 'DISPUTED'
                          ? 'In Contestazione'
                          : (trackedMechanic?.name || t('cyclist.mechanicComing'))}
                      </h4>
                      <p className="text-[9px] text-black/70  uppercase font-black tracking-widest">{getFaultTypeTranslation(activeSOS.faultType)}</p>
                    </div>
                  )}
                </div>
                {!isSOSMinimized && (
                  <div className="flex gap-1.5">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setIsSOSMinimized(true); }}
                      className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
                      title="Riduci icona"
                    >
                      <X size={18} />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setShowSOSDetails(true); }}
                      className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
                    >
                      <Eye size={18} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating SOS Button and Road Report (Only on Map Tab if no active SOS) */}
      {activeTab === 'MAP' && !activeSOS && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-20 flex gap-4">
           <button 
             onClick={() => setShowRoadReportModal(true)}
             className="bg-warning text-white rounded-full w-14 h-14 flex items-center justify-center shadow-lg shadow-warning/30 hover:scale-105 active:scale-95 transition-transform"
           >
             <AlertCircle size={24} />
           </button>
           <button 
             onClick={() => setShowSOSForm(true)}
             className="sos-button group"
           >
             <motion.div
               animate={{ scale: [1, 1.05, 1] }}
               transition={{ duration: 1.5, repeat: Infinity }}
               className="flex flex-col items-center -space-y-0.5"
             >
               <AlertCircle size={22} className="text-white" />
               <span className="text-[8px] font-black uppercase tracking-widest text-white">SOS</span>
             </motion.div>
           </button>
        </div>
      )}

      {/* Navigation */}
      <div className="absolute bottom-0 left-0 right-0 bg-white/95 backdrop-blur-2xl border-t border-grey/5 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] z-40 transition-all shadow-[0_-10px_40px_-5px_rgba(0,0,0,0.05)]">
        <div className="flex items-center justify-between px-1 sm:px-4 max-w-xl mx-auto relative">
          <div className="flex-1 flex justify-around items-center">
            <NavButton active={activeTab === 'MAP' && !showChat} onClick={() => { setActiveTab('MAP'); setShowChat(false); }} icon={<MapPin />} label={t('nav.home')} />
            <NavButton active={activeTab === 'COMMUNITY'} onClick={() => setActiveTab('COMMUNITY')} icon={<Bike />} label={t('nav.social')} />
          </div>
          
          <div className="w-16 sm:w-20 flex-shrink-0 flex justify-center relative -mt-12 group z-10">
              <button 
                onClick={toggleOnline}
                className={`w-16 h-16 rounded-[2rem] flex items-center justify-center shadow-xl transition-all duration-500 active:scale-95 ${profile?.isOnline ? 'bg-primary text-white scale-110 shadow-primary/40 ring-4 ring-primary/20' : 'bg-grey/20  text-grey  shadow-none border border-white/5 rotate-45'}`}
              >
                 <Power size={28} className={profile?.isOnline ? 'animate-pulse' : ''} />
              </button>
          </div>

          <div className="flex-1 flex justify-around items-center">
            <NavButton 
              active={activeTab === 'CHAT' || showChat} 
              onClick={() => { setActiveTab('CHAT'); setDirectChat(null); setShowChat(false); }} 
              icon={<MessageCircle />} 
              label={t('nav.chat')} 
              badge={unreadCount > 0 ? unreadCount : undefined}
            />
            <NavButton active={activeTab === 'PROFILE'} onClick={() => setActiveTab('PROFILE')} icon={<User />} label={t('nav.profile')} />
          </div>
        </div>
      </div>

      {/* Full SOS Details Side Panel */}
      <AnimatePresence>
        {showSOSDetails && activeSOS && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSOSDetails(false)}
              className="fixed inset-0 bg-dark/60 backdrop-blur-md z-[100]"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 right-0 w-full max-w-md bg-white  z-[110] shadow-2xl flex flex-col h-full transition-colors"
            >
              <div className="p-6 pt-12 border-b border-light-bg  flex items-center justify-between bg-primary  text-white shrink-0 transition-colors">
                <div className="flex items-center gap-3">
                  <button onClick={() => setShowSOSDetails(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                    <ArrowLeft size={24} />
                  </button>
                  <div>
                    <h2 className="text-xl font-black uppercase tracking-tight">{t('cyclist.sendRequest')}</h2>
                    <p className="text-[10px] opacity-70 uppercase tracking-widest">ID: {activeSOS.id.substring(0, 8)}</p>
                  </div>
                </div>
                <div className="px-3 py-1 bg-white/20 rounded-full text-[10px] font-black uppercase tracking-widest">
                  {activeSOS.status}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8 scroll-smooth">
                {/* Status Indicator */}
                <div className="bg-white text-black shadow-sm border border-grey/10 rounded-3xl p-6 flex items-center gap-5 border border-grey/5  transition-colors">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg ${activeSOS.status === 'ACCEPTED' ? 'bg-accent' : activeSOS.status === 'DISPUTED' ? 'bg-danger' : 'bg-primary  animate-pulse'}`}>
                    {activeSOS.status === 'ACCEPTED' ? <Navigation2 size={32} className="text-white" /> : activeSOS.status === 'DISPUTED' ? <AlertTriangle size={32} className="text-white" /> : <Clock size={32} className="text-white" />}
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-primary  uppercase leading-tight transition-colors">
                       {activeSOS.status === 'PENDING' ? t('cyclist.searching') : activeSOS.status === 'DISPUTED' ? 'In Contestazione' : t('cyclist.mechanicComing')}
                    </h3>
                    <p className="text-sm text-grey  font-medium uppercase tracking-wide transition-colors">{getFaultTypeTranslation(activeSOS.faultType)}</p>
                  </div>
                </div>

                {/* Tracking & Stats */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white text-black shadow-sm border border-grey/10 p-5 rounded-3xl border border-grey/5  transition-colors text-black ">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-grey  mb-1 transition-colors">Distanza</p>
                    <p className="text-2xl font-black text-primary  italic transition-colors">
                      {distance?.toFixed(1) || '--'} <span className="text-[10px] uppercase">km</span>
                    </p>
                  </div>
                  <div className="bg-white text-black shadow-sm border border-grey/10 p-5 rounded-3xl border border-grey/5  transition-colors text-black ">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-grey  mb-1 transition-colors">Tempo Stimato</p>
                    <p className="text-2xl font-black text-primary  italic transition-colors">
                      {eta ? `${eta}-${eta+2}` : '--'} <span className="text-[10px] uppercase">min</span>
                    </p>
                  </div>
                </div>

                {/* Embedded Map */}
                {activeSOS.status === 'ACCEPTED' && activeSOS.mechanicId && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-grey">Tracciamento in tempo reale</p>
                      <div className="flex items-center gap-1.5">
                         <div className="w-1.5 h-1.5 bg-accent rounded-full animate-ping" />
                         <span className="text-[8px] font-black text-accent uppercase tracking-widest">Live</span>
                      </div>
                    </div>
                    <div className="h-40 rounded-3xl overflow-hidden border border-grey/10 shadow-sm relative z-0">
                      <Map 
                        center={[activeSOS.lat, activeSOS.lng]} 
                        mechanicToTrackId={activeSOS.mechanicId}
                        minimal={true}
                      />
                    </div>
                  </div>
                )}

                {/* Admin Help Integration */}
                {userSupportTicket && (
                  <div className="bg-primary/5 border border-primary/20 p-5 rounded-3xl flex items-center justify-between mt-2 mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-primary/10 text-primary rounded-2xl flex items-center justify-center">
                        <Shield size={24} />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-primary uppercase tracking-widest leading-none">Supporto Admin</p>
                        <p className="text-[9px] font-bold text-grey uppercase tracking-tighter mt-1.5">L'admin ha avviato una chat di assistenza</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => {
                        setDirectChat({ 
                          id: userSupportTicket.id, 
                          name: 'Doctorbike Admin',
                          isAdminSupport: true 
                        } as any);
                        setShowChat(true);
                        setShowSOSDetails(false);
                      }}
                      className="bg-primary text-white px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20 active:scale-95 transition-all"
                    >
                      Apri Chat
                    </button>
                  </div>
                )}

                {/* Mechanic Details */}
                {activeSOS.status === 'ACCEPTED' && trackedMechanic && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-grey">{t('auth.mechanic')}</p>
                      {sosTimeoutSeconds !== null && (
                        <div className="flex items-center gap-1.5 px-3 py-1 bg-danger/10 border border-danger/20 rounded-full animate-pulse">
                          <Clock size={12} className="text-danger" />
                          <span className="text-[10px] font-black text-danger uppercase tracking-widest">
                            Timeout per risposta: {Math.floor(sosTimeoutSeconds / 60)}:{(sosTimeoutSeconds % 60).toString().padStart(2, '0')}
                          </span>
                        </div>
                      )}
                      <button 
                        onClick={() => { 
                          setShowSOSDetails(false); 
                          setDirectChat({ id: activeSOS.id, name: trackedMechanic?.name || t('auth.mechanic') });
                          setShowChat(true); 
                        }}
                        className="text-accent text-[10px] font-black uppercase tracking-widest hover:underline"
                      >
                        Apri Chat
                      </button>
                    </div>
                    <div className="flex items-center justify-between bg-white border border-grey/10 p-5 rounded-3xl shadow-sm">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-accent/10">
                          <img src={trackedMechanic.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${trackedMechanic.uid}`} alt="Mechanic" className="w-full h-full object-cover" />
                        </div>
                        <div>
                          <h4 className="font-black text-black text-lg uppercase tracking-tight">{trackedMechanic.name}</h4>
                          <p className="text-xs text-grey font-bold flex items-center gap-1">
                            <Bike size={12} className="text-accent" />
                            {trackedMechanic.transportType || 'Bici'} 
                          </p>
                        </div>
                      </div>
                      <button 
                         onClick={() => { 
                           setShowSOSDetails(false); 
                           setDirectChat({ id: activeSOS.id, name: trackedMechanic?.name || t('auth.mechanic') });
                           setShowChat(true); 
                         }}
                         className="bg-accent text-white p-4 rounded-2xl shadow-lg shadow-accent/20 hover:scale-105 active:scale-95 transition-transform"
                      >
                        <MessageCircle size={24} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Edit Form */}
                <div className="space-y-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-grey">{t('cyclist.faultDescription')}</p>
                  <div className="bg-white rounded-3xl p-5 border border-grey/5 space-y-4">
                    <div className="relative">
                      <textarea
                        value={tempDescription}
                        onChange={(e) => setTempDescription(e.target.value)}
                        onFocus={() => { if(!isEditingDescription) setTempDescription(activeSOS.description || ''); setIsEditingDescription(true); }}
                        className="w-full bg-white border border-grey/10 rounded-2xl p-4 text-base text-black min-h-[120px] focus:ring-2 focus:ring-accent outline-none resize-none transition-all placeholder:italic"
                        placeholder={t('cyclist.faultPlaceholder')}
                      />
                      <AnimatePresence>
                        {isEditingDescription && (
                          <motion.button 
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            onClick={async () => {
                              try {
                                await updateDoc(doc(db, 'sosRequests', activeSOS.id), {
                                  description: tempDescription,
                                  updatedAt: serverTimestamp()
                                });
                                setIsEditingDescription(false);
                              } catch (e) {
                                console.error(e);
                              }
                            }}
                            className="absolute right-3 bottom-3 bg-accent text-white p-3 rounded-xl shadow-xl hover:scale-110 active:scale-90 transition-transform"
                          >
                            <Send size={18} />
                          </motion.button>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="flex flex-wrap gap-2">
                       <label className="flex items-center gap-2 bg-white px-4 py-3 rounded-2xl border border-grey/10 cursor-pointer hover:bg-grey/5 transition-colors">
                          <Camera size={18} className="text-secondary" />
                          <span className="text-[10px] font-black uppercase text-secondary">Aggiungi Foto</span>
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e)} disabled={isUploading} />
                       </label>
                       {isUploading && (
                         <div className="flex items-center px-4 py-3 bg-accent/5 rounded-2xl">
                           <div className="w-2 h-2 bg-accent rounded-full animate-bounce mr-2" />
                           <span className="text-[10px] font-black text-accent uppercase">Caricamento...</span>
                         </div>
                       )}
                    </div>
                  </div>
                </div>

                {/* Photo Gallery */}
                {activeSOS.photos && activeSOS.photos.length > 0 && (
                  <div className="space-y-4">
                     <p className="text-[10px] font-black uppercase tracking-[0.2em] text-grey">Galleria Foto</p>
                     <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide snap-x">
                       {activeSOS.photos.map((photo: string, i: number) => (
                         <div 
                           key={i} 
                           onClick={() => setSelectedPhoto(photo)}
                           className="w-48 h-48 aspect-square rounded-3xl overflow-hidden border border-grey/10 shadow-sm flex-shrink-0 snap-start cursor-pointer hover:scale-[1.02] active:scale-95 transition-transform"
                         >
                            <img src={photo} alt={`Fault ${i}`} className="w-full h-full object-cover" />
                         </div>
                       ))}
                     </div>
                  </div>
                )}

                {/* Actions */}
                <div className="pt-8 space-y-4 pb-[calc(2rem+env(safe-area-inset-bottom)+5rem)]">
                   {activeSOS.mechanicConfirmed && activeSOS.status !== 'COMPLETED' && (
                     <div className="bg-accent/10 p-6 rounded-3xl border-2 border-accent border-dashed mb-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="flex items-center gap-3 mb-4">
                           <div className="w-10 h-10 bg-accent text-white rounded-xl flex items-center justify-center shadow-lg">
                              <Sparkles size={20} />
                           </div>
                           <div>
                              <h4 className="font-black text-accent uppercase text-xs">Intervento Terminato?</h4>
                              <p className="text-[10px] text-accent/70 font-bold">Il meccanico dichiara di aver concluso. Conferma per sbloccare il pagamento.</p>
                           </div>
                        </div>
                        <button 
                          onClick={finalizeJob}
                          className="w-full bg-accent text-white py-4 rounded-3xl font-black uppercase tracking-widest text-xs shadow-xl shadow-accent/20 hover:scale-[1.02] active:scale-95 transition-all"
                        >
                          Conferma e paga riparazione
                        </button>
                     </div>
                   )}

                   <button 
                      onClick={() => cancelSOS()}
                      disabled={isCancelling}
                      className="w-full py-4 bg-danger/10 text-danger rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-danger hover:text-white active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                   >
                     {isCancelling ? 'Annullamento...' : 'Annulla Richiesta SOS'}
                   </button>
                   <button 
                     onClick={() => setShowSOSDetails(false)}
                     className="w-full py-4 text-grey font-black uppercase tracking-widest text-[10px] hover:underline active:scale-95 transition-all"
                   >
                     Chiudi Dettagli
                   </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Insufficient Funds Overlay */}
      <AnimatePresence>
        {showInsufficientFunds && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowInsufficientFunds(false)}
              className="fixed inset-0 bg-dark/60 backdrop-blur-xl z-[300]"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[calc(100vw-2rem)] sm:max-w-sm z-[310]"
            >
              <div className="bg-white text-black rounded-[2rem] sm:rounded-[3rem] p-6 sm:p-8 shadow-2xl text-center relative overflow-hidden border border-danger/10">
                <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-danger to-accent" />
                <div className="w-20 h-20 bg-danger/10 text-danger rounded-[2rem] flex items-center justify-center mx-auto mb-6 rotate-3">
                  <AlertCircle size={40} />
                </div>
                <h3 className="text-2xl font-black text-primary  mb-2 uppercase italic">Saldo Insufficiente</h3>
                <p className="text-grey  text-sm mb-8 leading-relaxed">
                  Il tuo saldo attuale non è sufficiente per coprire la tariffa del meccanico. Ricarica il tuo wallet per procedere.
                </p>
                
                <div className="space-y-3">
                  <button 
                    onClick={() => {
                      setShowInsufficientFunds(false);
                      setShowSOSForm(false);
                      setActiveTab('PROFILE');
                    }}
                    className="w-full bg-primary text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/20 active:scale-95 transition-transform"
                  >
                    Ricarica Wallet
                  </button>
                  <button 
                    onClick={() => setShowInsufficientFunds(false)}
                    className="w-full py-4 text-grey font-bold uppercase tracking-widest text-[10px] hover:underline"
                  >
                    Magari dopo
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSOSForm && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setShowSOSForm(false); setSelectedFaultType(null); setSosStep(1); }}
              className="fixed inset-0 bg-dark/40 backdrop-blur-sm z-[90]"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[2rem] sm:rounded-t-[2.5rem] p-6 sm:p-8 z-[100] shadow-[0_-20px_50px_-10px_rgba(0,0,0,0.3)] max-h-[90dvh] overflow-y-auto pb-safe sm:pb-8 flex flex-col"
            >
              <div className="w-12 h-1.5 bg-grey/20 rounded-full mx-auto mb-6 shrink-0" />
              <button 
                onClick={() => { setShowSOSForm(false); setSelectedFaultType(null); setSosStep(1); }}
                className="absolute top-6 right-6 p-2 bg-grey/10 rounded-full text-grey hover:text-black transition-colors"
                title={t('common.close')}
              >
                <X size={20} />
              </button>

              <div className="flex items-center gap-2 mb-6 max-w-sm mx-auto">
                {[1, 2, 3].map((step) => (
                  <div key={step} className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${sosStep >= step ? 'bg-primary shadow-[0_0_10px_rgba(var(--color-primary),0.5)]' : 'bg-grey/10'}`} />
                ))}
              </div>

              {sosStep === 1 && (
                <div className="fade-in mt-4">
                  <h3 className="text-2xl font-black text-black mb-1 uppercase tracking-tight">{t('cyclist.sendRequest')}</h3>
                  <p className="text-grey text-xs font-bold uppercase mb-8">{t('cyclist.selectIssue')}</p>

                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
                    {faultTypes.map((type) => (
                      <button 
                        key={type.id}
                        onClick={() => setSelectedFaultType(type.id)}
                        className={`flex flex-col items-center p-4 rounded-[1.5rem] transition-all group ${
                          selectedFaultType === type.id 
                            ? 'bg-primary/10 ring-2 ring-primary border-transparent' 
                            : 'bg-white border border-grey/10 shadow-sm hover:bg-grey/5 hover:border-grey/20 hover:scale-[1.02]'
                        }`}
                      >
                        <div className={`p-4 rounded-2xl mb-3 shadow-md transition-all ${
                          selectedFaultType === type.id ? 'bg-primary text-white scale-110 shadow-primary/30' : 'bg-white text-dark/70 group-hover:scale-105 border border-grey/10'
                        }`}>
                          {type.icon}
                        </div>
                        <span className={`text-[10px] font-black uppercase tracking-widest text-center leading-tight ${
                          selectedFaultType === type.id ? 'text-primary' : 'text-dark/80'
                        }`}>{type.label}</span>
                      </button>
                    ))}
                  </div>

                  <button
                    disabled={!selectedFaultType}
                    onClick={() => setSosStep(2)}
                    className="w-full bg-primary text-white py-5 rounded-2xl font-black uppercase tracking-[0.1em] shadow-xl shadow-primary/20 hover:bg-primary/90 hover:scale-[1.02] focus:ring-4 focus:ring-primary/50 focus:outline-none active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-3 mt-4"
                  >
                    Avanti <ArrowRight size={20} />
                  </button>
                </div>
              )}

              {sosStep === 2 && (
                <div className="fade-in mt-4">
                  <button onClick={() => setSosStep(1)} className="flex items-center gap-2 text-grey text-[10px] font-black tracking-widest uppercase mb-6 hover:text-black hover:-translate-x-1 transition-all">
                    <ArrowLeft size={16} /> Indietro
                  </button>
                  <h3 className="text-2xl font-black text-black mb-1 uppercase tracking-tight">Dettagli Guasto</h3>
                  <p className="text-grey text-xs font-bold uppercase mb-8">Fornisci più informazioni al meccanico</p>
                  
                  <div className="mb-8">
                    <label className="text-[10px] font-black uppercase tracking-widest text-dark block mb-3 opacity-60">Descrizione (Opzionale)</label>
                    <textarea 
                      value={sosDescription}
                      onChange={(e) => setSosDescription(e.target.value)}
                      placeholder={t('cyclist.faultPlaceholder')}
                      className="w-full bg-grey/5 border border-grey/10 rounded-[1.5rem] p-5 text-sm focus:ring-2 focus:ring-primary h-32 resize-none mb-6 font-medium shadow-inner placeholder:text-grey/40"
                    />

                    <div className="flex justify-between items-center mb-4">
                       <label className="text-[10px] font-black uppercase tracking-widest text-dark block opacity-60">Foto (Opzionali)</label>
                       <label className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl cursor-pointer hover:scale-105 active:scale-95 transition-all font-black shadow-md shadow-primary/20">
                         <Camera size={16} />
                         <span className="text-[10px] uppercase tracking-widest">Carica</span>
                         <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleImageUpload(e, true)} disabled={isUploading} />
                       </label>
                    </div>

                    {/* Photo Previews */}
                    {sosPhotos.length > 0 && (
                       <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide">
                         {sosPhotos.map((photo, i) => (
                           <div key={i} className="relative group flex-shrink-0">
                             <div className="w-24 h-24 rounded-2xl overflow-hidden border-2 border-grey/10 bg-grey/5 shadow-sm">
                               <img src={photo} alt={`Preview ${i}`} className="w-full h-full object-cover" />
                             </div>
                             <button 
                               onClick={() => setSosPhotos(prev => prev.filter((_, idx) => idx !== i))}
                               className="absolute -top-2 -right-2 bg-danger text-white rounded-full p-1.5 shadow-xl border-2 border-white hover:scale-110 active:scale-90 transition-all"
                             >
                               <X size={12} strokeWidth={3}/>
                             </button>
                           </div>
                         ))}
                         {isUploading && (
                           <div className="w-24 h-24 rounded-2xl bg-grey/5 border-2 border-dashed border-grey/20 flex flex-col items-center justify-center animate-pulse gap-2">
                             <Camera size={24} className="text-grey/40" />
                           </div>
                         )}
                       </div>
                    )}
                    {isUploading && sosPhotos.length === 0 && (
                       <p className="text-[10px] text-primary font-black animate-pulse uppercase tracking-widest flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> {t('common.loading', {defaultValue: 'Caricamento foto'})}</p>
                    )}
                  </div>

                  <button
                    onClick={() => setSosStep(3)}
                    className="w-full bg-primary text-white py-5 rounded-2xl font-black uppercase tracking-[0.1em] shadow-xl shadow-primary/20 hover:bg-primary/90 hover:scale-[1.02] focus:ring-4 focus:ring-primary/50 focus:outline-none active:scale-95 transition-all flex items-center justify-center gap-3"
                  >
                    Conferma Dettagli <ArrowRight size={20} />
                  </button>
                </div>
              )}

              {sosStep === 3 && (
                <div className="fade-in mt-4 flex flex-col flex-1 min-h-[350px] sm:min-h-[400px]">
                  <button onClick={() => setSosStep(2)} className="flex items-center gap-2 text-grey text-[10px] font-black tracking-widest uppercase mb-6 hover:text-black hover:-translate-x-1 transition-all shrink-0">
                    <ArrowLeft size={16} /> Indietro
                  </button>
                  <h3 className="text-2xl font-black text-black mb-1 uppercase tracking-tight shrink-0">Conferma Posizione</h3>
                  <p className="text-grey text-xs font-bold uppercase mb-4 shrink-0">Trascina la mappa per indicare la tua posizione esatta</p>

                  <div className="flex-1 rounded-[1.5rem] overflow-hidden relative border-4 border-primary/20 mb-6 shadow-inner min-h-[220px]">
                      <div className="absolute inset-0 z-0 fade-in">
                        <MapContainer 
                          center={sosLocation || [45.4642, 9.1900]} 
                          zoom={17} 
                          zoomControl={false} 
                          style={{ width: '100%', height: '100%' }}
                        >
                            <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
                            <SOSLocationSelector setLoc={setSosLocation} userLoc={userLocation ? [userLocation.lat, userLocation.lng] : null} />
                        </MapContainer>
                      </div>
                      
                      {/* Fixed Reticle/Pin in the center */}
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full z-[1001] pointer-events-none mb-1">
                         <div className="flex flex-col items-center">
                           <div className="bg-danger text-white px-2 py-1 rounded-md text-[8px] font-black uppercase mb-1 shadow-md">TU SEI QUI</div>
                           <MapPin size={40} className="text-danger drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)] animate-pulse" />
                         </div>
                         <div className="w-1.5 h-1.5 bg-black/40 rounded-full blur-[1px] mx-auto -mt-1" />
                      </div>

                      <div className="absolute top-4 left-4 right-4 bg-primary text-white p-2 rounded-xl z-[1000] text-center text-[10px] font-black uppercase tracking-widest shadow-lg">
                          Centra la mappa sulla tua posizione
                      </div>
                  </div>

                  {nearestMechanic && (
                    <div className="bg-accent/5 p-4 rounded-[1.5rem] border border-accent/10 mb-6 flex flex-col gap-2 shadow-sm shrink-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl overflow-hidden border border-accent/20 bg-white">
                            <img src={nearestMechanic.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${nearestMechanic.uid}`} alt="N" className="w-full h-full object-cover" />
                          </div>
                          <div>
                            <p className="text-[7px] font-black uppercase text-accent tracking-[0.2em]">Tariffa Meccanico</p>
                            <h4 className="font-black text-black text-sm uppercase">DBC {nearestMechanic.sosPrice || 15}</h4>
                          </div>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="text-[10px] font-black text-primary uppercase">Saldo: {profile?.balance || 0} DBC</span>
                        </div>
                      </div>
                      
                      {(() => {
                        const discount = profile?.firstInterventionDiscount !== undefined && profile?.firstInterventionDiscount !== null ? profile.firstInterventionDiscount : (profile?.completedJobs === 0 ? 0.5 : 0);
                        if (discount > 0) {
                          return (
                            <div className="mt-2 bg-primary/10 border border-primary/20 rounded-xl p-3 flex justify-between items-center relative overflow-hidden">
                              <div className="absolute top-0 right-0 w-16 h-16 bg-primary/10 rounded-full blur-xl -translate-y-1/2 translate-x-1/2"></div>
                              <div>
                                <p className="text-[9px] font-black uppercase text-primary tracking-widest flex items-center gap-1">
                                  <Sparkles size={10} /> Sconto 1° Intervento ({(discount * 100).toFixed(0)}%)
                                </p>
                                <p className="text-sm font-black text-black">
                                  Totale: DBC {Math.max(0, (nearestMechanic.sosPrice || 15) - ((nearestMechanic.sosPrice || 15) * discount))}
                                </p>
                              </div>
                              <p className="text-xs font-bold text-grey line-through decoration-danger decoration-2 opacity-60">DBC {nearestMechanic.sosPrice || 15}</p>
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  )}

                  <button
                    disabled={!selectedFaultType || isCreatingSOS || !sosLocation}
                    onClick={() => selectedFaultType && handleSOSRequest(selectedFaultType)}
                    className="w-full shrink-0 bg-danger text-white py-5 rounded-[2rem] font-black uppercase tracking-[0.2em] shadow-2xl shadow-danger/30 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:grayscale disabled:scale-100 flex flex-col items-center justify-center gap-2 relative overflow-hidden"
                  >
                    <div className="flex items-center gap-3">
                      {isCreatingSOS ? (
                        <>
                          <Loader2 size={24} className="animate-spin" />
                          <span className="text-base">Inviando...</span>
                        </>
                      ) : (
                        <>
                          <span className="text-base text-shadow-sm uppercase">Invia SOS ORA</span> <Send size={22} className="drop-shadow-md" />
                        </>
                      )}
                    </div>
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {selectedPhoto && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedPhoto(null)}
              className="fixed inset-0 bg-dark/95 backdrop-blur-xl z-[200]"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="fixed inset-0 z-[210] flex items-center justify-center p-4 pointer-events-none"
            >
              <div className="relative max-w-full max-h-full pointer-events-auto">
                <button 
                  onClick={() => setSelectedPhoto(null)}
                  className="absolute -top-12 right-0 text-white flex items-center gap-2 font-black uppercase text-[10px] tracking-widest"
                >
                  Chiudi <X size={20} />
                </button>
                <img 
                  src={selectedPhoto} 
                  alt="Full view" 
                  className="rounded-3xl shadow-2xl max-h-[80vh] w-auto object-contain border-4 border-white/10" 
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* SOS Completion Popup */}
      <AnimatePresence>
        {showCompletionOverlay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-dark/80 backdrop-blur-md flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-sm bg-white  rounded-[40px] p-8 text-center shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-accent" />
              
              <button 
                onClick={() => setShowCompletionOverlay(false)}
                className="absolute top-4 right-4 p-2 bg-black/5 hover:bg-black/10 rounded-full transition-colors z-10"
              >
                <X size={20} className="text-black" />
              </button>

              <div className="w-20 h-20 bg-accent/20 rounded-3xl flex items-center justify-center mx-auto mb-6 text-accent animate-pulse">
                <Sparkles size={40} className="fill-accent" />
              </div>

              <h2 className="text-2xl font-black text-black  uppercase tracking-tighter italic leading-none mb-4">
                Intervento <br/> <span className="text-accent underline decoration-4 underline-offset-4">Concluso!</span>
              </h2>

              <p className="text-grey  text-sm font-medium mb-8">
                Il meccanico ha confermato di aver terminato la riparazione. Prosegui per confermare tutto ok, lasciare una valutazione e sbloccare il pagamento.
              </p>

              <button
                onClick={finalizeJob}
                disabled={isFinishing}
                className={`w-full ${isFinishing ? 'bg-grey opacity-50 cursor-not-allowed' : 'bg-accent'} text-white py-5 rounded-3xl font-black uppercase tracking-widest text-sm shadow-xl shadow-accent/40 mb-4 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2`}
              >
                {isFinishing && <Loader2 className="animate-spin" size={20} />}
                {isFinishing ? 'Elaborazione...' : 'Conferma e Paga'}
              </button>

              <p className="text-[10px] text-grey font-black uppercase tracking-widest italic opacity-50">
                Transazione Protetta da DoctorBike
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ReviewModal 
        isOpen={showReviewModal}
        onClose={() => {
          setShowReviewModal(false);
          setCompletedJobToReview(null);
          // When closed, if it's completed we might want to clear it from HUD
          // but our listener takes care of it if isReviewed is true
        }}
        sosRequest={completedJobToReview}
        mechanicName={trackedMechanic?.name || 'Meccanico'}
        mechanicId={completedJobToReview?.mechanicId}
        userId={user?.uid || ''}
      />

      <RoadReportModal 
        isOpen={showRoadReportModal}
        onClose={() => setShowRoadReportModal(false)}
      />
      <PublicProfileModal userId={viewProfileId as string} onClose={() => setViewProfileId(null)} />
      <RoadReportDetailModal 
        report={selectedReport} 
        onClose={() => setSelectedReport(null)} 
      />
    </div>
  );
}

function NavButton({ active, icon, label, onClick, badge }: { active: boolean, icon: React.ReactNode, label: string, onClick: () => void, badge?: number }) {
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
          {React.cloneElement(icon as React.ReactElement<any>, { size: active ? 24 : 22, strokeWidth: active ? 2.5 : 2 })}
          {badge !== undefined && badge > 0 && (
            <div className="absolute -top-1 -right-1.5 w-4 h-4 bg-red-500 text-white text-[8px] font-black rounded-full flex items-center justify-center border-2 border-white shadow-sm">
               {badge > 9 ? '9+' : badge}
            </div>
          )}
        </motion.div>
      </div>
      <span className={`text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-opacity duration-300 truncate w-full text-center ${active ? 'opacity-100' : 'opacity-70'}`}>{label}</span>
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

