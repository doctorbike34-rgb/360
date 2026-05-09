import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';

interface Props {
  onSubmit: (prompt: string) => void;
}

export default function BrandBriefForm({ onSubmit }: Props) {
  const [prompt, setPrompt] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim()) {
      onSubmit(prompt);
    }
  };

  return (
    <div className="flex flex-col items-start text-left gap-16 max-w-4xl">
      <div className="space-y-8">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="label-caps px-0 border-l-4 border-[#121212] pl-4"
        >
          Identity Architecture Module v1.0
        </motion.div>
        
        <h1 className="text-7xl md:text-9xl font-serif font-light tracking-tighter leading-[0.85] text-[#121212]">
          The <span className="italic">Soul</span> of the <br /> 
          <span className="font-bold">Enterprise.</span>
        </h1>
        
        <p className="text-xl text-[#121212]/60 font-light max-w-xl leading-relaxed">
          Articulate the essence of your venture. Our neural strategist will extract a visual philosophy from your narrative.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="w-full space-y-12">
        <div className="relative group border-t border-[#121212]/10 pt-12">
          <label className="label-caps block mb-6">Project Brief</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the aesthetic ritual of your brand..."
            className="w-full h-48 bg-transparent text-3xl font-serif italic border-none p-0 focus:ring-0 focus:outline-none placeholder:text-[#121212]/10 transition-all resize-none"
          />
          <div className="mt-4 flex items-center justify-between text-[9px] font-mono text-[#121212]/30 uppercase tracking-widest border-t border-[#121212]/5 pt-4">
            <span>Minimum 50 characters recommended for depth</span>
            <span className="text-[#121212]/60 font-bold">{prompt.length} / 1000</span>
          </div>
        </div>

        <button
          disabled={!prompt.trim()}
          className="btn-primary w-full md:w-auto px-16 py-8 text-xs flex items-center justify-center gap-6 group"
        >
          Begin Identity Synthesis
          <ArrowRight size={18} className="group-hover:translate-x-2 transition-transform" />
        </button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-12 w-full border-t border-[#121212]/10 pt-12">
        {[
          { title: 'Neural Analysis', desc: 'Decoding semantic brand values through high-parameter language modeling.' },
          { title: 'Visual DNA', desc: 'Structuring a coordinate system of color, form, and typography.' },
          { title: 'Motion Signature', desc: 'Cinematic brand reveal reflecting your identity velocity.' }
        ].map((feat, i) => (
          <div key={i} className="space-y-4">
            <div className="text-[#121212]/20 font-mono text-[9px] tracking-[0.4em] uppercase font-bold">0{i+1}</div>
            <h3 className="font-serif font-bold text-xl italic">{feat.title}</h3>
            <p className="text-[#121212]/50 text-xs leading-relaxed tracking-wide font-medium uppercase">{feat.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
