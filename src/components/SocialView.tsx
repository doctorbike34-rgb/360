import toast from 'react-hot-toast';
import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, updateDoc, doc, arrayUnion, arrayRemove, increment, limit, where, setDoc, getDocs } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { Calendar, Users, MapPin, Plus, Bike, ChevronRight, X, Clock, MessageCircle, ArrowLeft, Search } from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { gamificationService } from '../services/gamificationService';

function DraggableMarker({ position, setPosition }: { position: [number, number], setPosition: (pos: [number, number]) => void }) {
  const map = useMap();
  const markerRef = React.useRef<L.Marker | null>(null);
  
  const eventHandlers = React.useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current;
        if (marker != null) {
          const { lat, lng } = marker.getLatLng();
          setPosition([lat, lng]);
        }
      },
    }),
    [setPosition],
  );

  useEffect(() => {
    map.flyTo(position, map.getZoom());
  }, [position, map]);

  return (
    <Marker
      draggable={true}
      eventHandlers={eventHandlers}
      position={position}
      ref={markerRef}
      icon={L.icon({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41]
      })}
    />
  );
}
import { useAuthStore } from '../store/useAuthStore';
import { useTranslation } from 'react-i18next';
import { Chat } from './Chat';

interface Event {
  id: string;
  title: string;
  description: string;
  targetLevel?: string;
  organizerId: string;
  organizerName: string;
  startAt: string;
  address: string;
  maxParticipants: number;
  participantCount: number;
  participants: string[];
  lastLat: number;
  lastLng: number;
  createdAt: any;
}

interface UserSuggestion {
  id: string;
  name: string;
  photoURL?: string;
  updatedAt?: any;
  lastSeenAt?: any;
}

interface AddressSuggestion {
  place_id: string | number;
  display_name: string;
  lat: string;
  lon: string;
}

export function SocialView({ onStartChat, onFocusEvent, onViewEventDetails }: { 
  onStartChat?: (userId: string, userName: string) => void,
  onFocusEvent?: (lat: number, lng: number) => void,
  onViewEventDetails?: (event: any) => void
}) {
  const { user, setQuotaError } = useAuthStore();
  const { t } = useTranslation();
  const [events, setEvents] = useState<Event[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  
  // Creation form state
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newMax, setNewMax] = useState(10);
  const [newDate, setNewDate] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newTargetLevel, setNewTargetLevel] = useState('Tutti (inclusi esperti)');
  const [isCreating, setIsCreating] = useState(false);
  const [addressPreview, setAddressPreview] = useState<{ lat: number, lng: number } | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [focusedEventId, setFocusedEventId] = useState<string | null>(null);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const searchTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const [selectedChat, setSelectedChat] = useState<{ id: string, title: string } | null>(null);

  const [nearbyCyclists, setNearbyCyclists] = useState<UserSuggestion[]>([]);

  const lastUpdateRef = React.useRef<number>(0);

  useEffect(() => {
    const qNearby = query(
      collection(db, 'users'),
      where('role', '==', 'CYCLIST'),
      where('isOnline', '==', true),
      limit(100) // Increase from 20 to 100 to catch more local users
    );

    const unsubscribe = onSnapshot(qNearby, (snapshot) => {
      const docs = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as UserSuggestion))
        .filter(u => {
          if (u.id === user?.uid) return false;
          const lastSeen = u.lastSeenAt instanceof Date ? u.lastSeenAt.getTime() : ((u.lastSeenAt as any)?.seconds ? (u.lastSeenAt as any).seconds * 1000 : 0);
          const now = Date.now();
          // Filter users seen in last 30 mins (increased from 15)
          return (now - lastSeen) < (30 * 60 * 1000);
        })
        .sort((a, b) => {
          const valA = a.updatedAt instanceof Date ? a.updatedAt.getTime() : (a.updatedAt?.seconds ? a.updatedAt.seconds * 1000 : 0);
          const valB = b.updatedAt instanceof Date ? b.updatedAt.getTime() : (b.updatedAt?.seconds ? b.updatedAt.seconds * 1000 : 0);
          return valB - valA;
        });
      setNearbyCyclists(docs);
    }, (error: any) => {
      if (error.message.includes('Quota exceeded')) setQuotaError(true);
      console.warn('Error listening to nearby cyclists', error);
    });

    return () => unsubscribe();
  }, [user, setQuotaError]);

  useEffect(() => {
    const q = query(
      collection(db, 'events'), 
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Event))
        .sort((a, b) => {
           const dateA = a.startAt ? new Date(a.startAt).getTime() : 0;
           const dateB = b.startAt ? new Date(b.startAt).getTime() : 0;
           return dateA - dateB;
        });
      setEvents(docs);
    }, (error: any) => {
      if (error.message.includes('Quota exceeded')) setQuotaError(true);
      console.warn('Error listening to events', error);
    });

    return () => unsubscribe();
  }, [setQuotaError]);

  const geocodeAddress = async (address: string): Promise<{ lat: number, lng: number } | null> => {
    if (!address) return null;
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&countrycodes=it&addressdetails=1&limit=1`, {
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
         console.warn('Geocoding status not OK:', response.status);
         return null;
      }
      
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
         console.warn('Geocoding returned non-JSON response:', contentType);
         return null;
      }
      
      const data = await response.json();
      if (data && data.length > 0) {
        // Log for debug
        console.log('Location found:', data[0].display_name);
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      }
    } catch (err) {
      console.warn('Geocoding error:', err);
    }
    return null;
  };

  const handleVerifyAddress = async () => {
    if (!newAddress) return;
    setIsVerifying(true);
    const coords = await geocodeAddress(newAddress);
    if (coords) {
      setAddressPreview(coords);
    } else {
      toast.error(t('common.error') + ': Position not found. Please enter a more complete address.');
      setAddressPreview(null);
    }
    setIsVerifying(false);
  };

  const handleAddressChange = (val: string) => {
    setNewAddress(val);
    
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    
    if (val.length < 3) {
      setAddressSuggestions([]);
      return;
    }

    setIsSearchingAddress(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(val)}&countrycodes=it&addressdetails=1&limit=5`, {
          headers: {
            'Accept': 'application/json'
          }
        });
        
        if (!response.ok) {
           setAddressSuggestions([]);
           return;
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
           setAddressSuggestions([]);
           return;
        }

        const data = await response.json();
        setAddressSuggestions(data || []);
      } catch (err) {
        console.warn(err);
      } finally {
        setIsSearchingAddress(false);
      }
    }, 500);
  };

  const handleSelectSuggestion = (suggestion: AddressSuggestion) => {
    setNewAddress(suggestion.display_name);
    setAddressPreview({ lat: parseFloat(suggestion.lat), lng: parseFloat(suggestion.lon) });
    setAddressSuggestions([]);
  };

  const createEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newTitle || !newDate) return;

    setIsCreating(true);
    try {
      // Prioritize geocoded address
      let lat = addressPreview?.lat;
      let lng = addressPreview?.lng;
      
      // Secondary geocode if state was empty but input exists (shouldn't happen with check above)
      if (!lat || !lng && newAddress) {
        const coords = await geocodeAddress(newAddress);
        if (coords) {
           lat = coords.lat;
           lng = coords.lng;
        }
      }

      // Final fallback to user position ONLY if no address specified at all
      if ((!lat || !lng) && !newAddress) {
        if ("geolocation" in navigator) {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
          });
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        }
      } else if (!lat || !lng) {
        // If they DID specify an address but we couldn't geocode it
        toast.error('Non abbiamo trovato le coordinate per questo indirizzo. Assicurati che sia corretto.');
        setIsCreating(false);
        return;
      }

      if (!lat || !lng) {
        toast.error('Errore: non riusciamo a determinare la posizione dell\'evento.');
        setIsCreating(false);
        return;
      }

      const eventRef = await addDoc(collection(db, 'events'), {
        title: newTitle,
        description: newDescription,
        targetLevel: newTargetLevel,
        organizerId: user?.uid,
        organizerName: user?.displayName || t('auth.cyclist'),
        startAt: newDate,
        address: newAddress,
        maxParticipants: Number(newMax),
        participantCount: 1,
        participants: [user?.uid],
        lastLat: lat,
        lastLng: lng,
        createdAt: serverTimestamp()
      });

      // Create associated chat
      await setDoc(doc(db, 'chats', eventRef.id), {
        eventId: eventRef.id,
        title: newTitle,
        type: 'GROUP',
        participants: [user?.uid],
        createdAt: serverTimestamp(),
        lastMessage: 'Welcome to the group!',
        lastMessageAt: serverTimestamp()
      });

      if (user?.uid) gamificationService.awardPoints(user.uid, 'Creazione evento social', 30);

      setShowCreate(false);
      setNewTitle('');
      setNewDescription('');
      setNewDate('');
      setNewAddress('');
      setNewTargetLevel('Tutti (inclusi esperti)');
      setAddressPreview(null);
    } catch (err) {
      console.error(err);
      toast.error('Errore durante la creazione. Riprova.');
    } finally {
      setIsCreating(false);
    }
  };

  const [loadingEventId, setLoadingEventId] = useState<string | null>(null);

  const toggleJoin = async (event: Event) => {
    if (!user) return;
    const isJoined = event.participants?.includes(user?.uid);
    setLoadingEventId(event.id);

    try {
      if (isJoined) {
        await updateDoc(doc(db, 'events', event.id), {
          participants: arrayRemove(user?.uid),
          participantCount: increment(-1)
        });
        
        // Update local state immediately
        setEvents(prev => prev.map(e => 
          e.id === event.id 
            ? { ...e, participants: (e.participants || []).filter(id => id !== user.uid), participantCount: Math.max(0, e.participantCount - 1) } 
            : e
        ));

        // Also remove from chat participants, safely if chat doesn't exist
        try {
          await setDoc(doc(db, 'chats', event.id), {
            participants: arrayRemove(user?.uid)
          }, { merge: true });
        } catch(chatErr) { console.warn('Chat might not exist', chatErr); }
      } else {
        // Check limit
        if (event.participantCount >= event.maxParticipants) {
          toast.error(t('social.groupFullAlert'));
          setLoadingEventId(null);
          return;
        }
        await updateDoc(doc(db, 'events', event.id), {
          participants: arrayUnion(user?.uid),
          participantCount: increment(1)
        });
        
        // Update local state immediately
        setEvents(prev => prev.map(e => 
          e.id === event.id 
            ? { ...e, participants: [...(e.participants || []), user.uid], participantCount: e.participantCount + 1 } 
            : e
        ));

        // Also add to chat participants, creating if it doesn't exist
        try {
          await setDoc(doc(db, 'chats', event.id), {
            eventId: event.id,
            title: event.title,
            type: 'GROUP',
            participants: arrayUnion(user?.uid),
            createdAt: serverTimestamp()
          }, { merge: true });
        } catch(chatErr) { console.warn('Chat might not exist', chatErr); }
        
        gamificationService.awardPoints(user.uid, 'Partecipazione evento', 5);
        
        // Open chat automatically
        setSelectedChat({ id: event.id, title: event.title });
      }
    } catch (err: any) {
      console.error(err);
      toast.error('Non è stato possibile aggiornare la partecipazione: ' + err.message);
    } finally {
      setLoadingEventId(null);
    }
  };

  return (
    <div className="flex-1 bg-white text-black border border-grey/10 shadow-sm overflow-y-auto p-6 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-48 relative transition-colors duration-500">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-black text-primary  transition-colors">{t('social.title')}</h2>
          <p className="text-grey  text-sm italic transition-colors">{t('social.subtitle')}</p>
        </div>
        <button 
          onClick={() => setShowCreate(true)}
          className="bg-primary text-white p-3 rounded-2xl shadow-lg shadow-primary/20 active:scale-95 transition-transform"
        >
          <Plus size={24} />
        </button>
      </div>

      <div className="space-y-4">
        {events.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white text-black p-8 rounded-[2rem] text-center border border-grey/5 transition-colors"
          >
            <Bike className="mx-auto text-grey/20 w-16 h-16 mb-4" />
            <p className="text-grey font-bold italic">{t('social.noEvents')}</p>
            <button 
              onClick={() => setShowCreate(true)}
              className="mt-4 text-primary text-sm font-black uppercase tracking-widest border-b-2 border-primary transition-colors hover:text-accent"
            >
              {t('social.organize')}
            </button>
          </motion.div>
        ) : (
          events.map(event => {
            const isFull = event.participantCount >= event.maxParticipants;
            const isJoined = event.participants?.includes(user?.uid);
            
            const eventDate = new Date(event.startAt);
            const month = eventDate.toLocaleString('default', { month: 'short' });
            const day = eventDate.getDate();
            const time = eventDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            return (
              <motion.div 
                key={event.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setExpandedEventId(expandedEventId === event.id ? null : event.id)}
                className={`bg-white text-black p-5 rounded-[2rem] shadow-sm hover:shadow-md border border-grey/5 flex flex-col group transition-all duration-300 cursor-pointer ${isFull && !isJoined ? 'opacity-70' : ''}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 w-full">
                  <div className="flex items-center gap-4 w-full sm:w-auto">
                    <div className={`w-16 h-16 shrink-0 rounded-2xl flex flex-col items-center justify-center transition-colors ${isJoined ? 'bg-primary text-white' : 'bg-primary/5 text-primary'}`}>
                      <span className="text-[10px] font-black uppercase">{month}</span>
                      <span className="text-xl font-black leading-none">{day}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h4 className="font-bold text-black transition-colors truncate">{event.title}</h4>
                        {event.targetLevel && (
                          <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border border-primary/20 shrink-0">
                            {event.targetLevel}
                          </span>
                        )}
                        {isFull && (
                          <span className="bg-accent/10 text-accent text-[8px] font-black px-1.5 py-0.5 rounded uppercase">{t('social.fullGroup')}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                        <div className="flex items-center gap-1 text-[10px] font-bold text-grey uppercase transition-colors">
                          <Calendar size={12} /> {time}
                        </div>
                        {event.address && (
                          <div className="flex items-center gap-1 text-[10px] font-bold text-grey uppercase transition-colors truncate max-w-[150px]">
                            <MapPin size={12} /> {event.address}
                          </div>
                        )}
                        <div className="flex items-center gap-1 text-[10px] font-bold text-grey uppercase transition-colors">
                          <Users size={12} /> {event.participantCount || 0}/{event.maxParticipants}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3 items-center justify-between sm:justify-end w-full sm:w-auto mt-4 sm:mt-0 pt-4 sm:pt-0 border-t border-grey/5 sm:border-0 ml-auto">
                    <div className="flex gap-2">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          if (event.lastLat && event.lastLng) {
                            onFocusEvent?.(event.lastLat, event.lastLng);
                          }
                        }}
                        className="p-3 bg-accent/10 text-accent rounded-xl hover:bg-accent/20 transition-all active:scale-90"
                        title="Vedi sulla mappa"
                      >
                        <MapPin size={18} />
                      </button>
                      {isJoined && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedChat({ id: event.id, title: event.title });
                          }}
                          className="p-3 bg-primary/10 text-primary rounded-xl hover:bg-primary/20 transition-all active:scale-90"
                          title="Chat del gruppo"
                        >
                          <MessageCircle size={18} />
                        </button>
                      )}
                    </div>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleJoin(event);
                      }}
                      disabled={(!isJoined && isFull) || loadingEventId === event.id}
                      className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm flex-1 sm:flex-none text-center ${
                        loadingEventId === event.id ? 'bg-grey/20 text-grey cursor-not-allowed opacity-50' :
                        isJoined 
                          ? 'bg-white text-grey hover:bg-red-50 hover:text-red-500' 
                          : isFull 
                            ? 'bg-grey/10 text-grey cursor-not-allowed opacity-50'
                            : 'bg-primary text-white active:scale-95 shadow-primary/20'
                      }`}
                    >
                      {loadingEventId === event.id ? 'ATTENDI...' : (isJoined ? t('social.leaveGroup') : isFull ? t('social.fullGroup') : t('social.joinGroup'))}
                    </button>
                  </div>
                </div>

                <AnimatePresence>
                  {expandedEventId === event.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden w-full flex-shrink-0"
                    >
                      <div className="mt-4 pt-4 border-t border-grey/10 space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black text-grey uppercase tracking-widest">Organizzatore:</span>
                          <span className="text-xs font-bold text-black ml-2">{event.organizerName}</span>
                        </div>
                        {event.description && (
                          <div>
                            <span className="text-[10px] font-black text-grey uppercase tracking-widest block mb-1">Descrizione:</span>
                            <p className="text-sm text-black font-medium leading-relaxed">{event.description}</p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })
        )}
      </div>

      <AnimatePresence>
        {selectedChat && (
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            className="fixed inset-0 z-[200] flex flex-col bg-white  transition-colors"
          >
            <div className="bg-primary p-4 pt-12 flex items-center gap-4 text-black  transition-colors">
              <button onClick={() => setSelectedChat(null)} className="p-2 hover:bg-black/5 :bg-white/10 rounded-full">
                <ArrowLeft size={24} />
              </button>
              <div>
                <h3 className="font-bold text-sm">{selectedChat.title}</h3>
                <p className="text-[10px] opacity-70 uppercase tracking-widest">{t('social.groupTitle')} Chat</p>
              </div>
            </div>
            <div className="flex-1">
              <Chat chatId={selectedChat.id} otherPartyName={t('common.member')} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-8 mb-12">
        <h3 className="text-xs font-black text-grey  uppercase tracking-[0.3em] mb-4 italic">{t('social.nearbyCyclists')}</h3>
        <div className="flex flex-wrap gap-3 pb-4 px-0">
          {nearbyCyclists.length === 0 ? (
            <div className="bg-white text-black px-6 py-4 rounded-3xl w-full border border-grey/5  opacity-50 italic text-[10px] text-grey">
              {t('social.noCyclists')}
            </div>
          ) : (
            nearbyCyclists.map(cyclist => (
              <button 
                key={cyclist.id}
                onClick={() => onStartChat?.(cyclist.id, cyclist.name)}
                className="bg-white text-black px-4 py-3 rounded-2xl flex items-center gap-3 border border-grey/5  shadow-sm active:scale-95 transition-all text-left flex-1 min-w-[140px]"
              >
                <div className="relative shrink-0">
                  <img src={cyclist.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${cyclist.id}`} className="w-8 h-8 rounded-full border-2 border-primary" alt={cyclist.name} />
                  <div className="absolute bottom-0 right-0 w-2 h-2 bg-green-500 border border-white  rounded-full" />
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-bold text-black  block truncate">{cyclist.name}</span>
                  <span className="text-[7px] font-black uppercase text-primary italic tracking-widest">{t('chat.sendMessage')}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <AnimatePresence>
        {showCreate && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center px-4 pointer-events-none"
          >
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCreate(false)}
              className="absolute inset-0 bg-dark/60 backdrop-blur-sm pointer-events-auto"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="bg-white text-black w-full max-w-[calc(100vw-2rem)] sm:max-w-md max-h-[85vh] overflow-y-auto no-scrollbar rounded-[2rem] sm:rounded-[3rem] p-6 sm:p-8 relative shadow-2xl mx-auto pointer-events-auto"
            >
              <button 
                onClick={() => setShowCreate(false)}
                className="absolute top-4 sm:top-6 right-4 sm:right-6 text-grey hover:text-black transition-colors"
              >
                <X size={24} />
              </button>
              
              <h3 className="text-2xl font-black text-primary mb-6">{t('social.createGroup')}</h3>
              
              <form onSubmit={createEvent} className="space-y-6">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-grey mb-2 block">{t('social.groupTitle')}</label>
                  <input 
                    type="text" 
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Morning Ride to Lake..."
                    className="w-full bg-white border-none rounded-2xl px-6 py-4 text-sm font-bold focus:ring-2 focus:ring-primary/20"
                    required
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-grey mb-2 block">Descrizione</label>
                  <textarea 
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Racconta i dettagli dell'uscita..."
                    rows={3}
                    className="w-full bg-white border-none rounded-2xl px-6 py-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 resize-none"
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-grey mb-2 block">{t('social.maxParticipants')}</label>
                    <input 
                      type="number" 
                      value={newMax}
                      onChange={(e) => setNewMax(Number(e.target.value))}
                      className="w-full bg-white border-none rounded-2xl px-4 sm:px-6 py-4 text-sm font-bold focus:ring-2 focus:ring-primary/20"
                      min="1"
                      max="50"
                      required
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-grey mb-2 block">Data e Ora di Inizio</label>
                    <input 
                      type="datetime-local" 
                      value={newDate}
                      onChange={(e) => setNewDate(e.target.value)}
                      className="w-full bg-white border-none rounded-2xl px-4 sm:px-6 py-4 text-sm font-bold focus:ring-2 focus:ring-primary/20"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-grey mb-2 block">Livello Richiesto</label>
                  <select 
                    value={newTargetLevel}
                    onChange={(e) => setNewTargetLevel(e.target.value)}
                    className="w-full bg-white border-none rounded-2xl px-6 py-4 text-sm font-bold focus:ring-2 focus:ring-primary/20 appearance-none bg-no-repeat bg-[url('data:image/svg+xml;utf8,<svg fill=%22black%22 height=%2224%22 viewBox=%220 0 24 24%22 width=%2224%22 xmlns=%22http://www.w3.org/2000/svg%22><path d=%22M7 10l5 5 5-5z%22/></svg>')] bg-[position:calc(100%-1rem)_center]"
                  >
                    <option value="Tutti (inclusi esperti)">Tutti (inclusi esperti)</option>
                    <option value="Facile">Facile</option>
                    <option value="Medio">Medio</option>
                    <option value="Esperto">Esperto</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-grey mb-2 block">Indirizzo Incontro</label>
                  <div className="relative mb-3 flex gap-2">
                    <div className="relative flex-1">
                      <input 
                        type="text" 
                        value={newAddress}
                        onChange={(e) => handleAddressChange(e.target.value)}
                        placeholder="Esempio: Via Dante 1, Milano"
                        className="w-full bg-white border-none rounded-2xl px-4 py-4 text-xs sm:text-sm font-bold focus:ring-2 focus:ring-primary/20"
                        required
                      />
                      {addressSuggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-white text-black border border-grey/10 rounded-2xl shadow-xl z-[150] overflow-hidden max-h-60 overflow-y-auto">
                          {addressSuggestions.map(s => (
                            <button
                              type="button"
                              key={s.place_id}
                              onClick={() => handleSelectSuggestion(s)}
                              className="w-full text-left px-4 py-3 text-xs font-bold text-black  hover:bg-white :bg-dark border-b border-grey/5 last:border-0 transition-colors"
                            >
                              {s.display_name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button 
                      type="button"
                      onClick={handleVerifyAddress}
                      disabled={isVerifying || !newAddress}
                      className="px-4 bg-primary text-white rounded-2xl shadow-lg shadow-primary/20 disabled:opacity-50 flex items-center justify-center min-w-[60px]"
                    >
                      {isVerifying ? <Clock className="animate-spin" size={18} /> : <Search size={18} />}
                    </button>
                  </div>
                  
                  {addressPreview && (
                    <div className="space-y-3">
                      <div className="h-40 w-full rounded-2xl overflow-hidden border-2 border-primary/10 shadow-inner relative z-0">
                        <MapContainer 
                          center={[addressPreview.lat, addressPreview.lng]}
                          zoom={16}
                          className="w-full h-full"
                          zoomControl={false}
                          attributionControl={false}
                        >
                          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                          <DraggableMarker 
                            position={[addressPreview.lat, addressPreview.lng]} 
                            setPosition={(pos) => setAddressPreview({ lat: pos[0], lng: pos[1] })} 
                          />
                        </MapContainer>
                      </div>
                      <div className="p-3 bg-primary/10 rounded-xl border border-primary/20">
                        <p className="text-[10px] text-accent font-bold flex items-center gap-2">
                          <MapPin size={12} /> ✓ Indirizzo localizzato
                        </p>
                        <p className="text-[8px] text-grey  mt-0.5 italic">Puoi spostare il punto sulla mappa per selezionare il punto da cui l'evento partirà.</p>
                      </div>
                    </div>
                  )}
                </div>

                <button 
                  type="submit"
                  disabled={isCreating}
                  className="w-full bg-primary text-white font-black py-4 rounded-2xl shadow-xl shadow-primary/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreating ? t('common.loading') : t('social.createGroup')}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Nearby Clubs section removed per user request */}
    </div>
  );
}
