import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { BrandDirection } from '../services/geminiService';

interface Props {
  direction: BrandDirection;
  onGenerated: (url: string) => void;
}

export default function LogoGenerator({ direction, onGenerated }: Props) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          // Small delay before moving to animation
          setTimeout(() => {
            // Using a high-quality abstract seed that looks like a logo
            const mockLogo = `https://picsum.photos/seed/${direction.title.replace(/\s/g, '')}/800/800`;
            onGenerated(mockLogo);
          }, 1000);
          return 100;
        }
        return prev + (Math.random() * 15);
      });
    }, 600);
    return () => clearInterval(interval);
  }, [direction.title, onGenerated]);

  return (
    <div className="max-w-5xl mx-auto space-y-16">
      <div className="flex flex-col md:flex-row gap-16 items-center">
        <div className="flex-1 space-y-8">
          <div className="label-caps !text-[#121212]">
            Geometric Synthesis Active
          </div>
          <h2 className="text-6xl font-serif font-light leading-none">Drafting the <span className="italic">Identity Proof.</span></h2>
          
          <div className="editorial-panel p-8 space-y-6">
            <h4 className="label-caps">{direction.title}</h4>
            <p className="text-[#121212]/80 text-xl font-serif italic leading-snug">"{direction.description}"</p>
            <div className="flex gap-2">
              {direction.colors.map((c, i) => (
                <div key={i} className="w-8 h-4 border border-[#121212]/10" style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {[
              { label: "Indexing brand vectors", threshold: 10 },
              { label: "Balancing ink distribution", threshold: 40 },
              { label: "Refining visual hierarchy", threshold: 70 },
              { label: "Neural identity stabilization", threshold: 90 }
            ].map((task, i) => (
              <div key={i} className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest">
                <div className={`w-3 h-3 flex items-center justify-center border transition-colors ${progress >= task.threshold ? 'border-[#121212] bg-[#121212]/5' : 'border-[#121212]/10'}`}>
                  {progress >= task.threshold && progress < task.threshold + 20 ? (
                    <div className="w-full h-full bg-[#121212] animate-pulse" />
                  ) : progress >= task.threshold ? (
                    <div className="w-full h-full bg-[#121212]" />
                  ) : null}
                </div>
                <span className={`transition-colors ${progress >= task.threshold ? 'text-[#121212]' : 'text-[#121212]/20'}`}>
                  {task.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="w-full max-w-md aspect-square editorial-panel flex flex-col items-center justify-center p-16 relative overflow-hidden group bg-white shadow-2xl">
          {/* Scanning Line */}
          <motion.div 
            animate={{ top: ['0%', '100%', '0%'] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
            className="absolute left-0 right-0 h-px bg-[#121212]/20 z-10"
          />

          <div className="text-center space-y-6 relative z-20">
            <motion.div
              animate={{ 
                scale: [1, 1.02, 1],
                opacity: [0.3, 0.6, 0.3]
              }}
              transition={{ duration: 4, repeat: Infinity }}
              className="w-32 h-32 border border-[#121212]/5 flex items-center justify-center mx-auto"
            >
              <div className="w-12 h-12 bg-[#121212] animate-spin [animation-duration:3s]" />
            </motion.div>
            <div className="space-y-2">
              <p className="label-caps !text-[9px]">Neural Proof Processing</p>
              <p className="text-[#121212] font-serif italic text-4xl">{Math.floor(progress)}%</p>
            </div>
          </div>
          
          <div className="absolute inset-0 flex flex-col justify-end p-12 gap-4">
             <div className="w-full bg-[#121212]/5 h-[2px] overflow-hidden">
               <motion.div 
                 style={{ width: `${progress}%` }}
                 className="h-full bg-[#121212]" 
               />
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
