import toast from 'react-hot-toast';
import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
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
import { Send, Image as ImageIcon, Smile, MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { soundService } from '../lib/sounds';

const LazyEmojiPicker = lazy(() => import('emoji-picker-react'));

interface Message {
  id: string;
  senderId: string;
  content: string;
  createdAt: ReturnType<typeof serverTimestamp>;
  type: 'TEXT' | 'IMAGE';
}

export function Chat({ chatId, isAdminSupport = false, otherPartyName, targetUserId }: { chatId: string, otherPartyName: string, isAdminSupport?: boolean, targetUserId?: string }) {
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

    let messagesUnsubscribe: (() => void) | null = null;
    let isReadyToListenToMessages = false;
    let hasResetUnread = false;

    const chatDocRef = doc(db, collectionPath, chatId);
    const unsubChatDoc = onSnapshot(chatDocRef, (docSnap) => {
        if (docSnap.exists()) {
           const data = docSnap.data();
           
           if (!isAdminSupport && data.participants && !data.participants.includes(user.uid)) {
              updateDoc(chatDocRef, {
                 participants: arrayUnion(user.uid)
              }).then(() => {
              }).catch(err => console.warn('Failed to add self to participants:', err));
           } else {
              isReadyToListenToMessages = true;
           }

           // Only reset unread count once when chat is first opened
           if (!hasResetUnread) {
              const nestedUnread = data.unreadCount?.[user.uid] || 0;
              const flatUnread = data[`unreadCount.${user.uid}`] || undefined;
              
              if (flatUnread !== undefined) {
                 updateDoc(
                   chatDocRef, 
                   { [`unreadCount.${user.uid}`]: deleteField() }
                 ).catch((e) => console.error('Failed to delete flat unread count', e));
              }

              if (nestedUnread > 0) {
                 updateDoc(chatDocRef, {
                    [`unreadCount.${user.uid}`]: 0
                 }).catch((e) => console.error('Failed to reset unread count', e));
              }
              hasResetUnread = true;
           }
        } else if (!isAdminSupport && chatId.startsWith('direct_')) {
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

             setMessages((prev) => {
               const pending = prev.filter((m) => m.id.startsWith('opt_'));
               const merged = [...msgs];
               pending.forEach((p) => {
                 if (p.id.startsWith('opt_img_') && p.type === 'IMAGE') {
                   const optSec = p.createdAt?.seconds ?? 0;
                   const serverImage = merged.find((m) => {
                     if (m.type !== 'IMAGE' || m.senderId !== p.senderId || m.id.startsWith('opt_')) return false;
                     if (typeof m.content === 'string' && (m.content.startsWith('http://') || m.content.startsWith('https://'))) return true;
                     const mSec = m.createdAt?.seconds ?? 0;
                     return optSec > 0 && mSec > 0 && Math.abs(mSec - optSec) < 30;
                   });
                   if (serverImage) {
                     if (typeof p.content === 'string' && p.content.startsWith('blob:')) URL.revokeObjectURL(p.content);
                     return;
                   }
                 }
                 const already = merged.some(
                   (m) => m.senderId === p.senderId && m.content === p.content && m.type === p.type
                 );
                 if (!already) merged.push(p);
               });
               return merged;
             });
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

      // Increment unread count for the other party
      if (isAdminSupport && targetUserId) {
        parentUpdates[`unreadCount.${targetUserId}`] = increment(1);
      } else if (!isAdminSupport && chatId.startsWith('direct_')) {
        const parts = chatId.replace('direct_', '').split('_');
        const otherUserId = parts.find(id => id !== user.uid);
        if (otherUserId) {
          parentUpdates[`unreadCount.${otherUserId}`] = increment(1);
        }
      } else if (!isAdminSupport) {
        // For group chats, handled via setDoc merge with participants
      }

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
      toast.error('Messaggio non inviato. Riprova.');
      handleFirestoreError(err, OperationType.WRITE, `${collectionPath}/${chatId}`);
      setIsSending(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const previewUrl = URL.createObjectURL(file);
    const optimisticId = `opt_img_${Date.now()}`;
    const optimisticMsg: Message = {
      id: optimisticId,
      senderId: user.uid,
      content: previewUrl,
      type: 'IMAGE',
      createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } as any,
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    const clearOptimistic = () => {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      URL.revokeObjectURL(previewUrl);
    };
    
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
      
      // Upload to Firebase Storage instead of storing base64 in Firestore
      const storageRef = ref(storage, `chat-photos/${chatId}/${Date.now()}-${file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, compressedFile);
      
      const downloadURL = await new Promise<string>((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setUploadProgress(progress);
          },
          (error) => reject(error),
          async () => {
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            resolve(url);
          }
        );
      });
      
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
              updates[`unreadCount.${otherUserId}`] = 1;
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
        clearOptimistic();
        toast.error('Foto non inviata. Riprova.');
        setIsSending(false);
        return;
      }

      try {
        const msgData = {
          senderId: user?.uid,
          senderName: user?.displayName || 'Utente',
          content: downloadURL,
          type: 'IMAGE',
          createdAt: serverTimestamp(),
        };

        await addDoc(collection(db, collectionPath, chatId, 'messages'), msgData);
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        URL.revokeObjectURL(previewUrl);
      } catch (sendErr) {
        console.error("Photo message send error:", sendErr);
        clearOptimistic();
        toast.error('Foto non inviata. Riprova.');
        handleFirestoreError(sendErr, OperationType.WRITE, `${collectionPath}/${chatId}/messages`);
      } finally {
        setIsSending(false);
      }
      
    } catch (error) {
      console.error('Image compression or upload error:', error);
      clearOptimistic();
      toast.error('Foto non inviata. Riprova.');
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
    <div className={`flex flex-col ${isAdminSupport ? 'flex-1 min-h-0' : 'h-full'} relative bg-white w-full max-w-full overflow-hidden`} style={{ minHeight: 0 }}>
      {/* Messages */}
      <div 
        className="overflow-y-auto px-4 py-6 space-y-4 min-h-0" 
        style={{ 
          flex: 1,
          paddingBottom: '12px',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        {isAdminSupport && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-3 mb-4"
          >
            <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
              <MessageSquare size={16} className="text-primary" />
            </div>
            <div className="bg-primary/5 border border-primary/10 rounded-2xl rounded-tl-none p-4 max-w-[85%]">
              <p className="text-xs font-bold text-black leading-relaxed">
                Benvenuto nell'assistenza DB360! 🙌
              </p>
              <p className="text-xs text-grey font-medium mt-2 leading-relaxed">
                Per aiutarti al meglio, ti chiediamo di descrivere il problema in dettaglio e allegare foto o documenti se necessario. 
                Il nostro team ti risponderà <strong className="text-primary">entro 1 ora</strong>.
              </p>
            </div>
          </motion.div>
        )}
        {messages.length === 0 && (
          <motion.div className="space-y-3 px-2" aria-hidden>
            {[1, 2, 3].map((i) => (
              <div key={i} className={`flex ${i % 2 ? 'justify-end' : 'justify-start'}`}>
                <div className="h-12 w-48 animate-pulse rounded-3xl bg-grey/10" />
              </div>
            ))}
          </motion.div>
        )}
        {messages.map((msg) => {
          const isMe = msg.senderId === user?.uid;
          const isPending = msg.id.startsWith('opt_');
            return (
              <motion.div 
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: isPending ? 0.65 : 1, y: 0, scale: 1 }}
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
                    {isPending ? 'Invio…' : (msg.createdAt as any)?.toDate ? (msg.createdAt as any).toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...'}
                  </div>
                </div>
              </motion.div>
            );
        })}
        <div ref={scrollRef} />
      </div>

      {/* Input - pinned to bottom */}
      {uploadProgress !== null && (
        <div className="bg-white border-t border-grey/10 px-4 py-2 text-[10px] font-bold text-primary flex items-center justify-between shrink-0">
           <span>Invio foto in corso...</span>
           <span>{Math.round(uploadProgress)}%</span>
        </div>
      )}
      <form 
        onSubmit={sendMessage} 
        className="shrink-0 bg-white text-black border-t border-grey/10 flex gap-1.5 sm:gap-2 items-end w-full max-w-full box-border"
        style={{ 
          padding: '10px 12px',
          paddingBottom: 'calc(10px + env(safe-area-inset-bottom))',
          position: 'relative',
          zIndex: isAdminSupport ? 300 : 20,
          minHeight: '52px'
        }}
      >
        <div className="flex items-center gap-0.5 shrink-0 pb-0.5">
            <button 
              type="button" 
              onClick={() => fileInputRef.current?.click()}
              className="p-2 bg-black text-white rounded-full hover:bg-black/80 transition-colors disabled:opacity-50 flex items-center justify-center shrink-0 w-9 h-9"
              disabled={isSending}
              aria-label="Allega foto"
            >
              <ImageIcon size={17} />
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
                  className={`p-2 transition-colors shrink-0 w-9 h-9 flex items-center justify-center ${showEmojiPicker ? 'text-primary' : 'text-grey hover:text-primary'}`}
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  aria-label="Emoji"
                >
                  <Smile size={18} />
                </button>
                {showEmojiPicker && (
                    <div ref={pickerRef} className="absolute bottom-full left-0 z-50 mb-4 shadow-2xl">
                        <Suspense fallback={<div className="w-[300px] h-[400px] bg-white rounded-2xl animate-pulse" />}>
                          <LazyEmojiPicker 
                              onEmojiClick={onEmojiClick}
                              theme={'light' as any}
                              searchDisabled
                              skinTonesDisabled
                              width={300}
                              height={400}
                          />
                        </Suspense>
                    </div>
                )}
            </div>
        </div>
        <input 
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder={t('chat.placeholder')}
          className="flex-1 min-w-0 w-0 bg-white text-black border border-grey/10 shadow-sm rounded-full px-3 sm:px-4 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary/30"
          style={{ fontSize: '16px' }}
        />
        <button 
          type="submit"
          disabled={!newMessage.trim() || isSending}
          aria-label="Invia messaggio"
          className="w-10 h-10 shrink-0 bg-primary text-white rounded-full flex items-center justify-center disabled:opacity-30 active:scale-90 transition-transform cursor-pointer mb-0.5"
        >
          {isSending ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Send size={18} />
          )}
        </button>
      </form>
    </div>
  );
}
