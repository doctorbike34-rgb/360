import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface AIPromptProps {
  onOpenAssistant: () => void;
}

export function AIPrompt({ onOpenAssistant }: AIPromptProps) {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const hasBeenDismissedRef = useRef(false);
  const promptCountRef = useRef(0);
  const MAX_PROMPTS = 3;

  useEffect(() => {
    // Show first time after 2 minutes
    const initialTimer = setTimeout(() => {
      if (!hasBeenDismissedRef.current && promptCountRef.current < MAX_PROMPTS) {
        setIsVisible(true);
        promptCountRef.current++;
      }
    }, 120000);

    // Then every 5 minutes, but only if not dismissed and under max prompts
    const interval = setInterval(() => {
      if (!hasBeenDismissedRef.current && promptCountRef.current < MAX_PROMPTS) {
        setIsVisible(true);
        promptCountRef.current++;
      } else if (promptCountRef.current >= MAX_PROMPTS) {
        // Stop the interval once max prompts reached
        clearInterval(interval);
      }
    }, 300000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, []);

  const handleDismiss = () => {
    hasBeenDismissedRef.current = true;
    setIsVisible(false);
  };

  const handleOpen = () => {
    onOpenAssistant();
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.9 }}
          className="fixed bottom-24 left-4 right-4 z-[200] sm:max-w-xs sm:left-auto sm:right-6 pointer-events-none"
        >
          <div className="bg-zinc-900 text-white p-4 rounded-2xl shadow-2xl border border-white/10 pointer-events-auto flex items-center gap-4 relative group">
            <button 
              onClick={handleDismiss}
              className="absolute -top-2 -right-2 w-6 h-6 bg-zinc-800 border border-white/10 rounded-full flex items-center justify-center text-white/60 hover:text-white transition-colors shadow-lg"
            >
              <X size={12} />
            </button>
            
            <div 
              onClick={handleOpen}
              className="w-10 h-10 bg-accent rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-accent/20 cursor-pointer hover:scale-110 transition-transform"
            >
              <Sparkles size={20} className="text-white" />
            </div>
            
            <div 
              className="flex-1 cursor-pointer"
              onClick={handleOpen}
            >
              <p className="text-[10px] font-black text-accent uppercase tracking-widest mb-0.5">Doctorbike Ai</p>
              <p className="text-sm font-bold leading-tight">{t('common.needHelpPrompt') || 'Hai bisogno di aiuto?'}</p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
