import toast from 'react-hot-toast';
import React, { useState } from 'react';
import { Star, X, MessageSquare, Send, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useTranslation } from 'react-i18next';

import { gamificationService } from '../services/gamificationService';
import { logger } from '../lib/logger';

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  sosRequest: any;
  mechanicName: string;
  mechanicId: string;
  userId: string;
}

export function ReviewModal({ isOpen, onClose, sosRequest, mechanicName, mechanicId, userId }: ReviewModalProps) {
  const { t } = useTranslation();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hoveredRating, setHoveredRating] = useState(0);

  const handleSubmit = async () => {
    if (rating === 0 || isSubmitting) return;
    setIsSubmitting(true);
    logger.info('handleSubmit called for SOS', { sosId: sosRequest.id });
    try {
      // 1. Call Cloud Function to safely transfer funds & update Escrow
      logger.info('Calling completeSOS Cloud Function', { sosId: sosRequest.id });
      const { functions } = await import('../lib/firebase');
      const completeSOS = httpsCallable(functions, 'completeSOS');
      
      const response = await completeSOS({
         sosId: sosRequest.id,
         rating: rating,
         text: comment
      });

      logger.info('Cloud Function success', { data: response.data });

      onClose();
    } catch (error: any) {
      logger.error('Error submitting review', { error });
      toast.error('Errore durante il completamento: ' + (error.message || String(error)));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDispute = async () => {
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'sosRequests', sosRequest.id), {
        status: 'DISPUTED',
        paymentStatus: 'DISPUTED'
      });
      toast.error('Contestazione inviata all\'assistenza. I fondi rimarranno bloccati e verrai contattato a breve.');
      onClose();
    } catch (err) {
      logger.error('Error creating dispute', { error: err });
      handleFirestoreError(err, OperationType.UPDATE, 'sosRequests');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 pointer-events-none">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-dark/60 backdrop-blur-md pointer-events-auto"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="bg-white text-black w-full max-w-sm rounded-[2.5rem] p-8 relative shadow-2xl transition-colors overflow-hidden border border-accent/10 flex flex-col max-h-[90vh] pointer-events-auto"
          >
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-accent to-primary" />

            <div className="text-center mb-8 shrink-0 mt-4">
              <div className="w-20 h-20 bg-accent/10 text-accent rounded-3xl flex items-center justify-center mx-auto mb-4 rotate-3">
                <Star size={40} fill="currentColor" />
              </div>
              <h3 className="text-2xl font-black text-primary  uppercase italic transition-colors">
                {sosRequest?.estimatedPrice ? `PAGA ⚡${sosRequest.estimatedPrice.toFixed(0)} DBC` : 'Concludi Intervento'}
              </h3>
              <p className="text-xs text-grey  font-bold uppercase tracking-widest mt-2">
                Meccanico: {mechanicName}
              </p>
            </div>

            <div className="space-y-6 overflow-y-auto pb-4 scrollbar-hide">
              <p className="text-center text-[10px] font-black text-grey uppercase tracking-widest opacity-70">
                Prima di sbloccare il pagamento, lascia una valutazione al lavoro svolto:
              </p>
              
              {/* Rating Selection */}
              <div className="flex justify-center gap-2">
                {[1, 2, 3, 4, 5].map((starValue) => (
                  <button
                    key={starValue}
                    onMouseEnter={() => setHoveredRating(starValue)}
                    onMouseLeave={() => setHoveredRating(0)}
                    onClick={() => setRating(starValue)}
                    className="transition-transform active:scale-90"
                  >
                    <Star 
                      size={32} 
                      className={`${
                        (hoveredRating || rating) >= starValue 
                          ? 'text-accent fill-accent' 
                          : 'text-grey/20 '
                      } transition-colors`}
                    />
                  </button>
                ))}
              </div>

              {/* Comment */}
              <div className="relative">
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Scrivi un commento (opzionale)..."
                  className="w-full bg-white text-black border border-grey/10 shadow-sm border border-grey/10 rounded-2xl p-4 text-sm text-black  focus:ring-2 focus:ring-accent outline-none resize-none transition-all placeholder:italic min-h-[100px]"
                />
                <MessageSquare className="absolute right-4 bottom-4 text-grey/20" size={18} />
              </div>

              {/* Actions */}
              <div className="space-y-3">
                <button
                  disabled={rating === 0 || isSubmitting}
                  onClick={handleSubmit}
                  className="w-full bg-accent text-white py-4 rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl shadow-accent/20 active:scale-95 transition-all disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>PAGA E COMPLETA <Send size={18} /></>
                  )}
                </button>
                
                <button
                  disabled={isSubmitting}
                  onClick={handleDispute}
                  className="w-full py-4 text-xs font-bold text-grey hover:text-danger flex items-center justify-center gap-2 transition-colors uppercase tracking-[0.2em]"
                >
                  <AlertTriangle size={14} /> Il meccanico non ha finito? Apri contestazione
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
