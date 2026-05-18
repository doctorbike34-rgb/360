import { db } from '../lib/firebase';
import { doc, getDoc, runTransaction, query, collection, orderBy, limit, getDocs, setDoc, serverTimestamp, increment, updateDoc } from 'firebase/firestore';
import { BadgeId, Badge, UserProfile } from '../types';

export const gamificationService = {
  awardPoints: async (userId: string, action: string, points: number) => {
    try {
      const userRef = doc(db, 'users', userId);
      await runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists()) return;

        transaction.update(userRef, {
          points: increment(points),
          weeklyPoints: increment(points),
          updatedAt: serverTimestamp()
        });
      });
      console.log(`Awarded ${points} points for ${action}`);
      await gamificationService.checkAndAwardBadges(userId);
    } catch (error) {
      console.error('Error awarding points:', error);
    }
  },

  claimDailyBonus: async (userId: string): Promise<{ success: boolean; amount: number; streak: number }> => {
    try {
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) return { success: false, amount: 0, streak: 0 };

      const data = userSnap.data() as UserProfile & { lastDailyClaim?: any; dailyStreak?: number };
      const now = new Date();
      const lastClaim = (data.lastDailyClaim as any)?.toDate?.();
      
      if (lastClaim) {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const last = new Date(lastClaim.getFullYear(), lastClaim.getMonth(), lastClaim.getDate());
        const diffDays = Math.floor((today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) return { success: false, amount: 0, streak: data.dailyStreak || 0 };
        if (diffDays > 1) {
          await updateDoc(userRef, { dailyStreak: 1, lastDailyClaim: serverTimestamp() });
        }
      }

      const newStreak = (data.dailyStreak || 0) + 1;
      const bonusAmount = 0.01;

      await updateDoc(userRef, {
        points: increment(bonusAmount),
        weeklyPoints: increment(bonusAmount),
        lastDailyClaim: serverTimestamp(),
        dailyStreak: newStreak,
        updatedAt: serverTimestamp()
      });

      console.log(`Daily bonus claimed: ${bonusAmount} points, streak: ${newStreak}`);
      return { success: true, amount: bonusAmount, streak: newStreak };
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

        const data = userDoc.data() as UserProfile;
        const currentBadges = data.badges || [];
        const newBadges: Badge[] = [...currentBadges];

        // Ensure these badges are unlocked based on some conditions
        // Using generic conditions based on data mapping for example
        if (data.points >= 50 && !currentBadges.some(b => b.id === 'first_sos')) {
           newBadges.push({ id: 'first_sos', unlockedAt: Date.now() });
        }
        if (data.points >= 500 && !currentBadges.some(b => b.id === 'community_hero')) {
           newBadges.push({ id: 'community_hero', unlockedAt: Date.now() });
        }

        if (newBadges.length > currentBadges.length) {
          transaction.update(userRef, {
            badges: newBadges
          });
        }
      });
    } catch (e) {
      console.error('Error awarding badges:', e);
    }
  },

  getLeaderboard: async (type: 'cyclists_weekly' | 'mechanics_weekly' | 'mechanics_alltime') => {
      // In a real app, this would query a dedicated leaderboard collection updated by cloud functions.
      // We'll mimic it here by querying users sorted by points if possible.
      const q = query(collection(db, 'users'), orderBy(type.includes('weekly') ? 'weeklyPoints' : 'points', 'desc'), limit(10));
      const snap = await getDocs(q);
      return snap.docs.map(d => d.data());
  }
};
