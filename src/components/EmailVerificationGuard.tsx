import React, { useState, useEffect } from 'react';
import { auth } from '../lib/firebase';
import { sendEmailVerification, reload } from 'firebase/auth';
import { Mail, RefreshCw, Send, LogOut, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Logo } from './Logo';
import { safeStorage } from '../lib/storage';
import toast from 'react-hot-toast';

const EMAIL_EXPLORE_KEY = 'email_verify_explore_mode';

export function EmailVerificationGuard({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState(auth.currentUser);
  const [isVerified, setIsVerified] = useState(auth.currentUser?.emailVerified || false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
  const [exploreWithoutVerify, setExploreWithoutVerify] = useState(
    () => safeStorage.getItem(EMAIL_EXPLORE_KEY) === '1'
  );
  const { t } = useTranslation();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => {
      setUser(u);
      setIsVerified(u?.emailVerified || false);
    });
    return unsubscribe;
  }, []);

  const checkVerification = async () => {
    if (!auth.currentUser) return;
    setLoading(true);
    try {
      await reload(auth.currentUser);
      const updatedUser = auth.currentUser;
      setUser(updatedUser);
      setIsVerified(updatedUser.emailVerified);
      if (updatedUser.emailVerified) {
        setMessage({ text: 'Email verificata con successo!', type: 'success' });
      } else {
        setMessage({ text: 'Email non ancora verificata. Controlla la tua casella di posta.', type: 'error' });
      }
    } catch (error) {
      console.error(error);
      setMessage({ text: 'Errore durante l\'aggiornamento.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const resendEmail = async () => {
    if (!auth.currentUser) return;
    setSending(true);
    setMessage(null);
    try {
      await sendEmailVerification(auth.currentUser);
      setMessage({ text: 'Email di verifica inviata!', type: 'success' });
    } catch (error: any) {
      console.error(error);
      if (error.code === 'auth/too-many-requests') {
        setMessage({ text: 'Troppe richieste. Riprova più tardi.', type: 'error' });
      } else {
        setMessage({ text: 'Errore nell\'invio dell\'email.', type: 'error' });
      }
    } finally {
      setSending(false);
    }
  };

  // Skip if no user
  if (!user) {
    return <>{children}</>;
  }

  // Skip if verified
  if (isVerified) {
    return <>{children}</>;
  }

  if (exploreWithoutVerify) {
    return <>{children}</>;
  }

  // Skip admin
  if (user.email && user.email.toLowerCase() === 'doctorbike34@gmail.com') {
    return <>{children}</>;
  }

  // Skip phone auth (no email verification needed for phone numbers)
  const isPhoneAuth = user.providerData?.some(p => p.providerId === 'phone') || !!user.phoneNumber;
  if (isPhoneAuth) {
    return <>{children}</>;
  }

  // Skip anonymous users
  if (user.isAnonymous) {
    return <>{children}</>;
  }

  // Skip if email is missing or empty
  if (!user.email || user.email.trim().length === 0) {
    return <>{children}</>;
  }

  // Se arriviamo qui, ha una email non verificata e deve mostrare il blocco

  return (
    <div className="fixed inset-0 z-[9999] bg-white flex flex-col items-center justify-center p-6 text-center">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-sm w-full space-y-6"
      >
        <div className="flex flex-col items-center mb-8">
           <Logo size="lg" className="mb-4" />
           <div className="w-20 h-20 bg-primary/10 rounded-[2rem] flex items-center justify-center text-primary mb-4 shadow-inner">
              <Mail size={40} />
           </div>
           <h2 className="text-2xl font-black text-black uppercase italic tracking-tight">Verifica la tua Email</h2>
           <p className="text-grey font-medium mt-2">
             Abbiamo inviato un link di conferma a <span className="text-primary font-bold">{user.email}</span>. Per favore, clicca sul link per accedere a tutte le funzioni di DoctorBike.
           </p>
        </div>

        {message && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }} 
            animate={{ opacity: 1, y: 0 }}
            className={`p-4 rounded-2xl text-xs font-bold uppercase tracking-widest ${
              message.type === 'success' ? 'bg-green-500/10 text-green-600' : 'bg-danger/10 text-danger'
            }`}
          >
            {message.text}
          </motion.div>
        )}

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => {
              safeStorage.setItem(EMAIL_EXPLORE_KEY, '1');
              setExploreWithoutVerify(true);
              toast('Modalità limitata: verifica l\'email per SOS e pagamenti', { icon: 'ℹ️', duration: 5000 });
            }}
            className="w-full bg-grey/10 text-black font-bold py-4 rounded-[1.5rem] flex items-center justify-center gap-3 hover:bg-grey/15 transition-all uppercase tracking-widest text-xs border border-grey/10"
          >
            Continua in modalità limitata
          </button>

          <button
            onClick={checkVerification}
            disabled={loading}
            className="w-full bg-primary text-white font-black py-4 rounded-[1.5rem] shadow-xl shadow-primary/30 flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-[0.98] transition-all uppercase tracking-widest text-sm"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : <RefreshCw size={20} />}
            Ho già verificato
          </button>
          
          <button
            onClick={resendEmail}
            disabled={sending}
            className="w-full bg-grey/5 text-grey font-bold py-4 rounded-[1.5rem] flex items-center justify-center gap-3 hover:bg-grey/10 transition-all uppercase tracking-widest text-xs border border-grey/10"
          >
            {sending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
            Reinvia Email
          </button>
        </div>

        <div className="pt-8">
           <button 
             onClick={() => auth.signOut()}
             className="text-grey hover:text-danger font-black uppercase tracking-widest text-[10px] flex items-center gap-2 mx-auto"
           >
             <LogOut size={14} />
             Esci e usa un altro account
           </button>
        </div>
      </motion.div>
    </div>
  );
}
