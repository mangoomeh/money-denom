// The floor plan image lives in IndexedDB (localStorage is too small for images). PDFs are rendered to an
// image with pdf.js, loaded from the CDN only when a PDF is picked.

const DB_NAME = 'fengshui-plan';
const STORE = 'plans';
const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs';
const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs';

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

export const getPlan = () => run('readonly', (s) => s.get('home'));
export const putPlan = (blob) => run('readwrite', (s) => s.put(blob, 'home'));
export const deletePlan = () => run('readwrite', (s) => s.delete('home'));

function toBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
}

function scaledCanvas(source, width, height, maxSide = 2000) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // PDFs and transparent PNGs get a white page
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function pdfToCanvas(file) {
  const pdfjs = await import(PDFJS);
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(4, 2000 / Math.max(base.width, base.height)) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

// A picked file (photo, screenshot or PDF) as a JPEG of at most 2000 px.
export async function fileToPlan(file) {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    const c = await pdfToCanvas(file);
    return toBlob(scaledCanvas(c, c.width, c.height));
  }
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  return toBlob(scaledCanvas(bitmap, bitmap.width, bitmap.height));
}

// The plan turned a quarter turn clockwise.
export async function rotatePlan(blob) {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.height;
  canvas.height = bitmap.width;
  const ctx = canvas.getContext('2d');
  ctx.translate(canvas.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(bitmap, 0, 0);
  return toBlob(canvas);
}
