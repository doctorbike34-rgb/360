import React, { useRef, useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  motion,
  AnimatePresence,
  useScroll,
  useTransform,
  useMotionTemplate,
  type MotionValue,
} from 'motion/react';
import {
  Bike,
  MapPin,
  Wrench,
  ChevronRight,
  Zap,
  Users,
  Download,
  TrendingUp,
} from 'lucide-react';
import { Logo } from './Logo';
import { LandingPhoneVideo } from './LandingPhoneVideo';
import { useLandingSlideMotion, LANDING_SLIDE_COUNT } from '../lib/landingSlideMotion';
import { LandingInstallSheet } from './LandingInstallSheet';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/useAuthStore';
import { triggerPwaInstall, isPwaInstalled, markPwaInstalled } from '../lib/pwaInstall';

interface LandingPageProps {
  onStart: () => void;
  onLogin: () => void;
  onSkip: () => void;
}

const SLIDE_COUNT = LANDING_SLIDE_COUNT;

/** Layout slide: colonna su mobile, affiancato su desktop largo */
const slideStage =
  'flex-1 flex flex-col lg:flex-row lg:items-center lg:justify-center gap-3 sm:gap-4 lg:gap-10 xl:gap-14 max-w-md sm:max-w-lg lg:max-w-5xl xl:max-w-6xl mx-auto w-full min-h-0 pt-1 lg:py-4';
const phoneCol =
  'w-full max-w-[9rem] sm:max-w-[10rem] md:max-w-[11rem] lg:max-w-[13rem] xl:max-w-[15rem] shrink-0 flex justify-center landing-3d-layer lg:flex-[0_0_auto] lg:justify-end xl:pr-4';
const textColBase =
  'w-full shrink-0 flex flex-col items-center text-center px-1 pt-1 border-t lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8 xl:pl-12 lg:flex-1 lg:items-start lg:text-left lg:justify-center';

function PhoneMockup({
  scrollXProgress,
  slideIndex,
  accent = 'primary',
  children,
}: {
  scrollXProgress: MotionValue<number>;
  slideIndex: number;
  accent?: 'primary' | 'warning' | 'accent';
  children?: React.ReactNode;
}) {
  const { phoneOpacity, phoneStart, phoneMid, phoneEnd } = useLandingSlideMotion(scrollXProgress, slideIndex);

  const rotateY = useTransform(scrollXProgress, [phoneStart, phoneMid, phoneEnd], [28, 0, -28]);
  const rotateX = useTransform(scrollXProgress, [phoneStart, phoneMid, phoneEnd], [6, 0, -6]);
  const z = useTransform(scrollXProgress, [phoneStart, phoneMid, phoneEnd], [50, 100, 50]);
  const x = useTransform(scrollXProgress, [phoneStart, phoneMid, phoneEnd], [20, 0, -20]);
  const scale = useTransform(scrollXProgress, [phoneStart, phoneMid, phoneEnd], [0.9, 1, 0.9]);
  const transform = useMotionTemplate`translate3d(${x}px, 0, ${z}px) rotateY(${rotateY}deg) rotateX(${rotateX}deg) scale(${scale})`;

  const accentBg =
    accent === 'warning' ? 'from-warning/30' : accent === 'accent' ? 'from-accent/30' : 'from-primary/30';

  return (
    <motion.div
      style={{ transform, opacity: phoneOpacity }}
      className="landing-3d-layer relative w-full aspect-[9/17] mx-auto shrink-0"
    >
      <div className="absolute inset-0 rounded-[1.75rem] lg:rounded-[2rem] xl:rounded-[2.25rem] bg-gradient-to-b from-slate-900 to-slate-950 p-1.5 lg:p-2 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.7)] border border-white/15">
        <motion.div
          className={`h-full w-full rounded-[1.4rem] lg:rounded-[1.65rem] xl:rounded-[1.85rem] overflow-hidden relative ${children ? 'bg-black' : `bg-gradient-to-br ${accentBg} to-slate-900/80`}`}
          style={{ transform: 'translateZ(18px)' }}
        >
          {children ?? (
            <motion.div className="absolute inset-0 p-3 flex flex-col" style={{ transform: 'translateZ(24px)' }}>
              <div className="flex items-center gap-1.5 text-[8px] font-black uppercase text-white/80 tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                DB360
              </div>
              <div className="flex-1 mt-2 rounded-xl border border-white/15 bg-black/30 relative overflow-hidden">
                <motion.div
                  className="absolute w-6 h-6 rounded-full bg-white shadow flex items-center justify-center"
                  style={{ top: '35%', left: '30%', transform: 'translateZ(32px)' }}
                  animate={{ x: [0, 8, 0] }}
                  transition={{ repeat: Infinity, duration: 2.5 }}
                >
                  <Bike size={12} className="text-primary" />
                </motion.div>
                <motion.div
                  className="absolute w-6 h-6 rounded-full bg-white shadow flex items-center justify-center"
                  style={{ top: '55%', left: '55%', transform: 'translateZ(36px)' }}
                  animate={{ y: [0, -5, 0] }}
                  transition={{ repeat: Infinity, duration: 2, delay: 0.3 }}
                >
                  <MapPin size={12} className="text-warning" />
                </motion.div>
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}

function SlidePanel({
  scrollXProgress,
  slideIndex,
  accent,
  icon,
  badge,
  title,
  subtitle,
  bullets,
  phoneExtra,
}: {
  scrollXProgress: MotionValue<number>;
  slideIndex: number;
  accent: 'primary' | 'warning' | 'accent';
  icon: React.ReactNode;
  badge: string;
  title: string;
  subtitle: string;
  bullets?: string[];
  phoneExtra?: React.ReactNode;
}) {
  const borderAccent =
    accent === 'warning' ? 'border-warning/30' : accent === 'accent' ? 'border-accent/30' : 'border-primary/30';

  return (
    <section
      className="min-w-full w-full h-full snap-center snap-always shrink-0 flex flex-col px-4 sm:px-6 lg:px-10 xl:px-16 pt-[3.75rem] sm:pt-16 lg:pt-[4.5rem] pb-[8.75rem] sm:pb-[9rem] lg:pb-[9.5rem] overflow-y-auto no-scrollbar"
      aria-label={title}
    >
      <div className={slideStage}>
        <div className={phoneCol}>
          <PhoneMockup scrollXProgress={scrollXProgress} slideIndex={slideIndex} accent={accent}>
            {phoneExtra}
          </PhoneMockup>
        </div>

        <div className={`${textColBase} ${borderAccent}`}>
          <div className="w-11 h-11 sm:w-12 sm:h-12 lg:w-14 lg:h-14 rounded-xl bg-white/10 flex items-center justify-center text-white mb-3 -mt-6 lg:mt-0 ring-4 ring-[#020f0e]">
            {icon}
          </div>
          <p className="text-accent text-[10px] sm:text-xs lg:text-sm font-black uppercase tracking-[0.15em] mb-1 lg:mb-2">
            {badge}
          </p>
          <h2 className="text-xl sm:text-2xl lg:text-3xl xl:text-4xl font-black uppercase italic leading-[1.1] text-white px-1 lg:px-0">
            {title}
          </h2>
          <p className="text-white/80 text-xs sm:text-sm lg:text-base xl:text-lg mt-2 lg:mt-3 leading-relaxed font-medium max-w-[20rem] lg:max-w-xl xl:max-w-2xl">
            {subtitle}
          </p>
          {bullets && bullets.length > 0 && (
            <ul className="mt-3 lg:mt-5 space-y-2 lg:space-y-2.5 w-full max-w-[20rem] lg:max-w-xl text-left">
              {bullets.map((b) => (
                <li key={b} className="flex gap-2 sm:gap-2.5 text-[11px] sm:text-xs lg:text-sm xl:text-base text-white/70 leading-snug">
                  <ChevronRight size={14} className="text-accent shrink-0 mt-0.5 lg:w-4 lg:h-4" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

export function LandingPage({ onStart, onLogin, onSkip }: LandingPageProps) {
  const { t } = useTranslation();
  const { deferredPrompt, setDeferredPrompt } = useAuthStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { scrollXProgress } = useScroll({ container: scrollRef, axis: 'x' });
  /** Progress diretto per testi (evita lag del spring che nascondeva slide 1). */
  const smoothX = scrollXProgress;
  const [activeSlide, setActiveSlide] = useState(0);
  const [showInstallSheet, setShowInstallSheet] = useState(false);
  const installedApp = isPwaInstalled();

  // Ensure iOS safe-area/background outside the app container
  // matches the landing (avoids the white strip under the CTA).
  useEffect(() => {
    const prev = document.documentElement.style.getPropertyValue('--app-viewport-bg');
    document.documentElement.style.setProperty('--app-viewport-bg', '#020f0e');
    return () => {
      if (prev) document.documentElement.style.setProperty('--app-viewport-bg', prev);
      else document.documentElement.style.removeProperty('--app-viewport-bg');
    };
  }, []);

  const handleInstallApp = async () => {
    if (installedApp) {
      onStart();
      return;
    }

    try {
      const result = await triggerPwaInstall(deferredPrompt);
      if (result === 'accepted') {
        markPwaInstalled();
        setDeferredPrompt(null);
        toast.success(t('landing.installSuccess'));
        return;
      }
      if (result === 'dismissed') {
        toast(t('landing.installDismissed'), { icon: 'ℹ️' });
        return;
      }
      if (result === 'already') {
        onStart();
        return;
      }
      setShowInstallSheet(true);
    } catch {
      setShowInstallSheet(true);
    }
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const w = el.clientWidth || 1;
      setActiveSlide(Math.round(el.scrollLeft / w));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const bgShift = useTransform(smoothX, [0, 1], ['0%', '-40%']);

  const scrollToSlide = (index: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: index * el.clientWidth, behavior: 'smooth' });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = scrollRef.current;
      if (!el) return;
      const w = el.clientWidth || 1;
      const current = Math.round(el.scrollLeft / w);
      if (e.key === 'ArrowRight' && current < SLIDE_COUNT - 1) {
        scrollToSlide(current + 1);
      } else if (e.key === 'ArrowLeft' && current > 0) {
        scrollToSlide(current - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-[100dvh] w-full max-w-[100vw] bg-[#020f0e] text-white overflow-hidden relative select-none lg:flex lg:items-stretch lg:justify-center lg:bg-[#010a09] lg:p-4 xl:p-6 pwa-shell-padding box-border"
    >
      <motion.div className="relative h-full w-full min-w-0 lg:max-w-[1280px] xl:max-w-[1400px] lg:rounded-[1.75rem] xl:rounded-[2rem] lg:overflow-hidden lg:shadow-[0_32px_80px_-24px_rgba(0,0,0,0.85)] lg:ring-1 lg:ring-white/10">
      {/* Sfondo 3D laterale */}
      <motion.div className="pointer-events-none absolute inset-0 landing-3d-stage overflow-hidden" aria-hidden>
        <motion.div
          style={{ x: bgShift }}
          className="absolute inset-y-0 w-[200%] flex"
        >
          <div className="flex-1 bg-gradient-to-r from-primary/20 via-transparent to-transparent" />
          <motion.div
            className="absolute top-1/4 -left-20 w-40 h-40 rounded-full bg-primary/25 blur-3xl landing-3d-layer"
            style={{ transform: 'translateZ(-80px) rotateY(45deg)' }}
          />
          <motion.div
            className="absolute bottom-1/4 -right-16 w-52 h-52 rounded-full bg-accent/20 blur-3xl landing-3d-layer"
            style={{ transform: 'translateZ(-100px) rotateY(-40deg)' }}
          />
        </motion.div>
        <div className="absolute inset-0 landing-grid-sides opacity-[0.12]" />
      </motion.div>

      {/* Header app */}
      <header className="absolute top-pwa-safe left-0 right-0 z-50 flex items-center justify-between gap-2 px-4 sm:px-6 lg:px-8 pb-2 lg:pb-3">
        <Logo size="sm" className="brightness-0 invert shrink-0 lg:scale-110" />
        {!installedApp && (
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 lg:px-3 lg:py-2 rounded-full bg-white/5 border border-white/10">
            <Download size={10} className="text-accent lg:w-3.5 lg:h-3.5" />
            <span className="text-[8px] sm:text-[9px] lg:text-[10px] font-black uppercase tracking-wider text-white/70">
              {t('landing.installHint')}
            </span>
          </div>
        )}
        <div className="flex items-center gap-2 lg:gap-3 shrink-0">
          <button
            type="button"
            onClick={onSkip}
            className="text-[9px] sm:text-[10px] lg:text-xs font-black uppercase tracking-widest text-white/60 px-3 py-2 lg:px-4 lg:py-2.5 rounded-full hover:text-white active:scale-95 transition-all"
          >
            {t('landing.skip')}
          </button>
          <button
            type="button"
            onClick={onLogin}
            className="text-[9px] sm:text-[10px] lg:text-xs font-black uppercase tracking-widest text-white px-3 py-2 lg:px-4 lg:py-2.5 rounded-full border border-white/25 bg-white/10 backdrop-blur-md active:scale-95 transition-all"
          >
            {t('landing.skipLogin')}
          </button>
        </div>
      </header>

      {/* Scroll orizzontale */}
      <motion.div
        ref={scrollRef}
        className="h-full w-full overflow-x-auto overflow-y-hidden flex flex-row snap-x snap-mandatory no-scrollbar landing-3d-stage relative z-10"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <SlidePanel
          scrollXProgress={smoothX}
          slideIndex={0}
          accent="primary"
          icon={<Bike size={22} />}
          badge={t('landing.slide0Badge')}
          title={t('landing.slide0Title')}
          subtitle={t('landing.slide0Subtitle')}
          bullets={[t('landing.slide0B1'), t('landing.slide0B2')]}
          phoneExtra={<LandingPhoneVideo />}
        />

        <SlidePanel
          scrollXProgress={smoothX}
          slideIndex={1}
          accent="primary"
          icon={<MapPin size={22} />}
          badge={t('landing.slide1Badge')}
          title={t('landing.slide1Title')}
          subtitle={t('landing.slide1Subtitle')}
          bullets={[t('landing.slide1B1'), t('landing.slide1B2'), t('landing.slide1B3')]}
        />

        <SlidePanel
          scrollXProgress={smoothX}
          slideIndex={2}
          accent="accent"
          icon={<Zap size={22} />}
          badge={t('landing.slide2Badge')}
          title={t('landing.slide2Title')}
          subtitle={t('landing.slide2Subtitle')}
          bullets={[t('landing.slide2B1'), t('landing.slide2B2'), t('landing.slide2B3')]}
        />

        <SlidePanel
          scrollXProgress={smoothX}
          slideIndex={3}
          accent="warning"
          icon={<Wrench size={22} />}
          badge={t('landing.slide3Badge')}
          title={t('landing.slide3Title')}
          subtitle={t('landing.slide3Subtitle')}
          bullets={[t('landing.slide3B1'), t('landing.slide3B2'), t('landing.slide3B3')]}
        />

        <SlidePanel
          scrollXProgress={smoothX}
          slideIndex={4}
          accent="accent"
          icon={<Users size={22} />}
          badge={t('landing.slide4Badge')}
          title={t('landing.slide4Title')}
          subtitle={t('landing.slide4Subtitle')}
          bullets={[t('landing.slide4B1'), t('landing.slide4B2'), t('landing.slide4B3')]}
        />

        <SlidePanel
          scrollXProgress={smoothX}
          slideIndex={5}
          accent="primary"
          icon={<TrendingUp size={22} />}
          badge={t('landing.slide5Badge')}
          title={t('landing.slide5Title')}
          subtitle={t('landing.slide5Subtitle')}
          bullets={[t('landing.slide5B1'), t('landing.slide5B2'), t('landing.slide5B3')]}
        />

        {/* CTA finale */}
        <section className="min-w-full w-full h-full snap-center shrink-0 flex flex-col px-4 sm:px-6 lg:px-10 xl:px-16 pt-14 sm:pt-16 lg:pt-[4.5rem] pb-[8.75rem] sm:pb-[9rem] lg:pb-[9.5rem]">
          <div className={`${slideStage} text-center lg:text-left`}>
            <div className={phoneCol}>
              <PhoneMockup scrollXProgress={smoothX} slideIndex={6} accent="primary">
                <div className="absolute inset-0 p-3 lg:p-4 flex flex-col items-center justify-center gap-2">
                  <Logo size="sm" className="brightness-0 invert scale-75 lg:scale-90" />
                  <p className="text-[8px] lg:text-[10px] font-black uppercase text-center text-white/90 tracking-widest">
                    {t('landing.ready')}
                  </p>
                </div>
              </PhoneMockup>
            </div>
            <div className={`${textColBase} border-primary/30`}>
              <p className="text-accent text-[10px] sm:text-xs lg:text-sm font-black uppercase tracking-widest mb-2 lg:mb-3">
                {t('landing.slide6Badge')}
              </p>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl xl:text-5xl font-black uppercase italic leading-tight">
                {t('landing.slide6Title')}
              </h2>
              <p className="text-white/75 text-sm sm:text-base lg:text-lg xl:text-xl mt-3 lg:mt-4 leading-relaxed max-w-[18rem] lg:max-w-xl xl:max-w-2xl mx-auto lg:mx-0">
                {t('landing.slide6Subtitle')}
              </p>
            </div>
          </div>
        </section>
      </motion.div>

      {/* Footer navigazione app */}
      <footer className="absolute bottom-0 left-0 right-0 z-50 px-4 sm:px-6 lg:px-8 pb-safe pt-3 lg:pt-4 bg-gradient-to-t from-[#020f0e] from-80% to-transparent">
        <div className="flex items-center justify-between gap-2 mb-2 sm:mb-3 max-w-md sm:max-w-lg lg:max-w-2xl mx-auto">
          <span className="text-white/40 text-[8px] sm:text-[9px] lg:text-[10px] font-black uppercase tracking-widest">
            <span className="lg:hidden">{t('landing.swipeHint')}</span>
            <span className="hidden lg:inline">{t('landing.swipeHintDesktop')}</span>
          </span>
          <div className="flex gap-1 lg:gap-1.5">
            {Array.from({ length: SLIDE_COUNT }).map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Slide ${i + 1}`}
                onClick={() => scrollToSlide(i)}
                className={`h-1.5 lg:h-2 rounded-full transition-all ${
                  activeSlide === i ? 'w-5 lg:w-7 bg-accent' : 'w-1.5 lg:w-2 bg-white/25'
                }`}
              />
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={handleInstallApp}
          className="w-full max-w-md sm:max-w-lg lg:max-w-2xl mx-auto block py-3.5 lg:py-4 rounded-2xl bg-primary text-white font-black uppercase tracking-widest text-xs sm:text-sm lg:text-base border border-white/10 shadow-[0_8px_32px_-8px_rgba(0,132,125,0.8)] active:scale-[0.98] hover:brightness-110 transition-all"
        >
          {installedApp ? t('landing.openApp') : t('landing.stickyCta')}
        </button>
        {!installedApp && (
          <button
            type="button"
            onClick={onStart}
            className="w-full max-w-md sm:max-w-lg lg:max-w-2xl mx-auto block mt-1.5 lg:mt-2 py-2 lg:py-2.5 text-[10px] sm:text-xs lg:text-sm font-bold text-white/45 uppercase tracking-wider hover:text-white/60 transition-colors"
          >
            {t('landing.continueBrowser')}
          </button>
        )}
      </footer>
      </motion.div>

      <AnimatePresence>
        {showInstallSheet && (
          <LandingInstallSheet
            onClose={() => setShowInstallSheet(false)}
            onContinueInBrowser={() => {
              setShowInstallSheet(false);
              onStart();
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
