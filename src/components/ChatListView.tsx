import React from 'react';
import { motion } from 'motion/react';
import { MessageCircle, ChevronRight, Users, Shield, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatFaultTypeTitle } from '../lib/uxLabels';
import { ChatListSkeleton } from './Skeleton';

type ChatItem = {
  id: string;
  type?: string;
  title?: string;
  otherPartyName?: string;
  lastMessage?: string;
  lastMessageAt?: any;
  unreadCount?: Record<string, number>;
  participants?: string[];
  sosRequestId?: string;
  faultType?: string;
  fetchedProfileName?: string;
  [key: string]: any;
};

const ChatListItem = React.memo(({ chat, currentUserId, onSelectChat }: { chat: ChatItem, currentUserId: string, onSelectChat: (c: ChatItem) => void }) => {
  const isDirect = chat.type === 'DIRECT';
  const isGroup = chat.type === 'GROUP';
  const isSOS = !!chat.sosRequestId;
  const { t } = useTranslation();

  const participants = chat.participants as string[] | undefined;
  const otherId = isDirect
    ? participants?.find((p: string) => p !== currentUserId) || ''
    : '';

  let title = (chat.title as string) || 'Chat';
  if (isDirect) {
    title = chat.fetchedProfileName || chat.otherPartyName || (otherId ? `Utente ${otherId.substring(0, 4)}` : 'Chat Privata');
  } else if (isSOS) {
    title = formatFaultTypeTitle(chat.faultType as string | undefined, t);
  } else if (isGroup) {
    title = chat.title || 'Uscita di Gruppo';
  }

  const subtitle = (chat.lastMessage as string) || '...';

  let icon = <MessageCircle size={20} />;
  let avatarSeed = isDirect ? otherId : (chat.sosRequestId || `group_${chat.id}`);
  if (isDirect) icon = <User size={18} />;
  else if (isSOS) icon = <Shield size={18} />;
  else if (isGroup) icon = <Users size={18} />;

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
      onClick={() => onSelectChat(chat)}
      className="w-full bg-white text-black p-4 rounded-[2rem] flex items-center gap-4 group border border-grey/5 shadow-sm hover:shadow-md transition-all outline-none"
    >
      <div className="relative">
        <div className="w-14 h-14 rounded-2xl bg-white text-black border border-grey/10 shadow-sm shadow-inner flex items-center justify-center overflow-hidden">
          <img
            src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${avatarSeed}`}
            alt="Avatar"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="absolute -bottom-1 -right-1 bg-primary text-white p-1.5 rounded-xl border-2 border-white shadow-sm">
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
          <h5 className="font-black text-black transition-colors truncate pr-2 uppercase tracking-tight">
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
        <p className={`text-[10px] font-bold truncate italic ${unreadCount > 0 ? 'text-primary' : 'text-grey'}`}>
          {subtitle}
        </p>
      </div>
      
      <div className="w-8 h-8 rounded-full bg-white text-black shadow-sm border border-grey/10 flex items-center justify-center text-grey opacity-0 group-hover:opacity-100 transition-all">
        <ChevronRight size={16} />
      </div>
    </motion.button>
  );
});

interface ChatListViewProps {
  chats: ChatItem[];
  onSelectChat: (chat: ChatItem) => void;
  currentUserId: string;
}

export const ChatListView: React.FC<ChatListViewProps & { loading?: boolean }> = React.memo(({ chats, onSelectChat, currentUserId, loading }) => {
  const { t } = useTranslation();

  if (loading) {
    return <ChatListSkeleton />;
  }

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
      <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-grey px-2 italic">{t('nav.chat')}</h4>
      <div className="space-y-3">
        {chats.map(chat => (
          <ChatListItem key={chat.id} chat={chat} currentUserId={currentUserId} onSelectChat={onSelectChat} />
        ))}
      </div>
    </div>
  );
});
