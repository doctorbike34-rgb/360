import { motion } from 'motion/react';
import { Bike, MapPin } from 'lucide-react';

/** Scena animata ciclismo (default al posto del video placeholder). */
export function LandingCyclingAnimation() {
  return (
    <motion.div className="absolute inset-0 overflow-hidden bg-gradient-to-b from-sky-900/80 via-primary/30 to-slate-950">
      <motion.div
        className="absolute inset-0 opacity-30"
        animate={{ backgroundPosition: ['0% 0%', '100% 100%'] }}
        transition={{ duration: 12, repeat: Infinity, repeatType: 'reverse' }}
        style={{
          backgroundImage:
            'radial-gradient(circle at 30% 20%, rgba(56,189,248,0.35), transparent 50%), radial-gradient(circle at 70% 80%, rgba(0,132,125,0.4), transparent 45%)',
          backgroundSize: '200% 200%',
        }}
      />

      {/* Strada che scorre */}
      <motion.div className="absolute bottom-0 left-0 right-0 h-[45%] bg-gradient-to-t from-slate-900 to-transparent">
        {[0, 1, 2, 3, 4].map((i) => (
          <motion.div
            key={i}
            className="absolute left-1/2 h-0.5 w-8 -ml-4 bg-white/25 rounded-full"
            style={{ bottom: `${12 + i * 14}%` }}
            animate={{ y: [0, 28], opacity: [0.2, 0.7, 0.2] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.15, ease: 'linear' }}
          />
        ))}
      </motion.div>

      {/* Ciclista */}
      <motion.div
        className="absolute left-1/2 bottom-[28%] -translate-x-1/2"
        animate={{ y: [0, -4, 0], x: [0, 3, 0] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
      >
        <motion.div className="w-14 h-14 rounded-full bg-white shadow-lg flex items-center justify-center border-2 border-primary">
          <Bike size={28} className="text-primary" strokeWidth={2.5} />
        </motion.div>
      </motion.div>

      {/* Pin mappa */}
      <motion.div
        className="absolute top-[22%] right-[18%] w-8 h-8 rounded-full bg-warning shadow-md flex items-center justify-center"
        animate={{ y: [0, -6, 0], scale: [1, 1.08, 1] }}
        transition={{ duration: 2.2, repeat: Infinity }}
      >
        <MapPin size={16} className="text-white" />
      </motion.div>

      <motion.div
        className="absolute bottom-3 left-2 right-2 bg-black/55 backdrop-blur-sm rounded-lg px-2 py-1.5 border border-white/10"
        animate={{ opacity: [0.85, 1, 0.85] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <p className="text-[7px] font-black uppercase text-white tracking-wider text-center leading-tight">
          SOS · Meccanici in zona
        </p>
      </motion.div>
    </motion.div>
  );
}
