import toast from 'react-hot-toast';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import {
  avatarMarkerIcon,
  eventMarkerIcon,
  reportMarkerIcon,
} from '../lib/leafletIcons';
import {
  getFreshGpsCoords,
  geolocationErrorMessage,
  geoSuccessToast,
  toStoreLocationSource,
} from '../lib/geolocation';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { User as FirebaseUser } from 'firebase/auth';
import { collection, query, where, onSnapshot, doc, limit, getDocs, updateDoc, serverTimestamp, orderBy, startAt, endAt, runTransaction } from 'firebase/firestore';
import { geohashQueryBounds, distanceBetween } from 'geofire-common';
import { filterItemsNearMapCenter } from '../lib/mapGeoFilter';
import { isValidLatLngPair, mapCenterOrDefault } from '../lib/mapCoords';
import { MAP_VISIBLE_ROLES } from '../services/mapPresenceService';
import { useTranslation } from 'react-i18next';
import { useThemeStore } from '../store/useThemeStore';
import { MapLoadingOverlay } from './Skeleton';
import { useAuthStore } from '../store/useAuthStore';
import { isFirestoreQuotaError } from '../lib/firestoreErrors';
import { UserProfile, SOSRequest } from '../types';
import { Crosshair, Navigation, Map as MapIcon, Layers, Users, Clock, Star, Clock4, MessageCircle, Sun, Moon, Sparkles } from 'lucide-react';
import { NavigationButtons } from './NavigationButtons';
import { motion } from 'motion/react';
import { formatDistanceToNow } from 'date-fns';
import { it } from 'date-fns/locale';
import { TFunction } from 'i18next';

interface MechanicPopupProps {
  mechanic: UserProfile & { id: string, updatedAt?: any };
  onStartChat?: (id: string, name: string) => void;
  t: TFunction;
  sos?: SOSRequest;
  currentUserRole?: string | null;
  currentUser?: FirebaseUser | null;
  getFaultTypeTranslation: (type: string | undefined) => string;
}

const MechanicPopup = React.memo(function MechanicPopup({ 
  mechanic, 
  onStartChat, 
  t, 
  sos, 
  currentUserRole, 
  currentUser, 
  getFaultTypeTranslation 
}: MechanicPopupProps) {
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
      await runTransaction(db, async (transaction) => {
        const sosRef = doc(db, 'sosRequests', sos.id);
        const sosSnap = await transaction.get(sosRef);
        if (!sosSnap.exists || sosSnap.data()?.status !== 'PENDING') {
          throw new Error('SOS already accepted by another mechanic');
        }
        transaction.update(sosRef, {
          mechanicId: currentUser.uid,
          status: 'ACCEPTED',
          acceptedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });
    } catch (e) {
      console.error('Failed to accept SOS', e);
      toast.error(t('common.error') + ': SOS già accettato da un altro meccanico');
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
              {mechanic.role === 'MECHANIC' ? 'Meccanico Pro' : mechanic.role === 'PEER_MECHANIC' ? 'Ciclista Esperto' : 'Ciclista'}
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
          {sos.status === 'PENDING' && mechanic.role === 'CYCLIST' && currentUserRole === 'PEER_MECHANIC' && currentUser?.uid !== mechanic.id && (
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
});

const TrackedMechanicMarker = React.memo(function TrackedMechanicMarker({ mechanic, onStartChat, t, getFaultTypeTranslation }: {
  mechanic: any;
  onStartChat?: (userId: string, userName: string) => void;
  t: TFunction;
  getFaultTypeTranslation: (faultType: string | undefined) => string;
}) {
  const borderColor = mechanic.plan === 'PRO' ? '#F59E0B' : mechanic.plan === 'CLUB' ? '#94A3B8' : undefined;
  const icon = useMemo(
    () => avatarMarkerIcon(mechanic.id, mechanic.role || 'MECHANIC', {
      displayName: mechanic.name,
      borderColor,
      size: 40,
      online: mechanic.isOnline,
    }),
    [mechanic.id, mechanic.role, mechanic.name, borderColor, mechanic.isOnline]
  );

  return (
    <Marker position={[mechanic.lastLat, mechanic.lastLng]} icon={icon}>
      <Popup>
        <MechanicPopup mechanic={mechanic} onStartChat={onStartChat} t={t} getFaultTypeTranslation={getFaultTypeTranslation} />
      </Popup>
    </Marker>
  );
});

const UserMarker = React.memo(function UserMarker({ user: u, onStartChat, t, getFaultTypeTranslation, roleColor, onSelect, sos, currentUser, currentUserRole }: {
  user: any;
  onStartChat?: (userId: string, userName: string) => void;
  t: TFunction;
  getFaultTypeTranslation: (faultType: string | undefined) => string;
  roleColor: string;
  onSelect?: (user: any) => void;
  sos?: SOSRequest;
  currentUser?: FirebaseUser | null;
  currentUserRole?: string | null;
}) {
  const colorMap: Record<string, string> = { primary: '#3B82F6', warning: '#F59E0B', peer: '#8B5CF6' };
  const borderColor = colorMap[roleColor] || '#3B82F6';
  const icon = useMemo(
    () => avatarMarkerIcon(u.id, u.role || 'CYCLIST', {
      displayName: u.name,
      borderColor,
      size: 36,
      online: u.isOnline,
      sosActive: Boolean(sos),
    }),
    [u.id, u.role, u.name, borderColor, u.isOnline, sos]
  );

  const eventHandlers = useMemo(() => {
    return onSelect ? { click: () => onSelect(u) } : undefined;
  }, [onSelect, u]);

  return (
    <Marker position={[u.lastLat, u.lastLng]} icon={icon} eventHandlers={eventHandlers}>
      <Popup>
        <MechanicPopup
          mechanic={u}
          onStartChat={onStartChat}
          t={t}
          getFaultTypeTranslation={getFaultTypeTranslation}
          sos={sos}
          currentUser={currentUser}
          currentUserRole={currentUserRole}
        />
      </Popup>
    </Marker>
  );
});

const ReportMarker = React.memo(function ReportMarker({ report, isSelected, t, onSelect, onViewDetailsFunc }: {
  report: any;
  isSelected: boolean;
  t: TFunction;
  onSelect: (report: any) => void;
  onViewDetailsFunc?: (report: any) => void;
}) {
  const icon = useMemo(
    () => reportMarkerIcon(report.category || 'other', report.severity),
    [report.category, report.severity]
  );

  const lat = report.location?.lat ?? report.location?.latitude;
  const lng = report.location?.lng ?? report.location?.longitude;
  if (!lat || !lng) return null;

  const eventHandlers = useMemo(() => ({
    click: () => {
      onSelect(report);
      onViewDetailsFunc?.(report);
    },
  }), [onSelect, onViewDetailsFunc, report]);

  return (
    <Marker
      position={[lat, lng]}
      icon={icon}
      eventHandlers={eventHandlers}
    >
      <Popup>
        <div className="p-1 min-w-[140px]">
          <div className="font-black uppercase text-sm leading-tight mb-1">{t(`reports.categories.${report?.category}`, report?.category?.replace('_', ' ') || '') as any}</div>
          <div className="text-[10px] text-black/70 mb-2 truncate max-w-[150px]">{report?.description}</div>
          <div className="flex items-center justify-between text-[9px] font-bold text-grey uppercase mt-2 mb-2">
            <span>Conferme: {report?.upvotes?.length || 0}</span>
            <span className="bg-grey/10 px-1.5 py-0.5 rounded-md">{report?.status}</span>
          </div>
          {onViewDetailsFunc && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onViewDetailsFunc(report);
              }}
              className="w-full bg-primary text-white text-[9px] py-2 rounded-lg font-black uppercase tracking-widest active:scale-95 transition-all"
            >
              {report?.photoUrl ? 'Foto e conferma' : 'Dettagli e conferma'}
            </button>
          )}
        </div>
      </Popup>
    </Marker>
  );
});

const EventMarker = React.memo(function EventMarker({ event, onSelect, onJoin, onViewDetailsFunc, isJoining, currentUser, t }: {
  event: any;
  onSelect: (event: any) => void;
  onViewDetailsFunc?: (event: any) => void;
  onJoin?: (event: any) => void;
  isJoining?: boolean;
  currentUser: any;
  t: TFunction;
}) {
  const icon = useMemo(() => eventMarkerIcon(), []);
  const isJoined = event.participants?.includes(currentUser?.uid);

  const lat = event.lastLat ?? event.lat ?? event.location?.latitude;
  const lng = event.lastLng ?? event.lng ?? event.location?.longitude;
  if (!lat || !lng) return null;

  const eventHandlers = useMemo(() => ({
    click: () => {
      onSelect(event);
      onViewDetailsFunc?.(event);
    },
  }), [onSelect, onViewDetailsFunc, event]);

  return (
    <Marker
      position={[lat, lng]}
      icon={icon}
      eventHandlers={eventHandlers}
    >
      <Popup>
        <div className="p-1 min-w-[160px]">
          <div className="font-black text-primary uppercase italic text-sm leading-tight mb-1">{event.title}</div>
          {event.address && (
            <div className="text-[9px] font-bold text-black/60 mb-2 flex items-center gap-1">
              📍 {event.address}
            </div>
          )}
          <NavigationButtons lat={lat} lng={lng} compact className="mb-2" />
          <div className="flex items-center gap-2 text-[10px] font-bold text-grey uppercase tracking-widest mb-2">
            <div className="flex items-center gap-1">👥 {event.participantCount}/{event.maxParticipants}</div>
          </div>
          {onViewDetailsFunc && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onViewDetailsFunc(event);
              }}
              className="w-full mb-2 bg-grey/10 text-black py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-center active:scale-95 transition-all"
            >
              Dettagli evento
            </button>
          )}
          {isJoined ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onJoin?.(event); }}
              disabled={isJoining}
              className="w-full bg-accent/10 text-accent py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-center active:scale-95 transition-all disabled:opacity-50"
            >
              {isJoining ? '...' : 'Iscritto - Apri chat'}
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onJoin?.(event); }}
              disabled={isJoining}
              className="w-full bg-primary text-white py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-center active:scale-95 transition-all disabled:opacity-50"
            >
              {isJoining ? '...' : 'Unisciti'}
            </button>
          )}
        </div>
      </Popup>
    </Marker>
  );
});

function MapFlyController({ flyTarget }: { flyTarget: { pos: [number, number]; nonce: number } | null }) {
  const map = useMap();

  useEffect(() => {
    if (!flyTarget || !isValidLatLngPair(flyTarget.pos)) return;
    try {
      map.flyTo(flyTarget.pos, 15, { animate: true, duration: 0.35 });
    } catch {
      /* map may be unmounting */
    }
  }, [flyTarget?.nonce, flyTarget?.pos, map]);

  return null;
}

function LocationMarker({ position, userId, role, displayName }: { 
  position: [number, number] | null;
  userId: string;
  role: string;
  displayName?: string;
}) {
  const customIcon = useMemo(
    () => avatarMarkerIcon(userId, role, { displayName, borderColor: '#3B82F6', size: 36, online: true }),
    [userId, role, displayName]
  );

  const isValidPosition = position && position.length === 2 && 
                           Number.isFinite(position[0]) && 
                           Number.isFinite(position[1]);

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

export function Map({ center, mechanicToTrackId, onStartChat, onViewEventDetails, onViewReportDetails, onJoinEvent, joiningEventId, minimal = false, isAdmin = false, adminUsers = [], showMechanics = true, showCyclists = true }: { 
  center?: [number, number], 
  mechanicToTrackId?: string,
  onStartChat?: (userId: string, userName: string) => void,
  onViewEventDetails?: (event: any) => void,
  onViewReportDetails?: (report: any) => void,
  onJoinEvent?: (event: any) => void,
  joiningEventId?: string | null,
  minimal?: boolean,
  isAdmin?: boolean,
  adminUsers?: any[],
  showMechanics?: boolean,
  showCyclists?: boolean,
}) {
  const { user: currentUser, profile, role: currentUserRole, setQuotaError, userLocation: storeLocation, setShowAIDoctor } = useAuthStore();
  const [visibleUsers, setVisibleUsers] = useState<any[]>([]);
  const [rawEvents, setRawEvents] = useState<any[]>([]);
  const [rawReports, setRawReports] = useState<any[]>([]);
  const [activeSOSs, setActiveSOSs] = useState<Record<string, any>>({});
  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [debouncedUserPos, setDebouncedUserPos] = useState<[number, number] | null>(null);
  const userPosDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null); 
  const [flyTarget, setFlyTarget] = useState<{ pos: [number, number]; nonce: number } | null>(
    isValidLatLngPair(center) ? { pos: center, nonce: 0 } : null
  );
  const [trackedMechanic, setTrackedMechanic] = useState<any>(null);
  const [selectedObj, setSelectedObj] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [mapType, setMapType] = useState<'standard' | 'satellite' | 'terrain'>('standard');
  const [showMapTypes, setShowMapTypes] = useState(false);
  const [showNavMenu, setShowNavMenu] = useState(false);
  const { isDarkMode, toggleDarkMode } = useThemeStore();
  const { t } = useTranslation();
  const mapRef = useRef<L.Map | null>(null);
  const localUsersRef = useRef<Record<string, any>>({});
  const activeUnsubsRef = useRef<any[]>([]);
  const [mapBootstrapping, setMapBootstrapping] = useState(false);
  const mapLayersReadyRef = useRef({ events: false, reports: false });

  const flyToPosition = useCallback((pos: [number, number], syncLayers = true) => {
    if (!isValidLatLngPair(pos)) return;
    setUserPos(pos);
    if (syncLayers) setDebouncedUserPos(pos);
    setFlyTarget({ pos, nonce: Date.now() });
  }, []);

  const tryFinishMapBootstrap = useCallback(() => {
    if (mapLayersReadyRef.current.events || mapLayersReadyRef.current.reports) {
      setMapBootstrapping(false);
    }
  }, []);

  const getFaultTypeTranslation = useCallback((faultType: string | undefined) => {
    if (!faultType) return t('cyclist.other');
    const key = `cyclist.${faultType.toLowerCase().replace(/_([a-z])/g, (g) => g[1].toUpperCase())}`;
    const translated = t(key);
    return translated === key ? faultType.replace(/_/g, ' ') : translated;
  }, [t]);

  useEffect(() => {
    if (storeLocation) {
      const pos: [number, number] = [storeLocation.lat, storeLocation.lng];
      if (isValidLatLngPair(pos)) {
        setUserPos(pos);
        setDebouncedUserPos((prev) => prev ?? pos);
      }
    }
  }, [storeLocation]);

  // Debounce only Firestore geohash re-subscriptions — UI layers use live userPos
  useEffect(() => {
    if (userPosDebounceRef.current) clearTimeout(userPosDebounceRef.current);
    userPosDebounceRef.current = setTimeout(() => {
      setDebouncedUserPos(userPos);
    }, 800);
    return () => {
      if (userPosDebounceRef.current) clearTimeout(userPosDebounceRef.current);
    };
  }, [userPos]);

  const visibleEvents = useMemo(
    () => filterItemsNearMapCenter(rawEvents, userPos),
    [rawEvents, userPos]
  );
  const visibleReports = useMemo(
    () => filterItemsNearMapCenter(rawReports, userPos),
    [rawReports, userPos]
  );

  const lastUpdateRef = useRef<{ time: number, pos: [number, number] | null }>({ time: 0, pos: null });

  const updateRealPosition = useCallback((centerMap = true) => {
    if (storeLocation) {
        const newPos: [number, number] = [storeLocation.lat, storeLocation.lng];
        if (centerMap) flyToPosition(newPos);
        else {
          setUserPos(newPos);
          setDebouncedUserPos(newPos);
        }
        return;
    }

    if ("geolocation" in navigator) {
      setIsRefreshing(true);
      getFreshGpsCoords()
        .then((coords) => {
          const newPos: [number, number] = [coords.lat, coords.lng];
          if (centerMap) flyToPosition(newPos);
          else {
            setUserPos(newPos);
            setDebouncedUserPos(newPos);
          }
          const store = useAuthStore.getState();
          store.setUserLocation({ lat: coords.lat, lng: coords.lng });
          store.setLocationSource('gps');
        })
        .catch((error: { code?: number }) => {
          if (error?.code === 1) console.warn('Map geolocation permission denied');
          if (storeLocation) {
            const p: [number, number] = [storeLocation.lat, storeLocation.lng];
            if (centerMap) flyToPosition(p);
            else {
              setUserPos(p);
              setDebouncedUserPos(p);
            }
          }
        })
        .finally(() => setIsRefreshing(false));
    }
  }, [storeLocation, flyToPosition]);

  useEffect(() => {
    if (isValidLatLngPair(center)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      flyToPosition(center, false);
    }
  }, [center, flyToPosition]);

  useEffect(() => {
    if (!minimal) {
       // eslint-disable-next-line react-hooks/set-state-in-effect
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

  // 1. GEOHASH-BASED LISTENERS ONLY (no global listeners for performance)
  const lastListenerPos = useRef<[number, number] | null>(null);

  useEffect(() => {
    if (!currentUser || !debouncedUserPos) return;

    // Only re-subscribe if we moved more than 2km from the last listener center
    if (lastListenerPos.current) {
      const dist = distanceBetween(debouncedUserPos, lastListenerPos.current);
      if (dist < 2) return; 
    }
    
    lastListenerPos.current = debouncedUserPos;
    const radiusInM = 30000; // Increased to 30km
    const bounds = geohashQueryBounds([debouncedUserPos[0], debouncedUserPos[1]], radiusInM);
    const unsubs: any[] = [];

    for (const b of bounds) {
      const qUsers = query(
        collection(db, 'mapPresence'),
        where('role', 'in', [...MAP_VISIBLE_ROLES]),
        orderBy('geohash'),
        startAt(b[0]),
        endAt(b[1]),
        limit(200)
      );

      const unsub = onSnapshot(qUsers, (snapshot) => {
        snapshot.docs.forEach(docSnap => {
          const u = { id: docSnap.id, ...(docSnap.data() as UserProfile) };
          if (!u.lastLat || !u.lastLng || u.id === currentUser?.uid || u.isOnline === false) {
             delete localUsersRef.current[u.id];
             return;
          }
          if (!['MECHANIC', 'CYCLIST', 'PEER_MECHANIC'].includes(u.role)) {
             delete localUsersRef.current[u.id];
             return;
          }
          // Local filter slightly larger than query to avoid edge flickering
          const distanceInKm = distanceBetween([u.lastLat, u.lastLng], [debouncedUserPos[0], debouncedUserPos[1]]);
          if (distanceInKm > 40) {
             delete localUsersRef.current[u.id];
             return;
          }
          localUsersRef.current[u.id] = u;
        });
        syncUsers();
      }, (error: any) => {
        if (isFirestoreQuotaError(error)) setQuotaError?.(true);
        else console.warn('Map mapPresence geohash listener:', error);
      });
      unsubs.push(unsub);
    }

    return () => unsubs.forEach(u => u());
  }, [currentUser, isAdmin, debouncedUserPos, syncUsers]);

  // 3. ADMIN USER SYNC
  useEffect(() => {
    if (isAdmin && currentUser) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisibleUsers(adminUsers.filter(u => u.lastLat && u.lastLng && u.id !== currentUser?.uid));
    }
  }, [isAdmin, adminUsers, currentUser]);

  useEffect(() => {
    if (minimal) {
      setMapBootstrapping(false);
      return;
    }
    if (userPos || storeLocation) {
      setMapBootstrapping(false);
      return;
    }
    setMapBootstrapping(true);
    mapLayersReadyRef.current = { events: false, reports: false };
  }, [minimal, currentUser?.uid, userPos, storeLocation]);

  // 2-4. Real-time listeners for Events, SOS, and Reports
  useEffect(() => {
    if (!currentUser) {
      setRawEvents([]);
      setRawReports([]);
      setActiveSOSs({});
      return;
    }

    // Events
    const qEvents = query(
      collection(db, 'events'), 
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const unsubEvents = onSnapshot(qEvents, (snapshot) => {
      const events = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((event: any) => (event.lastLat ?? event.lat ?? event.location?.latitude) != null && (event.lastLng ?? event.lng ?? event.location?.longitude) != null);
      setRawEvents(events);
      mapLayersReadyRef.current.events = true;
      tryFinishMapBootstrap();
    }, (err) => {
      console.warn("Events listener error:", err);
      mapLayersReadyRef.current.events = true;
      tryFinishMapBootstrap();
    });

    // 3. SOS real-time
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

    // 4. Road Reports real-time
    const q = query(
      collection(db, 'roadReports'),
      where('status', 'in', ['open', 'confirmed', 'in_review']),
      limit(60)  // Ridotto da 100 per minimizzare i costi Firestore
    );
    const unsubReports = onSnapshot(q, (snapshot) => {
      const reports = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a: any, b: any) => {
          const dateA = a.createdAt?.seconds || 0;
          const dateB = b.createdAt?.seconds || 0;
          return dateB - dateA;
        });
      setRawReports(reports);
      mapLayersReadyRef.current.reports = true;
      tryFinishMapBootstrap();
    }, (err) => {
       console.warn("Reports listener error:", err);
       mapLayersReadyRef.current.reports = true;
       tryFinishMapBootstrap();
    });

    // Mechanic tracking
    let unsubTrack: any = () => {};
    if (mechanicToTrackId) {
      unsubTrack = onSnapshot(doc(db, 'users', mechanicToTrackId), (snapshot) => {
        if (snapshot.exists()) {
          setTrackedMechanic({ id: snapshot.id, ...snapshot.data() });
        }
      }, (err) => {
        console.warn("Track listener error:", err);
      });
    }

    return () => {
      unsubEvents();
      unsubSOS();
      unsubReports();
      unsubTrack();
    };
  }, [mechanicToTrackId, currentUser, tryFinishMapBootstrap]);


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
      {mapBootstrapping && !minimal && <MapLoadingOverlay />}
      {/* Top-Left Controls: Online Counters */}
      {!minimal && (
        <div className="absolute top-floating left-4 z-[999] flex flex-col gap-2 pointer-events-auto items-start">
           <div className="bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-md flex items-center gap-2">
             <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
             <span className="text-[9px] font-bold uppercase">{visibleUsers.filter(u => u.role === 'MECHANIC' || u.role === 'PEER_MECHANIC').length} Meccanici online</span>
           </div>
           <div className="bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-md flex items-center gap-2">
             <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
             <span className="text-[9px] font-bold uppercase">{visibleUsers.filter(u => u.role === 'CYCLIST').length} Ciclisti online</span>
           </div>
        </div>
      )}

      {/* Bottom-Right Controls: Map Type, Dark Mode, AI, Locate */}
      {!minimal && (
        <div className="absolute home-nav-fab-offset right-4 z-[999] flex flex-col gap-3 pointer-events-auto items-end">
           {/* Map Type Selector */}
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
               className="bg-white text-primary p-3 rounded-xl shadow-xl border border-grey/10 cursor-pointer transition-all flex items-center justify-center"
               title={t('map.toggle')}
             >
               <Layers size={20} />
             </motion.button>
           </div>

           {/* AI Assistant Toggle */}
           <motion.button
             whileHover={{ scale: 1.05 }}
             whileTap={{ scale: 0.95 }}
             onClick={() => setShowAIDoctor?.(true)}
             className="bg-white text-warning p-3 rounded-xl shadow-xl border border-grey/10 cursor-pointer transition-all flex items-center justify-center"
             title="AI Doctor"
           >
             <Sparkles size={20} />
           </motion.button>

           {/* Locate */}
           <motion.button
             whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={async () => {
                const known: [number, number] | null = userPos
                  ?? (storeLocation ? [storeLocation.lat, storeLocation.lng] : null);
                if (known) flyToPosition(known);

                if (!('geolocation' in navigator)) {
                  if (!known) toast.error('Geolocalizzazione non disponibile');
                  return;
                }

                setIsRefreshing(true);
                try {
                  const coords = await getFreshGpsCoords();
                  const newPos: [number, number] = [coords.lat, coords.lng];
                  flyToPosition(newPos);
                  const store = useAuthStore.getState();
                  store.setUserLocation({ lat: coords.lat, lng: coords.lng });
                  store.setLocationSource(toStoreLocationSource(coords.source));
                  if (coords.source === 'gps-low') {
                    toast(geoSuccessToast('gps-low'), { icon: 'ℹ️', duration: 3000 });
                  } else {
                    toast.success(geoSuccessToast('gps-high'));
                  }
                } catch (err: unknown) {
                  const code = (err as { code?: number })?.code ?? 2;
                  if (!known) {
                    toast.error(geolocationErrorMessage(code));
                  } else {
                    toast('GPS non aggiornato — resti sulla ultima posizione nota', { icon: 'ℹ️', duration: 4000 });
                  }
                } finally {
                  setIsRefreshing(false);
                }
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
          center: mapCenterOrDefault(userPos),
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
        <MapFlyController flyTarget={flyTarget} />
        <TileLayer
          {...({
            attribution: mapType === 'satellite' ? 'Esri' : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            url: getMapUrl()
          } as any)}
        />
        {/* User's own location marker - respect isOnline status for "live" feel */}
        {userPos && (profile?.isOnline !== false || isAdmin) && (
          <LocationMarker 
            position={userPos}
            userId={currentUser?.uid || 'me'}
            role={profile?.role || currentUserRole || 'CYCLIST'}
            displayName={profile?.name || currentUser?.displayName || undefined}
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
           <TrackedMechanicMarker
              mechanic={trackedMechanic}
              onStartChat={onStartChat}
              t={t}
              getFaultTypeTranslation={getFaultTypeTranslation}
           />
        )}

        {/* Regular Users (Mechanics, Peer Mechanics & Cyclists) */}
        {visibleUsers.filter(u => {
          if (u.id === mechanicToTrackId) return false;
          const isMechanic = u.role === 'MECHANIC' || u.role === 'PEER_MECHANIC';
          const isCyclist = u.role === 'CYCLIST';
          if (isMechanic && !showMechanics) return false;
          if (isCyclist && !showCyclists) return false;
          return true;
        }).map((u: any) => {
          if (!u.lastLat || !u.lastLng) return null;
          let roleColor = 'primary';
          if (u.role === 'MECHANIC') roleColor = 'warning';
          else if (u.role === 'PEER_MECHANIC') roleColor = 'peer';

          return (
            <UserMarker
              key={u.id}
              user={u}
              onStartChat={onStartChat}
              t={t}
              getFaultTypeTranslation={getFaultTypeTranslation}
              roleColor={roleColor}
              onSelect={setSelectedObj}
              sos={u.role === 'CYCLIST' ? activeSOSs[u.id] : undefined}
              currentUser={currentUser}
              currentUserRole={currentUserRole}
            />
          );
        })}

        {/* Road Reports */}
        {visibleReports.map((report: any) => {
          const isSelected = selectedObj?.id === report.id;
          const lat = report.location?.lat ?? report.location?.latitude;
          const lng = report.location?.lng ?? report.location?.longitude;
          if (!lat || !lng) return null;

          return (
            <ReportMarker
              key={report.id}
              report={report}
              isSelected={isSelected}
              t={t}
              onSelect={setSelectedObj}
              onViewDetailsFunc={onViewReportDetails}
            />
          );
        })}

        {/* Group Events */}
        {visibleEvents.map((event: any) => {
          const isSelected = selectedObj?.id === event.id;
          const lat = event.lastLat ?? event.lat ?? event.location?.latitude;
          const lng = event.lastLng ?? event.lng ?? event.location?.longitude;
          if (!lat || !lng) return null;

          return (
            <EventMarker
              key={event.id}
              event={event}
              onSelect={setSelectedObj}
              onViewDetailsFunc={onViewEventDetails}
              onJoin={onJoinEvent}
              isJoining={joiningEventId === event.id}
              currentUser={currentUser}
              t={t}
            />
          );
        })}
      </MapContainer>
    </div>
  );
}

export class MapErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('Map crashed:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="absolute inset-0 flex items-center justify-center bg-white">
          <div className="text-center p-8">
            <p className="font-black text-primary uppercase tracking-widest text-sm mb-4">
              Mappa non disponibile
            </p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false })}
              className="bg-primary text-white px-6 py-3 rounded-xl text-xs font-black uppercase"
            >
              Riprova
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

