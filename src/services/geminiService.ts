import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

export interface BrandDirection {
  title: string;
  description: string;
  vibe: string;
  colors: string[];
}

/** Messaggio sufficiente per una diagnosi tecnica strutturata (client-side gate). */
export function isBikeIssueDescription(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t.length < 12) return false;
  const greetings = /^(ciao|salve|buongiorno|buonasera|hey|hello|hi|ok|grazie|thanks)\b[!?.]*$/i;
  if (greetings.test(t)) return false;
  const bikeSignals =
    /\b(bici|bicicletta|freno|freni|catena|foratura|gonfi|pneumatico|ruota|deragli|marcia|pedal|pedale|manubrio|sell|sella|trasmissione|deragliatore|movimento|centrale|mozzo|cavo|freno a disco|v-brake|sospension|ammortizz|crepit|strid|rumor|guasto|rott|non funziona|si è rotto|perd|olio|camera|cerchio|raggi|frizione|frenata)\b/i;
  return bikeSignals.test(t) || t.length >= 40;
}

export async function askBikeDoctor(prompt: string, role: string): Promise<string> {
  try {
    const fn = httpsCallable<{ prompt: string; role: string }, { text: string }>(
      functions,
      'askBikeDoctor'
    );
    const result = await fn({ prompt, role });
    return result.data.text || 'Scusa, al momento non riesco a collegarmi. Riprova tra poco.';
  } catch (error) {
    console.error('askBikeDoctor callable error:', error);
    return 'Scusa, al momento non riesco a collegarmi. Riprova tra poco.';
  }
}

export async function analyzeBikeIssue(description: string): Promise<string | null> {
  if (!isBikeIssueDescription(description)) return null;

  try {
    const fn = httpsCallable<{ description: string }, { diagnosis: string | null }>(
      functions,
      'analyzeBikeIssue'
    );
    const result = await fn({ description });
    return result.data.diagnosis ?? null;
  } catch {
    return null;
  }
}
