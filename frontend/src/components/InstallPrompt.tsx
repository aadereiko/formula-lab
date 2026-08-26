import { useEffect, useState } from "react";
import { usePersistentState } from "../hooks";
import { IconClear } from "./icons";

/**
 * How to get the app onto a phone, said out loud.
 *
 * Without this, installing depends on somebody opening a browser menu and
 * recognising an item they were not looking for -- which nobody does. The two
 * platforms need opposite treatment, and neither is optional:
 *
 * Chrome fires `beforeinstallprompt`, which can be captured and replayed later,
 * so Android gets a real button that installs on tap.
 *
 * Safari fires nothing and exposes no API, so iOS gets a sentence. There is no
 * way to trigger the sheet, and no way to know whether the user has already
 * added the app except by asking the display mode -- which is why the hint is
 * dismissible and remembers being dismissed.
 */

/** The event Chrome fires; not in the DOM lib because it is not standardised. */
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
}

const isStandalone = (): boolean =>
  window.matchMedia("(display-mode: standalone)").matches ||
  // Safari's own flag, which predates `display-mode` and is still the only
  // signal on older iOS.
  (window.navigator as { standalone?: boolean }).standalone === true;

const isIos = (): boolean => {
  const ua = window.navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  // An iPad on recent iPadOS reports itself as a Mac; the touch points are what
  // give it away.
  return ua.includes("Macintosh") && window.navigator.maxTouchPoints > 1;
};

export function InstallPrompt() {
  const [dismissed, setDismissed] = usePersistentState("formula-lab.install-dismissed", false);
  const [chromeEvent, setChromeEvent] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      // Chrome shows its own bar unless the default is prevented; keeping the
      // event lets the button appear where somebody is already looking.
      event.preventDefault();
      setChromeEvent(event as InstallEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || dismissed) return null;

  const ios = isIos();
  if (!ios && !chromeEvent) return null;

  return (
    <aside className="install-note">
      <span className="install-text">
        {ios ? (
          <>
            <strong>Add to your home screen.</strong> Tap the Share button, then{" "}
            <em>Add to Home Screen</em> — it opens full screen and works offline.
          </>
        ) : (
          <>
            <strong>Install Formula Lab.</strong> It opens full screen and works
            offline.
          </>
        )}
      </span>

      {chromeEvent && (
        <button
          type="button"
          className="btn btn-small btn-primary"
          onClick={() => {
            void chromeEvent.prompt();
            // Chrome allows one replay per event, so it is spent either way.
            setChromeEvent(null);
          }}
        >
          Install
        </button>
      )}

      <button
        type="button"
        className="icon-btn install-dismiss"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
      >
        <IconClear />
      </button>
    </aside>
  );
}
