import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { confirmSubscriptionCheckout } from '../lib/subscriptionCheckout';

type StripeReturnMode = 'profile' | 'onboarding';

/**
 * Gestisce il ritorno da Stripe Checkout (session_id in query).
 * Abbonamento → confirmSubscriptionCheckout; ricarica → opzionale callback balance.
 */
export function useStripeReturn(
  userId: string | undefined,
  mode: StripeReturnMode,
  onSubscriptionActivated?: (planId: string) => void,
  onTopUpSuccess?: () => void
) {
  const processedRef = useRef(false);

  useEffect(() => {
    if (!userId) return;
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    if (!sessionId || processedRef.current) return;

    processedRef.current = true;
    window.history.replaceState({}, document.title, window.location.pathname);

    const run = async () => {
      const pendingPlan = params.get('plan');
      const isLikelySubscription = mode === 'onboarding' || !!pendingPlan;

      if (isLikelySubscription) {
        try {
          const result = await confirmSubscriptionCheckout(sessionId);
          if (result.success && result.planId) {
            toast.success(`Piano ${result.planId} attivato! 🎉`);
            onSubscriptionActivated?.(result.planId);
            return;
          }
          if (result.pending) {
            toast('Pagamento in elaborazione. Aggiorna tra qualche secondo.', { icon: '⏳' });
            return;
          }
        } catch (e) {
          console.error('Subscription confirm failed', e);
          toast.error('Errore attivazione abbonamento. Contatta assistenza se il pagamento è andato a buon fine.');
        }
      }

      onTopUpSuccess?.();
    };

    void run();
  }, [userId, mode, onSubscriptionActivated, onTopUpSuccess]);
}
