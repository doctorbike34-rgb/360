import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Gift, Sparkles, X, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Logo } from './Logo';
import { db } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { useAuthStore } from '../store/useAuthStore';

interface WelcomePopupProps {
  userId: string;
  onClose: () => void;
}

export function WelcomePopup({ userId, onClose }: WelcomePopupProps) {
  const { t } = useTranslation();
  const { role } = useAuthStore();

  const handleClose = async () => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        hasWelcomeGift: false
      });
      onClose();
    } catch (e) {
      console.error("Error closing welcome popup:", e);
      onClose();
    }
  };

  return (
    <div className="absolute inset-0 z-[100] flex items-end sm:items-center justify-center p-4 pad-bottom-safe">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleClose}
        className="absolute inset-0 bg-primary/40 backdrop-blur-md"
      />
      
      <motion.div 
        initial={{ opacity: 0, y: 100, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="relative bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl overflow-hidden"
      >
        {/* Background Sparkles */}
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <Sparkles className="w-24 h-24 text-accent" />
        </div>

        <div className="flex flex-col items-center text-center">
          <Logo size="lg" className="mb-6" />

          <h2 className="text-2xl font-black text-primary mb-2">{t('profile.welcomeTitle')}</h2>
          <p className="text-accent font-black uppercase text-[10px] tracking-widest mb-6">{t('profile.welcomeSubtitle')}</p>

          {role === 'CYCLIST' && (
            <div className="space-y-4 mb-8">
               <div className="flex items-start gap-4 text-left bg-primary/5 p-4 rounded-2xl">
                  <div className="w-8 h-8 bg-primary/10 text-primary rounded-lg flex items-center justify-center shrink-0">
                     <Check size={18} />
                  </div>
                  <p className="text-sm font-bold text-black italic leading-tight">
                    {t('profile.welcomeGift')}
                  </p>
               </div>
               
               <div className="flex items-start gap-4 text-left bg-accent/5 p-4 rounded-2xl">
                  <div className="w-8 h-8 bg-accent/10 text-accent rounded-lg flex items-center justify-center shrink-0">
                     <Check size={18} />
                  </div>
                  <p className="text-sm font-bold text-black italic leading-tight">
                    {t('profile.welcomeDiscount')}
                  </p>
               </div>
            </div>
          )}

          <button 
            onClick={handleClose}
            className="w-full bg-primary text-black font-black py-4 rounded-2xl shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all uppercase tracking-widest text-xs"
          >
            {t('profile.getStarted')}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
