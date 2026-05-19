import React, { useEffect, useRef, useState } from 'react';
import { Bike, MapPin } from 'lucide-react';
import { motion } from 'motion/react';
import { LandingCyclingAnimation } from './LandingCyclingAnimation';

function getVideoSrc(): string | null {
  const custom = import.meta.env.VITE_LANDING_VIDEO_URL?.trim();
  return custom || null;
}

/** Animazione di fallback se il file video non è disponibile */
export function LandingPhoneFallback() {
  return (
    <motion.div className="absolute inset-0 p-3 flex flex-col" style={{ transform: 'translateZ(24px)' }}>
      <div className="flex items-center gap-1.5 text-[8px] font-black uppercase text-white/80 tracking-wider">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        DB360
      </div>
      <motion.div className="flex-1 mt-2 rounded-xl border border-white/15 bg-black/30 relative overflow-hidden">
        <motion.div
          className="absolute inset-0 opacity-50"
          animate={{ backgroundPosition: ['0% 50%', '100% 50%'] }}
          transition={{ duration: 8, repeat: Infinity, repeatType: 'reverse' }}
          style={{
            backgroundImage:
              'linear-gradient(120deg, rgba(0,132,125,0.5), rgba(0,158,148,0.2), rgba(0,132,125,0.5))',
            backgroundSize: '200% 100%',
          }}
        />
        <motion.div
          className="absolute w-6 h-6 rounded-full bg-white shadow flex items-center justify-center"
          style={{ top: '35%', left: '30%' }}
          animate={{ x: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 2.5 }}
        >
          <Bike size={12} className="text-primary" />
        </motion.div>
        <motion.div
          className="absolute w-6 h-6 rounded-full bg-white shadow flex items-center justify-center"
          style={{ top: '55%', left: '55%' }}
          animate={{ y: [0, -5, 0] }}
          transition={{ repeat: Infinity, duration: 2, delay: 0.3 }}
        >
          <MapPin size={12} className="text-warning" />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

export function LandingPhoneVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const src = getVideoSrc();

  if (!src) {
    return <LandingCyclingAnimation />;
  }

  useEffect(() => {
    const video = videoRef.current;
    if (!video || failed) return;

    const tryPlay = () => {
      video.play().catch(() => {
        /* iOS: play dopo interazione — riprova al primo touch */
      });
    };

    tryPlay();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') tryPlay();
    };
    document.addEventListener('visibilitychange', onVisibility);

    const resumeOnTouch = () => {
      tryPlay();
      document.removeEventListener('touchstart', resumeOnTouch, true);
    };
    document.addEventListener('touchstart', resumeOnTouch, { capture: true, once: true });

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('touchstart', resumeOnTouch, true);
    };
  }, [failed, src]);

  if (failed) {
    return <LandingPhoneFallback />;
  }

  return (
  <div className="absolute inset-0 rounded-[1.4rem] overflow-hidden bg-black">
      {!ready && (
        <motion.div
          className="absolute inset-0 z-10 bg-primary/20"
          animate={{ opacity: [0.4, 0.8, 0.4] }}
          transition={{ repeat: Infinity, duration: 1.2 }}
        />
      )}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        poster="/logo.png"
        onLoadedData={() => setReady(true)}
        onCanPlay={() => {
          setReady(true);
          videoRef.current?.play().catch(() => {});
        }}
        onError={() => setFailed(true)}
      >
        <source src={src} type="video/mp4" />
      </video>
      <div className="absolute top-2 left-2 z-20 flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/50 backdrop-blur-sm">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
        <span className="text-[7px] font-black uppercase text-white tracking-wider">Live</span>
      </div>
    </div>
  );
}
