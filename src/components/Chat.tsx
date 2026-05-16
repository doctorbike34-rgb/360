import React, { useState, useEffect, useRef } from 'react';
import { auth, db, handleFirestoreError, OperationType, storage } from '../lib/firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import imageCompression from 'browser-image-compression';
import { 
  collection, 
  addDoc,
  updateDoc,
  setDoc,
  doc, 
  getDoc,
  query, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  increment,
  arrayUnion,
  FieldPath,
  deleteField
} from 'firebase/firestore';
import { useAuthStore } from '../store/useAuthStore';
import { Send, Image as ImageIcon, Smile } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import EmojiPicker, { Theme } from 'emoji-picker-react';
import { soundService } from '../lib/sounds';
import { fileToBase64 } from '../lib/fileUtils';

interface Message {
  id: string;
  senderId: string;
  content: string;
  createdAt: ReturnType<typeof serverTimestamp>;
  type: 'TEXT' | 'IMAGE';
}

export function Chat({ chatId, isAdminSupport = false, otherPartyName }: { chatId: string, otherPartyName: string, isAdminSupport?: boolean }) {
  const { user } = useAuthStore();
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const collectionPath = isAdminSupport ? 'supportTickets' : 'chats';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    };

    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEmojiPicker]);

  useEffect(() => {
    if (!chatId || !user) return;
    
    useAuthStore.getState().setActiveChatId(chatId);

    // Reset unread count for current user when opening chat and keep it 0 if it changes
    let messagesUnsubscribe: (() => void) | null = null;
    let isReadyToListenToMessages = false;

    const chatDocRef = doc(db, collectionPath, chatId);
    const unsubChatDoc = onSnapshot(chatDocRef, (docSnap) => {
        if (docSnap.exists()) {
           const data = docSnap.data();
           
           if (!isAdminSupport && data.participants && !data.participants.includes(user.uid)) {
              updateDoc(chatDocRef, {
                 participants: arrayUnion(user.uid)
              }).then(() => {
                 // Once added, the snapshot will fire again, so we don't need to do anything here
              }).catch(err => console.warn('Failed to add self to participants:', err));
           } else {
              isReadyToListenToMessages = true;
           }

           const nestedUnread = data.unreadCount?.[user.uid] || 0;
           const flatUnread = data[`unreadCount.${user.uid}`] || undefined;
           
           if (flatUnread !== undefined) {
              // Delete the incorrectly created flat field
              updateDoc(
                chatDocRef, 
                new FieldPath(`unreadCount.${user.uid}`), deleteField()
              ).catch((e) => console.error('Failed to delete flat unread count', e));
           }

           if (nestedUnread > 0) {
              updateDoc(chatDocRef, {
                 [`unreadCount.${user.uid}`]: 0
              }).catch((e) => console.error('Failed to reset unread count', e));
           }
        } else if (!isAdminSupport && chatId.startsWith('direct_')) {
           // Auto-create direct chat doc if it doesn't exist yet but we are opening it
           const parts = chatId.replace('direct_', '').split('_');
           if (parts.includes(user.uid)) {
             setDoc(chatDocRef, {
               participants: parts,
               type: 'DIRECT',
               createdAt: serverTimestamp(),
               updatedAt: serverTimestamp()
             }, { merge: true }).catch(err => console.warn('Failed to auto-create direct chat:', err));
           }
        } else if (!isAdminSupport) {
           // Auto-create group chat doc if it doesn't exist yet
           setDoc(chatDocRef, {
             participants: arrayUnion(user.uid),
             type: 'GROUP',
             createdAt: serverTimestamp(),
             updatedAt: serverTimestamp()
           }, { merge: true }).catch(err => console.warn('Failed to auto-create group chat:', err));
        }

        if (isAdminSupport) {
          isReadyToListenToMessages = true;
        }

        // Attach messages listener once we know we are valid to read
        if (isReadyToListenToMessages && !messagesUnsubscribe) {
           const q = query(
             collection(db, collectionPath, chatId, 'messages'),
             orderBy('createdAt', 'asc')
           );

           messagesUnsubscribe = onSnapshot(q, (snapshot) => {
             const msgs = snapshot.docs.map(doc => ({
               id: doc.id,
               ...doc.data()
             })) as Message[];
             
             snapshot.docChanges().forEach(change => {
               if (change.type === 'added') {
                 const msgData = change.doc.data();
                 if (msgData.senderId && msgData.senderId !== user?.uid) {
                    const isRecent = msgData.createdAt?.seconds && (Date.now() / 1000 - msgData.createdAt.seconds < 10);
                    if (isRecent && useAuthStore.getState().profile?.notificationsEnabled) {
                      const role = useAuthStore.getState().role;
                      soundService.play(role === 'MECHANIC' || role === 'PEER_MECHANIC' ? 'MESSAGE_MECHANIC' : 'MESSAGE_CYCLIST');
                    }
                 }
               }
             });

             setMessages(msgs);
           }, (error) => {
             if (!auth.currentUser) {
               console.warn('Expected Auth sync error during logout: ', error);
             } else {
               handleFirestoreError(error, OperationType.LIST, `${collectionPath}/${chatId}/messages`);
             }
           });
        }
    }, (error) => {
        handleFirestoreError(error, OperationType.GET, `${collectionPath}/${chatId}`);
    });

    return () => {
       if (messagesUnsubscribe) messagesUnsubscribe();
       unsubChatDoc();
       useAuthStore.getState().setActiveChatId(null);
    };
  }, [chatId, user, collectionPath]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    console.log('Attempting to send message:', newMessage);
    if (!newMessage.trim() || !user || isSending) {
      console.log('SendMessage aborted: message empty, user null, or already sending');
      return;
    }

    setIsSending(true);
    
    // Optimistically clear the input UI and add to local state
    const msgContent = newMessage;
    setNewMessage('');
    setShowEmojiPicker(false);

    const optimisticMsg: Message = {
      id: 'opt_' + Date.now(),
      senderId: user.uid,
      content: msgContent,
      type: 'TEXT',
      createdAt: { seconds: Math.floor(Date.now()/1000), nanoseconds: 0 } as any, // Mock timestamp
    };
    setMessages(prev => [...prev, optimisticMsg]);
    
    try {
      // 1. Parallelize parent update and message creation
      const docRef = doc(db, collectionPath, chatId);
      const msgRef = collection(db, collectionPath, chatId, 'messages');
      
      const parentUpdates: Record<string, any> = {
        lastMessage: msgContent,
        updatedAt: serverTimestamp(),
        lastMessageAt: serverTimestamp(),
        [`unreadCount.${user.uid}`]: 0 // Reset self unread
      };

      // Use setDoc with merge: true to avoid getDoc check
      const p1 = setDoc(docRef, parentUpdates, { merge: true });
      const p2 = addDoc(msgRef, {
        senderId: user.uid,
        senderName: user.displayName || 'Utente',
        content: msgContent,
        type: 'TEXT',
        createdAt: serverTimestamp(),
      });

      await Promise.all([p1, p2]);
      setIsSending(false);
    } catch (err) {
      console.error('SendMessage error:', err);
      // Remove optimistic message on error and restore text
      setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id));
      setNewMessage(msgContent);
      handleFirestoreError(err, OperationType.WRITE, `${collectionPath}/${chatId}`);
      setIsSending(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    
    setIsSending(true);
    setUploadProgress(0);

    try {
      const options = {
        maxSizeMB: 0.4,
        maxWidthOrHeight: 800,
        useWebWorker: false,
        fileType: 'image/jpeg'
      };
      
      let compressedFile: File | Blob = file;
      try {
        if (typeof imageCompression === 'function') {
          compressedFile = await imageCompression(file, options);
        } else if (imageCompression && (imageCompression as any).default && typeof (imageCompression as any).default === 'function') {
          compressedFile = await (imageCompression as any).default(file, options);
        }
      } catch (compressErr) {
        console.error('Compression failed, using original:', compressErr);
        compressedFile = file;
      }
      
      const base64string = await fileToBase64(compressedFile);
      setUploadProgress(null);

      try {
        // 1. Ensure the parent chat document exists and user is participant BEFORE sending message
        const docRef = doc(db, collectionPath, chatId);
        const docSnap = await getDoc(docRef);
        
        const updates: Record<string, unknown> = {
          lastMessage: '📷 Foto',
          updatedAt: serverTimestamp(),
          lastMessageAt: serverTimestamp()
        };

        if (!docSnap.exists()) {
          if (chatId.startsWith('direct_') && !isAdminSupport) {
            const parts = chatId.replace('direct_', '').split('_');
            updates.participants = parts;
            updates.participantCount = 2;
            updates.type = 'DIRECT';
            updates.createdAt = serverTimestamp();
            
            const otherUserId = parts.find(id => id !== user?.uid);
            if (otherUserId) {
              updates.unreadCount = { [otherUserId]: 1 };
            }
          } else if (!isAdminSupport) {
            updates.participants = [user.uid];
            updates.type = 'GROUP';
            updates.createdAt = serverTimestamp();
          }
          await setDoc(docRef, updates, { merge: true });
        } else {
          const data = docSnap.data();
          if (!isAdminSupport) {
            const participants = data.participants || [];
            if (!participants.includes(user.uid)) {
              updates.participants = arrayUnion(user.uid);
            }
            
            participants.forEach((pId: string) => {
              if (pId !== user?.uid) {
                updates[`unreadCount.${pId}`] = increment(1);
              }
            });
          }
          await updateDoc(docRef, updates);
        }
      } catch (chatUpdateErr) {
        console.error("Chat document update error during photo upload:", chatUpdateErr);
        handleFirestoreError(chatUpdateErr, OperationType.WRITE, `${collectionPath}/${chatId}`);
        setIsSending(false);
        return;
      }

      try {
        const msgData = {
          senderId: user?.uid,
          senderName: user?.displayName || 'Utente',
          content: base64string,
          type: 'IMAGE',
          createdAt: serverTimestamp(),
        };

        await addDoc(collection(db, collectionPath, chatId, 'messages'), msgData);
      } catch (sendErr) {
        console.error("Photo message send error:", sendErr);
        handleFirestoreError(sendErr, OperationType.WRITE, `${collectionPath}/${chatId}/messages`);
      } finally {
        setIsSending(false);
      }
      
    } catch (error) {
      console.error('Image compression or upload error:', error);
      setUploadProgress(null);
      setIsSending(false);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const onEmojiClick = (emojiData: any) => {
    setNewMessage(prev => prev + emojiData.emoji);
  };

  return (
    <div className={`flex flex-col h-full ${isAdminSupport ? 'bg-transparent' : 'bg-white'} relative`}>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.map((msg) => {
          const isMe = msg.senderId === user?.uid;
            return (
              <motion.div 
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                key={msg.id} 
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                {!isMe && !chatId.startsWith('direct_') && (msg as Message & { senderName?: string }).senderName && (
                  <span className="text-[9px] font-black uppercase text-grey ml-2 mb-1 tracking-widest italic">
                    {(msg as Message & { senderName?: string }).senderName}
                  </span>
                )}
                <div className={`
                  max-w-[85%] p-4 rounded-3xl text-sm shadow-sm
                  ${isMe 
                    ? 'bg-primary text-white rounded-tr-none' 
                    : 'bg-white text-black rounded-tl-none border border-grey/5'}
                `}>
                  {msg.type === 'IMAGE' ? (
                    <img src={msg.content} alt="Foto inviata" className="w-full max-w-[250px] rounded-2xl mb-1" loading="lazy" />
                  ) : (
                    msg.content
                  )}
                  <div className={`text-[8px] mt-1 opacity-60 font-bold ${isMe ? 'text-right' : 'text-left'}`}>
                    {(msg.createdAt as any)?.toDate ? (msg.createdAt as any).toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...'}
                  </div>
                </div>
              </motion.div>
            );
        })}
        <div ref={scrollRef} />
      </div>

      {/* Input */}
      {uploadProgress !== null && (
        <div className="absolute bottom-full left-0 w-full bg-white border-t border-grey/10 px-4 py-2 text-[10px] font-bold text-primary flex items-center justify-between z-10 transition-colors">
           <span>Invio foto in corso...</span>
           <span>{Math.round(uploadProgress)}%</span>
        </div>
      )}
      <form onSubmit={sendMessage} className="p-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-white text-black border-t border-grey/10  flex gap-2 items-center transition-colors relative z-20">
        <div className="flex items-center">
            <button 
              type="button" 
              onClick={() => fileInputRef.current?.click()}
              className="p-2 bg-black text-white rounded-full hover:bg-black/80 transition-colors disabled:opacity-50 flex items-center justify-center shrink-0"
              disabled={isSending}
            >
              <ImageIcon size={18} />
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              accept="image/jpeg, image/png, image/webp" 
              className="hidden" 
              onChange={handlePhotoUpload} 
            />
            <div className="relative">
                <button 
                  type="button" 
                  className={`p-2 transition-colors ${showEmojiPicker ? 'text-primary' : 'text-grey hover:text-primary'}`}
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                >
                  <Smile size={20} />
                </button>
                {showEmojiPicker && (
                    <div ref={pickerRef} className="absolute bottom-full left-0 z-50 mb-4 shadow-2xl">
                        <EmojiPicker 
                            onEmojiClick={onEmojiClick}
                            theme={Theme.LIGHT}
                            searchDisabled
                            skinTonesDisabled
                            width={300}
                            height={400}
                        />
                    </div>
                )}
            </div>
        </div>
        <input 
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder={t('chat.placeholder')}
          className="flex-1 bg-white text-black border border-grey/10 shadow-sm rounded-full px-4 py-2 text-base focus:outline-none focus:ring-1 focus:ring-primary/20 "
        />
        <button 
          type="submit"
          disabled={!newMessage.trim() || isSending}
          className="w-10 h-10 bg-primary text-black rounded-full flex items-center justify-center disabled:opacity-30 active:scale-90 transition-transform cursor-pointer"
        >
          {isSending ? (
            <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
          ) : (
            <Send size={18} />
          )}
        </button>
      </form>
    </div>
  );
}
