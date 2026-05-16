import toast from 'react-hot-toast';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { User as FirebaseUser } from 'firebase/auth';
import { collection, query, where, onSnapshot, doc, limit, getDocs, updateDoc, serverTimestamp, orderBy, startAt, endAt } from 'firebase/firestore';
import { geohashQueryBounds, distanceBetween } from 'geofire-common';
import { useTranslation } from 'react-i18next';
import { useThemeStore } from '../store/useThemeStore';
import { useAuthStore } from '../store/useAuthStore';
import { Crosshair, Navigation, Map as MapIcon, Layers, Users, Clock, Star, Clock4, MessageCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { formatDistanceToNow } from 'date-fns';
import { it } from 'date-fns/locale';
import { TFunction } from 'i18next';
import { UserProfile, SOSRequest } from '../types';

// Cache for divIcons to prevent flickering on re-renders
const iconCache = new globalThis.Map<string, L.DivIcon>();

function getCachedDivIcon(options: L.DivIconOptions): L.DivIcon {
  const key = JSON.stringify(options);
  if (!iconCache.has(key)) {
    iconCache.set(key, L.divIcon(options));
  }
  return iconCache.get(key)!;
}

interface MechanicPopupProps {
  mechanic: UserProfile & { id?: string, updatedAt?: any };
  onStartChat?: (id: string, name: string) => void;
  t: TFunction;
  sos?: SOSRequest | null;
  currentUserRole?: string | null;
  currentUser?: FirebaseUser | null;
  getFaultTypeTranslation: (type: string | undefined) => string;
}

function MechanicPopup({ mechanic, onStartChat, t, sos, currentUserRole, currentUser, getFaultTypeTranslation }: MechanicPopupProps) {
  const [avgRating, setAvgRating] = useState<number | null>(null);
  const [reviewCount, setReviewCount] = useState(0);
  const [isAccepting, setIsAccepting] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, 'reviews'),
      where('mechanicId', '==', mechanic.id),
      limit(50)
    );
    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const ratings = snap.docs.map(d => d.data().rating);
        const sum = ratings.reduce((a, b: any) => a + b, 0);
        setAvgRating(sum / ratings.length);
        setReviewCount(ratings.length);
      } else {
        setAvgRating(null);
        setReviewCount(0);
      }
    }, (error) => {
       handleFirestoreError(error, OperationType.LIST, `reviews for mechanic ${mechanic.id}`);
    });
    return () => unsub();
  }, [mechanic.id]);

  const handleAcceptSOS = async () => {
    if (!sos || !currentUser) return;
    setIsAccepting(true);
    try {
      await updateDoc(doc(db, 'sosRequests', sos.id), {
        mechanicId: currentUser.uid,
        status: 'ACCEPTED',
        acceptedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      console.error('Failed to accept SOS', e);
      toast.error(t('common.error') + ': Impossibile accettare SOS');
    } finally {
      setIsAccepting(false);
    }
  };

  return (
    <div className="w-[180px] overflow-hidden p-1">
      <div className="flex flex-col items-center text-center">
        <img 
            src={mechanic.photoURL || mechanic.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${mechanic.id}`} 
            className="w-12 h-12 rounded-full border-2 border-grey/20 object-cover shrink-0 mb-2" 
        />
        <div className="w-full min-w-0">
          <div className="font-black text-sm truncate leading-tight text-black ">{mechanic.name || 'Utente Sconosciuto'}</div>
          <div className="mt-1">
            <span className={`inline-block px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest ${mechanic.role === 'MECHANIC' ? 'bg-primary/20 text-primary border border-primary/20' : mechanic.role === 'PEER_MECHANIC' ? 'bg-[#8B5CF6]/20 text-[#8B5CF6] border border-[#8B5CF6]/20' : 'bg-grey/20 text-grey border border-grey/20'}`}>
              {mechanic.role === 'MECHANIC' ? 'Meccanico Pro' : mechanic.role === 'PEER_MECHANIC' ? 'Peer Mechanic' : 'Ciclista'}
            </span>
          </div>
          {mechanic.updatedAt && (
             <div className="flex items-center justify-center gap-1 text-[8px] font-bold text-grey/80 uppercase mt-2">
               <Clock4 size={10} /> 
               <span className="truncate">{formatDistanceToNow(mechanic.updatedAt instanceof Date ? mechanic.updatedAt : mechanic.updatedAt?.seconds ? new Date(mechanic.updatedAt.seconds * 1000) : new Date(), { addSuffix: true, locale: it })}</span>
             </div>
          )}
        </div>
      </div>
      
      {avgRating !== null && (
        <div className="flex items-center justify-center gap-1 mt-3">
          <Star size={10} className="text-accent fill-accent" />
          <span className="text-[10px] font-black text-accent">{avgRating.toFixed(1)}</span>
          <span className="text-[9px] text-grey font-bold">({reviewCount})</span>
        </div>
      )}

      {(mechanic.role === 'MECHANIC' || mechanic.role === 'PEER_MECHANIC') && mechanic.isOnline && (
        <div className="text-center">
        <div className={`mt-2 text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-md inline-block ${
          mechanic.mechanicStatus === 'BUSY' ? 'bg-red-100 text-red-600 border border-red-200' : 
          mechanic.mechanicStatus === 'TRAVELING' ? 'bg-blue-100 text-blue-600 border border-blue-200' : 
          'bg-green-100 text-green-600 border border-green-200'
        }`}>
          {mechanic.mechanicStatus === 'BUSY' ? t('mechanic.statusBusy') : 
           mechanic.mechanicStatus === 'TRAVELING' ? t('mechanic.statusTraveling') : 
           t('mechanic.statusFree')}
        </div>
        </div>
      )}
      
      {!mechanic.isOnline && (
        <div className="mt-2 text-grey text-[9px] font-bold italic text-center">
          {mechanic.role === 'MECHANIC' || mechanic.role === 'PEER_MECHANIC' ? t('mechanic.offlineMessage') : t('cyclist.offlineMessage')}
        </div>
      )}

      {sos && (
        <div className="mt-3 p-2 bg-red-50 text-danger text-[9px] rounded-lg border border-red-200 text-center">
          <div className="font-black uppercase animate-pulse mb-1">
            🚨 SOS Attivo
          </div>
          <p className="font-bold truncate">{getFaultTypeTranslation(sos.faultType)}</p>
          {sos.status === 'PENDING' && (currentUserRole === 'PEER_MECHANIC' || currentUserRole === 'MECHANIC') && currentUser.uid !== mechanic.id && (
            <button 
              onClick={handleAcceptSOS}
              disabled={isAccepting}
              className="mt-2 w-full bg-danger text-white text-[9px] py-1.5 rounded-lg font-black uppercase tracking-widest active:scale-95 transition-all shadow-md shadow-danger/20"
            >
              {isAccepting ? '...' : 'Accetta'}
            </button>
          )}
        </div>
      )}

      {onStartChat && (
        <button 
          onClick={() => onStartChat(mechanic.id, mechanic.name)}
          className="mt-3 w-full flex items-center justify-center gap-1 bg-primary text-white text-[9px] py-2 rounded-lg font-black uppercase tracking-widest shadow-md shadow-primary/20 active:scale-95 transition-all"
        >
          <MessageCircle size={12} /> Chat Diretta
        </button>
      )}
    </div>
  );
}

// Use CDN for icons to avoid build issues with static assets
const icon = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png';
const iconShadow = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

function LocationMarker({ position, forceCenter, forceFlyPosition, avatarUrl }: { 
  position: [number, number] | null, 
  forceCenter?: boolean,
  forceFlyPosition?: [number, number] | null,
  avatarUrl?: string | null
}) {
  const map = useMap();
  const lastFlyPosRef = useRef<string | null>(null);
  const initialCenterSet = useRef(false);

  const isValidPosition = position && position.length === 2 && 
                          Number.isFinite(position[0]) && 
                          Number.isFinite(position[1]);

    useEffect(() => {
      // FIX: Invalidate size to handle persistent tab mounting (where map might start with 0 size)
      map.invalidateSize();
      
      const flyToPos = forceFlyPosition || (isValidPosition ? position : null);
      
      if (flyToPos && flyToPos.length === 2 && Number.isFinite(flyToPos[0]) && Number.isFinite(flyToPos[1])) {
         // Only fly if forceCenter is triggered or if forceFlyPosition changed
         if (forceFlyPosition) {
           const posKey = `${forceFlyPosition[0]},${forceFlyPosition[1]}`;
           if (lastFlyPosRef.current !== posKey) {
             map.flyTo(flyToPos, 16, { duration: 1.5 });
             lastFlyPosRef.current = posKey;
           }
         } else if (forceCenter || !initialCenterSet.current) {
           map.flyTo(flyToPos, 15, { duration: 1.5 });
           initialCenterSet.current = true;
         }
      } else if (!forceFlyPosition) {
         lastFlyPosRef.current = null;
      }
    }, [map, forceCenter, forceFlyPosition, isValidPosition, position]);

  const customIcon = avatarUrl ? getCachedDivIcon({
    className: 'self-marker',
    html: `<div class="relative flex items-center justify-center">
             <div class="absolute inset-0 bg-primary/20 rounded-full animate-ping"></div>
             <div class="relative w-10 h-10 rounded-full border-4 border-white shadow-xl overflow-hidden ring-4 ring-primary/30">
               <img src="${avatarUrl}" class="w-full h-full object-cover" />
             </div>
             <div class="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-white rounded-full"></div>
           </div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20]
  }) : undefined;

  return !isValidPosition ? null : (
    <Marker position={position as [number, number]} icon={customIcon}>
      <Popup>Tu sei qui</Popup>
    </Marker>
  );
}

function MapClickEvents({ onClick }: { onClick: () => void }) {
  useMapEvents({
    click: () => {
      onClick();
    }
  });
  return null;
}

export function Map({ center, mechanicToTrackId, onStartChat, onViewEventDetails, onViewReportDetails, minimal = false, isAdmin = false, adminUsers = [] }: { 
  center?: [number, number], 
  mechanicToTrackId?: string,
  onStartChat?: (userId: string, userName: string) => void,
  onViewEventDetails?: (event: any) => void,
  onViewReportDetails?: (report: any) => void,
  minimal?: boolean,
  isAdmin?: boolean,
  adminUsers?: any[]
}) {
  const { user: currentUser, profile, role: currentUserRole, setQuotaError, userLocation: storeLocation } = useAuthStore();
  const [visibleUsers, setVisibleUsers] = useState<any[]>([]);
  const [visibleEvents, setVisibleEvents] = useState<any[]>([]);
  const [visibleReports, setVisibleReports] = useState<any[]>([]);
  const [activeSOSs, setActiveSOSs] = useState<Record<string, any>>({});
  const [userPos, setUserPos] = useState<[number, number] | null>(null); 
  const [flyPos, setFlyPos] = useState<[number, number] | null>(center || null);
  const [trackedMechanic, setTrackedMechanic] = useState<any>(null);
  const [selectedObj, setSelectedObj] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [mapType, setMapType] = useState<'standard' | 'satellite' | 'terrain'>('standard');
  const [showMapTypes, setShowMapTypes] = useState(false);
  const [showNavMenu, setShowNavMenu] = useState(false);
  const [forceCenterToggle, setForceCenterToggle] = useState(false);
  const { isDarkMode } = useThemeStore();
  const { t } = useTranslation();
  const mapRef = useRef<L.Map | null>(null);
  const localUsersRef = useRef<Record<string, any>>({});
  const activeUnsubsRef = useRef<any[]>([]);

  const getFaultTypeTranslation = useCallback((faultType: string | undefined) => {
    if (!faultType) return t('cyclist.other');
    const key = `cyclist.${faultType.toLowerCase().replace(/_([a-z])/g, (g) => g[1].toUpperCase())}`;
    const translated = t(key);
    return translated === key ? faultType.replace(/_/g, ' ') : translated;
  }, [t]);

  useEffect(() => {
    if (storeLocation) {
      setUserPos([storeLocation.lat, storeLocation.lng]);
    }
  }, [storeLocation]);

  const lastUpdateRef = useRef<{ time: number, pos: [number, number] | null }>({ time: 0, pos: null });

  const updateRealPosition = useCallback((centerMap = true) => {
    if (storeLocation) {
        const newPos: [number, number] = [storeLocation.lat, storeLocation.lng];
        setUserPos(newPos);
        if (centerMap) setForceCenterToggle(prev => !prev);
        return;
    }

    if ("geolocation" in navigator) {
      setIsRefreshing(true);
      const safetyTimeout = setTimeout(() => setIsRefreshing(false), 5000);

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(safetyTimeout);
          const newPos: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          setUserPos(newPos);
          setIsRefreshing(false);
          // If we have a center prop (focusing on an event), don't auto-center on user position
          if (centerMap) setForceCenterToggle(prev => !prev);
        },
        (error) => {
          clearTimeout(safetyTimeout);
          if (error.code === 1) {
            console.warn('Map geolocation permission denied');
          } else {
            console.debug('Map geolocation unavailable:', error.message);
          }
          setIsRefreshing(false);
          setUserPos(prev => prev ? prev : [45.4642, 9.1900]); 
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
      );
    }
  }, [center, storeLocation]);

  useEffect(() => {
    if (center) {
       
      setFlyPos(center);
    }
  }, [center]);

  useEffect(() => {
    if (!minimal) {
       updateRealPosition(false);
    }
  }, [minimal, updateRealPosition]);

  // Removed redundant Admin user-sync useEffect as it is handled in the main listener useEffect below

  const syncUsers = useCallback(() => {
    const usersArray = Object.values(localUsersRef.current).sort((a: any, b: any) => {
      const valA = a.updatedAt instanceof Date ? a.updatedAt.getTime() : (a.updatedAt?.seconds ? a.updatedAt.seconds * 1000 : 0);
      const valB = b.updatedAt instanceof Date ? b.updatedAt.getTime() : (b.updatedAt?.seconds ? b.updatedAt.seconds * 1000 : 0);
      return valB - valA;
    });
    setVisibleUsers([...usersArray]);
  }, []);

  // 1. GLOBAL LISTENERS
  useEffect(() => {
    if (!currentUser) return;

    // 1a. GLOBAL MECHANICS LISTENER
    const qGlobalMech = query(
      collection(db, 'users'),
      where('role', 'in', ['MECHANIC', 'PEER_MECHANIC']),
      where('isOnline', '==', true),
      limit(100)
    );
    const unsubGlobalMech = onSnapshot(qGlobalMech, (snap) => {
      snap.docs.forEach(docSnap => {
        const u = { id: docSnap.id, ...docSnap.data() } as any;
        if (!u.lastLat || !u.lastLng || u.id === currentUser?.uid || u.isOnline === false) {
           delete localUsersRef.current[u.id];
           return;
        }
        localUsersRef.current[u.id] = u;
      });
      syncUsers();
    }, (error) => {
      console.warn("Global mechanics listener failed", error);
    });

    // 1b. GLOBAL CYCLISTS LISTENER
    const qGlobalCyclists = query(
      collection(db, 'users'),
      where('role', '==', 'CYCLIST'),
      where('isOnline', '==', true),
      limit(100)
    );
    const unsubGlobalCyclists = onSnapshot(qGlobalCyclists, (snap) => {
      snap.docs.forEach(docSnap => {
        const u = { id: docSnap.id, ...docSnap.data() } as any;
        if (!u.lastLat || !u.lastLng || u.id === currentUser?.uid || u.isOnline === false) {
           delete localUsersRef.current[u.id];
           return;
        }
        localUsersRef.current[u.id] = u;
      });
      syncUsers();
    }, (error) => {
      console.warn("Global cyclists listener failed", error);
    });

    return () => {
      unsubGlobalMech();
      unsubGlobalCyclists();
    };
  }, [currentUser, isAdmin, syncUsers]);

  // 2. GEOHASH LISTENERS
  const lastListenerPos = useRef<[number, number] | null>(null);

  useEffect(() => {
    if (!currentUser || !userPos) return;

    // Only re-subscribe if we moved more than 2km from the last listener center
    if (lastListenerPos.current) {
      const dist = distanceBetween(userPos, lastListenerPos.current);
      if (dist < 2) return; 
    }
    
    lastListenerPos.current = userPos;
    const radiusInM = 30000; // Increased to 30km
    const bounds = geohashQueryBounds([userPos[0], userPos[1]], radiusInM);
    const unsubs: any[] = [];

    for (const b of bounds) {
      const qUsers = query(
        collection(db, 'users'), 
        orderBy('geohash'),
        startAt(b[0]),
        endAt(b[1]),
        limit(200) // Increase limit per shard
      );

      const unsub = onSnapshot(qUsers, (snapshot) => {
        snapshot.docs.forEach(docSnap => {
          const u = { id: docSnap.id, ...docSnap.data() } as any;
          if (!u.lastLat || !u.lastLng || u.id === currentUser?.uid || u.isOnline === false) {
             delete localUsersRef.current[u.id];
             return;
          }
          if (!['MECHANIC', 'CYCLIST', 'PEER_MECHANIC'].includes(u.role)) {
             delete localUsersRef.current[u.id];
             return;
          }
          // Local filter slightly larger than query to avoid edge flickering
          const distanceInKm = distanceBetween([u.lastLat, u.lastLng], [userPos[0], userPos[1]]);
          if (distanceInKm > 40) {
             delete localUsersRef.current[u.id];
             return;
          }
          localUsersRef.current[u.id] = u;
        });
        syncUsers();
      }, (error: any) => {
        if (error.message.includes('Quota exceeded')) setQuotaError?.(true);
      });
      unsubs.push(unsub);
    }

    return () => unsubs.forEach(u => u());
  }, [currentUser, isAdmin, userPos, syncUsers]);

  // 3. ADMIN USER SYNC
  useEffect(() => {
    if (isAdmin && currentUser) {
      setVisibleUsers(adminUsers.filter(u => u.lastLat && u.lastLng && u.id !== currentUser?.uid));
    }
  }, [isAdmin, adminUsers, currentUser]);

  // 2-4. Real-time listeners for Events, SOS, and Reports
  useEffect(() => {
    // Events
    const qEvents = query(
      collection(db, 'events'), 
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const unsubEvents = onSnapshot(qEvents, (snapshot) => {
      const events = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((event: any) => event.lastLat && event.lastLng);
      setVisibleEvents(events);
    });

    // 3. SOS real-time - ATTACH REGARDLESS OF userPos
    const qSOS = query(
      collection(db, 'sosRequests'),
      where('status', 'in', ['PENDING', 'ACCEPTED', 'IN_PROGRESS']),
      limit(50)
    );
    const unsubSOS = onSnapshot(qSOS, (snapshot) => {
      const sosMap: Record<string, any> = {};
      const sortedDocs = snapshot.docs.sort((a, b) => {
        const dateA = a.data().createdAt?.seconds || 0;
        const dateB = b.data().createdAt?.seconds || 0;
        return dateB - dateA;
      });
      
      sortedDocs.forEach(docSnap => {
        const data = docSnap.data();
        sosMap[data.cyclistId] = { id: docSnap.id, ...data };
      });
      setActiveSOSs(sosMap);
    }, (err) => {
      console.warn("SOS listener error:", err);
    });

    // 4. Road Reports real-time - ATTACH REGARDLESS OF userPos
    const q = query(
      collection(db, 'roadReports'),
      where('status', 'in', ['open', 'confirmed', 'in_review']),
      limit(300)
    );
    const unsubReports = onSnapshot(q, (snapshot) => {
      const reports = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a: any, b: any) => {
          const dateA = a.createdAt?.seconds || 0;
          const dateB = b.createdAt?.seconds || 0;
          return dateB - dateA;
        });
      setVisibleReports(reports);
    }, (err) => {
       console.warn("Reports listener error:", err);
    });

    // Mechanic tracking
    let unsubTrack: any = () => {};
    if (mechanicToTrackId) {
      unsubTrack = onSnapshot(doc(db, 'users', mechanicToTrackId), (snapshot) => {
        if (snapshot.exists()) {
          setTrackedMechanic({ id: snapshot.id, ...snapshot.data() });
        }
      });
    }

    return () => {
      unsubEvents();
      unsubSOS();
      unsubReports();
      unsubTrack();
    };
  }, [mechanicToTrackId]);


  const openExternalMap = (provider: 'google' | 'waze') => {
    if (!userPos) return;
    const [lat, lng] = userPos;
    const url = provider === 'google' ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}` : `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
    window.open(url, '_blank');
    setShowNavMenu(false);
  };

  const getMapUrl = () => {
    if (mapType === 'satellite') {
      return "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}";
    }
    if (mapType === 'terrain') {
      return "https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}";
    }
    if (isDarkMode) {
      return "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
    }
    return "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}";
  };

  return (
    <div className="w-full h-full relative z-0">
      {/* Map Controls */}
      {!minimal && (
        <div className="absolute bottom-28 right-4 z-[999] flex flex-col gap-3 pointer-events-auto items-end">
           <div className="relative flex flex-col items-end gap-2">
             {showMapTypes && (
               <motion.div 
                 initial={{ opacity: 0, x: 20 }}
                 animate={{ opacity: 1, x: 0 }}
                 className="flex flex-col gap-2 mb-2 bg-white p-2 rounded-2xl shadow-xl border border-grey/10"
               >
                 {[
                   { id: 'standard', label: 'Standard', icon: MapIcon },
                   { id: 'satellite', label: 'Satellite', icon: Layers },
                   { id: 'terrain', label: 'Terreno', icon: Navigation }
                 ].map((type) => (
                   <button
                     key={type.id}
                     onClick={() => { setMapType(type.id as any); setShowMapTypes(false); }}
                     className={`px-4 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center gap-3 ${mapType === type.id ? 'bg-grey/10 text-black' : 'hover:bg-grey/10 text-black'}`}
                   >
                     <type.icon size={16} />
                     {type.label}
                   </button>
                 ))}
               </motion.div>
             )}
             <motion.button
               whileHover={{ scale: 1.05 }}
               whileTap={{ scale: 0.95 }}
               onClick={() => setShowMapTypes(!showMapTypes)} 
               className={`bg-white text-primary p-3 rounded-xl shadow-xl border border-grey/10 cursor-pointer transition-all flex items-center justify-center`}
               title={t('map.toggle')}
             >
               <Layers size={20} />
             </motion.button>
           </div>
 
           <motion.button
             whileHover={{ scale: 1.05 }}
             whileTap={{ scale: 0.95 }}
             onClick={() => {
               setFlyPos(null);
               updateRealPosition(true);
             }} 
             className="bg-white text-accent p-3 rounded-xl shadow-xl shadow-accent/20 border border-grey/10 cursor-pointer transition-all"
             title={t('map.locate')}
           >
             <Crosshair className={isRefreshing ? "animate-spin" : ""} size={20} />
           </motion.button>
        </div>
      )}


      <MapContainer 
        {...({
          center: userPos || [45.4642, 9.1900],
          zoom: minimal ? 15 : 13,
          scrollWheelZoom: !minimal,
          dragging: !minimal,
          className: "w-full h-full",
          zoomControl: false,
          touchZoom: !minimal,
          doubleClickZoom: !minimal,
          boxZoom: !minimal,
        } as any)}
      >
        <MapClickEvents onClick={() => setSelectedObj(null)} />
        <TileLayer
          {...({
            attribution: mapType === 'satellite' ? 'Esri' : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            url: getMapUrl()
          } as any)}
        />
        {/* User's own location marker - respect isOnline status for "live" feel */}
        {userPos && profile?.isOnline !== false && (
          <LocationMarker 
            position={userPos} 
            forceCenter={forceCenterToggle}
            forceFlyPosition={flyPos}
            avatarUrl={profile?.photoURL || currentUser?.photoURL}
          />
        )}{/* Route Track */}
        {trackedMechanic?.lastLat && trackedMechanic?.lastLng && userPos && (
          <Polyline 
            positions={[
              [trackedMechanic.lastLat, trackedMechanic.lastLng],
              userPos
            ]}
            pathOptions={{ 
              color: '#F97316', 
              weight: 3, 
              dashArray: '10, 10', 
              opacity: 0.6 
            }}
          />
        )}
        
        {/* Selected Highlight Route Track */}
        {selectedObj?.lastLat && selectedObj?.lastLng && userPos && selectedObj.id !== trackedMechanic?.id && (
          <Polyline 
            positions={[
              [selectedObj.lastLat, selectedObj.lastLng],
              userPos
            ]}
            pathOptions={{ 
              color: selectedObj.participantCount ? '#E11D48' : '#0EA5E9', 
              weight: 4, 
              dashArray: '5, 10', 
              opacity: 0.8 
            }}
          />
        )}
        
        {/* Tracked Mechanic (Primary) */}
        {trackedMechanic?.lastLat && trackedMechanic?.lastLng && (
           <Marker 
              {...({
                position: [trackedMechanic.lastLat, trackedMechanic.lastLng],
                icon: getCachedDivIcon({
                  className: 'tracked-mechanic-marker',
                  html: `<div class="marker-size-lg relative flex items-center justify-center bg-accent/30 p-1 rounded-full ring-2 ring-accent ${trackedMechanic.mechanicStatus === 'TRAVELING' ? 'pulse-accent' : 'pulse-warning'}">
                           <img src="${trackedMechanic.photoURL || trackedMechanic.avatarUrl || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + trackedMechanic.id}" class="avatar-size-md rounded-full border-2 border-accent object-cover shadow-sm" />
                           ${trackedMechanic.isOnline ? '<div class="status-dot-lg absolute bottom-0 right-0 bg-green-500 border-2 border-white rounded-full"></div>' : ''}
                         </div>`,
                  iconSize: [28, 28],
                  iconAnchor: [14, 14]
                })
              } as any)} 
            >
              <Popup>
                <MechanicPopup mechanic={trackedMechanic} onStartChat={onStartChat} t={t} getFaultTypeTranslation={getFaultTypeTranslation} />
              </Popup>
            </Marker>
        )}

        {/* Regular Users (Mechanics, Peer Mechanics & Cyclists) */}
        {visibleUsers.filter(u => u.id !== mechanicToTrackId).map((u: any) => {
          const hasSOS = activeSOSs[u.id];
          const isTraveling = u.mechanicStatus === 'TRAVELING';
          const isAvailable = (u.role === 'MECHANIC' || u.role === 'PEER_MECHANIC') && u.mechanicStatus === 'FREE' && u.isOnline;
          const isSelected = selectedObj?.id === u.id;
          
          let roleColor = 'primary';
          let roleHex = '#3B82F6';
          if (u.role === 'MECHANIC') { roleColor = 'warning'; roleHex = '#F59E0B'; }
          else if (u.role === 'PEER_MECHANIC') { roleColor = '[#8B5CF6]'; roleHex = '#8B5CF6'; }

          return u.lastLat && u.lastLng && (
            <Marker 
              key={u.id}
              eventHandlers={{
                click: () => setSelectedObj(u)
              }}
              {...({
                position: [u.lastLat, u.lastLng],
                icon: getCachedDivIcon({
                  className: `custom-marker ${isSelected ? 'z-[1000]' : ''}`,
                  html: `<div class="transition-all duration-300 ${isSelected ? 'scale-125 drop-shadow-2xl' : ''} ${hasSOS ? 'marker-size-lg' : 'marker-size-md'} relative flex items-center justify-center p-0.5 rounded-full transition-all duration-300 ${isSelected ? 'ring-4 ring-offset-2 animate-pulse' : ''} ${u.role === 'MECHANIC' ? 'bg-warning/20' : u.role === 'PEER_MECHANIC' ? 'bg-[#8B5CF6]/20' : 'bg-primary/20'}" ${isSelected && u.role === 'PEER_MECHANIC' ? 'style="box-shadow: 0 0 0 4px #8B5CF6;"' : ''} ${u.role === 'PEER_MECHANIC' ? 'style="background-color: rgba(139, 92, 246, 0.2);"' : ''}>
                            <img src="${u.photoURL || u.avatarUrl || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + u.id}" 
                                 class="${hasSOS ? 'avatar-size-lg' : 'avatar-size-sm'} rounded-full object-cover border-2 shadow-sm" style="border-color: ${roleHex};" />
                            ${u.isOnline ? `<div class="status-dot-md absolute bottom-0 right-0 ${['MECHANIC', 'PEER_MECHANIC'].includes(u.role) ? (u.mechanicStatus === 'BUSY' ? 'bg-red-500' : u.mechanicStatus === 'TRAVELING' ? 'bg-blue-500' : 'bg-green-500') : 'bg-green-500'} border border-white rounded-full shadow-sm"></div>` : `<div class="status-dot-md absolute bottom-0 right-0 bg-grey border border-white rounded-full shadow-sm"></div>`}
                            ${hasSOS ? '<div class="absolute -top-3 -right-3 bg-danger text-white text-[8px] px-1.5 py-0.5 rounded-full font-black animate-bounce shadow-lg border-2 border-white">SOS</div>' : ''}
                          </div>`,
                  iconSize: [hasSOS ? 28 : 22, hasSOS ? 28 : 22],
                  iconAnchor: [hasSOS ? 14 : 11, hasSOS ? 14 : 11]
                })
              } as any)} 
            >
              <Popup eventHandlers={{ remove: () => setSelectedObj(null) }}>
                <MechanicPopup mechanic={u} onStartChat={onStartChat} t={t} sos={hasSOS} currentUserRole={currentUserRole} currentUser={currentUser} getFaultTypeTranslation={getFaultTypeTranslation} />
              </Popup>
            </Marker>
          );
        })}

        {/* Road Reports */}
        {visibleReports.map((report: any) => {
          const isSelected = selectedObj?.id === report.id;
          let color = '#EAB308'; // low
          if (report.severity === 'medium') color = '#F97316';
          if (report.severity === 'high') color = '#EF4444';

          const lat = report.location?.lat ?? report.location?.latitude;
          const lng = report.location?.lng ?? report.location?.longitude;

          if (!lat || !lng) return null;

          return (
            <Marker 
              key={report.id}
              eventHandlers={{ click: () => setSelectedObj(report) }}
              {...({
                position: [lat, lng],
                icon: getCachedDivIcon({
                  className: `report-marker ${isSelected ? 'z-[1000]' : ''}`,
                  html: `<div class="transition-all duration-300 ${isSelected ? 'scale-110' : ''} marker-size-md relative flex items-center justify-center text-white p-1 rounded-2xl shadow-lg border-2 border-white" style="background-color: ${color}">
                           <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
                           <div class="absolute -bottom-6 bg-white px-1.5 py-0.5 rounded-lg border border-grey/10 shadow-sm whitespace-nowrap">
                              <span class="text-[8px] font-black uppercase text-black">${t(`reports.categories.${report.category}`, report.category.replace('_', ' '))}</span>
                           </div>
                         </div>`,
                  iconSize: [28, 28],
                  iconAnchor: [14, 14]
                })
              } as any)} 
            >
              <Popup eventHandlers={{ remove: () => setSelectedObj(null) }}>
                <div className="p-1 min-w-[140px]">
                  <div className="font-black uppercase text-sm leading-tight mb-1" style={{ color }}>{t(`reports.categories.${report.category}`, report.category.replace('_', ' ')) as any}</div>
                  <div className="text-[10px] text-black/70 mb-2 truncate max-w-[150px]">{report.description}</div>
                  <div className="flex items-center justify-between text-[9px] font-bold text-grey uppercase mt-2 mb-3">
                    <span>Upvotes: {report.upvotes?.length || 0}</span>
                    <span className="bg-grey/10 px-1.5 py-0.5 rounded-md">{report.status}</span>
                  </div>
                  <button 
                    onClick={() => onViewReportDetails?.(report)}
                    className="w-full bg-primary text-white py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20"
                  >
                    Vedi Foto e Dettagli
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Group Events */}
        {visibleEvents.map((event: any) => {
          const isSelected = selectedObj?.id === event.id;
          const lat = event.lastLat ?? event.lat ?? event.location?.latitude;
          const lng = event.lastLng ?? event.lng ?? event.location?.longitude;

          if (!lat || !lng) return null;

          return (
          <Marker 
            key={event.id}
            eventHandlers={{
                click: () => setSelectedObj(event)
            }}
            {...({
              position: [lat, lng],
              icon: getCachedDivIcon({
                className: `event-marker ${isSelected ? 'z-[1000]' : ''}`,
                html: `<div class="transition-all duration-300 ${isSelected ? 'scale-110' : ''} marker-size-xl relative flex items-center justify-center bg-accent text-white p-1 rounded-2xl shadow-accent-lg border-2 border-white ring-4 ring-accent/20 ${isSelected ? 'animate-bounce ring-accent ring-offset-2 border-4' : 'animate-pulse'}">
                         <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bike"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>
                         <div class="absolute -top-2 -right-2 bg-red-500 text-[8px] font-black px-1.5 py-0.5 rounded-full border-2 border-white shadow-sm">
                           ${event.participantCount || 0}/${event.maxParticipants}
                         </div>
                         <div class="absolute -bottom-6 bg-white px-1.5 py-0.5 rounded-lg border border-grey/10 shadow-sm whitespace-nowrap">
                            <span class="text-[8px] font-black text-primary uppercase italic">${event.title}</span>
                         </div>
                       </div>`,
                iconSize: [38, 38],
                iconAnchor: [19, 19]
              })
            } as any)} 
          >
            <Popup eventHandlers={{ remove: () => setSelectedObj(null) }}>
              <div className="p-1">
                <div className="font-black text-primary uppercase italic text-sm leading-tight mb-1">{event.title}</div>
                {event.address && (
                  <div className="text-[9px] font-bold text-black/60 mb-2 flex items-center gap-1">
                    <Navigation size={10} /> {event.address}
                  </div>
                )}
                <div className="flex items-center gap-2 text-[10px] font-bold text-grey uppercase tracking-widest mb-3">
                  <div className="flex items-center gap-1"><Users size={12} /> {event.participantCount}/{event.maxParticipants}</div>
                  <div className="flex items-center gap-1"><Clock size={12} /> {new Date(event.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
                <button 
                  onClick={() => onViewEventDetails?.(event)}
                  className="w-full bg-primary text-black py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20"
                >
                  Vedi Dettagli
                </button>
              </div>
            </Popup>
          </Marker>
        )})}
      </MapContainer>
    </div>
  );
}

