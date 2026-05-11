const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, collection, getDocs, updateDoc, deleteField } = require('firebase/firestore');
const config = require('./firebase-applet-config.json');

const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function check() {
  const snaps = await getDocs(collection(db, 'chats'));
  let found = false;
  for (const snap of snaps.docs) {
    const data = snap.data();
    for (const key of Object.keys(data)) {
      if (key.startsWith('unreadCount.')) {
        console.log('Chat', snap.id, 'has FLAT unread:', key, data[key]);
        const updates = {};
        updates[key] = deleteField();
        await updateDoc(doc(db, 'chats', snap.id), updates)
        found = true;
      }
    }
  }
  console.log('Done scanning chats.');
  process.exit(0);
}
check();
