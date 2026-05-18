import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ArrowUpRight, ArrowDownRight, RefreshCw, AlertTriangle, Loader2 } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { db } from '../lib/firebase';
import { collection, query, where, orderBy, onSnapshot, limit } from 'firebase/firestore';

interface TransactionsModalProps {
  onClose: () => void;
}

export function TransactionsModal({ onClose }: TransactionsModalProps) {
  const { user } = useAuthStore();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    // Use two separate queries merged client-side to avoid needing composite indexes.
    // Firestore "or" queries require composite indexes for each clause.
    const sentQ = query(
      collection(db, 'transactions'),
      where('fromId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const receivedQ = query(
      collection(db, 'transactions'),
      where('toId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    let unsub1: (() => void) | null = null;
    let unsub2: (() => void) | null = null;
    let sentLoaded = false;
    let receivedLoaded = false;
    let sentData: any[] = [];
    let receivedData: any[] = [];

    const mergeAndSet = () => {
      if (!sentLoaded || !receivedLoaded) return;
      const all = [...receivedData, ...sentData];
      all.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() ?? a.createdAt?.seconds ?? 0;
        const bTime = b.createdAt?.toMillis?.() ?? b.createdAt?.seconds ?? 0;
        return bTime - aTime;
      });
      setTransactions(all);
      setLoading(false);
    };

    unsub1 = onSnapshot(sentQ, (snap) => {
      sentData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      sentLoaded = true;
      mergeAndSet();
    }, (err) => {
      console.error('Sent transactions query error:', err);
      sentLoaded = true;
      mergeAndSet();
    });

    unsub2 = onSnapshot(receivedQ, (snap) => {
      receivedData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      receivedLoaded = true;
      mergeAndSet();
    }, (err) => {
      console.error('Received transactions query error:', err);
      receivedLoaded = true;
      mergeAndSet();
    });

    return () => {
      if (unsub1) unsub1();
      if (unsub2) unsub2();
    };
  }, [user]);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-end justify-center">
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="bg-[#F8F9FA] w-full max-w-md rounded-t-[2.5rem] shadow-2xl overflow-hidden flex flex-col h-[85vh]"
        >
          <div className="p-6 pb-4 flex justify-between items-center bg-white border-b border-black/5 sticky top-0 z-10">
            <h2 className="text-xl font-black text-black uppercase tracking-tight italic">Storico</h2>
            <button
              onClick={onClose}
              className="w-10 h-10 bg-black/5 rounded-full flex items-center justify-center text-black/50 hover:bg-black/10 active:scale-95 transition-all"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-32">
             {loading ? (
                 <div className="py-20 flex flex-col items-center justify-center opacity-50">
                    <Loader2 className="w-8 h-8 animate-spin mb-4" />
                    <p className="text-xs font-black uppercase tracking-widest">Caricamento...</p>
                 </div>
             ) : transactions.length === 0 ? (
                 <div className="py-20 flex flex-col items-center justify-center opacity-30 text-center px-8">
                     <AlertTriangle className="w-12 h-12 mb-4" />
                     <p className="text-sm font-black uppercase tracking-widest leading-loose">Nessuna transazione trovata</p>
                 </div>
             ) : (
                 transactions.map(tx => {
                     const isSender = tx.fromId === user?.uid;
                     const dateStr = tx.createdAt?.toDate ? tx.createdAt.toDate().toLocaleDateString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Elaborazione...';
                     
                     let title = '';
                     let subtitle = '';

                     if (tx.type === 'P2P_TRANSFER') {
                         title = isSender ? 'Invio P2P' : 'Ricezione P2P';
                         subtitle = isSender ? `A: ${tx.toName || 'Utente'}` : `Da: ${tx.fromName || 'Utente'}`;
                     } else if (tx.type === 'TOPUP') {
                         title = 'Ricarica dal Web';
                         subtitle = 'Stripe';
                     } else if (tx.type?.includes('SOS_PAYMENT')) {
                         title = isSender ? 'Pagamento SOS' : 'Fondi Accreditati';
                         subtitle = isSender ? 'Trattenuti in garanzia' : 'Intervento completato';
                     } else if (tx.type?.includes('REFUND')) {
                         title = 'Rimborso SOS';
                         subtitle = 'Fondi riaccreditati sul wallet';
                     } else if (tx.type === 'ADMIN_DISPUTE_RELEASE') {
                         title = 'Risoluzione Contestazione';
                         subtitle = 'Fondi accreditati da Admin';
                     } else if (tx.type === 'ADMIN_DISPUTE_REFUND') {
                         title = 'Rimborso Contestazione';
                         subtitle = 'Fondi riaccreditati da Admin';
                     } else {
                         title = 'Transazione';
                         subtitle = tx.type || 'Sconosciuto';
                     }

                     return (
                         <div key={tx.id} className="bg-white p-4 rounded-2xl flex items-center justify-between border border-black/5 shadow-sm">
                             <div className="flex items-center gap-3">
                                 <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isSender ? 'bg-danger/10 text-danger' : 'bg-primary/10 text-primary'}`}>
                                    {isSender ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
                                 </div>
                                 <div>
                                     <p className="text-xs font-black uppercase">{title}</p>
                                     <p className="text-[10px] text-grey">{subtitle}</p>
                                     <p className="text-[9px] text-grey/60 mt-0.5">{dateStr}</p>
                                 </div>
                             </div>
                             <div className={`text-right ${isSender ? 'text-black' : 'text-primary'}`}>
                                 <p className="text-base font-black tracking-tight">{isSender ? '-' : '+'}{tx.amount !== undefined ? tx.amount.toFixed(2) : '0.00'} <span className="text-[10px] opacity-70">DBC</span></p>
                             </div>
                         </div>
                     );
                 })
             )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
