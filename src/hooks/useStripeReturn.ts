import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { confirmSubscriptionCheckout } from '../lib/subscriptionCheckout';
import { peekStripeSessionId, clearStripeReturnStorage } from '../lib/stripeReturnStorage';

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
    const sessionId = peekStripeSessionId();
    if (!sessionId || processedRef.current) return;

    processedRef.current = true;

    const run = async () => {
      const isLikelySubscription = mode === 'onboarding';

      if (isLikelySubscription) {
        try {
          let result = await confirmSubscriptionCheckout(sessionId);
          if (result.pending) {
            await new Promise((r) => setTimeout(r, 2500));
            result = await confirmSubscriptionCheckout(sessionId);
          }
          if (result.success && result.planId) {
            clearStripeReturnStorage();
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
