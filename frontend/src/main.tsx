import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "katex/dist/katex.min.css";
import "./styles.css";
import "./hover.css";
import App from "./App";

const host = document.getElementById("root");
if (!host) throw new Error("#root is missing from index.html");

createRoot(host).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/*
 * Registered only in a real build. A service worker sitting in front of Vite's
 * dev server intercepts the module graph and fights HMR, so development would
 * spend its time serving yesterday's code back to you.
 *
 * After load, not before: registration competes with the first paint for the
 * same connection, and the app rendering is worth more than the cache being
 * warm a few hundred milliseconds earlier.
 */
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* No offline mode, then. Everything else still works. */
    });
  });
}
