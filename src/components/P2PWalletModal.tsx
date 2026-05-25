import toast from 'react-hot-toast';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, QrCode, Scan, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { useAuthStore } from '../store/useAuthStore';
import { useTranslation } from 'react-i18next';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, runTransaction, serverTimestamp, collection, setDoc, getDoc } from 'firebase/firestore';

export interface P2PWalletModalProps {
  onClose: () => void;
}

export function P2PWalletModal({ onClose }: P2PWalletModalProps) {
  const { user, profile } = useAuthStore();
  const { t } = useTranslation();
  
  const [mode, setMode] = useState<'HOME' | 'RECEIVE' | 'SCAN' | 'PAYMENT' | 'CONFIRM' | 'SECURITY' | 'SUCCESS'>('HOME');
  const [scannedUserId, setScannedUserId] = useState<string | null>(null);
  const [scannedUserName, setScannedUserName] = useState<string | null>(null);
  const [amountToSend, setAmountToSend] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [securityCheckProgress, setSecurityCheckProgress] = useState(0);

  const startSecurityCheck = () => {
    setMode('SECURITY');
    setSecurityCheckProgress(0);
    const interval = setInterval(() => {
      setSecurityCheckProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          handlePayment();
          return 100;
        }
        return prev + 2;
      });
    }, 30);
  };

  const handleScan = async (result: any) => {
    if (result && result.length > 0) {
      const qrData = result[0].rawValue;
      if (qrData.startsWith('dbcoin:')) {
        const rawUid = qrData.split(':')[1];
        // Security: sanitize UID to prevent injection/path traversal
        const uid = rawUid.replace(/[^a-zA-Z0-9_-]/g, '');
        
        if (uid !== rawUid || !uid) {
           toast.error('Codice QR non valido o corrotto.');
           return;
        }

        if (uid === user?.uid) {
            toast.error('Non puoi inviare fondi a te stesso.');
            return;
        }
        try {
          const userDoc = await getDoc(doc(db, 'users', uid));
          if (userDoc.exists()) {
              setScannedUserId(uid);
              setScannedUserName(userDoc.data().name || 'Utente');
              setMode('PAYMENT');
          } else {
              toast.error('Utente non trovato');
          }
        } catch (e) {
          console.error(e);
          toast.error('Errore nella lettura del codice QR');
        }
      } else {
          toast.error('Codice QR non valido per DoctorBike Coin');
      }
    }
  };

  const validateAndPrepare = () => {
    const amountNum = parseFloat(amountToSend);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error('Inserisci un importo valido.');
      return;
    }

    if ((profile?.balance || 0) < amountNum) {
      toast.error('Fondi insufficienti nel tuo wallet.');
      return;
    }
    
    setMode('CONFIRM');
  };

  const handlePayment = async () => {
    if (!user || !scannedUserId || !amountToSend) return;
    
    const amountNum = parseFloat(amountToSend);
    
    // Security: Block zero, negative, or invalid amounts exactly before transaction
    if (isNaN(amountNum) || amountNum <= 0) {
        toast.error('Importo non valido.');
        return;
    }

    setIsProcessing(true);
    try {
        const httpsCallable = (await import('firebase/functions')).httpsCallable;
        const { functions } = await import('../lib/firebase');
        const transferFundsCallable = httpsCallable(functions, 'transferFunds');
        
        await transferFundsCallable({
            toId: scannedUserId,
            amount: amountNum,
            toName: scannedUserName || 'Destinatario'
        });

        setMode('SUCCESS');
    } catch (e: any) {
        if (e.message?.includes('Insufficient') || e.message?.includes('resource-exhausted')) {
            toast.error('Fondi insufficienti nel momento della transazione.');
        } else {
            console.error("P2P Transfer failed:", e);
            toast.error('Errore durante il trasferimento.');
        }
    } finally {
        setIsProcessing(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[150] flex items-center justify-center p-4 pointer-events-none"
    >
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-dark/80 backdrop-blur-sm z-0 pointer-events-auto"
      />
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="relative bg-white text-black rounded-[2.5rem] w-full max-w-md overflow-hidden z-10 shadow-2xl p-6 pointer-events-auto"
      >
         <button onClick={onClose} aria-label={t('common.close')} className="absolute top-4 right-4 p-2 bg-grey/10 rounded-full text-grey">
            <X size={20} />
         </button>

         {mode === 'HOME' && (
             <div className="text-center mt-4">
                 <div className="w-16 h-16 bg-primary/10 rounded-2xl mx-auto flex items-center justify-center text-primary mb-4 shadow-xl shadow-primary/10">
                    <QrCode size={32} />
                 </div>
                 <h2 className="text-2xl font-black text-black  mb-2 uppercase tracking-tight italic">DoctorBike Coin</h2>
                 <p className="text-xs text-grey mb-8 font-bold uppercase tracking-widest leading-relaxed max-w-[280px] mx-auto">
                    Invia o ricevi credito DoctorBike istantaneamente scambiando il tuo QR code personale.
                 </p>

                 <div className="space-y-4">
                    <button 
                       onClick={() => setMode('RECEIVE')}
                       className="w-full py-5 rounded-2xl border-2 border-primary text-primary font-black uppercase tracking-widest text-[11px] flex items-center justify-center gap-2 hover:bg-primary/5 active:scale-95 transition-all"
                    >
                       <QrCode size={18} /> Mostra il mio QR
                    </button>
                    <button 
                       onClick={() => setMode('SCAN')}
                       className="w-full py-5 rounded-2xl bg-primary text-white font-black uppercase tracking-widest text-[11px] flex items-center justify-center gap-2 hover:bg-primary/90 active:scale-95 transition-all shadow-xl shadow-primary/20"
                    >
                       <Scan size={18} /> Scansiona per inviare
                    </button>
                 </div>
             </div>
         )}

         {mode === 'RECEIVE' && (
             <div className="text-center mt-4">
                 <h2 className="text-xl font-black text-black  mb-6 uppercase tracking-tight italic">Ricevi Credito</h2>
                 <div className="bg-white p-8 rounded-[2.5rem] inline-block shadow-[0_0_50px_rgba(0,0,0,0.05)] mx-auto mb-8 border-4 border-grey/5 relative">
                     <QRCodeSVG value={`dbcoin:${user?.uid}`} size={220} level="H" fgColor="#000" bgColor="#fff" />
                     <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-black text-white px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border-2 border-white">
                        {user?.displayName || 'Il mio Wallet'}
                     </div>
                 </div>
                 <p className="text-[10px] text-grey font-bold uppercase tracking-[0.15em] mb-8 leading-relaxed max-w-[240px] mx-auto">
                    Fai inquadrare questo codice ad un altro utente per ricevere pagamenti DoctorBike Coin
                 </p>
                 <button onClick={() => setMode('HOME')} className="text-[10px] text-primary font-black uppercase tracking-widest underline underline-offset-4 decoration-2">Tornare indietro</button>
             </div>
         )}

         {mode === 'SCAN' && (
             <div className="mt-4">
                 <h2 className="text-xl font-black text-black  mb-2 uppercase tracking-tight text-center italic">Inquadra QR</h2>
                 <p className="text-[10px] text-grey font-bold uppercase tracking-widest text-center mb-6">Posiziona il QR code all'interno del riquadro</p>
                 
                 {scanError ? (
                     <div className="bg-red-50 p-6 rounded-[2.5rem] border-2 border-red-100 text-center mb-6">
                         <p className="text-red-600 font-bold text-xs uppercase tracking-widest mb-4 leading-relaxed">
                             {scanError.includes('denied') || scanError.includes('Permission') 
                               ? 'Permesso fotocamera negato.' 
                               : 'Impossibile accedere alla fotocamera.'}
                         </p>

                         <div className="mb-6 p-4 bg-white rounded-2xl border border-red-100 text-left">
                            <p className="text-[10px] font-black text-black uppercase tracking-tight mb-2 flex items-center gap-2">
                                iPhone / iOS Info
                            </p>
                            <p className="text-[10px] text-black/70 font-medium leading-relaxed">
                                Apple richiede che l'app sia aperta in una <span className="font-bold text-red-600 italic">Nuova Scheda</span> (non nell'anteprima) e che tu stia usando <span className="font-bold">Safari</span> per permettere l'uso della fotocamera.
                            </p>
                            <button 
                                onClick={() => window.open(window.location.href, '_blank')}
                                className="mt-3 w-full py-2 bg-red-600 text-white text-[9px] font-black uppercase tracking-widest rounded-lg shadow-lg shadow-red-200"
                            >
                                Apri in Nuova Scheda
                            </button>
                         </div>

                         <div className="flex flex-col gap-2">
                            <button 
                                onClick={() => { window.location.reload(); }}
                                className="bg-primary text-white px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20"
                            >
                                Ricarica Pagina
                            </button>
                            <button 
                                onClick={() => { setScanError(null); setMode('HOME'); }}
                                className="bg-grey/10 text-black px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest"
                            >
                                Torna Home
                            </button>
                         </div>
                     </div>
                 ) : (
                     <div className="rounded-[2.5rem] overflow-hidden mb-8 border-4 border-grey/5 bg-black relative aspect-square shadow-2xl">
                         <div className="absolute inset-0 flex items-center justify-center">
                             <Loader2 className="w-10 h-10 text-white/20 animate-spin" />
                         </div>
                         <Scanner 
                             onScan={handleScan}
                             onError={(err) => {
                                 console.error("Scanner Error:", err);
                                 const message = err instanceof Error ? err.message : String(err);
                                 setScanError(message || 'Errore fotocamera');
                             }}
                             constraints={{ 
                                 facingMode: 'environment'
                             }}
                             styles={{
                                 video: { width: '100%', height: '100%', objectFit: 'cover', position: 'relative', zIndex: 10 }
                             }}
                         />
                         {/* QR Overlay Mask */}
                         <div className="absolute inset-0 z-20 pointer-events-none">
                            <div className="absolute inset-0 border-[40px] border-black/40" />
                            <div className="absolute inset-[40px] border-2 border-white/50 rounded-2xl" />
                           <div className="absolute top-1/2 left-0 w-full h-0.5 bg-primary/40 animate-scan-line shadow-[0_0_15px_rgba(var(--color-primary),0.8)]" />
                         </div>
                     </div>
                 )}

                 <div className="text-center">
                    <button onClick={() => { setScanError(null); setMode('HOME'); }} className="text-[10px] text-grey font-black uppercase tracking-widest underline underline-offset-4">Annulla Scansione</button>
                 </div>
             </div>
         )}

         {mode === 'PAYMENT' && (
             <div className="text-center mt-4">
                 <h2 className="text-xl font-black text-black  mb-2 uppercase tracking-tight italic">Invia a {scannedUserName}</h2>
                 <p className="text-[10px] text-grey font-bold uppercase tracking-widest mb-8">Bilancio disponibile: <span className="text-primary font-black">⚡{profile?.balance?.toFixed(0) || '0'} DBC</span></p>
                 
                 <div className="bg-grey/5 rounded-[2.5rem] p-8 mb-8 border-2 border-grey/5 focus-within:border-primary/20 transition-all">
                     <p className="text-[10px] font-black text-grey uppercase tracking-widest mb-4">Inserisci Importo</p>
                     <div className="flex items-baseline justify-center gap-3">
                        <span className="text-3xl font-black text-primary italic">DBC</span>
                        <input 
                            type="number"
                            inputMode="decimal"
                            min="1"
                            step="0.01"
                            placeholder="0.00"
                            autoFocus
                            value={amountToSend}
                            onChange={(e) => setAmountToSend(e.target.value)}
                            className="text-6xl font-black w-48 bg-transparent outline-none text-center placeholder:text-grey/20"
                        />
                     </div>
                 </div>

                 <button 
                     onClick={validateAndPrepare}
                     disabled={!amountToSend || parseFloat(amountToSend) <= 0}
                     className="w-full py-5 rounded-2xl bg-primary text-white font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all mb-4 disabled:opacity-50"
                 >
                     Procedi al riepilogo
                     <ArrowRight size={18} />
                 </button>
                 <button onClick={() => setMode('HOME')} className="text-[10px] text-grey font-black uppercase tracking-widest underline">Annulla operazione</button>
             </div>
         )}

         {mode === 'CONFIRM' && (
            <div className="text-center mt-4">
                <div className="w-16 h-16 bg-accent/10 rounded-full mx-auto flex items-center justify-center text-accent mb-6">
                    <CheckCircle2 size={32} />
                </div>
                <h2 className="text-2xl font-black text-black  mb-2 uppercase tracking-tight italic">Conferma Pagamento</h2>
                <p className="text-sm text-grey font-bold uppercase tracking-widest mb-8">Stai per inviare credito a un altro utente</p>
                
                <div className="bg-grey/5 rounded-[2.5rem] p-6 mb-8 border border-grey/10 text-left">
                    <div className="flex justify-between items-center mb-4 pb-4 border-b border-grey/10">
                        <span className="text-[10px] font-black text-grey uppercase tracking-widest">Destinatario</span>
                        <span className="font-black text-black italic">{scannedUserName}</span>
                    </div>
                    <div className="flex justify-between items-center mb-4 pb-4 border-b border-grey/10">
                        <span className="text-[10px] font-black text-grey uppercase tracking-widest">Metodo</span>
                        <span className="font-bold text-black italic">Wallet Interno (P2P)</span>
                    </div>
                    <div className="flex justify-between items-center pt-2">
                        <span className="text-sm font-black text-grey uppercase tracking-widest">Totale Invio</span>
                        <span className="text-2xl font-black text-primary italic">⚡{parseFloat(amountToSend).toFixed(2)} DBC</span>
                    </div>
                </div>

                <div className="flex flex-col gap-3">
                    <button 
                        onClick={startSecurityCheck}
                        disabled={isProcessing}
                        className="w-full py-5 rounded-2xl bg-accent text-white font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 shadow-xl shadow-accent/20 hover:scale-[1.02] active:scale-95 transition-all"
                    >
                        Conferma e Invia Ora
                    </button>
                    <button 
                        onClick={() => setMode('PAYMENT')}
                        disabled={isProcessing}
                        className="w-full py-4 text-[10px] font-black text-grey uppercase tracking-widest"
                    >
                        Correggi importo
                    </button>
                </div>
            </div>
         )}

         {mode === 'SECURITY' && (
            <div className="text-center mt-8 py-6">
                <div className="relative w-32 h-32 mx-auto mb-8">
                    <svg className="w-full h-full" viewBox="0 0 100 100">
                        <circle 
                            cx="50" cy="50" r="45" 
                            fill="none" 
                            stroke="currentColor" 
                            strokeWidth="8" 
                            className="text-grey/10"
                        />
                        <motion.circle 
                            cx="50" cy="50" r="45" 
                            fill="none" 
                            stroke="currentColor" 
                            strokeWidth="8" 
                            strokeDasharray="283"
                            strokeDashoffset={283 - (283 * securityCheckProgress) / 100}
                            className="text-primary"
                            style={{ rotate: -90, originX: '50%', originY: '50%' }}
                        />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-2xl font-black text-primary">{securityCheckProgress}%</span>
                        <span className="text-[8px] font-black text-grey uppercase tracking-widest">Verifica</span>
                    </div>
                </div>
                <h2 className="text-2xl font-black text-black mb-2 uppercase italic tracking-tight">Security Check</h2>
                <div className="space-y-2 mb-8">
                    <p className={`text-[10px] font-bold uppercase tracking-widest transition-opacity ${securityCheckProgress > 20 ? 'opacity-100' : 'opacity-30'}`}>• Analisi identità destinatario...</p>
                    <p className={`text-[10px] font-bold uppercase tracking-widest transition-opacity ${securityCheckProgress > 50 ? 'opacity-100' : 'opacity-30'}`}>• Controllo integrità wallet...</p>
                    <p className={`text-[10px] font-bold uppercase tracking-widest transition-opacity ${securityCheckProgress > 80 ? 'opacity-100' : 'opacity-30'}`}>• Crittografia transazione...</p>
                </div>
                <p className="text-xs text-grey font-bold italic animate-pulse">Proteggendo i tuoi Coin...</p>
            </div>
         )}

         {mode === 'SUCCESS' && (
             <div className="text-center mt-8 py-6">
                 <motion.div 
                     initial={{ scale: 0 }}
                     animate={{ scale: 1 }}
                     transition={{ type: "spring", damping: 15 }}
                     className="w-24 h-24 bg-green-500 rounded-full mx-auto flex items-center justify-center text-white mb-8 shadow-2xl shadow-green-500/30 relative"
                 >
                     <CheckCircle2 size={48} />
                     <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1, scale: [1, 1.5, 1], rotate: [0, 45, 0] }}
                        className="absolute inset-0 rounded-full border-4 border-green-500/30"
                     />
                 </motion.div>
                 <h2 className="text-3xl font-black text-black  mb-2 uppercase italic tracking-tight">Transazione Riuscita!</h2>
                 <p className="text-xs text-grey font-bold uppercase tracking-widest mb-10 leading-relaxed max-w-[280px] mx-auto">
                    Hai inviato con successo <span className="text-primary font-black">⚡{parseFloat(amountToSend).toFixed(2)} DBC</span> a {scannedUserName}
                 </p>
                 <button 
                     onClick={onClose}
                     className="w-full py-5 rounded-2xl bg-black text-white font-black uppercase tracking-widest text-xs flex items-center justify-center shadow-xl shadow-black/20 hover:scale-[1.02] active:scale-95 transition-all"
                 >
                     Fatto, Torna alla Mappa
                 </button>
             </div>
         )}
      </motion.div>
    </motion.div>
  );
}
