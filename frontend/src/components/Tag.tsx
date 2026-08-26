import type { CSSProperties } from "react";

/**
 * Hues a tag can take. Two regions are deliberately absent, each reserved
 * elsewhere in the app: the accent blue (~217), because a tag is not clickable
 * and one wearing the colour of every button would say otherwise; and red
 * (~358), because that is `--danger`, and `local` is not a warning.
 *
 * The order matters as much as the values. Short similar words tend to land in
 * *neighbouring* buckets, so the list is interleaved rather than sorted --
 * consecutive entries sit across the wheel from one another, never less than 64
 * degrees apart. Sorted by hue, `local` and `hidden` came out two adjacent
 * ambers; interleaved, they are orange and cyan. That property holds for
 * whatever tag is added next, which hand-picking hues for today's pair would
 * not.
 */
const TAG_HUES = [30, 182, 92, 258, 52, 292, 148, 326];

/**
 * djb2. Small, stable across sessions and platforms, and it spreads short
 * uppercase words across eight buckets well enough that the tags actually in
 * use land on different colours.
 *
 * Stability is the point: the same name must always take the same colour, or
 * the tag stops being something you can recognise without reading.
 */
function hueFor(label: string): number {
  let hash = 5381;
  for (let index = 0; index < label.length; index += 1) {
    // `| 0` keeps this in int32 rather than drifting into float territory,
    // which is what makes the result identical everywhere.
    hash = ((hash << 5) + hash + label.charCodeAt(index)) | 0;
  }
  return TAG_HUES[Math.abs(hash) % TAG_HUES.length] as number;
}

interface Props {
  label: string;
  /** The hover explanation. Tags are terse by design, so most want one. */
  title?: string;
}

/**
 * A small coloured label — `LOCAL`, `HIDDEN`, and whatever comes next.
 *
 * The colour is derived from the name rather than passed in, so a new tag needs
 * no palette decision and can never collide by accident with an existing one.
 * Only the *hue* is inlined; how light and how saturated that hue reads is left
 * to the stylesheet, which already knows which theme is in force.
 */
export function Tag({ label, title }: Props) {
  return (
    <span className="tag" style={{ "--tag-h": hueFor(label) } as CSSProperties} title={title}>
      {label}
    </span>
  );
}
