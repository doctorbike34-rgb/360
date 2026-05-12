import toast from 'react-hot-toast';
import React, { useState } from 'react';
import { Star, X, MessageSquare, Send, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, doc, runTransaction, increment, updateDoc } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';

import { gamificationService } from '../services/gamificationService';

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
    console.log('handleSubmit called for SOS:', sosRequest.id);
    try {
      // 1. Finalize Transaction (Unlock Funds)
      console.log('Finalizing transaction...');
      await runTransaction(db, async (transaction) => {
        const sosRef = doc(db, 'sosRequests', sosRequest.id);
        const mechanicUserRef = doc(db, 'users', mechanicId);
        const mechStatsRef = doc(db, 'mechanics', mechanicId);
        const platformStatsRef = doc(db, 'platformStats', 'global');

        const [sosSnap, mechStatsSnap, platformSnap, mechanicUserSnap] = await Promise.all([
          transaction.get(sosRef),
          transaction.get(mechStatsRef),
          transaction.get(platformStatsRef),
          transaction.get(mechanicUserRef)
        ]);
        
        if (!sosSnap.exists()) throw new Error('SOS not found');
        const data = sosSnap.data();
        
        // Idempotency check: if already reviewed, skip most of the work but ensure we finish cleanly
        if (data.isReviewed) {
          console.log('SOS already reviewed, skipping transaction updates');
          return;
        }

        const price = Number(data.estimatedPrice) || 0;
        const plan = data.mechanicPlan || 'BASE';
        
        // Fee logic: PRO 5%, CLUB 10%, BASE 15%
        const feeMultipliers: Record<string, number> = { PRO: 0.05, CLUB: 0.10, BASE: 0.15 };
        const feePercent = feeMultipliers[plan as string] || 0.15;
        const fee = price * feePercent;
        const netAmount = price - fee;

        // Release funds and complete job
        transaction.update(sosRef, {
          isReviewed: true,
          cyclistConfirmed: true,
          status: 'COMPLETED',
          paymentStatus: 'RELEASED',
          completedAt: serverTimestamp(),
          platformFee: fee,
          mechanicNet: netAmount,
          finalPrice: netAmount 
        });

        // Add funds to mechanic (net amount)
        const txRef = doc(collection(db, 'transactions'));
        const userUpdates: any = {
          balance: increment(netAmount),
          updatedAt: serverTimestamp(),
          lastTxId: txRef.id
        };
        // Update peer mechanic if applicable
        if (mechanicUserSnap.data()?.role === 'PEER_MECHANIC') {
            userUpdates.peerMechanicEarnings = increment(netAmount);
            userUpdates.peerMechanicJobsCompleted = increment(1);
        }
        transaction.update(mechanicUserRef, userUpdates);
        
        transaction.set(txRef, {
            fromId: 'ESCROW',
            toId: mechanicId,
            amount: netAmount,
            currency: 'DoctorBike Coin',
            createdAt: serverTimestamp(),
            type: 'SOS_PAYMENT_RELEASE',
            fee: fee
        });

        // Add fee to platform stats
        if (platformSnap.exists()) {
          transaction.update(platformStatsRef, {
            totalFees: increment(fee),
            totalTransactions: increment(price),
            completedJobs: increment(1),
            updatedAt: serverTimestamp()
          });
        } else {
          transaction.set(platformStatsRef, {
            totalFees: fee,
            totalTransactions: price,
            completedJobs: 1,
            updatedAt: serverTimestamp()
          });
        }

        if (mechStatsSnap.exists()) {
          transaction.update(mechStatsRef, {
            totalEarnings: increment(netAmount),
            completedJobs: increment(1),
            updatedAt: serverTimestamp()
          });
        }

        // Create Intervention Record
        const interventionRef = doc(collection(db, 'interventions'));
        transaction.set(interventionRef, {
            sosId: sosRequest.id,
            date: new Date().toISOString(),
            cyclistId: userId,
            cyclistName: data.cyclistName || 'Cyclist',
            mechanicId: mechanicId,
            mechanicName: mechanicName || 'Mechanic',
            mechanicType: plan,
            problemDescription: data.description || data.faultType || 'Intervento',
            problemSeverity: 'medium',
            location: {
                lat: data.lat,
                lng: data.lng,
                address: data.address || ''
            },
            duration: 0,
            cost: price,
            stripePaymentId: data.stripePaymentId || '',
            status: 'completed',
            review: {
                rating, comment
            }
        });
      });
      
      // 2. Create review (Done after transaction success or if already reviewed check passes)
      // Note: we might want to check if a review for this SOS already exists
      try {
        await addDoc(collection(db, 'reviews'), {
          sosRequestId: sosRequest.id,
          cyclistId: userId,
          mechanicId,
          rating,
          comment,
          createdAt: serverTimestamp()
        });
      } catch (e) {
        console.warn('Silent failure creating review (might be duplicate):', e);
      }

      // Gamification
      let pointsToAward = 5;
      if (rating === 5) pointsToAward = 20;
      else if (rating === 4) pointsToAward = 10;
      
      gamificationService.awardPoints(mechanicId, 'Ricevuta recensione', pointsToAward);
      gamificationService.awardPoints(userId, 'Chiusura intervento e recensione', 10);

      onClose();
    } catch (error: any) {
      console.error('Error submitting review:', error);
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
      console.error('Error creating dispute:', err);
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
