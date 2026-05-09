import { db } from '../lib/firebase';
import { doc, getDoc, runTransaction, query, collection, orderBy, limit, getDocs, setDoc, serverTimestamp } from 'firebase/firestore';
import { BadgeId, Badge, UserProfile } from '../types';

export const gamificationService = {
  awardPoints: async (userId: string, action: string, points: number) => {
    try {
      const userRef = doc(db, 'users', userId);
      await runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists()) return;

        const data = userDoc.data() as Partial<UserProfile>;
        const currentPoints = data.points || 0;
        const currentWeekly = data.weeklyPoints || 0;

        transaction.update(userRef, {
          points: currentPoints + points,
          weeklyPoints: currentWeekly + points,
          updatedAt: serverTimestamp()
        });
      });
      console.log(`Awarded ${points} points for ${action}`);
      await gamificationService.checkAndAwardBadges(userId);
    } catch (error) {
      console.error('Error awarding points:', error);
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
