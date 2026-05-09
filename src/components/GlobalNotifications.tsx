import React, { useEffect, useRef } from 'react';
import { onSnapshot, query, collection, where, orderBy, getDocs } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { useAuthStore } from '../store/useAuthStore';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X, Bell } from 'lucide-react';
import { soundService } from '../lib/sounds';

export function GlobalNotifications() {
  const { user, profile, toasts, removeToast, addToast, activeChatId } = useAuthStore();
  const unreadRef = useRef<Record<string, number>>({});
  const initialLoadRef = useRef(true);

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
            // Check if this is the active chat
            if (activeChatId === change.doc.id) {
               // We don't notify if the user is currently viewing this chat
               // We might even auto-reset unread here, but Chat.tsx handles it when messages arrive
            } else {
              // New message arrived
              const title = chatData.title || chatData.otherPartyName || 'Nuovo messaggio';
              const body = chatData.lastMessage || 'Hai ricevuto un nuovo messaggio.';

              // Play Sound if enabled
              if (profile?.notificationsEnabled) {
                const role = useAuthStore.getState().role;
                soundService.play(role === 'MECHANIC' || role === 'PEER_MECHANIC' ? 'MESSAGE_MECHANIC' : 'MESSAGE_CYCLIST');
              }

              // Internal Toast
              addToast({
                title,
                message: body,
                type: 'info',
                icon: <MessageCircle size={20} />
              });

              // Browser Notification
              if ('Notification' in window && Notification.permission === 'granted') {
                 new Notification(title, {
                   body,
                   icon: '/pwa-192x192.png' // using default pwa icon
                 });
              }
            }
          }

          unreadRef.current[change.doc.id] = currentUnread;
        }
      });
      
      // After processing the initial snapshot, future changes are real updates
      initialLoadRef.current = false;
    }, (err) => {
      console.warn("Global chat listener warning:", err);
    });

    return () => unsubscribe();
  }, [user, addToast, activeChatId, profile?.notificationsEnabled]);

  return (
    <div className="fixed top-4 left-4 right-4 z-[9999] pointer-events-none flex flex-col gap-2 max-w-sm mx-auto">
      <AnimatePresence>
        {toasts.map((toast) => {
          // auto remove after 5 seconds
          setTimeout(() => removeToast(toast.id), 5000);
          
          return (
            <motion.div
              key={toast.id}
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
              <button onClick={() => removeToast(toast.id)} className="text-grey hover:text-black">
                 <X size={16} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
