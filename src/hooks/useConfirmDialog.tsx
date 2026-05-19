import { useState, useCallback } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';

type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
};

type PendingConfirm = ConfirmOptions & {
  onConfirm: () => void | Promise<void>;
};

export function useConfirmDialog() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [loading, setLoading] = useState(false);

  const requestConfirm = useCallback((options: ConfirmOptions & { onConfirm: () => void | Promise<void> }) => {
    setPending({
      title: options.title,
      message: options.message,
      confirmLabel: options.confirmLabel ?? 'Conferma',
      cancelLabel: options.cancelLabel ?? 'Annulla',
      variant: options.variant ?? 'primary',
      onConfirm: options.onConfirm,
    });
  }, []);

  const ConfirmDialogPortal = () => (
    <ConfirmDialog
      open={Boolean(pending)}
      title={pending?.title ?? ''}
      message={pending?.message ?? ''}
      confirmLabel={pending?.confirmLabel}
      cancelLabel={pending?.cancelLabel}
      variant={pending?.variant}
      loading={loading}
      onCancel={() => {
        if (!loading) setPending(null);
      }}
      onConfirm={async () => {
        if (!pending) return;
        setLoading(true);
        try {
          await pending.onConfirm();
          setPending(null);
        } finally {
          setLoading(false);
        }
      }}
    />
  );

  return { requestConfirm, ConfirmDialogPortal, isConfirmOpen: Boolean(pending) };
}
