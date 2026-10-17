// On-device receipt reading with Tesseract.js. The library (and ~10 MB of English
// language data, cached by the browser afterwards) is only downloaded on first use.

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const LANG_PATH = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int';
const TIMEOUT_MS = 120000;

let loading;
function loadTesseract() {
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = TESSERACT_URL;
    s.onload = () => resolve(window.Tesseract);
    s.onerror = () => { loading = null; s.remove(); reject(new Error('Could not download the text reader. Check your connection.')); };
    document.head.append(s);
  });
  return loading;
}

// Returns the text found in the image. onProgress gets a label and a 0–1 fraction.
// A failed download can leave Tesseract waiting forever, so the read is bounded by a
// timeout and can be cancelled through `signal`.
export async function readText(image, onProgress = () => {}, signal) {
  onProgress('Loading text reader… (first time only, about 10 MB)', 0);
  const Tesseract = await loadTesseract();
  let worker;
  let fail;
  const failed = new Promise((_, reject) => { fail = reject; });
  const timer = setTimeout(() => fail(new Error('Reading the receipt took too long. Check your connection, or type the total in.')), TIMEOUT_MS);
  const onAbort = () => fail(new Error('Cancelled.'));
  signal?.addEventListener('abort', onAbort);
  try {
    worker = await Promise.race([failed, Tesseract.createWorker('eng', 1, {
      langPath: LANG_PATH,
      errorHandler: (err) => fail(new Error(`Could not load the text reader (${err}).`)),
      logger: (m) => {
        if (m.status === 'recognizing text') onProgress('Reading receipt…', m.progress);
        else if (/loading|initializ/.test(m.status)) onProgress('Loading text reader… (first time only, about 10 MB)', m.progress);
      },
    })]);
    const { data } = await Promise.race([failed, worker.recognize(image)]);
    return data.text;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
    worker?.terminate().catch(() => {});
  }
}
