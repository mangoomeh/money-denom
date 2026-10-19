// Conversations live in IndexedDB, since attached photos are too big for localStorage.

const DB_NAME = 'local-chat';
const STORE = 'chats';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(req?.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export const allChats = () => run('readonly', (s) => s.getAll());
export const saveChat = (chat) => run('readwrite', (s) => s.put(chat));
export const deleteChat = (id) => run('readwrite', (s) => s.delete(id));
export const clearChats = () => run('readwrite', (s) => s.clear());
