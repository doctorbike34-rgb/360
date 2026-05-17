import React, { useEffect, useState } from 'react';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ArrowLeft, MoreVertical, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/useAuthStore';

interface ChatHeaderProps {
  chatId: string;
  defaultName?: string;
  onBack: () => void;
  onViewProfile?: (userId: string) => void;
  isAdminSupport?: boolean;
  targetUserId?: string;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({ chatId, defaultName, onBack, onViewProfile, isAdminSupport, targetUserId }) => {
  const { user } = useAuthStore();
  const { t } = useTranslation();
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    let unsubscribe: () => void = () => {};
    const fetchProfile = async () => {
      if (!user) return;
      
      let otherId: string | undefined;
      
      if (isAdminSupport && targetUserId) {
        otherId = targetUserId;
      } else if (chatId.startsWith('direct_')) {
        const parts = chatId.replace('direct_', '').split('_');
        otherId = parts.find(id => id !== user.uid);
      } else if (!isAdminSupport) {
        try {
          const chatSnap = await getDoc(doc(db, 'chats', chatId));
          if (chatSnap.exists()) {
            const data = chatSnap.data();
            const participants = data.participants || [];
            otherId = participants.find((p: string) => p !== user.uid);
          }
        } catch (e) {
          console.error("Error fetching chat for profile:", e);
        }
      }

      if (otherId && typeof otherId === 'string' && !otherId.includes('/')) {
        unsubscribe = onSnapshot(doc(db, 'users', otherId), (snap) => {
          if (snap.exists()) {
            setProfile({ id: otherId, ...snap.data() });
          }
        }, (error) => {
          console.error("Error listening to profile:", error);
        });
      }
    };
    fetchProfile();
    return () => unsubscribe();
  }, [chatId, user, isAdminSupport, targetUserId]);

  const name = profile?.name || profile?.displayName || defaultName || 'Utente';
  const avatar = profile?.photoURL || profile?.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile?.id || chatId}`;
  const isOnline = profile?.isOnline || profile?.presenceStatus === 'ONLINE';

  return (
    <div className="bg-primary p-3 flex items-center gap-3 text-white transition-colors border-b border-black/10 ">
      <button onClick={onBack} className="hover:bg-black/10 p-2 -ml-1 rounded-full transition-colors flex-shrink-0" aria-label={t('common.goBack')}>
        <ArrowLeft size={24} />
      </button>
      
      <div 
        className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer" 
        onClick={() => profile?.id && onViewProfile?.(profile.id)}
      >
        <div className="relative flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-white/20 overflow-hidden border border-white/20">
            <img src={avatar} alt="avatar" className="w-full h-full object-cover" />
          </div>
          {isOnline && (
            <div className="absolute bottom-0 right-0 w-3 h-3 bg-accent rounded-full border-2 border-primary animate-pulse" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-sm truncate leading-tight">{name}</h3>
            {isOnline && (
              <span className="text-[8px] font-black uppercase text-accent tracking-widest italic animate-pulse">Online</span>
            )}
          </div>
          <p className="text-[11px] opacity-80 truncate">
            {isOnline ? t('mechanic.online') : t('mechanic.offline')}
          </p>
        </div>
      </div>
      
      {profile?.id && onViewProfile && (
        <button onClick={() => onViewProfile(profile.id)} className="hover:bg-black/10 p-2 -mr-1 rounded-full transition-colors flex-shrink-0" aria-label={t('common.viewProfile')}>
          <Info size={22} />
        </button>
      )}
    </div>
  );
};
