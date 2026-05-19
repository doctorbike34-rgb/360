import toast from 'react-hot-toast';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { User as FirebaseUser } from 'firebase/auth';
import { collection, query, where, onSnapshot, doc, limit, getDocs, updateDoc, serverTimestamp, orderBy, startAt, endAt, runTransaction } from 'firebase/firestore';
import { geohashQueryBounds, distanceBetween } from 'geofire-common';
import { useTranslation } from 'react-i18next';
import { useThemeStore } from '../store/useThemeStore';
import { useAuthStore } from '../store/useAuthStore';
import { UserProfile, SOSRequest } from '../types';
import { Crosshair, Navigation, Map as MapIcon, Layers, Users, Clock, Star, Clock4, MessageCircle, Sun, Moon, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { formatDistanceToNow } from 'date-fns';
import { it } from 'date-fns/locale';
import { TFunction } from 'i18next';

function escapeHtml(unsafe: string | number | null | undefined): string {
  if (unsafe == null) return '';
  const str = String(unsafe);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

interface MechanicPopupProps {
  mechanic: UserProfile & { id: string, updatedAt?: any };
  onStartChat?: (id: string, name: string) => void;
  t: TFunction;
  sos?: SOSRequest;
  currentUserRole?: string | null;
  currentUser?: FirebaseUser | null;
  getFaultTypeTranslation: (type: string | undefined) => string;
}

function MechanicPopup({ 
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
          {sos.status === 'PENDING' && (currentUserRole === 'PEER_MECHANIC' || currentUserRole === 'MECHANIC') && currentUser?.uid !== mechanic.id && (
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

function makeSvgIcon(svg: string, size: number, anchor: [number, number]): L.Icon {
  return L.icon({
    iconUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    iconSize: [size, size],
    iconAnchor: anchor,
    popupAnchor: [0, -size / 2]
  });
}

function userMarkerIcon(color: string, online: boolean): L.Icon {
  const dot = online ? `<circle cx="26" cy="26" r="5" fill="#22C55E" stroke="white" stroke-width="2"/>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
    <circle cx="16" cy="16" r="14" fill="${color}" opacity="0.2" stroke="${color}" stroke-width="2"/>
    <circle cx="16" cy="16" r="8" fill="${color}" opacity="0.6"/>
    ${dot}
  </svg>`;
  return makeSvgIcon(svg, 32, [16, 16]);
}

function mechanicMarkerIcon(status: string, online: boolean): L.Icon {
  const pulse = status === 'TRAVELING' ? `<animate attributeName="r" values="14;18;14" dur="1.5s" repeatCount="indefinite"/>` : '';
  const dot = online ? `<circle cx="26" cy="26" r="5" fill="#22C55E" stroke="white" stroke-width="2"/>` : '';
  const color = status === 'TRAVELING' ? '#F97316' : '#EA580C';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="36" height="36">
    <circle cx="18" cy="18" r="14" fill="${color}" opacity="0.25" stroke="${color}" stroke-width="2.5">
      ${pulse}
    </circle>
    <circle cx="18" cy="18" r="10" fill="${color}" opacity="0.7"/>
    <circle cx="18" cy="18" r="5" fill="white" opacity="0.9"/>
    ${dot}
  </svg>`;
  return makeSvgIcon(svg, 36, [18, 18]);
}

function reportMarkerIcon(severity: string): L.Icon {
  const colors: Record<string, string> = { low: '#EAB308', medium: '#F97316', high: '#EF4444' };
  const color = colors[severity] || '#EAB308';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
    <circle cx="16" cy="16" r="14" fill="${color}" opacity="0.3" stroke="${color}" stroke-width="2"/>
    <path d="M16 8 L22 22 L10 22 Z" fill="${color}" stroke="white" stroke-width="1" stroke-linejoin="round"/>
    <circle cx="16" cy="18" r="1.5" fill="white"/>
    <line x1="16" y1="13" x2="16" y2="15.5" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`;
  return makeSvgIcon(svg, 32, [16, 16]);
}

function eventMarkerIcon(): L.Icon {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">
    <circle cx="20" cy="20" r="18" fill="#EA580C" opacity="0.2" stroke="#EA580C" stroke-width="2"/>
    <circle cx="20" cy="20" r="14" fill="#EA580C" opacity="0.5"/>
    <circle cx="20" cy="20" r="10" fill="white" opacity="0.9"/>
    <text x="20" y="24" text-anchor="middle" font-size="14" fill="#EA580C">🚲</text>
  </svg>`;
  return makeSvgIcon(svg, 40, [20, 20]);
}

function TrackedMechanicMarker({ mechanic, onStartChat, t, getFaultTypeTranslation }: {
  mechanic: any;
  onStartChat?: (userId: string, userName: string) => void;
  t: TFunction;
  getFaultTypeTranslation: (faultType: string | undefined) => string;
}) {
  const icon = useMemo(() => mechanicMarkerIcon(mechanic.mechanicStatus, mechanic.isOnline),
    [mechanic.mechanicStatus, mechanic.isOnline]);

  return (
    <Marker position={[mechanic.lastLat, mechanic.lastLng]} icon={icon}>
      <Popup>
        <MechanicPopup mechanic={mechanic} onStartChat={onStartChat} t={t} getFaultTypeTranslation={getFaultTypeTranslation} />
      </Popup>
    </Marker>
  );
}

function UserMarker({ user: u, onStartChat, t, getFaultTypeTranslation, roleColor, onClick }: {
  user: any;
  onStartChat?: (userId: string, userName: string) => void;
  t: TFunction;
  getFaultTypeTranslation: (faultType: string | undefined) => string;
  roleColor: string;
  onClick?: () => void;
}) {
  const colorMap: Record<string, string> = { primary: '#3B82F6', warning: '#F59E0B', '[#8B5CF6]': '#8B5CF6' };
  const color = colorMap[roleColor] || '#3B82F6';
  const icon = useMemo(() => userMarkerIcon(color, u.isOnline), [color, u.isOnline]);

  return (
    <Marker position={[u.lastLat, u.lastLng]} icon={icon} eventHandlers={onClick ? { click: onClick } : undefined}>
      <Popup>
        <MechanicPopup mechanic={u} onStartChat={onStartChat} t={t} getFaultTypeTranslation={getFaultTypeTranslation} />
      </Popup>
    </Marker>
  );
}

function ReportMarker({ report, isSelected, t, onClick }: {
  report: any;
  isSelected: boolean;
  t: TFunction;
  onClick: () => void;
}) {
  const icon = useMemo(() => reportMarkerIcon(report.severity), [report.severity]);

  const lat = report.location?.lat ?? report.location?.latitude;
  const lng = report.location?.lng ?? report.location?.longitude;
  if (!lat || !lng) return null;

  return (
    <Marker position={[lat, lng]} icon={icon} eventHandlers={{ click: onClick }}>
      <Popup>
        <div className="p-1 min-w-[140px]">
          <div className="font-black uppercase text-sm leading-tight mb-1">{t(`reports.categories.${report?.category}`, report?.category?.replace('_', ' ') || '') as any}</div>
          <div className="text-[10px] text-black/70 mb-2 truncate max-w-[150px]">{report?.description}</div>
          <div className="flex items-center justify-between text-[9px] font-bold text-grey uppercase mt-2 mb-3">
            <span>Upvotes: {report?.upvotes?.length || 0}</span>
            <span className="bg-grey/10 px-1.5 py-0.5 rounded-md">{report?.status}</span>
          </div>
        </div>
      </Popup>
    </Marker>
  );
}

function EventMarker({ event, onClick }: {
  event: any;
  onClick: () => void;
}) {
  const icon = useMemo(() => eventMarkerIcon(), []);

  const lat = event.lastLat ?? event.lat ?? event.location?.latitude;
  const lng = event.lastLng ?? event.lng ?? event.location?.longitude;
  if (!lat || !lng) return null;

  return (
    <Marker position={[lat, lng]} icon={icon} eventHandlers={{ click: onClick }}>
      <Popup>
        <div className="p-1">
          <div className="font-black text-primary uppercase italic text-sm leading-tight mb-1">{event.title}</div>
          <div className="flex items-center gap-2 text-[10px] font-bold text-grey uppercase tracking-widest mb-3">
            <div className="flex items-center gap-1"><Users size={12} /> {event.participantCount}/{event.maxParticipants}</div>
          </div>
        </div>
      </Popup>
    </Marker>
  );
}

function LocationMarker({ position, forceCenter, forceFlyPosition, avatarUrl }: { 
  position: [number, number] | null, 
  forceCenter?: boolean,
  forceFlyPosition?: [number, number] | null,
  avatarUrl?: string | null
}) {
  const map = useMap();
  const lastFlyPosRef = useRef<string | null>(null);
  const initialCenterSet = useRef(false);

  const customIcon = useMemo(() => avatarUrl ? userMarkerIcon('#3B82F6', true) : undefined, [avatarUrl]);

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

export function Map({ center, mechanicToTrackId, onStartChat, onViewEventDetails, onViewReportDetails, minimal = false, isAdmin = false, adminUsers = [], showMechanics = true, showCyclists = true }: { 
  center?: [number, number], 
  mechanicToTrackId?: string,
  onStartChat?: (userId: string, userName: string) => void,
  onViewEventDetails?: (event: any) => void,
  onViewReportDetails?: (report: any) => void,
  minimal?: boolean,
  isAdmin?: boolean,
  adminUsers?: any[],
  showMechanics?: boolean,
  showCyclists?: boolean,
}) {
  const { user: currentUser, profile, role: currentUserRole, setQuotaError, userLocation: storeLocation, setShowAIDoctor } = useAuthStore();
  const [visibleUsers, setVisibleUsers] = useState<any[]>([]);
  const [visibleEvents, setVisibleEvents] = useState<any[]>([]);
  const [visibleReports, setVisibleReports] = useState<any[]>([]);
  const [activeSOSs, setActiveSOSs] = useState<Record<string, any>>({});
  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [debouncedUserPos, setDebouncedUserPos] = useState<[number, number] | null>(null);
  const userPosDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null); 
  const [flyPos, setFlyPos] = useState<[number, number] | null>(center || null);
  const [trackedMechanic, setTrackedMechanic] = useState<any>(null);
  const [selectedObj, setSelectedObj] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [mapType, setMapType] = useState<'standard' | 'satellite' | 'terrain'>('standard');
  const [showMapTypes, setShowMapTypes] = useState(false);
  const [showNavMenu, setShowNavMenu] = useState(false);
  const [forceCenterToggle, setForceCenterToggle] = useState(false);
  const { isDarkMode, toggleDarkMode } = useThemeStore();
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

  // Debounce userPos for geohash listeners to prevent excessive re-subscriptions
  useEffect(() => {
    if (userPosDebounceRef.current) clearTimeout(userPosDebounceRef.current);
    userPosDebounceRef.current = setTimeout(() => {
      setDebouncedUserPos(userPos);
    }, 500);
    return () => {
      if (userPosDebounceRef.current) clearTimeout(userPosDebounceRef.current);
    };
  }, [userPos]);

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
       
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFlyPos(center);
    }
  }, [center]);

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
        collection(db, 'users'), 
        orderBy('geohash'),
        startAt(b[0]),
        endAt(b[1]),
        limit(200) // Increase limit per shard
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
        if (error.message.includes('Quota exceeded')) setQuotaError?.(true);
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

  // 2-4. Real-time listeners for Events, SOS, and Reports
  useEffect(() => {
    if (!currentUser) {
      setVisibleEvents([]);
      setVisibleReports([]);
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
      setVisibleEvents(events);
    }, (err) => {
      console.warn("Events listener error:", err);
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
  }, [mechanicToTrackId, currentUser]);


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
      {/* Top-Left Controls: Online Counters */}
      {!minimal && (
        <div className="absolute top-4 left-4 z-[999] flex flex-col gap-2 pointer-events-auto items-start">
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
        <div className="absolute bottom-28 right-4 z-[999] flex flex-col gap-3 pointer-events-auto items-end">
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

           {/* Dark Mode Toggle */}
           <motion.button
             whileHover={{ scale: 1.05 }}
             whileTap={{ scale: 0.95 }}
             onClick={toggleDarkMode}
             className="bg-white text-primary p-3 rounded-xl shadow-xl border border-grey/10 cursor-pointer transition-all flex items-center justify-center"
             title={isDarkMode ? 'Modalità chiara' : 'Modalità scura'}
           >
             {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
           </motion.button>

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
             onClick={() => {
               setFlyPos(null);
               if (storeLocation) {
                 setUserPos([storeLocation.lat, storeLocation.lng]);
                 setForceCenterToggle(prev => !prev);
               } else {
                 updateRealPosition(true);
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
        {userPos && (profile?.isOnline !== false || isAdmin) && (
          <LocationMarker 
            position={userPos} 
            forceCenter={forceCenterToggle}
            forceFlyPosition={flyPos}
            avatarUrl={isAdmin ? null : (profile?.photoURL || currentUser?.photoURL)}
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
          else if (u.role === 'PEER_MECHANIC') roleColor = '[#8B5CF6]';

          return (
            <UserMarker
              key={u.id}
              user={u}
              onStartChat={onStartChat}
              t={t}
              getFaultTypeTranslation={getFaultTypeTranslation}
              roleColor={roleColor}
              onClick={() => setSelectedObj(u)}
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
              onClick={() => setSelectedObj(report)}
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
              isSelected={isSelected}
              onClick={() => setSelectedObj(event)}
            />
          );
        })}
      </MapContainer>
    </div>
  );
}

