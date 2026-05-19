import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Star, MapPin, Bike, Mail, Phone, Award, Flame } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { BADGE_CATALOG, getUnlockedBadgeIds } from '../lib/badgeMeta';
import { formatLoyaltyPoints } from '../lib/loyaltyPoints';

interface PublicProfileModalProps {
  userId: string;
  onClose: () => void;
}

export const PublicProfileModal: React.FC<PublicProfileModalProps> = ({ userId, onClose }) => {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, 'users', userId));
        if (snap.exists()) {
          setProfile(snap.data());
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    if (userId) fetchProfile();
  }, [userId]);

  const avatar = profile?.photoURL || profile?.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${userId}`;
  const isOwnProfile = auth.currentUser?.uid === userId;
  const reputationPointsLabel = formatLoyaltyPoints(profile?.points ?? 0);
  const unlockedBadges = getUnlockedBadgeIds(profile?.badges);
  const visibleBadges = BADGE_CATALOG.filter((b) => unlockedBadges.has(b.id));

  return (
    <AnimatePresence>
      {userId && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-dark/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 pointer-events-auto"
        >
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-white text-black rounded-[2rem] overflow-hidden shadow-2xl relative pointer-events-auto"
          >
          {loading ? (
            <div className="p-12 flex justify-center text-primary">
              <div className="w-8 h-8 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />
            </div>
          ) : !profile ? (
            <div className="p-8 text-center text-grey">
              Errore: Profilo non trovato.
            </div>
          ) : (
            <div className="flex flex-col">
              <div className="bg-primary pt-8 pb-12 relative flex flex-col items-center">
                <button onClick={onClose} className="absolute top-4 right-4 bg-black/10 hover:bg-black/20 text-white p-2 rounded-full transition-colors">
                  <X size={20} />
                </button>
                <div className="w-24 h-24 rounded-full bg-white/20 p-1 mb-4 shadow-xl">
                  <div className="w-full h-full rounded-full overflow-hidden bg-white">
                    <img src={avatar} alt="profilo" className="w-full h-full object-contain" />
                  </div>
                </div>
                <h2 className="text-xl font-black text-white px-4 text-center">{profile.name || profile.displayName || 'Utente'}</h2>
                <div className="flex items-center gap-1 text-white/80 mt-1 uppercase text-[10px] font-bold tracking-widest">
                  <Star size={12} className="text-yellow-400 fill-yellow-400" /> 
                  <span>{(profile.rating || 5.0).toFixed(1)}</span>
                  <span className="mx-2">•</span>
                  <span>{profile.role === 'MECHANIC' ? 'Meccanico Pro' : profile.role === 'PEER_MECHANIC' ? 'Ciclista Esperto' : 'Ciclista'}</span>
                </div>
              </div>

              <div className="px-6 pb-8 pt-6 space-y-4 -mt-6 bg-white text-black rounded-t-[2rem] relative z-10 transition-colors max-h-[60vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-warning/10 border border-warning/20 p-4 rounded-xl">
                    <p className="text-[9px] font-black uppercase text-grey tracking-widest mb-1 flex items-center gap-1">
                      <Award size={12} className="text-warning" /> Punti reputazione
                    </p>
                    <p className="text-2xl font-black text-warning tabular-nums tracking-tight">{reputationPointsLabel}</p>
                  </div>
                  {(profile?.dailyStreak ?? 0) > 0 && (
                    <div className="bg-accent/10 border border-accent/20 p-4 rounded-xl">
                      <p className="text-[9px] font-black uppercase text-grey tracking-widest mb-1 flex items-center gap-1">
                        <Flame size={12} className="text-accent" /> Streak
                      </p>
                      <p className="text-2xl font-black text-accent">{profile.dailyStreak} gg</p>
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase text-grey tracking-widest mb-2">Badge ottenuti</p>
                  {visibleBadges.length > 0 ? (
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                      {visibleBadges.map((b) => (
                        <div
                          key={b.id}
                          title={b.hint}
                          className="shrink-0 flex flex-col items-center p-2.5 rounded-xl border border-warning/40 bg-warning/10 min-w-[4.5rem]"
                        >
                          <span className="text-xl">{b.icon}</span>
                          <span className="text-[8px] font-bold uppercase text-center mt-1 leading-tight">{b.name}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-grey font-bold text-center py-2">Nessun badge ancora</p>
                  )}
                </div>
                <div className="bg-white text-black border border-grey/10 shadow-sm p-4 rounded-xl flex items-center gap-3 transition-colors">
                  <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                    <Bike size={20} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase text-grey  tracking-widest mb-0.5">Specialità / Bici</p>
                    <p className="text-sm font-bold text-black  transition-colors">{profile.specialties?.length ? profile.specialties.join(', ') : profile.bikeModel || 'Generale'}</p>
                  </div>
                </div>

                <div className="bg-white text-black border border-grey/10 shadow-sm p-4 rounded-xl flex items-center gap-3 transition-colors">
                  <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                    <MapPin size={20} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase text-grey  tracking-widest mb-0.5">Zona</p>
                    <p className="text-sm font-bold text-black  transition-colors">{profile.locationName || 'Nessuna zona impostata'}</p>
                  </div>
                </div>

                {isOwnProfile && profile.email && (
                  <div className="bg-white text-black border border-grey/10 shadow-sm p-4 rounded-xl flex items-center gap-3 transition-colors">
                    <div className="w-10 h-10 rounded-full bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
                      <Mail size={20} />
                    </div>
                    <div className="min-w-0 overflow-hidden">
                      <p className="text-[10px] font-black uppercase text-grey tracking-widest mb-0.5">Email</p>
                      <p className="text-sm font-bold text-black truncate">{profile.email}</p>
                    </div>
                  </div>
                )}

                {isOwnProfile && profile.phone && (
                  <div className="bg-white text-black border border-grey/10 shadow-sm p-4 rounded-xl flex items-center gap-3 transition-colors">
                    <div className="w-10 h-10 rounded-full bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
                      <Phone size={20} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase text-grey tracking-widest mb-0.5">Telefono</p>
                      <p className="text-sm font-bold text-black">{profile.phone}</p>
                    </div>
                  </div>
                )}
                
                {profile.role === 'PEER_MECHANIC' && profile.experience && (
                  <div className="p-4 bg-grey/5 rounded-2xl border border-grey/10">
                     <p className="text-[10px] font-black uppercase text-grey tracking-widest mb-2">Esperienza</p>
                     <p className="text-[11px] font-bold text-black italic">"{profile.experience}"</p>
                  </div>
                )}

                <button onClick={onClose} className="w-full py-3 bg-primary text-white shadow-xl shadow-primary/20 rounded-xl font-black transition-colors mt-2 text-sm uppercase tracking-widest">
                  Chiudi
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
      )}
    </AnimatePresence>
  );
};
