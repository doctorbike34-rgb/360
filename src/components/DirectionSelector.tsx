import React from 'react';
import { motion } from 'motion/react';
import { BrandDirection } from '../services/geminiService';
import { Zap } from 'lucide-react';

interface Props {
  directions: BrandDirection[];
  isRefining: boolean;
  onSelect: (direction: BrandDirection) => void;
}

export default function DirectionSelector({ directions, isRefining, onSelect }: Props) {
  if (isRefining || directions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-8">
        <div className="relative">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
            className="w-24 h-24 border-2 border-[#00ff6a]/20 border-t-[#00ff6a] rounded-full"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <Zap size={32} className="text-[#00ff6a] animate-pulse" />
          </div>
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-display font-bold uppercase tracking-widest">Architecting Directions</h2>
          <p className="text-white/40 font-mono text-sm animate-pulse">Consulting creative intelligence...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-16">
      <div className="text-center space-y-6">
        <h2 className="text-5xl md:text-7xl font-serif font-light tracking-tight leading-tight">
          Select your <span className="italic">Visual Philosophy.</span>
        </h2>
        <p className="text-sm text-[#121212]/40 max-w-xl mx-auto font-bold uppercase tracking-[0.3em]">
          Three derived strategic directions based on your narrative inputs.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border border-[#121212]/10 divide-x divide-[#121212]/10 bg-white">
        {directions.map((dir, i) => (
          <motion.div
            key={i}
            whileHover={{ backgroundColor: '#F9F9F7' }}
            className="group p-12 flex flex-col gap-12 cursor-pointer relative overflow-hidden transition-colors"
            onClick={() => onSelect(dir)}
          >
            <div className="space-y-6">
              <div className="text-[#121212]/20 font-mono text-xs tracking-widest font-bold">DIRECTION_0{i+1}</div>
              <h3 className="text-4xl font-serif font-bold italic tracking-tighter leading-none">{dir.title}</h3>
              <p className="text-[#121212]/60 text-sm leading-relaxed font-medium">{dir.description}</p>
            </div>

            <div className="mt-auto space-y-10">
              <div className="flex flex-col gap-2">
                <span className="label-caps !text-[8px]">Chromatic Palette</span>
                <div className="flex gap-1">
                  {dir.colors.map((color, j) => (
                    <div 
                      key={j} 
                      className="w-10 h-6 border border-[#121212]/10" 
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
              
              <button className="btn-secondary w-full group-hover:bg-[#121212] group-hover:text-white">
                Review Direction
              </button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
