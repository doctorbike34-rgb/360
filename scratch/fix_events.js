
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('/Users/yoube/360/firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app);

async function updateEvents() {
  const eventsCol = collection(db, 'events');
  const snapshot = await getDocs(eventsCol);
  
  for (const eventDoc of snapshot.docs) {
    const data = eventDoc.data();
    if (!data.status) {
      console.log(`Updating event ${eventDoc.id}...`);
      await updateDoc(doc(db, 'events', eventDoc.id), {
        status: 'upcoming'
      });
    }
  }
  console.log('Done!');
}

updateEvents().catch(console.error);
