import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Loader2 } from 'lucide-react';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Conferma',
  cancelLabel = 'Annulla',
  variant = 'primary',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmClass =
    variant === 'danger'
      ? 'bg-danger text-white shadow-danger/20'
      : 'bg-primary text-white shadow-primary/20';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[2000] flex items-center justify-center px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0 bg-dark/60 backdrop-blur-sm"
            onClick={loading ? undefined : onCancel}
          />
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            initial={{ scale: 0.92, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 12 }}
            className="relative w-full max-w-sm bg-white rounded-[2rem] p-6 sm:p-8 shadow-2xl"
          >
            <div className="w-14 h-14 rounded-2xl bg-grey/10 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={28} className={variant === 'danger' ? 'text-danger' : 'text-primary'} />
            </div>
            <h2 id="confirm-dialog-title" className="text-lg font-black text-black uppercase text-center mb-2">
              {title}
            </h2>
            <p className="text-sm text-grey text-center mb-6 leading-relaxed">{message}</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                disabled={loading}
                onClick={onCancel}
                className="flex-1 py-3.5 rounded-2xl font-black uppercase text-[11px] tracking-widest bg-grey/10 text-black active:scale-95 disabled:opacity-50"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={onConfirm}
                className={`flex-1 py-3.5 rounded-2xl font-black uppercase text-[11px] tracking-widest shadow-xl active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 ${confirmClass}`}
              >
                {loading && <Loader2 size={16} className="animate-spin" />}
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
