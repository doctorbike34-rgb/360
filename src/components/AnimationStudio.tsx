import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BrandDirection } from '../services/geminiService';
import { Download, RefreshCw } from 'lucide-react';

interface Props {
  logoUrl: string;
  direction: BrandDirection;
  onReset: () => void;
}

export default function AnimationStudio({ logoUrl, direction, onReset }: Props) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [showUI, setShowUI] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsPlaying(true), 1000);
    const uiTimer = setTimeout(() => setShowUI(true), 4000);
    return () => {
      clearTimeout(timer);
      clearTimeout(uiTimer);
    };
  }, []);

  return (
    <div className="relative min-h-[85vh] flex flex-col items-center justify-center overflow-hidden border border-[#121212]/10 bg-white group">
      {/* Background Cinematic Lighting - Subtle for Editorial */}
      <div className="absolute inset-0 bg-[#F9F9F7]" />
      
      <AnimatePresence>
        {isPlaying && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 flex items-center justify-center"
          >
             <motion.div
               animate={{ 
                 opacity: [0.02, 0.05, 0.02]
               }}
               transition={{ duration: 8, repeat: Infinity }}
               className="absolute w-full h-full bg-[#121212]/5"
             />
          </motion.div>
        )}
      </AnimatePresence>

      {/* The Animated Logo Asset */}
      <div className="relative z-20 flex flex-col items-center gap-16">
        <motion.div
          initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
          animate={isPlaying ? { 
            opacity: 1, 
            y: 0, 
            filter: 'blur(0px)',
            transition: { duration: 2, ease: [0.22, 1, 0.36, 1] }
          } : {}}
          className="relative px-20 py-20 bg-white shadow-[0_40px_100px_-20px_rgba(0,0,0,0.1)] border border-[#121212]/5"
        >
          {/* Technical Guides */}
          <div className="absolute top-4 left-4 text-[8px] font-mono text-[#121212]/20">ASSET_V1.0 // GRID_ENABLED</div>
          <div className="absolute top-4 right-4 text-[8px] font-mono text-[#121212]/20">© LOGOVIVE_STUDIO</div>
          <div className="absolute bottom-4 left-4 text-[8px] font-mono text-[#121212]/20 uppercase tracking-widest">{direction.vibe}</div>

          <motion.div
             animate={{ 
                y: [0, -5, 0],
             }}
             transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
             className="relative z-10"
          >
            <img 
              src={logoUrl} 
              alt="Generated Brand Mark" 
              className="w-72 h-72 object-contain"
              referrerPolicy="no-referrer"
            />
          </motion.div>
        </motion.div>

        {/* Brand Reveal Text */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isPlaying ? { opacity: 1 } : {}}
          transition={{ delay: 1, duration: 1.5 }}
          className="text-center space-y-4"
        >
          <div className="label-caps !text-[#121212]/40 mb-2 italic">Official Identity Launch</div>
          <h2 className="text-6xl font-serif font-black tracking-tighter uppercase">{direction.title}</h2>
          <div className="h-px w-12 bg-[#121212]/20 mx-auto" />
          <p className="text-[#121212]/40 font-bold tracking-[0.4em] uppercase text-[10px]">{direction.vibe} System</p>
        </motion.div>
      </div>

      {/* Action Overlay */}
      <AnimatePresence>
        {showUI && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute bottom-12 left-12 right-12 z-40 flex flex-col md:flex-row items-center justify-between gap-8 bg-white/80 backdrop-blur-xl p-10 border border-[#121212]/10 shadow-2xl"
          >
            <div className="flex gap-12 items-center">
              <div className="space-y-2">
                <span className="label-caps !text-[8px]">System Palettes</span>
                <div className="flex gap-1">
                   {direction.colors.map(c => <div key={c} className="w-8 h-4 border border-[#121212]/10" style={{ backgroundColor: c }} />)}
                </div>
              </div>
              <div className="h-10 w-px bg-[#121212]/10 hidden md:block" />
              <div className="space-y-1">
                 <span className="label-caps !text-[8px]">Motion Profile</span>
                 <div className="text-[10px] font-bold text-[#121212] uppercase tracking-widest">Minimal Reveal 04</div>
              </div>
            </div>

            <div className="flex gap-3 w-full md:w-auto">
              <button 
                onClick={() => setIsPlaying(!isPlaying)}
                className="flex-1 md:flex-none p-5 border border-[#121212]/10 hover:bg-[#121212]/5 transition-colors flex items-center justify-center"
              >
                <RefreshCw size={18} className={isPlaying ? 'animate-spin' : ''} />
              </button>
              <button className="btn-primary flex-1 md:flex-none flex items-center justify-center gap-3">
                <Download size={14} />
                Export IP
              </button>
              <button 
                onClick={onReset}
                className="btn-secondary flex-1 md:flex-none flex items-center justify-center gap-3"
              >
                Reset Session
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
