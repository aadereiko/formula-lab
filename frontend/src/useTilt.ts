import { useEffect } from "react";
import { usePersistentState } from "./hooks";

const STORAGE_KEY = "formula-lab.tilt";
/** How far an element leans, in degrees at the very edge. */
const MAX_DEGREES = 7;

/**
 * Whether the 3D hover effects are on, remembered per browser.
 *
 * A setting rather than a decision: it can be turned off from the interface
 * without touching the code, and the CSS is gated on a single class so it can
 * be removed wholesale if it turns out to be unwanted.
 */
export function useTiltSetting() {
  const [enabled, setEnabled] = usePersistentState<boolean>(STORAGE_KEY, true);
  return { enabled, setEnabled };
}

/**
 * Leans whatever the cursor is over towards it.
 *
 * One listener on the document rather than one per element: with library rows,
 * saved rows, cards and buttons all participating, per-element handlers would
 * mean hundreds of subscriptions and a re-bind on every render. This walks up
 * from the event target to the nearest `[data-tilt]` ancestor instead, so an
 * element opts in with an attribute and nothing has to be wired up.
 *
 * The rotation is published as CSS custom properties and applied by the
 * stylesheet, which keeps the maths here and the look there.
 */
export function useTilt(enabled: boolean) {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("tilt-on", enabled);
    if (!enabled) return;

    // Someone who has asked for less motion should not get a tilting page.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) {
      root.classList.remove("tilt-on");
      return;
    }

    // Touch has no hover, and a tilt that fires on tap reads as a glitch.
    const hasHover = window.matchMedia("(hover: hover)");
    if (!hasHover.matches) {
      root.classList.remove("tilt-on");
      return;
    }

    let active: HTMLElement | null = null;

    const clear = () => {
      if (!active) return;
      active.style.removeProperty("--tilt-x");
      active.style.removeProperty("--tilt-y");
      active.classList.remove("is-tilting");
      active = null;
    };

    const onMove = (event: PointerEvent) => {
      const target = (event.target as Element | null)?.closest<HTMLElement>("[data-tilt]");
      if (!target) {
        clear();
        return;
      }
      if (target !== active) {
        clear();
        active = target;
        target.classList.add("is-tilting");
      }

      const box = target.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return;

      // -1 at one edge, +1 at the other, 0 dead centre.
      const x = ((event.clientX - box.left) / box.width) * 2 - 1;
      const y = ((event.clientY - box.top) / box.height) * 2 - 1;
      target.style.setProperty("--tilt-x", `${(x * MAX_DEGREES).toFixed(2)}deg`);
      target.style.setProperty("--tilt-y", `${(-y * MAX_DEGREES).toFixed(2)}deg`);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    // Leaving the window never fires pointermove over a non-tilt target.
    document.addEventListener("pointerleave", clear);
    window.addEventListener("blur", clear);

    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", clear);
      window.removeEventListener("blur", clear);
      clear();
      root.classList.remove("tilt-on");
    };
  }, [enabled]);
}
