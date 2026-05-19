import React from 'react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/useAuthStore';
import { motion, AnimatePresence } from 'motion/react';
import { Download, Smartphone, CheckCircle2, ChevronRight, Share, Bell, Info } from 'lucide-react';
import { safeStorage } from '../lib/storage';
import { markPwaInstalled } from '../lib/pwaInstall';

const PWA_DISMISS_KEY = 'pwa_install_dismissed_until';

export const InstallPWAOverlay: React.FC = () => {
  const { deferredPrompt, setDeferredPrompt } = useAuthStore();
  const [isIOS, setIsIOS] = React.useState(false);

  React.useEffect(() => {
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsIOS(isIOSDevice);
  }, []);

  // If already standalone, don't show anything
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
  
  if (isStandalone) return null;

  const dismissedUntil = safeStorage.getItem(PWA_DISMISS_KEY);
  if (dismissedUntil && Date.now() < parseInt(dismissedUntil, 10)) {
    return null;
  }

  // If we don't have a prompt and it's not IOS (where we show instructions), return null
  if (!deferredPrompt && !isIOS) return null;

  const remindLater = () => {
    const until = Date.now() + 7 * 24 * 60 * 60 * 1000;
    safeStorage.setItem(PWA_DISMISS_KEY, String(until));
    setDeferredPrompt(null);
    toast('Ti ricorderemo l\'installazione tra qualche giorno', { icon: 'ℹ️' });
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    if (outcome === 'accepted') markPwaInstalled();
    setDeferredPrompt(null);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[5000] bg-white flex flex-col font-sans"
      >
        {/* Background Accent */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -mr-32 -mt-32 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-accent/5 rounded-full -ml-32 -mb-32 blur-3xl pointer-events-none" />

        {/* Header / Brand */}
        <div className="pt-16 pb-10 px-8 flex flex-col items-center text-center relative">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="w-24 h-24 bg-gradient-to-br from-primary to-primary-dark rounded-[2.5rem] flex items-center justify-center text-white mb-8 shadow-2xl shadow-primary/30 relative"
          >
            <Download size={44} />
            <div className="absolute -top-2 -right-2 w-8 h-8 bg-black rounded-full border-4 border-white flex items-center justify-center">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
            </div>
          </motion.div>
          <h2 className="text-4xl font-black text-black uppercase italic leading-none tracking-tight">
            Installa <br/> <span className="text-primary text-5xl">DoctorBike</span>
          </h2>
          <p className="mt-6 text-grey font-bold text-sm max-w-[300px] leading-relaxed">
            L'assistenza meccanica professionale, <br/>sempre a portata di mano sul tuo smartphone.
          </p>
        </div>

        {/* Benefits & Info */}
        <div className="flex-1 px-8 space-y-6 overflow-y-auto pb-10">
          <div className="bg-grey/5 p-2 rounded-[2rem] border border-grey/5">
            <BenefitCard 
              icon={<Smartphone className="text-primary" size={20}/>}
              title="Accesso Rapido"
              description="Icona dedicata sulla tua Home per un lancio istantaneo."
            />
            <BenefitCard 
              icon={<Bell className="text-primary" size={20}/>}
              title="Notifiche SOS"
              description="Ricevi avvisi critici anche con lo schermo spento."
            />
            <BenefitCard 
              icon={<CheckCircle2 className="text-primary" size={20}/>}
              title="Esperienza App"
              description="Nessuna barra del browser, più spazio per l'assistenza."
            />
          </div>

          {isIOS && (
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="p-8 bg-blue-50/50 rounded-[2.5rem] border-2 border-blue-100/50 space-y-6 shadow-sm"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-blue-100 rounded-xl">
                  <Share size={18} className="text-blue-600" />
                </div>
                <p className="text-[11px] font-black uppercase text-blue-600 tracking-widest">Guida Installazione iPhone</p>
              </div>

              <div className="space-y-4">
                <InstructionStep 
                  number="1"
                  text={<>Tocca il tasto <span className="text-blue-600 font-black underline decoration-2 underline-offset-2">Condividi</span> in basso al centro</>}
                  icon={<Share size={16} className="text-blue-500" />}
                />
                <InstructionStep 
                  number="2"
                  text={<>Scorri e seleziona <span className="text-primary font-black underline decoration-2 underline-offset-2">Aggiungi alla Home</span></>}
                  icon={<div className="font-black text-lg">+</div>}
                />
              </div>

              <div className="pt-4 mt-4 border-t border-blue-100 flex gap-3 text-blue-800/60">
                <Info size={16} className="shrink-0" />
                <p className="text-[10px] font-bold leading-tight uppercase italic">
                  Nota: Su iPhone, le notifiche sono disponibili solo dopo aver aggiunto l'app alla Home Screen.
                </p>
              </div>
            </motion.div>
          )}
        </div>

        {/* Actions */}
        <div className="p-8 pb-12 bg-white/80 backdrop-blur-md border-t border-grey/5 space-y-4">
          {!isIOS ? (
            <button 
              onClick={handleInstall}
              className="w-full bg-primary text-white font-black py-6 rounded-2xl shadow-2xl shadow-primary/30 active:scale-95 transition-all text-base uppercase tracking-widest flex items-center justify-center gap-3"
            >
              Installa Ora
              <ChevronRight size={20} />
            </button>
          ) : (
            <button 
              onClick={() => {
                // Dimiss for now
                setDeferredPrompt(null);
              }}
              className="w-full bg-black text-white font-black py-6 rounded-2xl shadow-2xl shadow-black/20 active:scale-95 transition-all text-base uppercase tracking-widest"
            >
              Ho capito, procedo
            </button>
          )}

          <button
            type="button"
            onClick={remindLater}
            className="w-full text-primary font-black py-3 active:scale-95 transition-all text-[11px] uppercase tracking-[0.2em]"
          >
            Ricordamelo dopo
          </button>

          <button 
            type="button"
            onClick={() => {
              setDeferredPrompt(null);
              toast('Puoi installare l\'app in qualsiasi momento dal menu', { icon: 'ℹ️' });
            }}
            className="w-full text-grey font-black py-2 active:scale-95 transition-all text-[11px] uppercase tracking-[0.2em] opacity-60 hover:opacity-100"
          >
            Continua nel browser
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

const BenefitCard = ({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) => (
  <div className="flex gap-5 p-5 hover:bg-white rounded-3xl transition-colors">
    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shrink-0 shadow-sm border border-grey/5">
      {icon}
    </div>
    <div className="flex flex-col justify-center">
      <h4 className="font-black text-black uppercase italic text-sm tracking-tight leading-none mb-1">{title}</h4>
      <p className="text-[11px] text-grey font-bold leading-tight">{description}</p>
    </div>
  </div>
);

const InstructionStep = ({ number, text, icon }: { number: string, text: React.ReactNode, icon: React.ReactNode }) => (
  <div className="flex items-center gap-5 text-sm font-bold text-black/80 bg-white/50 p-4 rounded-2xl border border-white">
    <div className="w-8 h-8 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-blue-200 shrink-0 font-black text-xs">
      {number}
    </div>
    <div className="flex-1 leading-relaxed">
      {text}
    </div>
    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm shrink-0 border border-grey/5">
      {icon}
    </div>
  </div>
);

