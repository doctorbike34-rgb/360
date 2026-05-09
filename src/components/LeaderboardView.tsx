import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Trophy, Medal, Star, ArrowLeft } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { gamificationService } from '../services/gamificationService';

export function LeaderboardView({ onClose }: { onClose: () => void }) {
  const { user } = useAuthStore();
  const [tab, setTab] = useState<'cyclists_weekly' | 'mechanics_weekly' | 'mechanics_alltime'>('cyclists_weekly');
  const [leaders, setLeaders] = useState<any[]>([]);

  useEffect(() => {
    const fetchLeaders = async () => {
      const data = await gamificationService.getLeaderboard(tab);
      setLeaders(data);
    };
    fetchLeaders();
  }, [tab]);

  return (
    <div className="fixed inset-0 bg-white text-black border border-grey/10 shadow-sm text-black  z-[150] flex flex-col pt-safe pb-safe">
      <div className="flex items-center p-4 bg-white text-black shrink-0 sticky top-0 z-10 border-b border-grey/10 shadow-sm">
        <button onClick={onClose} className="p-2 rounded-full bg-grey/5 hover:bg-grey/10 transition-colors mr-3">
          <ArrowLeft size={20} className="text-black " />
        </button>
        <div className="flex-1">
          <h2 className="text-lg font-black uppercase text-black  flex items-center gap-2">
            <Trophy size={18} className="text-warning" />
            Classifiche
          </h2>
        </div>
      </div>

      <div className="flex gap-2 p-4 shrink-0 overflow-x-auto no-scrollbar border-b border-grey/10">
        <button 
          onClick={() => setTab('cyclists_weekly')}
          className={`shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-all ${tab === 'cyclists_weekly' ? 'bg-primary text-white shadow-md' : 'bg-grey/10 text-grey hover:bg-grey/20'}`}
        >
          Ciclisti (Settimana)
        </button>
        <button 
          onClick={() => setTab('mechanics_weekly')}
          className={`shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-all ${tab === 'mechanics_weekly' ? 'bg-primary text-white shadow-md' : 'bg-grey/10 text-grey hover:bg-grey/20'}`}
        >
          Meccanici (Settimana)
        </button>
        <button 
          onClick={() => setTab('mechanics_alltime')}
          className={`shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-all ${tab === 'mechanics_alltime' ? 'bg-primary text-white shadow-md' : 'bg-grey/10 text-grey hover:bg-grey/20'}`}
        >
          Meccanici (All Time)
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
         {leaders.map((leader, index) => (
             <motion.div 
               initial={{ opacity: 0, y: 10 }}
               animate={{ opacity: 1, y: 0 }}
               key={leader.uid} 
               className={`flex items-center p-4 bg-white text-black shadow-sm border border-grey/10 rounded-2xl shadow-sm border ${leader.uid === user?.uid ? 'border-primary' : 'border-grey/5'}`}
             >
                 <div className="w-8 font-black text-lg text-grey/50">#{index + 1}</div>
                 <div className="flex-1 ml-2">
                     <p className="font-bold text-sm flex items-center gap-2">
                         {leader.name} {leader.uid === user?.uid && <span className="text-[9px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">TU</span>}
                     </p>
                     <p className="text-xs text-grey border-b border-white/0">{tab.includes('weekly') ? leader.weeklyPoints || 0 : leader.points || 0} pt</p>
                 </div>
                 {index === 0 && <Medal size={24} className="text-warning" />}
                 {index === 1 && <Medal size={24} className="text-grey/70" />}
                 {index === 2 && <Medal size={24} className="text-accent" />}
             </motion.div>
         ))}
         {leaders.length === 0 && <p className="text-center text-sm text-grey font-bold mt-10">Nessun dato disponibile.</p>}
      </div>
    </div>
  );
}
