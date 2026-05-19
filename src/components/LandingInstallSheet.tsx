import React from 'react';
import { motion } from 'motion/react';
import { Share, Download, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { isAndroidDevice, isIosDevice } from '../lib/pwaInstall';

interface LandingInstallSheetProps {
  onClose: () => void;
  onContinueInBrowser: () => void;
}

export function LandingInstallSheet({ onClose, onContinueInBrowser }: LandingInstallSheetProps) {
  const { t } = useTranslation();
  const ios = isIosDevice();
  const android = isAndroidDevice();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 backdrop-blur-sm p-4 pb-safe"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 120 }}
        animate={{ y: 0 }}
        exit={{ y: 120 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-white rounded-[2rem] p-6 text-black shadow-2xl"
      >
        <motion.div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
              <Download size={22} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">{t('landing.installSheetTitle')}</p>
              <p className="text-sm font-black uppercase italic text-black">{t('landing.installSheetSubtitle')}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-full bg-grey/10" aria-label={t('common.close')}>
            <X size={18} />
          </button>
        </motion.div>

        {ios ? (
          <ol className="space-y-3 text-sm font-medium text-grey mb-6">
            <li className="flex gap-3 items-start">
              <span className="w-6 h-6 rounded-lg bg-primary text-white text-xs font-black flex items-center justify-center shrink-0">1</span>
              <span>{t('landing.installIos1')}</span>
            </li>
            <li className="flex gap-3 items-start">
              <Share size={18} className="text-primary shrink-0 mt-0.5" />
              <span>{t('landing.installIos2')}</span>
            </li>
            <li className="flex gap-3 items-start">
              <span className="w-6 h-6 rounded-lg bg-primary text-white text-xs font-black flex items-center justify-center shrink-0">+</span>
              <span>{t('landing.installIos3')}</span>
            </li>
          </ol>
        ) : android ? (
          <p className="text-sm text-grey font-medium leading-relaxed mb-6">{t('landing.installAndroid')}</p>
        ) : (
          <p className="text-sm text-grey font-medium leading-relaxed mb-6">{t('landing.installDesktop')}</p>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-full py-3.5 rounded-2xl bg-primary text-white font-black uppercase tracking-widest text-xs mb-2"
        >
          {t('landing.installSheetOk')}
        </button>
        <button
          type="button"
          onClick={onContinueInBrowser}
          className="w-full py-2 text-[10px] font-bold text-grey uppercase tracking-wider"
        >
          {t('landing.continueBrowser')}
        </button>
      </motion.div>
    </motion.div>
  );
}
