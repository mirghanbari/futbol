/// <reference types="vite/client" />

interface Window {
  // Set by the gtag.js snippet in index.html (GA4). Optional because it's
  // absent in dev/localhost and in the brief window before the async script
  // tag finishes loading.
  gtag?: (...args: unknown[]) => void;
}
