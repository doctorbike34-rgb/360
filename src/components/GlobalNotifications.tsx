import React, { useEffect, useRef, useCallback } from 'react';
import { onSnapshot, query, collection, where, orderBy, getDocs } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { useAuthStore } from '../store/useAuthStore';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageCircle, X, Bell } from 'lucide-react';
import { soundService } from '../lib/sounds';

function ToastItem({ toast, onRemove }: { toast: any; onRemove: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onRemove(toast.id), 5000);
    return () => clearTimeout(timer);
  }, [toast.id, onRemove]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      className="pointer-events-auto bg-white border border-grey/10 shadow-2xl rounded-2xl p-4 flex items-start gap-3"
    >
      <div className={`p-2 rounded-xl flex-shrink-0 ${toast.type === 'info' ? 'bg-primary/10 text-primary' : toast.type === 'success' ? 'bg-accent/10 text-accent' : toast.type === 'error' ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning'}`}>
         {toast.icon || <Bell size={20} />}
      </div>
      <div className="flex-1 mt-0.5">
         <h4 className="font-bold text-sm text-black uppercase tracking-widest leading-tight">{toast.title}</h4>
         <p className="text-xs text-grey font-bold truncate max-w-[200px] mt-0.5">{toast.message}</p>
      </div>
      <button onClick={() => onRemove(toast.id)} className="text-grey hover:text-black">
         <X size={16} />
      </button>
    </motion.div>
  );
}

export function GlobalNotifications() {
  const { user, profile, toasts, removeToast, addToast, activeChatId } = useAuthStore();
  const unreadRef = useRef<Record<string, number>>({});
  const initialLoadRef = useRef(true);
  
  const handleRemoveToast = useCallback((id: string) => {
    removeToast(id);
  }, [removeToast]);

  useEffect(() => {
    if (!user) return;
    
    // Request notification permission if not granted
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added' || change.type === 'modified') {
          const chatData = change.doc.data();
          const pId = user.uid;
          const currentUnread = chatData.unreadCount?.[pId] || 0;
          const prevUnread = unreadRef.current[change.doc.id] || 0;

          if (!initialLoadRef.current && currentUnread > prevUnread) {
            if (activeChatId !== change.doc.id) {
              const title = chatData.title || chatData.otherPartyName || 'Nuovo messaggio';
              const body = chatData.lastMessage || 'Hai ricevuto un nuovo messaggio.';

              addToast({
                title,
                message: body,
                type: 'info',
                icon: <MessageCircle size={20} />
              });

              if (profile?.notificationsEnabled) {
                const role = useAuthStore.getState().role;
                soundService.play(role === 'MECHANIC' || role === 'PEER_MECHANIC' ? 'MESSAGE_MECHANIC' : 'MESSAGE_CYCLIST');
              }

              if ('Notification' in window && Notification.permission === 'granted') {
                 new Notification(title, { body, icon: '/pwa-192x192.png' });
              }
            }
          }
          unreadRef.current[change.doc.id] = currentUnread;
        }
      });
      initialLoadRef.current = false;
    }, (err) => {
      console.warn("Global chat listener warning:", err);
    });

    // 2. Support Tickets Listener (Admin -> User)
    const qSupport = query(
      collection(db, 'supportTickets'),
      where('userId', '==', user.uid),
      where('status', '==', 'OPEN')
    );

    const unsubSupport = onSnapshot(qSupport, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const ticketData = change.doc.data();
        // If the ticket was modified and has a new lastMessage
        if (change.type === 'modified' && ticketData.lastMessage) {
           // We only notify if it's NOT just the very first system message
           const skipMessages = ["Richiesta di assistenza avviata", "Chat avviata dall'admin"];
           if (ticketData.updatedAt && !skipMessages.includes(ticketData.lastMessage)) {
              addToast({
                title: "Assistenza DoctorBike",
                message: ticketData.lastMessage,
                type: 'info',
                icon: <MessageCircle size={20} className="text-accent" />
              });
              soundService.play('MESSAGE');
           }
        }
      });
    });

    return () => {
      unsubscribe();
      unsubSupport();
    };
  }, [user, addToast, activeChatId, profile?.notificationsEnabled]);

  return (
    <div className="fixed top-4 left-4 right-4 z-[9999] pointer-events-none flex flex-col gap-2 max-w-sm mx-auto">
      <AnimatePresence>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onRemove={handleRemoveToast} />
        ))}
      </AnimatePresence>
    </div>
  );
}
