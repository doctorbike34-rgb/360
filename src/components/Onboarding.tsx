import toast from 'react-hot-toast';
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { 
  Zap, 
  Users, 
  Smartphone, 
  ArrowRight, 
  Check, 
  Smartphone as PhoneIcon,
  Download,
  Share,
  PlusSquare,
  MoreVertical,
  Loader2,
  X,
  Bell,
  Shield
} from 'lucide-react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { useAuthStore } from '../store/useAuthStore';
import { getCloudFunctionUrl } from '../config/env';
import { confirmSubscriptionCheckout } from '../lib/subscriptionCheckout';
import { peekStripeSessionId, clearStripeReturnStorage } from '../lib/stripeReturnStorage';
import { formatFeePercentLabel, PEER_MECHANIC_FEE_PERCENT } from '../lib/platformFees';

interface OnboardingProps {
  onComplete: () => void;
  profile: any;
}

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete, profile }) => {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const { user, deferredPrompt } = useAuthStore();
  const [isFinishing, setIsFinishing] = useState(false);
  // Pre-populate from profile.plan so returning-from-Stripe users don't get blocked
  const [selectedPlan, setSelectedPlan] = useState<string | null>(profile?.plan || null);

  const installPWA = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
  };

  const [peerSkills, setPeerSkills] = useState<string[]>([]);
  const [customSkills, setCustomSkills] = useState<string[]>([]);
  const [newSkillText, setNewSkillText] = useState('');
  const [peerRate, setPeerRate] = useState(15);
  const [peerRadius, setPeerRadius] = useState(10);
  
  const [email, setEmail] = useState(profile?.email || '');

  const [consents, setConsents] = useState({
    privacyPolicy: false,
    termsOfService: false,
    dataProcessing: false,
    marketing: false
  });

  const contactStep = {
    id: 'contact',
    title: 'Informazioni di Contatto',
    desc: 'Inserisci la tua email per ricevere aggiornamenti sullo stato del tuo account e SOS.',
    icon: <Bell className="text-primary" size={48} />,
    gradient: 'from-primary/20 to-primary/5',
    image: 'https://images.unsplash.com/photo-1512314889357-e157c22f938d?auto=format&fit=crop&q=80&w=1000'
  };

  const gdprStep = {
    id: 'gdpr',
    title: 'Privacy & Legal',
    desc: 'Per iniziare, conferma di aver letto e accettato i nostri termini.',
    icon: <Shield className="text-accent" size={48} />,
    gradient: 'from-accent/20 to-accent/5',
    image: 'https://images.unsplash.com/photo-1512314889357-e157c22f938d?auto=format&fit=crop&q=80&w=1000'
  };

  const cyclistBaseSteps = [
    {
      id: 'step1',
      title: t('auth.onboardingStep1Title', { defaultValue: 'Benvenuto' }),
      desc: t('auth.onboardingStep1Desc', { defaultValue: 'Esplora la mappa e trova supporto quando ne hai bisogno.' }),
      icon: <Zap className="text-accent" size={48} />,
      gradient: 'from-accent/20 to-accent/5',
      image: 'https://images.unsplash.com/photo-1511994298241-608e28f14fde?auto=format&fit=crop&q=80&w=1000'
    },
    {
      id: 'step2',
      title: t('auth.onboardingStep2Title', { defaultValue: 'Interventi veloci' }),
      desc: t('auth.onboardingStep2Desc', { defaultValue: 'Contatta i meccanici vicini a te con un tap.' }),
      icon: <Users className="text-primary" size={48} />,
      gradient: 'from-primary/20 to-primary/5',
      image: 'https://images.unsplash.com/photo-1541625602330-2277a4c46182?auto=format&fit=crop&q=80&w=1000'
    }
  ];

  const mechanicBaseSteps = [
    {
      id: 'mech_step1',
      title: 'Nuovi Clienti',
      desc: 'Scopri come trovare nuovi clienti e gestire le richieste di intervento nella tua zona in tempo reale.',
      icon: <Zap className="text-accent" size={48} />,
      gradient: 'from-accent/20 to-accent/5',
      image: 'https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?auto=format&fit=crop&q=80&w=1000'
    },
    {
      id: 'mech_step2',
      title: 'Espandi il business',
      desc: 'Mostra la tua disponibilità, accetta le richieste e fai crescere la tua attività.',
      icon: <Users className="text-primary" size={48} />,
      gradient: 'from-primary/20 to-primary/5',
      image: 'https://images.unsplash.com/photo-1541625602330-2277a4c46182?auto=format&fit=crop&q=80&w=1000'
    }
  ];

  const peerMechanicBaseSteps = [
    {
      id: 'peer_step1',
      title: 'Assistenza e Guadagno',
      desc: `Aiuta altri ciclisti in difficoltà e guadagna con un rimborso spese. Come ciclista esperto, commissione piattaforma fissa del ${formatFeePercentLabel(PEER_MECHANIC_FEE_PERCENT)} su ogni intervento.`,
      icon: <Zap className="text-[#14B8A6]" size={48} />,
      gradient: 'from-[#14B8A6]/20 to-[#14B8A6]/5',
      image: 'https://images.unsplash.com/photo-1511994298241-608e28f14fde?auto=format&fit=crop&q=80&w=1000'
    },
    {
      id: 'peer_step2',
      title: 'Eventi e Community',
      desc: 'Crea gruppi, organizza uscite ed eventi con gli altri membri della community di ciclisti.',
      icon: <Users className="text-primary" size={48} />,
      gradient: 'from-primary/20 to-primary/5',
      image: 'https://images.unsplash.com/photo-1541625602330-2277a4c46182?auto=format&fit=crop&q=80&w=1000'
    }
  ];

  const planStep = {
      id: 'plan',
      title: 'Scegli il Piano',
      desc: 'Crea un piano di abbonamento e inizia a ricevere richieste.',
      icon: <Check className="text-accent" size={48} />,
      gradient: 'from-accent/20 to-accent/5',
      image: 'https://images.unsplash.com/photo-1581092795360-fd1ca04f0952?auto=format&fit=crop&q=80&w=1000'
  };

  const peerSkillsStep = {
      id: 'peerSkills',
      title: "Competenze",
      desc: "Seleziona le tue competenze ciclistiche",
      icon: <Check className="text-teal-500" size={48} />,
      gradient: 'from-[#14B8A6]/20 to-[#14B8A6]/5',
      image: 'https://images.unsplash.com/photo-1576403061268-d069da1922fa?auto=format&fit=crop&q=80&w=1000'
  };

  const peerTermsStep = {
      id: 'peerTerms',
      title: "Tariffa e Raggio",
      // eslint-disable-next-line no-useless-escape
      desc: "Definisci il tuo rimborso spese e l\'area di disponibilità.",
      icon: <Zap className="text-teal-500" size={48} />,
      gradient: 'from-[#14B8A6]/20 to-[#14B8A6]/5',
      image: 'https://images.unsplash.com/photo-1512314889357-e157c22f938d?auto=format&fit=crop&q=80&w=1000'
  };

  const finalStep = {
      id: 'final',
      title: t('auth.onboardingStep3Title'),
      desc: profile?.role === 'MECHANIC' ? 'Inizia subito ad accettare i SOS!' : (profile?.role === 'PEER_MECHANIC' ? 'Ora puoi aiutare la community, gestire gruppi ed eventi!' : t('auth.onboardingStep3Desc')),
      icon: <Smartphone className="text-black " size={48} />,
      gradient: 'from-grey/20 to-grey/5',
      image: 'https://images.unsplash.com/photo-1512314889357-e157c22f938d?auto=format&fit=crop&q=80&w=1000'
  };

  // useMemo to stabilize activeSteps reference for useEffect closure
  const activeSteps: any[] = React.useMemo(() => {
    if (profile?.role === 'MECHANIC') {
      return [gdprStep, contactStep, ...mechanicBaseSteps, planStep, finalStep];
    } else if (profile?.role === 'PEER_MECHANIC') {
      return [gdprStep, ...peerMechanicBaseSteps, peerSkillsStep, peerTermsStep, finalStep];
    } else {
      return [gdprStep, ...cyclistBaseSteps, finalStep];
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.role]);

  const plans = [
    { 
      id: 'BASE', 
      title: 'BASE', 
      price: '€29/mese', 
      priceValue: 29,
      features: ['Visibilità standard', 'Commissione 15%', 'Supporto base'],
    },
    { 
      id: 'CLUB', 
      title: 'CLUB', 
      price: '€59/mese', 
      priceValue: 59,
      features: ['Meccanico in primo piano', 'Commissione 10%', 'Badge ARGENTO'],
    },
    { 
      id: 'PRO', 
      title: 'PRO', 
      price: '€99/mese', 
      priceValue: 99,
      features: ['Visibilità prioritaria', 'Commissione 5%', 'Badge ORO'],
    }
  ];

  const [confirmingPlan, setConfirmingPlan] = useState<string | null>(null);
  const stripeReturnRef = useRef(false);

  useEffect(() => {
    if (!user || stripeReturnRef.current || profile?.role !== 'MECHANIC') return;
    const sessionId = peekStripeSessionId();
    if (!sessionId) return;

    stripeReturnRef.current = true;

    // Fast path: if Firestore already updated the plan (webhook beat us back),
    // skip the Cloud Function call and jump straight to the final step.
    if (profile?.plan && profile.plan !== 'MECHANIC_FREE') {
      clearStripeReturnStorage();
      setSelectedPlan(profile.plan);
      toast.success(`Piano ${profile.plan} attivato!`);
      const finalIdx = activeSteps.findIndex((s: any) => s.id === 'final');
      if (finalIdx >= 0) setStep(finalIdx);
      return;
    }

    void (async () => {
      setIsFinishing(true);
      try {
        let result = await confirmSubscriptionCheckout(sessionId);
        if (result.pending) {
          await new Promise((r) => setTimeout(r, 2500));
          result = await confirmSubscriptionCheckout(sessionId);
        }
        if (result.success && result.planId) {
          clearStripeReturnStorage();
          setSelectedPlan(result.planId);
          setConfirmingPlan(null);
          toast.success(`Piano ${result.planId} attivato!`);
          const finalIdx = activeSteps.findIndex((s: any) => s.id === 'final');
          if (finalIdx >= 0) setStep(finalIdx);
        } else if (result.pending) {
          toast('Pagamento in elaborazione. Attendi qualche secondo e riapri l\'app.', { icon: '⏳' });
        } else if (profile?.plan) {
          clearStripeReturnStorage();
          setSelectedPlan(profile.plan);
          toast.success(`Piano ${profile.plan} già attivo.`);
          const finalIdx = activeSteps.findIndex((s: any) => s.id === 'final');
          if (finalIdx >= 0) setStep(finalIdx);
        }
      } catch (e) {
        console.error('Stripe return onboarding', e);
        if (profile?.plan) {
          clearStripeReturnStorage();
          setSelectedPlan(profile.plan);
          toast.success(`Pagamento ricevuto. Piano ${profile.plan} attivo.`);
          const finalIdx = activeSteps.findIndex((s: any) => s.id === 'final');
          if (finalIdx >= 0) setStep(finalIdx);
        } else {
          toast.error('Errore attivazione abbonamento. Contatta assistenza se il pagamento è andato a buon fine.');
        }
      } finally {
        setIsFinishing(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profile?.role, profile?.plan, activeSteps]);

  const initStripeUpgrade = async (planId: string) => {
    if (!user) return false;
    const plan = plans.find(p => p.id === planId);
    if (!plan) return false;
    setIsFinishing(true);
    try {
      console.log('Initializing Stripe payment for plan:', planId, 'Amount:', plan.priceValue);
      
      const idToken = await user.getIdToken();
      const returnUrl = `${window.location.origin}/?stripe_return=onboarding`;
      const response = await fetch(getCloudFunctionUrl('createCheckoutSession'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
          'X-Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          amount: plan.priceValue,
          currency: 'eur',
          type: 'SUBSCRIPTION',
          planId: plan.id,
          returnUrl,
          token: idToken
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('Failed to create checkout session');
      }
    } catch (err: any) {
      console.error('Error creating payment intent (DETAILED):', err);
      // Detailed logging for mobile debugging
      if (err instanceof Error) {
        console.error('Error Message:', err.message);
        console.error('Error Stack:', err.stack);
      }
      toast.error('Errore inizializzazione pagamento: ' + (err.message || 'Errore sconosciuto'));
      setIsFinishing(false);
      return false;
    }
  };

  const handleNext = async () => {
    if (step < activeSteps.length - 1) {
      if (activeSteps[step].id === 'contact') {
        if (!email || !email.includes('@')) {
          toast.error('Inserisci un indirizzo email valido.');
          return;
        }
      }
      if (activeSteps[step].id === 'gdpr') {
        if (!consents.privacyPolicy || !consents.termsOfService || !consents.dataProcessing) {
          toast.error('Per favore accetta i termini obbligatori per continuare.');
          return;
        }
      }
      if (profile?.role === 'MECHANIC' && activeSteps[step].id === 'plan') {
        if (!selectedPlan) {
          toast.error('Seleziona un piano o usa "Scopri l\'app" per continuare senza andare online.');
          return;
        }
        setConfirmingPlan(selectedPlan);
        return; 
      }
      if (profile?.role === 'PEER_MECHANIC' && activeSteps[step].id === 'peerSkills') {
         if (peerSkills.length === 0) {
             toast.error('Seleziona almeno una competenza.');
             return;
         }
      }
      setStep(step + 1);
    } else {
      setIsFinishing(true);
      if (user) {
        try {
          const updateData: any = {
            hasCompletedOnboarding: true,
            consents: consents,
            notificationPreferences: {
              sosAlerts: true,
              newJobs: true,
              communityUpdates: true,
              marketing: consents.marketing
            },
            updatedAt: serverTimestamp()
          };
          if (profile?.role === 'MECHANIC' && selectedPlan) {
            updateData.plan = selectedPlan;
          }
          if (email) {
            updateData.email = email;
          }
          if (profile?.role === 'PEER_MECHANIC') {
            updateData.peerMechanicSkills = peerSkills;
            updateData.peerMechanicRate = peerRate;
            updateData.peerMechanicRadius = peerRadius;
          }
          await setDoc(doc(db, 'users', user?.uid), updateData, { merge: true });
          onComplete();
        } catch (e) {
          console.error('Error completing onboarding:', e);
          toast.error('Errore durante il salvataggio. Riprova.');
          setIsFinishing(false);
        }
      } else {
        onComplete();
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-white flex flex-col items-center justify-center px-6 pwa-fixed-shell text-center overflow-hidden">
      
      <button 
        type="button"
        onClick={async () => {
          const stepId = activeSteps[step]?.id;
          if (stepId === 'gdpr' && (!consents.privacyPolicy || !consents.termsOfService || !consents.dataProcessing)) {
            toast.error('Accetta i termini obbligatori prima di uscire.');
            return;
          }
          if (user) {
            try {
              await setDoc(doc(db, 'users', user.uid), {
                hasCompletedOnboarding: true,
                skippedOnboarding: true,
                updatedAt: serverTimestamp(),
              }, { merge: true });
            } catch (e) {
              console.error('skip onboarding', e);
            }
          }
          toast('Puoi completare il profilo più tardi dalle impostazioni', { icon: 'ℹ️' });
          onComplete();
        }}
        className="absolute top-6 top-pwa-safe right-6 z-[250] p-2 bg-black/10 text-black rounded-full hover:bg-black/20 transition-colors backdrop-blur-md"
        aria-label="Salta introduzione"
      >
        <X size={20} />
      </button>

      <AnimatePresence mode="wait">
        <motion.img 
          key={`bg-${step}`}
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 0.1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7 }}
          src={activeSteps[step].image}
          className="absolute inset-0 w-full h-full object-cover z-0"
        />
      </AnimatePresence>
      <div className="absolute inset-0 bg-gradient-to-t from-white via-white/80 to-transparent z-0 pointer-events-none" />

      <AnimatePresence mode="wait">
        {confirmingPlan ? (
           <motion.div
            key="confirm-plan"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.1, y: -20 }}
            className="relative z-10 w-full max-w-sm flex-1 flex flex-col justify-center overflow-y-auto no-scrollbar py-4"
          >
             <div className="bg-white p-8 rounded-[2.5rem] border-2 border-primary/20 shadow-2xl text-center backdrop-blur-md">
                <div className="w-16 h-16 bg-primary/10 rounded-full mx-auto flex items-center justify-center text-primary mb-4">
                   <Check size={32} />
                </div>
                <h2 className="text-xl font-black uppercase italic mb-2 text-black">Conferma Abbonamento</h2>
                <div className="bg-grey/5 p-4 rounded-2xl mb-6 text-left border border-grey/10">
                   <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] font-black text-grey uppercase tracking-widest">Piano Scelto</span>
                      <span className="font-black text-primary">{plans.find(p => p.id === confirmingPlan)?.title}</span>
                   </div>
                   <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black text-grey uppercase tracking-widest">Prezzo Mensile</span>
                      <span className="font-black text-black">€{plans.find(p => p.id === confirmingPlan)?.priceValue}</span>
                   </div>
                </div>
                <p className="text-[10px] text-grey font-bold uppercase tracking-widest mb-6">
                   Procedendo verrai reindirizzato al sistema di pagamento sicuro Stripe.
                </p>
                <div className="flex flex-col gap-3">
                   <button 
                     onClick={() => initStripeUpgrade(confirmingPlan)}
                     disabled={isFinishing}
                     className="w-full bg-primary text-white py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-primary/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                   >
                      {isFinishing ? <Loader2 size={16} className="animate-spin" /> : 'Procedi al Pagamento'}
                   </button>
                   <button 
                     onClick={() => setConfirmingPlan(null)}
                     className="w-full py-3 text-[10px] font-black text-grey uppercase tracking-widest"
                   >
                      Annulla e Cambia Piano
                   </button>
                </div>
             </div>
           </motion.div>
         ) : (
          <motion.div
            key={step}
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 1.1, y: -20 }}
          className="relative z-10 w-full max-w-sm flex-1 flex flex-col justify-center overflow-y-auto no-scrollbar py-4"
        >
          <div className={`w-20 h-20 rounded-[1.5rem] bg-gradient-to-br ${activeSteps[step].gradient} flex shrink-0 items-center justify-center mx-auto mb-6 shadow-xl border border-white/10 backdrop-blur-md`}>
            {activeSteps[step].icon}
          </div>
          
          <h2 className="text-2xl font-black text-black uppercase italic tracking-tight mb-2 drop-shadow-md shrink-0">
            {activeSteps[step].title}
          </h2>
          
          <p className="text-black/80 font-bold text-xs leading-relaxed mb-6 drop-shadow-md shrink-0">
            {activeSteps[step].desc}
          </p>

          {/* GDPR Step UI */}
          {activeSteps[step].id === 'gdpr' && (
             <div className="space-y-4 mb-6 text-left shrink-0 bg-white/50 p-4 rounded-3xl backdrop-blur-md border border-white/20">
                <OnboardingConsent 
                  label="Accetto l'Informativa Privacy" 
                  checked={consents.privacyPolicy} 
                  required
                  onChange={(v) => setConsents({...consents, privacyPolicy: v})} 
                />
                <OnboardingConsent 
                  label="Accetto i Termini di Servizio" 
                  checked={consents.termsOfService} 
                  required
                  onChange={(v) => setConsents({...consents, termsOfService: v})} 
                />
                <OnboardingConsent 
                  label="Consenso al trattamento dati GPS" 
                  checked={consents.dataProcessing} 
                  required
                  onChange={(v) => setConsents({...consents, dataProcessing: v})} 
                />
                <OnboardingConsent 
                  label="Ricevi offerte e novità (Marketing)" 
                  checked={consents.marketing} 
                  onChange={(v) => setConsents({...consents, marketing: v})} 
                />
             </div>
          )}

          {/* Contact Step UI */}
          {activeSteps[step].id === 'contact' && (
             <div className="space-y-4 mb-6 text-left shrink-0 bg-white/50 p-6 rounded-3xl backdrop-blur-md border border-white/20 shadow-xl">
                <div className="flex items-center gap-2 mb-2">
                   <Bell size={14} className="text-primary" />
                   <p className="text-black/80 font-black text-[10px] uppercase tracking-wider">Email per comunicazioni</p>
                </div>
                <input 
                  type="email"
                  placeholder="la-tua@email.com"
                  className="w-full bg-white p-4 rounded-2xl text-black text-sm outline-none ring-1 ring-black/10 focus:ring-2 focus:ring-primary border-none transition-all font-bold"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <p className="text-black/40 text-[9px] font-bold leading-relaxed px-1">
                  Usiamo questa email per confermare l'approvazione del tuo account e per inviarti le notifiche SOS e le ricevute.
                </p>
             </div>
          )}

          {/* Plan Step UI */}
          {profile?.role === 'MECHANIC' && activeSteps[step].id === 'plan' && (
             <div className="space-y-3 mb-6 text-left shrink-0">
                {plans.map((plan) => (
                   <button 
                     key={plan.id}
                     onClick={() => setSelectedPlan(plan.id)}
                     className={`w-full p-4 rounded-3xl border-2 flex flex-col transition-all backdrop-blur-md ${selectedPlan === plan.id ? 'border-primary bg-primary/20 text-black shadow-[0_0_30px_-5px_rgba(var(--color-primary),0.3)] scale-[1.02]' : 'border-black/10 bg-black/5 text-black/70 hover:bg-black/10'}`}
                   >
                     <div className="flex w-full justify-between items-center mb-1.5">
                       <span className={`font-black uppercase text-xs ${selectedPlan === plan.id ? 'text-black' : 'text-black/90'}`}>{plan.title}</span>
                       <span className={`font-black text-[10px] ${selectedPlan === plan.id ? 'text-primary drop-shadow-md' : 'text-primary/70'}`}>{plan.price}</span>
                     </div>
                     <ul className={`text-[9px] font-bold space-y-1 text-left ${selectedPlan === plan.id ? 'text-black/90' : 'text-black/50'}`}>
                       {plan.features.map(f => <li key={f}>• {f}</li>)}
                     </ul>
                   </button>
                ))}
             </div>
          )}

          {profile?.role === 'MECHANIC' && activeSteps[step].id === 'plan' && (
             <button
               onClick={() => { setSelectedPlan('MECHANIC_FREE'); setStep(step + 1); }}
               className="mb-6 shrink-0 text-[10px] font-black text-black/70 uppercase tracking-widest hover:text-black transition-colors bg-black/10 px-6 py-3 rounded-full backdrop-blur-md border border-black/10 hover:bg-black/20 active:scale-95"
             >
               Scopri l'app (Non potrai andare online)
             </button>
          )}

          {/* Peer Mechanic Skills Step UI */}
          {profile?.role === 'PEER_MECHANIC' && activeSteps[step].id === 'peerSkills' && (
             <div className="space-y-3 mb-6 text-left shrink-0">
                <p className="text-black/80 font-bold text-xs mb-3">Seleziona cosa sei in grado di riparare:</p>
                {['Foratura', 'Catena', 'Regolazione Cambio', 'Freni', 'Centratura Ruota', ...customSkills].map((skill) => (
                    <label key={skill} className="flex items-center gap-3 bg-black/5 p-3 rounded-xl cursor-pointer hover:bg-black/10 transition-colors">
                        <input 
                            type="checkbox" 
                            className="w-5 h-5 accent-[#14B8A6]"
                            checked={peerSkills.includes(skill)}
                            onChange={(e) => {
                                if (e.target.checked) setPeerSkills([...peerSkills, skill]);
                                else setPeerSkills(peerSkills.filter(s => s !== skill));
                            }}
                        />
                        <span className="text-black font-bold text-sm">{skill}</span>
                    </label>
                ))}
                <div className="flex gap-2 items-center mt-4 border-t border-black/5 pt-4">
                    <input 
                        type="text" 
                        placeholder="Altra abilità (es. Sostituzione raggi)"
                        className="flex-1 bg-black/5 p-3 rounded-xl text-black text-sm outline-none focus:ring-2 focus:ring-[#14B8A6] border border-transparent focus:border-[#14B8A6]/20 transition-all font-medium placeholder:text-black/30"
                        value={newSkillText}
                        onChange={(e) => setNewSkillText(e.target.value)}
                        onKeyDown={(e) => {
                            if(e.key === 'Enter') {
                                e.preventDefault();
                                const trimmed = newSkillText.trim();
                                const defaultSkills = ['Foratura', 'Catena', 'Regolazione Cambio', 'Freni', 'Centratura Ruota'];
                                if(trimmed && !defaultSkills.includes(trimmed) && !customSkills.includes(trimmed)) {
                                    setCustomSkills([...customSkills, trimmed]);
                                    setPeerSkills([...peerSkills, trimmed]);
                                    setNewSkillText('');
                                }
                            }
                        }}
                    />
                    <button 
                        type="button"
                        className="bg-[#14B8A6] text-white px-5 py-3 rounded-xl font-black text-[10px] uppercase tracking-wider active:scale-95 transition-transform shrink-0 shadow-lg shadow-[#14B8A6]/20"
                        onClick={() => {
                            const trimmed = newSkillText.trim();
                            const defaultSkills = ['Foratura', 'Catena', 'Regolazione Cambio', 'Freni', 'Centratura Ruota'];
                            if(trimmed && !defaultSkills.includes(trimmed) && !customSkills.includes(trimmed)) {
                                setCustomSkills([...customSkills, trimmed]);
                                setPeerSkills([...peerSkills, trimmed]);
                                setNewSkillText('');
                            }
                        }}
                    >
                        Aggiungi
                    </button>
                </div>
             </div>
          )}

          {/* Peer Mechanic Terms Step UI */}
          {profile?.role === 'PEER_MECHANIC' && activeSteps[step].id === 'peerTerms' && (
             <div className="space-y-6 mb-6 text-left shrink-0">
                <div>
                   <p className="text-black/80 font-bold text-xs mb-2">Tariffa Base (Rimborso spese):</p>
                   <div className="flex items-center gap-4 bg-black/5 p-4 rounded-2xl">
                       <input 
                           type="range" 
                           min="5" max="30" step="5"
                           value={peerRate}
                           onChange={(e) => setPeerRate(Number(e.target.value))}
                           className="flex-1 accent-[#14B8A6]"
                       />
                       <span className="text-black font-black text-xl w-12 text-right">€{peerRate}</span>
                   </div>
                   <p className="text-black/50 text-[10px] mt-2">La tariffa deve riflettere il solo rimborso spese e tempo, non costituisce attività professionale.</p>
                </div>
                <div>
                   <p className="text-black/80 font-bold text-xs mb-2">Raggio di Copertura (km):</p>
                   <div className="flex items-center gap-4 bg-black/5 p-4 rounded-2xl">
                       <input 
                           type="range" 
                           min="5" max="50" step="5"
                           value={peerRadius}
                           onChange={(e) => setPeerRadius(Number(e.target.value))}
                           className="flex-1 accent-[#14B8A6]"
                       />
                       <span className="text-black font-black text-xl w-12 text-right">{peerRadius}</span>
                   </div>
                </div>
                <p className="text-black/50 text-[10px] font-bold leading-relaxed bg-[#14B8A6]/10 p-3 rounded-xl border border-[#14B8A6]/20">
                  Su ogni intervento completato la piattaforma trattiene una commissione fissa del {formatFeePercentLabel(PEER_MECHANIC_FEE_PERCENT)} (solo ciclisti esperti). I meccanici professionisti hanno commissioni diverse in base al piano (5%, 10%, 15%).
                </p>
             </div>
          )}
          
          {activeSteps[step].id === 'final' && (
            <div className="bg-white/90 backdrop-blur-md p-6 rounded-[2.5rem] border-2 border-primary/10 mb-8 text-left shrink-0 shadow-xl shadow-black/5">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center text-white shadow-lg shadow-primary/20">
                  <Download size={24} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-black uppercase italic tracking-tight leading-none mb-1">
                    {t('auth.pwaTitle')}
                  </h3>
                  <p className="text-[10px] font-bold text-primary uppercase tracking-widest">Esperienza Completa</p>
                </div>
              </div>
              
              {deferredPrompt ? (
                 <button 
                  onClick={installPWA} 
                  className="w-full bg-primary text-white py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-primary/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                    <Smartphone size={18} /> Installa App Ora
                 </button>
              ) : (
                <div className="space-y-6">
                  <div className="flex gap-4 items-start">
                    <div className="bg-blue-600 p-2.5 rounded-xl text-white shadow-lg shadow-blue-200 shrink-0">
                      <Share size={18} />
                    </div>
                    <div>
                      <p className="text-[11px] font-black text-black uppercase mb-1 flex items-center gap-2">
                        iPhone <span className="text-[9px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">Consigliato</span>
                      </p>
                      <p className="text-[10px] text-black/60 font-medium leading-relaxed">Tocca <span className="font-bold text-blue-600 italic">Condividi</span> e poi <span className="font-bold text-primary italic">Aggiungi alla Home Screen</span>.</p>
                    </div>
                  </div>

                  <div className="flex gap-4 items-start pt-2">
                    <div className="bg-grey/10 p-2.5 rounded-xl text-black shadow-sm shrink-0">
                      <MoreVertical size={18} />
                    </div>
                    <div>
                      <p className="text-[11px] font-black text-black uppercase mb-1">Android</p>
                      <p className="text-[10px] text-black/60 font-medium leading-relaxed">Tocca i tre puntini e seleziona <span className="font-bold text-primary italic">Installa Applicazione</span>.</p>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-grey/5">
                    <div className="flex items-center gap-2 text-[10px] text-grey font-bold uppercase tracking-widest">
                      <Bell size={12} className="text-primary" />
                      Notifiche SOS attive solo dopo l'installazione
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-2 w-full max-w-sm relative z-10 shrink-0">
        <div className="flex justify-center gap-2 mb-6">
          {activeSteps.map((_, i) => (
            <div 
              key={i} 
              className={`h-1.5 rounded-full transition-all duration-500 ${step === i ? 'w-8 bg-dark' : 'w-1.5 bg-black/20'}`} 
            />
          ))}
        </div>

        <div className="flex gap-3">
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              disabled={isFinishing}
              className="px-6 bg-black/5 text-black py-5 rounded-[2rem] font-black uppercase tracking-widest text-xs shadow-sm hover:bg-black/10 active:scale-95 transition-all flex items-center justify-center"
            >
              Indietro
            </button>
          )}
          <button
            onClick={handleNext}
            disabled={isFinishing}
            className="flex-1 bg-primary text-white py-5 rounded-[2rem] font-black uppercase tracking-[0.2em] text-xs shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            {isFinishing ? (
              <div className="w-5 h-5 border-2 border-dark/30 border-t-dark rounded-full animate-spin" />
            ) : (
              <>
                {step === activeSteps.length - 1 ? t('auth.onboardingFinish') : (profile?.role === 'MECHANIC' && step === 2 ? 'Conferma Acquisto' : t('auth.onboardingNext'))}
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>

        <button 
          onClick={() => onComplete()}
          className="mt-4 text-[10px] font-black text-black/50 uppercase tracking-widest hover:text-black transition-colors drop-shadow-md"
        >
          {t('auth.onboardingSkip')}
        </button>
      </div>
    </div>
  );
};

function OnboardingConsent({ label, checked, onChange, required = false }: { label: string, checked: boolean, onChange: (v: boolean) => void, required?: boolean }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <button 
        onClick={(e) => { e.preventDefault(); onChange(!checked); }}
        className={`w-5 h-5 rounded border-2 shrink-0 transition-colors flex items-center justify-center ${checked ? 'bg-primary border-primary text-white' : 'border-black/20 bg-white/50'}`}
      >
        {checked && <Check size={14} />}
      </button>
      <span className="text-[10px] font-bold text-black/70 leading-tight">
        {label} {required && <span className="text-danger">*</span>}
      </span>
    </label>
  );
}
