import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { geohashForLocation } from 'geofire-common';
import { db } from '../lib/firebase';

export const MAP_VISIBLE_ROLES = ['MECHANIC', 'CYCLIST', 'PEER_MECHANIC'] as const;

export async function syncMapPresence(data: {
  uid: string;
  role: string;
  name?: string;
  lastLat: number;
  lastLng: number;
  isOnline?: boolean;
  mechanicStatus?: string;
}): Promise<void> {
  if (!MAP_VISIBLE_ROLES.includes(data.role as (typeof MAP_VISIBLE_ROLES)[number])) return;

  await setDoc(
    doc(db, 'mapPresence', data.uid),
    {
      uid: data.uid,
      role: data.role,
      name: data.name ?? null,
      lastLat: data.lastLat,
      lastLng: data.lastLng,
      geohash: geohashForLocation([data.lastLat, data.lastLng]),
      isOnline: data.isOnline ?? true,
      ...(data.mechanicStatus ? { mechanicStatus: data.mechanicStatus } : {}),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function clearMapPresence(uid: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'mapPresence', uid));
  } catch {
    /* già assente */
  }
}
