import type { BadgeId } from '../types';

export const DAILY_BONUS_POINTS = 10;

export const BADGE_CATALOG: { id: BadgeId; icon: string; name: string; hint: string }[] = [
  { id: 'first_sos', icon: '🆘', name: 'Primo SOS', hint: '50+ punti reputazione' },
  { id: 'rescuer_5', icon: '🦸', name: 'Eroe soccorso', hint: '150+ punti' },
  { id: 'rescuer_25', icon: '🏅', name: 'Veterano', hint: '300+ punti' },
  { id: 'community_hero', icon: '🌟', name: 'Hero community', hint: '500+ punti' },
  { id: 'top_rated', icon: '⭐', name: 'Top rated', hint: 'Valutazione 4.8+' },
  { id: 'loyal_cyclist', icon: '🔥', name: 'Fedele', hint: '7+ giorni streak' },
  { id: 'peer_pioneer', icon: '🔧', name: 'Peer pioneer', hint: 'Meccanico peer attivo' },
  { id: 'bike_doctor', icon: '🩺', name: 'Bike doctor', hint: '10+ interventi' },
];

export function getUnlockedBadgeIds(badges: { id: BadgeId }[] | undefined): Set<BadgeId> {
  return new Set((badges ?? []).map((b) => b.id));
}
