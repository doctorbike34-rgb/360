import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { useAuthStore } from '../store/useAuthStore';
import { InterventionRecord } from '../types';
import { pdfService } from '../services/pdfService';
import { Download, FileText, ArrowLeft, Clock } from 'lucide-react';
import { motion } from 'motion/react';

export function InterventionHistory({ onClose }: { onClose?: () => void }) {
  const { user, profile } = useAuthStore();
  const [interventions, setInterventions] = useState<InterventionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

                  <div className="mt-4 flex items-end justify-between">
                      <div>
                          <p className="text-xs font-bold text-grey">{profile?.role === 'CYCLIST' ? `Meccanico: ${inv.mechanicName || 'N/A'}` : `Ciclista: ${inv.cyclistName || 'N/A'}`}</p>
                          <p className="text-lg font-black mt-1">€{inv.cost?.toFixed(2)}</p>
                      </div>
                      <button 
                          onClick={() => pdfService.generateInterventionPDF(inv)}
                          className="bg-grey/10 text-black  p-2 rounded-xl hover:bg-grey/20 transition-colors"
                      >
                          <Download size={18} />
                      </button>
                  </div>
              </motion.div>
          ))}
      </div>
    </div>
  );
}
