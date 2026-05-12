import React, { useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, limit, orderBy, getDocs } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { useAuthStore } from '../store/useAuthStore';
import { requestNotificationPermission, onForegroundMessage, showLocalNotification } from '../lib/notifications';
import { Bell, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const NotificationManager: React.FC = () => {
  const { user, role, profile } = useAuthStore();
  const [showPermissionPrompt, setShowPermissionPrompt] = React.useState(false);
  const lastSOSRef = useRef<Record<string, string>>({});
  const lastUnreadRef = useRef<Record<string, number>>({});
  const processedMechanicSOS = useRef<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sosAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Create a notification sound
    audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    // More urgent SOS sound for mechanics
    sosAudioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3');
  }, []);

  const playNotificationSound = (isSOS = false) => {
    const audio = isSOS && sosAudioRef.current ? sosAudioRef.current : audioRef.current;
    if (audio) {
      audio.currentTime = 0; // Reset to start if already playing
      audio.play().catch(e => console.log('Audio play blocked:', e));
    }
  };

  const notify = (title: string, options?: NotificationOptions & { isSOS?: boolean }) => {
    playNotificationSound(options?.isSOS);
    showLocalNotification(title, options);
  };

  useEffect(() => {
    if (!user) return;

    // Check if permission already granted or we need to ask
    // using setTimeout to avoid setting state synchronously during render in an effect
    if ('Notification' in window) {
      if (Notification.permission === 'default') {
        setTimeout(() => setShowPermissionPrompt(true), 0);
      } else if (Notification.permission === 'granted') {
        requestNotificationPermission();
      }
    }

    // Set up FCM foreground listener
    let unsubscribeFCM: () => void = () => {};
    const setupFCM = async () => {
      unsubscribeFCM = await onForegroundMessage((payload: any) => {
        console.log('Foreground FCM received:', payload);
        if (payload?.notification) {
          const title = payload.notification.title || 'Doctorbike Ai';
          const body = payload.notification.body || '';
          const isSOS = title.includes('SOS') || body.includes('SOS');
          
          notify(title, {
            body,
            isSOS
          });
        }
      });
    };
    setupFCM();

    // --- SNAPSHOT-BASED "PUSH" FALLBACK (Works even without FCM setup) ---
    
    // 1. Cyclist: Watch for SOS acceptance
    let cleanupSOS: () => void = () => {};
    if (role === 'CYCLIST') {
      const fetchSOS = async () => {
        try {
          const q = query(
            collection(db, 'sosRequests'),
            where('cyclistId', '==', user?.uid),
            orderBy('createdAt', 'desc'),
            limit(5)
          );
          const snapshot = await getDocs(q);
          snapshot.docs.forEach(doc => {
            const data = doc.data();
            const oldStatus = lastSOSRef.current[doc.id];
            if (oldStatus && oldStatus === 'PENDING' && data.status === 'ACCEPTED') {
              notify('Richiesta Accettata!', {
                body: 'Un meccanico ha preso in carico la tua richiesta ed è in viaggio.',
                tag: 'sos-accepted'
              });
            }
            lastSOSRef.current[doc.id] = data.status;
          });
        } catch (err: any) {
          if (!err.message?.includes('Quota') && !err.message?.includes('permissions')) {
            console.error("Error polling SOS status", err);
          }
        }
      };
      
      const poll = () => {
        let timeoutId: NodeJS.Timeout | null = null;
        const run = async () => {
          if (document.visibilityState === 'visible') {
            await fetchSOS();
          }
          const nextInterval = 300000 + Math.random() * 60000;
          timeoutId = setTimeout(run, nextInterval);
        };
        run();
        return () => { if (timeoutId) clearTimeout(timeoutId); };
      };
      
      cleanupSOS = poll();
    }

    // 2. Mechanic: Watch for nearby PENDING SOS
    let cleanupNearby: () => void = () => {};
    if (role === 'MECHANIC' || role === 'PEER_MECHANIC') {
      const fetchNearbySOS = async () => {
        // Only fetch if available
        const isAvailable = role === 'MECHANIC' ? profile?.isOnline : profile?.peerMechanicEnabled;
        if (!isAvailable) return;

        try {
          const q = query(
            collection(db, 'sosRequests'),
            where('status', '==', 'PENDING'),
            orderBy('createdAt', 'desc'),
            limit(10)
          );

          const snapshot = await getDocs(q);
          snapshot.docs.forEach(doc => {
             const data = doc.data();
             const id = doc.id;
             
             // Avoid duplicate notifications for sessions
             if (!processedMechanicSOS.current.has(id)) {
                processedMechanicSOS.current.add(id);
                notify('Nuova Richiesta SOS!', {
                  body: `Tipo: ${data.faultType}. Un ciclista ha bisogno di aiuto nelle vicinanze.`,
                  tag: 'new-sos',
                  isSOS: true
                });
             }
          });
        } catch (err: any) {
          if (!err.message?.includes('Quota') && !err.message?.includes('permissions')) {
            console.error("Error polling nearby SOS", err);
          }
        }
      };
      
      const poll = () => {
        let timeoutId: NodeJS.Timeout | null = null;
        const run = async () => {
          if (document.visibilityState === 'visible') {
            await fetchNearbySOS();
          }
          const nextInterval = 300000 + Math.random() * 60000;
          timeoutId = setTimeout(run, nextInterval);
        };
        run();
        return () => { if (timeoutId) clearTimeout(timeoutId); };
      };
      
      cleanupNearby = poll();
    }

      // 3. All Users: Watch for Unread Chat Messages
    let cleanupChats: () => void = () => {};
    if (user && profile?.notificationsEnabled !== false) {
      const q = query(
        collection(db, 'chats'),
        where('participants', 'array-contains', user.uid),
        orderBy('updatedAt', 'desc'),
        limit(10)
      );

      cleanupChats = onSnapshot(q, (snapshot) => {
        snapshot.docs.forEach(doc => {
          const data = doc.data();
          const nestedUnread = data.unreadCount?.[user.uid] || 0;
          const flatUnread = data[`unreadCount.${user.uid}`] || 0;
          const unreadNow = nestedUnread + flatUnread;
          const unreadBefore = lastUnreadRef.current[doc.id] || 0;
          
          if (unreadNow > unreadBefore) {
             const activeChatId = useAuthStore.getState().activeChatId;
             if (activeChatId !== doc.id) {
               // Only notify if not currently looking at this chat
               const senderName = data.id && data.id.startsWith('direct_') ? (data.title || 'Nuovo Messaggio') : data.title || 'Nuovo Messaggio Gruppo';
               notify(senderName, {
                 body: data.lastMessage || 'Hai ricevuto un nuovo messaggio.',
                 tag: `chat-${doc.id}`
               });
             }
          }
          lastUnreadRef.current[doc.id] = unreadNow;
        });
      }, (err) => {
         if (!err.message?.includes('Quota')) {
           console.error("Error polling chats for notifications", err);
         }
      });
    }

    return () => {
      unsubscribeFCM();
      cleanupSOS();
      cleanupNearby();
      cleanupChats();
    };
  }, [user, role, profile]);

  const handleGrant = async () => {
    await requestNotificationPermission();
    setShowPermissionPrompt(false);
  };

  return (
    <>
      <AnimatePresence>
        {showPermissionPrompt && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 100 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 100 }}
            className="fixed bottom-6 left-6 right-6 z-[1000] bg-white/95 backdrop-blur-2xl text-black p-8 rounded-[3rem] shadow-[0_20px_50px_rgba(0,0,0,0.15)] border-4 border-primary/20"
          >
            <div className="flex flex-col items-center text-center mb-8">
              <div className="w-20 h-20 bg-gradient-to-br from-primary to-primary-dark rounded-[2rem] flex items-center justify-center text-white mb-6 shadow-xl shadow-primary/20 relative">
                <Bell size={32} className="animate-swing" />
                <div className="absolute -top-1 -right-1 w-6 h-6 bg-accent rounded-full border-4 border-white" />
              </div>
              <h3 className="text-2xl font-black text-black uppercase italic tracking-tight leading-none mb-3">Rimani Aggiornato</h3>
              <p className="text-xs font-bold text-grey uppercase tracking-widest leading-relaxed max-w-[240px]">
                Attiva le notifiche push per ricevere assistenza SOS e messaggi in tempo reale.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <button 
                onClick={handleGrant}
                className="w-full bg-primary text-white py-5 rounded-2xl font-black uppercase text-sm tracking-widest shadow-2xl shadow-primary/20 active:scale-95 transition-all flex items-center justify-center gap-3"
              >
                Consenti Notifiche
                <ChevronRight size={18} />
              </button>
              <button 
                onClick={() => setShowPermissionPrompt(false)}
                className="w-full py-4 text-grey font-black uppercase text-[10px] tracking-[0.2em] active:opacity-60 transition-all"
              >
                Forse più tardi
              </button>
            </div>

            {/* iOS Hint */}
            {/iPad|iPhone|iPod/.test(navigator.userAgent) && (
              <div className="mt-6 pt-6 border-t border-grey/5 flex items-start gap-3">
                <div className="w-5 h-5 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                  <span className="text-blue-600 font-black text-[10px]">i</span>
                </div>
                <p className="text-[9px] font-bold text-blue-800/60 uppercase leading-snug">
                  Nota: Se sei su iPhone, assicurati di aver aggiunto DoctorBike alla Home Screen per ricevere le notifiche.
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
