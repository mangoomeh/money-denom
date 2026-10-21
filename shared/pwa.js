// Loaded by every page: turns on offline use and asks the browser to keep saved data.
// Without persistent storage, Safari can clear a site's data after a week of not opening it.

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register(new URL('../sw.js', import.meta.url), { scope: new URL('../', import.meta.url).pathname }).catch(() => {});
}

navigator.storage?.persist?.().catch(() => {});
