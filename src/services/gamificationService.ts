import { db } from '../lib/firebase';
import { DAILY_BONUS_POINTS } from '../lib/badgeMeta';
import {
  loyaltyPointsNeedSanitize,
  normalizeLoyaltyPointsValue,
} from '../lib/loyaltyPoints';
import {
  doc,
  getDoc,
  runTransaction,
  query,
  collection,
  orderBy,
  where,
  limit,
  getDocs,
  serverTimestamp,
  increment,
  updateDoc,
} from 'firebase/firestore';

import { BadgeId, Badge, UserProfile } from '../types';

export { DAILY_BONUS_POINTS };

export const gamificationService = {
  /** Arrotonda punti/weeklyPoints già salvati con decimali spurii. */
  sanitizeUserLoyaltyPoints: async (userId: string): Promise<boolean> => {
    try {
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) return false;

      const data = userSnap.data() as UserProfile;
      if (!loyaltyPointsNeedSanitize(data.points, data.weeklyPoints)) return false;

      await updateDoc(userRef, {
        points: normalizeLoyaltyPointsValue(data.points),
        weeklyPoints: normalizeLoyaltyPointsValue(data.weeklyPoints),
        updatedAt: serverTimestamp(),
      });
      return true;
    } catch (error) {
      console.error('Error sanitizing loyalty points:', error);
      return false;
    }
  },

  awardPoints: async (userId: string, action: string, points: number) => {
    try {
      const userRef = doc(db, 'users', userId);
      await runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists()) return;

        const data = userDoc.data() as UserProfile & {
          rating?: number;
          completedJobs?: number;
          peerMechanicEnabled?: boolean;
        };

        const pts = normalizeLoyaltyPointsValue(points);
        const projectedPts = (data.points ?? 0) + pts;

        // Inline badge evaluation — avoids a second Firestore round-trip.
        const currentBadges = data.badges || [];
        const newBadges: Badge[] = [...currentBadges];
        const has = (id: BadgeId) => currentBadges.some((b) => b.id === id);
        const push = (id: BadgeId) => { if (!has(id)) newBadges.push({ id, unlockedAt: Date.now() }); };

        if (projectedPts >= 50)  push('first_sos');
        if (projectedPts >= 150) push('rescuer_5');
        if (projectedPts >= 300) push('rescuer_25');
        if (projectedPts >= 500) push('community_hero');
        if ((data.rating ?? 0) >= 4.8)          push('top_rated');
        if ((data.dailyStreak ?? 0) >= 7)        push('loyal_cyclist');
        if (data.peerMechanicEnabled)            push('peer_pioneer');
        if ((data.completedJobs ?? 0) >= 10)     push('bike_doctor');

        const updates: Record<string, unknown> = {
          points: increment(pts),
          weeklyPoints: increment(pts),
          updatedAt: serverTimestamp(),
        };
        if (newBadges.length > currentBadges.length) {
          updates.badges = newBadges;
        }

        transaction.update(userRef, updates);
      });
      console.log(`Awarded ${points} points for ${action}`);
    } catch (error) {
      console.error('Error awarding points:', error);
    }
  },

  claimDailyBonus: async (userId: string): Promise<{ success: boolean; amount: number; streak: number }> => {
    try {
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) return { success: false, amount: 0, streak: 0 };

      const data = userSnap.data() as UserProfile & { lastDailyClaim?: { toDate?: () => Date } };
      const now = new Date();
      const lastClaim = data.lastDailyClaim?.toDate?.();

      let newStreak = 1;
      if (lastClaim) {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const last = new Date(lastClaim.getFullYear(), lastClaim.getMonth(), lastClaim.getDate());
        const diffDays = Math.floor((today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
          return { success: false, amount: 0, streak: data.dailyStreak || 0 };
        }
        if (diffDays === 1) {
          newStreak = (data.dailyStreak || 0) + 1;
        }
      }

      await updateDoc(userRef, {
        points: increment(DAILY_BONUS_POINTS),
        weeklyPoints: increment(DAILY_BONUS_POINTS),
        lastDailyClaim: serverTimestamp(),
        dailyStreak: newStreak,
        updatedAt: serverTimestamp(),
      });

      await gamificationService.checkAndAwardBadges(userId);
      return { success: true, amount: DAILY_BONUS_POINTS, streak: newStreak };
    } catch (error) {
      console.error('Error claiming daily bonus:', error);
      return { success: false, amount: 0, streak: 0 };
    }
  },

  checkAndAwardBadges: async (userId: string) => {
    try {
      const userRef = doc(db, 'users', userId);
      await runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists()) return;

        const data = userDoc.data() as UserProfile & {
          rating?: number;
          completedJobs?: number;
          peerMechanicEnabled?: boolean;
        };
        const currentBadges = data.badges || [];
        const newBadges: Badge[] = [...currentBadges];
        const has = (id: BadgeId) => currentBadges.some((b) => b.id === id);
        const push = (id: BadgeId) => {
          if (!has(id)) newBadges.push({ id, unlockedAt: Date.now() });
        };

        const pts = data.points ?? 0;
        if (pts >= 50) push('first_sos');
        if (pts >= 150) push('rescuer_5');
        if (pts >= 300) push('rescuer_25');
        if (pts >= 500) push('community_hero');
        if ((data.rating ?? 0) >= 4.8) push('top_rated');
        if ((data.dailyStreak ?? 0) >= 7) push('loyal_cyclist');
        if (data.peerMechanicEnabled) push('peer_pioneer');
        if ((data.completedJobs ?? 0) >= 10) push('bike_doctor');

        if (newBadges.length > currentBadges.length) {
          transaction.update(userRef, { badges: newBadges });
        }
      });
    } catch (e) {
      console.error('Error awarding badges:', e);
    }
  },

  getLeaderboard: async (type: 'cyclists_weekly' | 'mechanics_weekly' | 'mechanics_alltime') => {
    const isMechanics = type.startsWith('mechanics');
    const orderField = type.includes('weekly') ? 'weeklyPoints' : 'points';
    const q = query(
      collection(db, 'users'),
      where('role', 'in', isMechanics ? ['MECHANIC', 'PEER_MECHANIC'] : ['CYCLIST']),
      orderBy(orderField, 'desc'),
      limit(10)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data());
  },
};
