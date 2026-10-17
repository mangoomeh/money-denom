// Receipt photos live in IndexedDB (localStorage is too small for images).
// Keys are a saved visit's id, or 'meal' for the meal in progress.

const DB_NAME = 'sushiro-photos';
const STORE = 'receipts';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
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

export const getPhoto = (key) => run('readonly', (s) => s.get(key));
export const putPhoto = (key, blob) => run('readwrite', (s) => s.put(blob, key));
export const deletePhoto = (key) => run('readwrite', (s) => s.delete(key));

export async function movePhoto(from, to) {
  const blob = await getPhoto(from);
  if (!blob) return false;
  await putPhoto(to, blob);
  await deletePhoto(from);
  return true;
}

// Loads a camera photo with its EXIF rotation applied.
export function loadImage(file) {
  return createImageBitmap(file, { imageOrientation: 'from-image' });
}

function drawScaled(bitmap, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

// A small JPEG (~100-200 KB) for keeping with the visit.
export function compressForStorage(bitmap) {
  const canvas = drawScaled(bitmap, 1400);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.72));
}

// Greyscale with stretched contrast, which helps OCR on faded thermal paper.
export function prepareForOcr(bitmap) {
  const canvas = drawScaled(bitmap, 2000);
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = img.data;
  let lo = 255, hi = 0;
  for (let i = 0; i < px.length; i += 4) {
    const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    px[i] = g;
    if (g < lo) lo = g;
    if (g > hi) hi = g;
  }
  const range = Math.max(1, hi - lo);
  for (let i = 0; i < px.length; i += 4) {
    const v = ((px[i] - lo) / range) * 255;
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
