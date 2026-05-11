import React from 'react';
import { motion } from 'motion/react';
import { MessageCircle, ChevronRight, Users, Shield, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

const ChatListItem = ({ chat, currentUserId, onSelectChat }: { chat: any, currentUserId: string, onSelectChat: (c: any) => void }) => {
  const [profile, setProfile] = React.useState<any>(null);

  React.useEffect(() => {
    let unsubscribe: () => void = () => {};
    if (chat.type === 'DIRECT') {
      const participants = chat.participants as string[] | undefined;
      const otherId = participants?.find((p: string) => p !== currentUserId) || chat.id.replace('direct_', '').split('_').find((id: string) => id !== currentUserId);
      if (otherId) {
        unsubscribe = onSnapshot(doc(db, 'users', otherId), (snap) => {
          if (snap.exists()) setProfile({ id: otherId, ...snap.data() });
        }, (err) => console.error(err));
      }
    }
    return () => unsubscribe();
  }, [chat, currentUserId]);

  const isDirect = chat.type === 'DIRECT';
  const isOnline = profile?.isOnline || profile?.presenceStatus === 'ONLINE';
  const isGroup = chat.type === 'GROUP';
  const isSOS = !!chat.sosRequestId;
  const { t } = useTranslation();
  
  let title = (chat.title as string) || 'Chat';
  const subtitle = (chat.lastMessage as string) || '...';
  let icon = <MessageCircle size={20} />;
  let avatarSeed = chat.id;
  let avatarImage = `https://api.dicebear.com/7.x/avataaars/svg?seed=${avatarSeed}`;

  if (isDirect) {
    const participants = chat.participants as string[] | undefined;
    const otherParticipantId = participants?.find((p: string) => p !== currentUserId) || chat.id.replace('direct_', '').split('_').find((id: string) => id !== currentUserId);
    avatarSeed = otherParticipantId || (chat.id as string);
    title = profile?.name || profile?.displayName || (chat.otherPartyName as string) || (otherParticipantId ? `Utente ${otherParticipantId.substring(0, 4)}` : 'Chat Privata');
    icon = <User size={18} />;
    avatarImage = profile?.photoURL || profile?.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${avatarSeed}`;
  } else if (isSOS) {
    title = `SOS ${chat.faultType ? ' - ' + chat.faultType : ''}`;
    icon = <Shield size={18} />;
    avatarSeed = chat.sosRequestId;
  } else if (isGroup) {
    title = chat.title || 'Uscita di Gruppo';
    icon = <Users size={18} />;
    avatarSeed = `group_${chat.id}`;
  }

  const getTimeString = (time: any) => {
    if (!time) return '';
    const d = time.toDate ? time.toDate() : (time.seconds ? new Date(time.seconds * 1000) : new Date(time as number | string | Date));
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const nestedUnread = chat.unreadCount?.[currentUserId] || 0;
  const flatUnread = chat[`unreadCount.${currentUserId}`] || 0;
  const unreadCount = nestedUnread + flatUnread;

  return (
    <motion.button 
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onSelectChat({ ...chat, fetchedProfileName: profile?.name || profile?.displayName })}
      className="w-full bg-white text-black p-4 rounded-[2rem] flex items-center gap-4 group border border-grey/5  shadow-sm hover:shadow-md transition-all outline-none"
    >
      <div className="relative">
        <div className="w-14 h-14 rounded-2xl bg-white text-black border border-grey/10 shadow-sm shadow-inner flex items-center justify-center overflow-hidden border border-grey/10">
          <img src={avatarImage} alt="Avatar" className="w-full h-full object-cover" />
        </div>
        {isDirect && isOnline && (
          <div className="absolute -top-1 -left-1 w-4 h-4 bg-accent rounded-full border-2 border-white shadow-sm z-10 animate-pulse" />
        )}
        <div className="absolute -bottom-1 -right-1 bg-primary text-white p-1.5 rounded-xl border-2 border-white  shadow-sm">
          {icon}
        </div>
        {unreadCount > 0 && (
          <div className="absolute -top-1 -right-1 bg-danger text-white text-[10px] font-black w-6 h-6 rounded-full flex items-center justify-center border-2 border-white shadow-md animate-bounce">
            {unreadCount}
          </div>
        )}
      </div>
      
      <div className="flex-1 text-left min-w-0">
        <div className="flex justify-between items-center mb-0.5">
          <h5 className="font-black text-black  transition-colors truncate pr-2 uppercase tracking-tight">
            {title}
          </h5>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <span className="w-4 h-4 bg-primary text-white rounded-full text-[9px] font-black flex items-center justify-center shadow-sm">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
            <span className="text-[8px] font-bold text-grey/60 uppercase shrink-0">
              {getTimeString(chat.lastMessageAt)}
            </span>
          </div>
        </div>
        <p className={`text-[10px] font-bold truncate italic ${unreadCount > 0 ? 'text-primary' : 'text-grey '}`}>
          {subtitle}
        </p>
      </div>
      
      <div className="w-8 h-8 rounded-full bg-white text-black shadow-sm border border-grey/10 flex items-center justify-center text-grey opacity-0 group-hover:opacity-100 transition-all">
        <ChevronRight size={16} />
      </div>
    </motion.button>
  );
};

interface ChatListViewProps {
  chats: any[];
  onSelectChat: (chat: any) => void;
  currentUserId: string;
}

export const ChatListView: React.FC<ChatListViewProps> = ({ chats, onSelectChat, currentUserId }) => {
  const { t } = useTranslation();

  if (chats.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-grey">
        <div className="w-20 h-20 bg-white text-black shadow-sm border border-grey/10 rounded-full flex items-center justify-center mb-4 transition-colors">
          <MessageCircle size={40} className="opacity-20 transition-colors" />
        </div>
        <h4 className="font-bold text-black mb-1 transition-colors">{t('common.noChats', { defaultValue: 'Nessuna Conversazione' })}</h4>
        <p className="text-xs transition-colors">{t('common.noChatsDesc', { defaultValue: 'Qui appariranno i tuoi messaggi e gruppi.' })}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-grey  px-2 italic">{t('nav.chat')}</h4>
      <div className="space-y-3">
        {chats.map(chat => (
          <ChatListItem key={chat.id} chat={chat} currentUserId={currentUserId} onSelectChat={onSelectChat} />
        ))}
      </div>
    </div>
  );
};
