import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Send, X, Bot, User, Loader2, Info } from 'lucide-react';
import { askBikeDoctor, analyzeBikeIssue } from '../services/geminiService';
import { useAuthStore } from '../store/useAuthStore';
import ReactMarkdown from 'react-markdown';
import { db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, updateDoc, doc, arrayUnion } from 'firebase/firestore';

interface Message {
  id: string;
  text: string;
  sender: 'ai' | 'user';
  timestamp: number;
}

interface AIBikeDoctorProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AIBikeDoctor({ isOpen, onClose }: AIBikeDoctorProps) {
  const { user, role } = useAuthStore();
  const [messages, setMessages] = useState<Message[]>(() => [
    {
      id: '1',
      text: role === 'CYCLIST'
        ? "Ciao! Sono Doctorbike AI. Descrivi il problema della bici e ti aiuto con la diagnosi. Se sei fermo in strada puoi usare **SOS** dall'app; per l'app o l'account vai in **Profilo → Assistenza**."
        : "Ciao collega, sono Doctorbike AI. Dimmi il caso tecnico: ti aiuto con diagnosi e strumenti. Per problemi sulla piattaforma DB360 usa **Profilo → Assistenza**.",
      sender: 'ai',
      timestamp: Date.now()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Create initial conversation session in Firestore when the user first interacts
  const initSession = async (initialMessages: Message[]) => {
    if (sessionId || !user) return;
    try {
      const docRef = await addDoc(collection(db, 'aiConversations'), {
        userId: user.uid,
        userName: user.displayName || user.email,
        role: role,
        messages: initialMessages.map(m => ({
          text: m.text,
          sender: m.sender,
          timestamp: m.timestamp
        })),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setSessionId(docRef.id);
    } catch (err) {
      console.error("Error creating AI session:", err);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      text: input,
      sender: 'user',
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    // Initial session creation on first user message if not already done
    if (!sessionId) {
      await initSession([...messages, userMsg]);
    } else {
      // Update existing session with user message
      try {
        await updateDoc(doc(db, 'aiConversations', sessionId), {
          messages: arrayUnion({
            text: userMsg.text,
            sender: userMsg.sender,
            timestamp: userMsg.timestamp
          }),
          updatedAt: serverTimestamp()
        });
      } catch (err) {
        console.error("Error updating AI session:", err);
      }
    }

    const userText = userMsg.text;
    const [analysis, response] = await Promise.all([
      analyzeBikeIssue(userText),
      askBikeDoctor(userText, role || 'CYCLIST'),
    ]);

    const main = (response || '').trim() || 'Scusa, ho avuto un problema tecnico. Riprova.';
    const finalResponse = analysis
      ? `${main}\n\n---\n**Diagnosi rapida**\n\n${analysis}`
      : main;

    const aiMsg: Message = {
      id: (Date.now() + 1).toString(),
      text: finalResponse,
      sender: 'ai',
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, aiMsg]);
    setIsLoading(false);

    // Update session with AI response
    if (sessionId) {
      try {
        await updateDoc(doc(db, 'aiConversations', sessionId), {
          messages: arrayUnion({
            text: aiMsg.text,
            sender: aiMsg.sender,
            timestamp: aiMsg.timestamp
          }),
          updatedAt: serverTimestamp()
        });
      } catch (err) {
        console.error("Error updating AI session with response:", err);
      }
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[1000]"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="absolute bottom-0 left-0 right-0 w-full sm:max-w-2xl sm:mx-auto h-[80vh] bg-white text-black rounded-t-[2.5rem] z-[1001] flex flex-col border-t border-grey/10 overflow-hidden"
          >
            <div className="w-12 h-1.5 bg-grey/10 rounded-full mx-auto my-3 shrink-0" />
            {/* Header */}
            <div className="p-6 pt-3 border-b border-grey/5 flex justify-between items-center bg-white/50 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
                  <Sparkles size={20} className="text-white" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-primary uppercase tracking-widest italic">AI Assistant</p>
                  <h3 className="font-bold text-lg leading-tight uppercase tracking-tight text-black">Doctorbike Ai</h3>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-white/5 rounded-xl transition-colors text-zinc-500"
              >
                <X size={20} />
              </button>
            </div>

            {/* Warning for Cyclists */}
            {role === 'CYCLIST' && (
              <div className="mx-6 mt-4 p-3 bg-primary/10 border border-primary/20 rounded-xl flex gap-3 items-start">
                <Info size={16} className="text-primary shrink-0 mt-0.5" />
                <p className="text-[10px] text-grey leading-relaxed font-medium">
                  Le diagnosi AI sono indicative. In caso di componenti critici (freni, telaio), consulta sempre un professionista.
                </p>
              </div>
            )}

            {/* Chat Area */}
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide"
            >
              {messages.map((m) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`flex gap-3 max-w-[85%] ${m.sender === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center ${
                      m.sender === 'user' ? 'bg-grey/10' : 'bg-primary/10 text-primary'
                    }`}>
                      {m.sender === 'user' ? <User size={16} /> : <Bot size={16} />}
                    </div>
                    <div className={`rounded-2xl p-4 text-sm leading-relaxed shadow-sm ${
                      m.sender === 'user' 
                        ? 'bg-primary text-white rounded-tr-none' 
                        : 'bg-grey/5 text-black rounded-tl-none border border-grey/10'
                    }`}>
                      <div className="prose prose-sm font-medium">
                        <ReactMarkdown>{m.text}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="flex gap-3 max-w-[85%]">
                    <div className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center bg-primary/10 text-primary">
                      <Bot size={16} />
                    </div>
                    <div className="bg-grey/5 rounded-2xl rounded-tl-none p-4 border border-grey/10">
                      <Loader2 size={16} className="animate-spin text-primary" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Input Area */}
            <div className="p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] bg-white border-t border-grey/5">
              <div className="relative">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                  placeholder={role === 'CYCLIST' ? "Descrivi il problema..." : "Cerca specifiche o consigli..."}
                  className="w-full bg-grey/5 border border-grey/10 rounded-2xl py-4 pl-5 pr-14 text-base focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all placeholder:text-grey/40 text-black"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  className="absolute right-2 top-2 bottom-2 w-10 h-10 bg-primary text-white rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 disabled:opacity-50 disabled:shadow-none transition-all active:scale-90"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
