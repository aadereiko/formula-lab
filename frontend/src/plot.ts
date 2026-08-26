/**
 * Geometry for the plot panel: tick steps, the path of a curve, and the
 * isometric projection behind the surface.
 *
 * Kept out of the component because none of it touches React, and because the
 * painter's-order argument on `isoFacets` is the only part of drawing a plot by
 * hand that is not obvious from reading the markup.
 */

/**
 * Tick values across `[low, high]`: 1, 2 or 5 times a power of ten.
 *
 * Dividing the range into equal parts is easier and gives axes labelled
 * `1.4286`, `2.8571`, `4.2857` — numbers nobody reads. A step people already
 * count in is what makes a value legible at a glance.
 */
export function niceTicks(low: number, high: number, target: number): number[] {
  const span = high - low;
  if (!(span > 0) || !Number.isFinite(span)) return [low];

  const rough = span / target;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  if (!(magnitude > 0)) return [low, high];
  const step = [1, 2, 5, 10].map((factor) => factor * magnitude).find((s) => s >= rough);
  if (!step) return [low, high];

  const ticks: number[] = [];
  // Multiplied out from an integer index rather than accumulated: adding 0.1
  // eleven times lands on 1.0999999999999999, which prints as a whole line of
  // digits under the axis.
  for (let index = Math.ceil(low / step); index * step <= high + step * 1e-9; index += 1) {
    ticks.push(Number((index * step).toPrecision(12)));
  }
  return ticks;
}

/** A tick label short enough to sit beside an axis. */
export function tickLabel(value: number): string {
  if (value === 0) return "0";
  const size = Math.abs(value);
  // Exponential past the point where the digits stop being readable. The `+` is
  // dropped because it aligns nothing here.
  if (size >= 1e5 || size < 1e-3) return value.toExponential(1).replace("e+", "e");
  return String(Number(value.toPrecision(3)));
}

/**
 * A curve's `d` attribute, with a fresh `M` after every gap.
 *
 * A null is a point where the formula has no real value, and the two sides of it
 * must not be joined: drawn as one path, `1/x` grows a vertical line through the
 * asymptote that reads as part of the curve.
 */
export function curvePath(
  row: readonly (number | null)[],
  toX: (index: number) => number,
  toY: (value: number) => number,
): string {
  const runs: string[][] = [];
  let run: string[] = [];

  row.forEach((value, index) => {
    if (value === null) {
      if (run.length > 0) runs.push(run);
      run = [];
      return;
    }
    run.push(`${toX(index).toFixed(2)} ${toY(value).toFixed(2)}`);
  });
  if (run.length > 0) runs.push(run);

  return runs
    .map((points) => {
      const first = points[0]!;
      // A run of one is a sample stranded between two gaps. Repeating the point
      // makes a zero-length segment, which `stroke-linecap: round` paints as a
      // dot -- otherwise the only value the formula has would draw nothing.
      const rest = points.length === 1 ? [first] : points.slice(1);
      return `M${first}${rest.map((point) => `L${point}`).join("")}`;
    })
    .join("");
}

export interface IsoFrame {
  /** Half the width of the base diamond, in pixels. */
  halfWidth: number;
  /** Half its depth: how far the far and near corners sit apart vertically. */
  halfDepth: number;
  /** How tall the value axis stands above the base. */
  valueHeight: number;
  /** Where the far corner (u = 0, w = 0) of the base sits on screen. */
  originX: number;
  originY: number;
}

// The projection itself, split out so that nothing else has to restate it.
const isoX = (frame: IsoFrame, u: number, w: number) =>
  frame.originX + (u - w) * frame.halfWidth;
const isoY = (frame: IsoFrame, u: number, w: number, v: number) =>
  frame.originY + (u + w) * frame.halfDepth - v * frame.valueHeight;

/** Project a point of the unit cube — u across, w back, v up — onto the plane. */
export function isoPoint(frame: IsoFrame, u: number, w: number, v: number): string {
  return `${isoX(frame, u, w).toFixed(2)},${isoY(frame, u, w, v).toFixed(2)}`;
}

/**
 * The band of screen rows the projected surface and its floor actually occupy.
 *
 * The frame has to reserve a whole value axis above the far corner, because the
 * surface *could* peak there — but usually it does not, and a plot cropped to
 * the box it might have filled leaves a third of the panel empty. Measuring
 * what got drawn and cropping the viewBox to that is the cheap fix, and it costs
 * one more pass over the samples.
 */
export function isoExtent(
  rows: readonly (number | null)[][],
  frame: IsoFrame,
  toUnit: (value: number) => number,
): [number, number] {
  const depth = rows.length;
  const width = rows[0]?.length ?? 0;
  // Seeded with the floor's own corners, so an empty mesh still has a frame.
  let top = frame.originY;
  let bottom = frame.originY + frame.halfDepth * 2;

  for (let j = 0; j < depth; j += 1) {
    for (let i = 0; i < width; i += 1) {
      const value = rows[j]?.[i];
      if (value === null || value === undefined) continue;
      const y = isoY(
        frame,
        i / Math.max(1, width - 1),
        j / Math.max(1, depth - 1),
        toUnit(value),
      );
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  return [top, bottom];
}

export interface IsoFacet {
  /** The `points` attribute of one quad of the mesh. */
  points: string;
  /** Mean height of its four corners, 0 at the base and 1 at the ceiling. */
  shade: number;
}

/**
 * The mesh of a sampled surface, ordered back to front.
 *
 * The projection is orthographic and the value axis maps to screen *-y* only, so
 * depth is a function of `u + w` alone. That is what makes painter's order
 * *exact* rather than a heuristic: sort by `i + j`, draw in that order, and each
 * filled quad covers whatever sits behind it — the entire hidden-surface problem
 * solved by a sort. It is also why filled quads beat a wireframe here. A mesh
 * with no occlusion reads as a tangle of lines rather than as a shape, and real
 * hidden-line removal is a far larger piece of work than this.
 */
export function isoFacets(
  rows: readonly (number | null)[][],
  frame: IsoFrame,
  toUnit: (value: number) => number,
): IsoFacet[] {
  const depth = rows.length;
  const width = rows[0]?.length ?? 0;
  if (depth < 2 || width < 2) return [];

  const ordered: { key: number; facet: IsoFacet }[] = [];
  for (let j = 0; j < depth - 1; j += 1) {
    for (let i = 0; i < width - 1; i += 1) {
      const corners = [
        [i, j],
        [i + 1, j],
        [i + 1, j + 1],
        [i, j + 1],
      ];

      const units: number[] = [];
      for (const corner of corners) {
        const value = rows[corner[1]!]?.[corner[0]!];
        // A quad with a corner the formula has no value at is left out
        // entirely: a hole in the mesh is the honest shape of an asymptote.
        if (value === null || value === undefined) break;
        units.push(toUnit(value));
      }
      if (units.length < 4) continue;

      const points = corners
        .map((corner, index) =>
          isoPoint(frame, corner[0]! / (width - 1), corner[1]! / (depth - 1), units[index]!))
        .join(" ");
      ordered.push({
        key: i + j,
        facet: { points, shade: units.reduce((sum, unit) => sum + unit, 0) / units.length },
      });
    }
  }

  return ordered.sort((a, b) => a.key - b.key).map((entry) => entry.facet);
}

/**
 * The extent of the value axis.
 *
 * `slack` is why this takes an argument. A curve wants a little either side so
 * it does not run along the frame; a surface wants none, because its floor is
 * the base diamond drawn under it — pad that and the lowest part of the sheet
 * hovers above its own ground for no reason, which is exactly the cue that
 * makes an isometric plot unreadable.
 *
 * A constant gets room either side regardless, instead of a zero-height frame
 * that would divide by zero and put the whole thing on one pixel.
 */
export function valueDomain(
  min: number | null,
  max: number | null,
  slack = 0.08,
): [number, number] {
  const low = min ?? 0;
  const high = max ?? 1;
  if (high - low <= Math.abs(high) * Number.EPSILON) {
    const room = Math.abs(low) > 0 ? Math.abs(low) * 0.5 : 1;
    return [low - room, low + room];
  }
  const pad = (high - low) * slack;
  return [low - pad, high + pad];
}
