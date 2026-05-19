import React, { useEffect, useRef, useCallback } from 'react';
import { onSnapshot, query, collection, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthStore } from '../store/useAuthStore';
import { AnimatePresence, motion } from 'motion/react';
import { MessageCircle, X, Bell } from 'lucide-react';

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
      <motion.div className={`p-2 rounded-xl shrink-0 ${toast.type === 'info' ? 'bg-primary/10 text-primary' : toast.type === 'success' ? 'bg-accent/10 text-accent' : toast.type === 'error' ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning'}`}>
         {toast.icon || <Bell size={20} />}
      </motion.div>
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

const SUPPORT_SKIP_MESSAGES = [
  'Richiesta di assistenza avviata',
  "Chat avviata dall'admin",
];

export function GlobalNotifications() {
  const { user, toasts, removeToast, addToast } = useAuthStore();
  const unreadRef = useRef<Record<string, number>>({});
  const supportLastMessageRef = useRef<Record<string, string>>({});
  const chatsInitializedRef = useRef(false);
  const supportInitializedRef = useRef(false);
  
  const handleRemoveToast = useCallback((id: string) => {
    removeToast(id);
  }, [removeToast]);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added' || change.type === 'modified') {
          const chatData = change.doc.data();
          const pId = user.uid;
          const nestedUnread = chatData.unreadCount?.[pId] || 0;
          const flatUnread = chatData[`unreadCount.${pId}`] || 0;
          const currentUnread = nestedUnread + flatUnread;
          const prevUnread = unreadRef.current[change.doc.id] ?? 0;
          const activeChatId = useAuthStore.getState().activeChatId;
          const fromSelf = chatData.lastMessageSenderId === pId;

          if (
            chatsInitializedRef.current &&
            currentUnread > prevUnread &&
            activeChatId !== change.doc.id &&
            !fromSelf
          ) {
            const title = chatData.title || chatData.otherPartyName || 'Nuovo messaggio';
            const body = chatData.lastMessage || 'Hai ricevuto un nuovo messaggio.';

            addToast({
              title,
              message: body,
              type: 'info',
              icon: <MessageCircle size={20} />,
            });
          }
          unreadRef.current[change.doc.id] = currentUnread;
        }
      });
      chatsInitializedRef.current = true;
    }, (err) => {
      console.warn('Global chat listener warning:', err);
    });

    const qSupport = query(
      collection(db, 'supportTickets'),
      where('userId', '==', user.uid),
      where('status', '==', 'OPEN')
    );

    const unsubSupport = onSnapshot(qSupport, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type !== 'modified' && change.type !== 'added') return;

        const ticketId = change.doc.id;
        const ticketData = change.doc.data();
        const lastMessage = ticketData.lastMessage as string | undefined;
        if (!lastMessage || SUPPORT_SKIP_MESSAGES.includes(lastMessage)) return;

        const activeChatId = useAuthStore.getState().activeChatId;
        if (activeChatId === ticketId) {
          supportLastMessageRef.current[ticketId] = lastMessage;
          return;
        }

        if (ticketData.lastMessageSenderId === user.uid) {
          supportLastMessageRef.current[ticketId] = lastMessage;
          return;
        }

        const prevMessage = supportLastMessageRef.current[ticketId];
        if (!supportInitializedRef.current || prevMessage === lastMessage) {
          supportLastMessageRef.current[ticketId] = lastMessage;
          return;
        }

        addToast({
          title: 'Assistenza DoctorBike',
          message: lastMessage,
          type: 'info',
          icon: <MessageCircle size={20} className="text-accent" />,
        });
        supportLastMessageRef.current[ticketId] = lastMessage;
      });
      supportInitializedRef.current = true;
    });

    return () => {
      unsubscribe();
      unsubSupport();
      chatsInitializedRef.current = false;
      supportInitializedRef.current = false;
      unreadRef.current = {};
      supportLastMessageRef.current = {};
    };
  }, [user, addToast]);

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
