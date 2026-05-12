import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, orderBy, updateDoc, doc } from 'firebase/firestore';
import { useAuthStore } from '../store/useAuthStore';
import { InterventionRecord } from '../types';
import { pdfService } from '../services/pdfService';
import { Download, FileText, ArrowLeft, Clock, Sparkles, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { analyzeBikeIssue } from '../services/geminiService';
import ReactMarkdown from 'react-markdown';

export function InterventionHistory({ onClose }: { onClose?: () => void }) {
  const { user, profile } = useAuthStore();
  const [interventions, setInterventions] = useState<InterventionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);

  useEffect(() => {
    const fetchInterventions = async () => {
      if (!user || (!profile?.role)) return;
      try {
        const q = profile.role === 'CYCLIST' 
          ? query(collection(db, 'interventions'), where('cyclistId', '==', user.uid), orderBy('date', 'desc'))
          : query(collection(db, 'interventions'), where('mechanicId', '==', user.uid), orderBy('date', 'desc'));
        
        const snap = await getDocs(q);
        setInterventions(snap.docs.map(d => ({ id: d.id, ...d.data() } as InterventionRecord)));
      } catch (err) {
        console.error('Error fetching interventions:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchInterventions();
  }, [user, profile]);

  const handleAnalyze = async (inv: InterventionRecord) => {
    if (analyzingId || inv.aiDiagnosis) return;
    setAnalyzingId(inv.id);
    try {
      const diagnosis = await analyzeBikeIssue(inv.problemDescription);
      const updatedDiagnosis = diagnosis === "Could not analyze issue." 
        ? "Impossibile analizzare il problema. Riprova più tardi."
        : diagnosis;

      await updateDoc(doc(db, 'interventions', inv.id), {
        aiDiagnosis: updatedDiagnosis
      });

      setInterventions(prev => 
        prev.map(item => item.id === inv.id ? { ...item, aiDiagnosis: updatedDiagnosis || '' } : item)
      );
    } catch (error) {
      console.error("Error analyzing issue:", error);
    } finally {
      setAnalyzingId(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-white text-black border border-grey/10 shadow-sm text-black  z-[150] flex flex-col pt-safe pb-safe">
      <div className="flex items-center p-4 bg-white text-black shrink-0 sticky top-0 z-10 border-b border-grey/10 shadow-sm justify-between">
        <div className="flex items-center">
            {onClose && (
                <button onClick={onClose} className="p-2 rounded-full bg-grey/5 hover:bg-grey/10 transition-colors mr-3">
                    <ArrowLeft size={20} className="text-black " />
                </button>
            )}
            <h2 className="text-lg font-black uppercase flex items-center gap-2">
                <FileText size={18} className="text-primary" />
                Storico Interventi
            </h2>
        </div>
        <button 
          onClick={() => pdfService.generatePeriodPDF(interventions)}
          className="text-[10px] font-black uppercase text-white bg-primary px-3 py-2 rounded-xl flex items-center gap-1 active:scale-95 transition-transform"
        >
            <Download size={14} /> Espora Tutti
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isLoading && <p className="text-center font-bold text-sm text-grey">Caricamento...</p>}
          {!isLoading && interventions.length === 0 && (
              <p className="text-center font-bold text-sm text-grey mt-10">Nessun intervento registrato.</p>
          )}

          {interventions.map((inv) => (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={inv.id} 
                className="p-4 bg-white text-black shadow-sm border border-grey/10 rounded-2xl shadow-sm border border-grey/5"
              >
                  <div className="flex justify-between items-start mb-2">
                      <div>
                          <p className="font-bold text-sm">{inv.problemDescription}</p>
                          <p className="text-[10px] uppercase font-bold text-grey flex items-center gap-1">
                              <Clock size={12} /> {new Date(inv.date).toLocaleDateString()}
                          </p>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-[9px] font-black uppercase ${
                          inv.status === 'completed' ? 'bg-success/10 text-success' : 
                          inv.status === 'disputed' ? 'bg-danger/10 text-danger' : 'bg-grey/10 text-grey'
                      }`}>
                          {inv.status}
                      </span>
                  </div>

                  <div className="mt-2 mb-4">
                    <AnimatePresence>
                      {inv.aiDiagnosis ? (
                         <motion.div 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-sm mt-2"
                         >
                            <div className="flex items-center gap-1.5 mb-2 text-primary font-black uppercase tracking-widest text-[10px]">
                              <Sparkles size={12} />
                              AI Doctor
                            </div>
                            <div className="prose prose-sm prose-p:my-1 prose-li:my-0 text-black/80 font-medium text-xs">
                              <ReactMarkdown>{inv.aiDiagnosis}</ReactMarkdown>
                            </div>
                         </motion.div>
                      ) : (
                        <button
                          onClick={() => handleAnalyze(inv)}
                          disabled={analyzingId === inv.id}
                          className="flex items-center gap-1.5 text-[10px] uppercase font-black text-primary bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 mt-2"
                        >
                          {analyzingId === inv.id ? (
                            <>
                              <Loader2 size={12} className="animate-spin" /> Analisi in corso...
                            </>
                          ) : (
                            <>
                              <Sparkles size={12} /> Analizza con AI Doctor
                            </>
                          )}
                        </button>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="mt-4 flex items-end justify-between border-t border-grey/10 pt-3">
                      <div>
                          <p className="text-xs font-bold text-grey">{profile?.role === 'CYCLIST' ? `Meccanico: ${inv.mechanicName || 'N/A'}` : `Ciclista: ${inv.cyclistName || 'N/A'}`}</p>
                          <p className="text-lg font-black mt-1">€{inv.cost?.toFixed(2)}</p>
                      </div>
                      <button 
                          onClick={() => pdfService.generateInterventionPDF(inv)}
                          className="bg-grey/10 text-black  p-2 rounded-xl hover:bg-grey/20 transition-colors flex items-center justify-center gap-1 text-[10px] uppercase font-bold"
                      >
                          <Download size={14} /> <span className="hidden sm:inline">Scarica</span>
                      </button>
                  </div>
              </motion.div>
          ))}
      </div>
    </div>
  );
}
