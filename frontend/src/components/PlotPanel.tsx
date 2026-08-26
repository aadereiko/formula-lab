import { useEffect, useMemo, useState } from "react";
import * as api from "../api";
import { ApiError } from "../api";
import { useDebouncedValue, useElementWidth, usePersistentState } from "../hooks";
import {
  curvePath,
  isoExtent,
  isoFacets,
  isoPoint,
  niceTicks,
  tickLabel,
  valueDomain,
  type IsoFrame,
} from "../plot";
import type { PlotAxisInput, PlotRequest, PlotResponse } from "../types";

interface Props {
  /** The parser's own spelling of the formula, so the plot cannot disagree with
   *  what the rest of the page is showing. */
  expression: string;
  symbols: string[];
  /** Only the current formula's filled-in variables: the API rejects the rest. */
  values: Record<string, string>;
  isEquation: boolean;
  /** What the workspace is solving for, when it knows. There is deliberately no
   *  second selector for the value axis: "leave one blank" is already how this
   *  app decides which quantity is the answer, and the server infers the same
   *  way once a variable has been taken out of the picture by an axis. */
  target: string | null;
}

/**
 * Resolution to ask for. A surface is a grid, and the server lowers this to its
 * own per-axis cap, so the cap itself stays in exactly one place.
 *
 * Odd on purpose: an odd count over a symmetric range samples the range's own
 * centre, and that is where an asymptote usually sits. With 200 points, `1/x`
 * over [-5, 5] steps either side of zero without ever landing on it, so the two
 * limbs get joined by a near-vertical line instead of the gap they deserve.
 */
const SAMPLES = 201;

/** Room for the tick labels and the two axis names, in pixels. */
const PAD = { left: 54, right: 14, top: 20, bottom: 34 };

const describe = (error: unknown) =>
  error instanceof ApiError || error instanceof Error ? error.message : "Could not plot this.";

const asNumber = (text: string | undefined) => {
  const trimmed = (text ?? "").trim();
  const value = Number(trimmed);
  return trimmed !== "" && Number.isFinite(value) ? value : null;
};

const short = (value: number) => String(Number(value.toPrecision(6)));

/**
 * Where to start a sweep, given whatever the variable is currently set to.
 *
 * Centring on the value already entered is the useful default: the user is
 * looking at one point of the curve and wants the shape around it. Zero to twice
 * that value does it while keeping the origin in frame, which matters because
 * most of these quantities are positive and read from zero.
 */
function defaultRange(current: string | undefined): { min: string; max: string } {
  const value = asNumber(current);
  if (value === null || value === 0) return { min: "0", max: "10" };
  return value > 0
    ? { min: "0", max: short(2 * value) }
    : { min: short(2 * value), max: "0" };
}

export function PlotPanel({ expression, symbols, values, isEquation, target }: Props) {
  const [open, setOpen] = usePersistentState("formula-lab.plot-open", false);
  const [wantSurface, setWantSurface] = useState(false);
  /** Edited ranges, keyed by variable, so switching axis picks up that
   *  variable's own range rather than carrying the last one's numbers over. */
  const [ranges, setRanges] = useState<Record<string, { min: string; max: string }>>({});
  const [data, setData] = useState<PlotResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [measure, width] = useElementWidth<HTMLDivElement>(560);

  const [xChoice, setXChoice] = useState<string | null>(null);
  const [zChoice, setZChoice] = useState<string | null>(null);

  // Derived with a fallback rather than reset by an effect: the formula can
  // change under this panel on any keystroke, and a choice that no longer exists
  // should simply stop being the choice.
  const sweepable = symbols.filter((symbol) => !isEquation || symbol !== target);
  const x = (xChoice && sweepable.includes(xChoice) ? xChoice : sweepable[0]) ?? null;
  const alsoSweepable = sweepable.filter((symbol) => symbol !== x);
  const z = (zChoice && alsoSweepable.includes(zChoice) ? zChoice : alsoSweepable[0]) ?? null;
  // A surface needs two axes *and* something left to plot. An equation whose
  // target is not yet pinned down needs a third variable for the server to
  // infer one from -- without this, `y = 1/x` offered a 3D switch that could
  // only ever produce "leave one variable blank".
  const canSurface = sweepable.length >= (isEquation && !target ? 3 : 2);
  const surface = wantSurface && canSurface && z !== null;

  const request = useMemo((): PlotRequest | null => {
    if (!open || !x) return null;

    const axes: PlotAxisInput[] = [];
    for (const variable of surface && z ? [x, z] : [x]) {
      const edge = ranges[variable] ?? defaultRange(values[variable]);
      const min = asNumber(edge.min);
      const max = asNumber(edge.max);
      // Half-typed bounds are not worth a round trip: leave the last plot on
      // screen until the field is a number again.
      if (min === null || max === null) return null;
      axes.push({ variable, min, max });
    }

    // An expression has no variable to solve for, and the workspace can still be
    // holding one from before the `=` was deleted -- sending it would be refused.
    return {
      expression,
      values,
      solve_for: isEquation ? target : null,
      axes,
      samples: SAMPLES,
    };
  }, [open, x, z, surface, expression, values, isEquation, target, ranges]);

  const settled = useDebouncedValue(request, 300);

  useEffect(() => {
    if (!settled) {
      setBusy(false);
      return;
    }
    const controller = new AbortController();
    setBusy(true);
    api
      .plot(settled, controller.signal)
      .then((next) => {
        setData(next);
        setError(null);
      })
      .catch((failure) => {
        if (failure instanceof DOMException && failure.name === "AbortError") return;
        setData(null);
        setError(describe(failure));
      })
      .finally(() => setBusy(false));
    return () => controller.abort();
  }, [settled]);

  // Nothing to sweep is not an empty state, it is the absence of the feature:
  // `y = 2` has no second variable to put on an axis.
  if (!x) return null;

  const rangeFor = (variable: string) => ranges[variable] ?? defaultRange(values[variable]);

  const editRange = (variable: string, edge: "min" | "max", value: string) =>
    setRanges((previous) => ({
      ...previous,
      [variable]: { ...rangeFor(variable), [edge]: value },
    }));

  const axisRow = (
    lead: string,
    variable: string,
    choices: string[],
    pick: (name: string) => void,
  ) => {
    const range = rangeFor(variable);
    return (
      <div className="toolbar plot-controls">
        <label>
          {lead}
          <select value={variable} onChange={(event) => pick(event.target.value)}>
            {choices.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        {/* The two bounds wrap as one unit. Left to themselves they break
            between "from 0" and "to 6" on a phone, which reads as two settings
            rather than one range. */}
        <span className="plot-bounds">
          <label>
            from
            <input
              className="plot-input"
              type="text"
              inputMode="decimal"
              value={range.min}
              onChange={(event) => editRange(variable, "min", event.target.value)}
            />
          </label>
          <label>
            to
            <input
              className="plot-input"
              type="text"
              inputMode="decimal"
              value={range.max}
              onChange={(event) => editRange(variable, "max", event.target.value)}
            />
          </label>
        </span>
      </div>
    );
  };

  return (
    <section className={`block plot${busy ? " is-busy" : ""}`}>
      <div className="block-head">
        <span className="label">Plot</span>
        <span className="block-actions">
          {open && canSurface && (
            <button
              type="button"
              className={`chip plot-dim${surface ? " is-on" : ""}`}
              aria-pressed={surface}
              title={surface ? "Back to a single curve" : "Sweep a second variable as a surface"}
              onClick={() => setWantSurface(!surface)}
            >
              3D
            </button>
          )}
          <button type="button" className="ghost-btn" onClick={() => setOpen(!open)}>
            {open ? "Hide" : "Show"}
          </button>
        </span>
      </div>

      {open && (
        <div className="plot-body">
          {axisRow("sweep", x, sweepable, setXChoice)}
          {surface && z && axisRow("and", z, alsoSweepable, setZChoice)}

          {/* The server's messages are written to be shown verbatim, so a plot
              that cannot be drawn explains itself rather than being second-
              guessed here. */}
          {error ? (
            <p className="plot-error">{error}</p>
          ) : (
            <figure className="plot-figure">
              <div className="plot-frame" ref={measure}>
                {data ? (
                  data.mode === "surface" ? (
                    <Surface data={data} width={width} />
                  ) : (
                    <Curve data={data} width={width} />
                  )
                ) : (
                  <p className="plot-placeholder">Pick a variable and a range to sweep.</p>
                )}
              </div>
              {data && <Caption data={data} />}
            </figure>
          )}
        </div>
      )}
    </section>
  );
}

function Caption({ data }: { data: PlotResponse }) {
  const { value_min: low, value_max: high } = data;
  return (
    <figcaption className="plot-caption">
      {data.series.length > 1 && (
        <span className="plot-legend">
          {data.series.map((series, index) => (
            <span className="plot-key" key={series.label}>
              <span className={`plot-swatch${index > 0 ? " is-alt" : ""}`} aria-hidden="true" />
              {series.label}
            </span>
          ))}
        </span>
      )}
      {/* A surface has no vertical axis to read values off, so its range is
          stated instead. A curve already carries ticks. */}
      {data.mode === "surface" && low !== null && high !== null && (
        <span className="plot-range">
          {data.value_label} {tickLabel(low)} … {tickLabel(high)}
        </span>
      )}
      {data.note && <span className="plot-note">{data.note}</span>}
    </figcaption>
  );
}

function Curve({ data, width }: { data: PlotResponse; width: number }) {
  const axis = data.axes[0];
  if (!axis) return null;

  const height = Math.round(Math.min(300, Math.max(180, width * 0.56)));
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const [low, high] = valueDomain(data.value_min, data.value_max);

  const toX = (index: number) => PAD.left + (innerW * index) / Math.max(1, axis.samples - 1);
  const atX = (value: number) => PAD.left + (innerW * (value - axis.min)) / (axis.max - axis.min);
  const toY = (value: number) => PAD.top + innerH * (1 - (value - low) / (high - low));
  const crosses = (from: number, to: number) => from < 0 && to > 0;

  return (
    <svg
      className="plot-svg"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${data.value_label} against ${axis.variable}`}
    >
      {/* The divisors are the count *before* the step is snapped to 1, 2 or 5,
          and snapping only ever rounds up -- so asking for five lines is how you
          reliably get three or four. */}
      {niceTicks(low, high, 5).map((tick) => (
        <g key={`v${tick}`}>
          <line
            className="plot-grid"
            x1={PAD.left}
            x2={PAD.left + innerW}
            y1={toY(tick)}
            y2={toY(tick)}
          />
          <text
            className="plot-tick"
            x={PAD.left - 8}
            y={toY(tick)}
            textAnchor="end"
            dominantBaseline="middle"
          >
            {tickLabel(tick)}
          </text>
        </g>
      ))}

      {niceTicks(axis.min, axis.max, 6).map((tick) => (
        <g key={`a${tick}`}>
          <line
            className="plot-grid"
            x1={atX(tick)}
            x2={atX(tick)}
            y1={PAD.top}
            y2={PAD.top + innerH}
          />
          <text className="plot-tick" x={atX(tick)} y={PAD.top + innerH + 15} textAnchor="middle">
            {tickLabel(tick)}
          </text>
        </g>
      ))}

      <path
        className="plot-axis"
        d={`M${PAD.left} ${PAD.top}V${PAD.top + innerH}H${PAD.left + innerW}`}
      />
      {/* Zero is the one gridline worth telling apart from the rest, and only
          when the sweep actually crosses it. */}
      {crosses(low, high) && (
        <line className="plot-axis" x1={PAD.left} x2={PAD.left + innerW} y1={toY(0)} y2={toY(0)} />
      )}
      {crosses(axis.min, axis.max) && (
        <line className="plot-axis" x1={atX(0)} x2={atX(0)} y1={PAD.top} y2={PAD.top + innerH} />
      )}

      {data.series.map((series, index) => (
        <path
          key={series.label}
          className={`plot-curve${index > 0 ? " is-alt" : ""}`}
          d={curvePath(series.samples[0] ?? [], toX, toY)}
        />
      ))}

      <text className="plot-name" x={PAD.left} y={PAD.top - 7}>
        {data.value_label}
      </text>
      <text className="plot-name" x={width - PAD.right} y={height - 5} textAnchor="end">
        {axis.variable}
      </text>
    </svg>
  );
}

function Surface({ data, width }: { data: PlotResponse; width: number }) {
  const across = data.axes[0];
  const back = data.axes[1];
  const rows = data.series[0]?.samples;
  if (!across || !back || !rows) return null;

  const nominal = Math.round(Math.min(340, Math.max(200, width * 0.62)));
  const halfWidth = Math.max(40, (width - 68) / 2);
  const halfDepth = halfWidth * 0.26;
  const valueHeight = Math.max(40, nominal - 44 - halfDepth * 2);
  const frame: IsoFrame = {
    halfWidth,
    halfDepth,
    valueHeight,
    originX: width / 2,
    // The far corner sits a full value-axis below the top of the box, because
    // that is as high as the surface above it could reach.
    originY: 22 + valueHeight,
  };

  const [low, high] = valueDomain(data.value_min, data.value_max, 0);
  const toUnit = (value: number) => (value - low) / (high - low);
  const facets = isoFacets(rows, frame, toUnit);
  const base = [
    isoPoint(frame, 0, 0, 0),
    isoPoint(frame, 1, 0, 0),
    isoPoint(frame, 1, 1, 0),
    isoPoint(frame, 0, 1, 0),
  ];

  // Cropped to the drawing rather than to the box: 18px above for the value
  // label, 26 below for the two axis names.
  const [top, bottom] = isoExtent(rows, frame, toUnit);
  const viewTop = top - 18;

  return (
    <svg
      className="plot-svg"
      viewBox={`0 ${viewTop} ${width} ${bottom - viewTop + 26}`}
      role="img"
      aria-label={`${data.value_label} over ${across.variable} and ${back.variable}`}
    >
      <polygon className="plot-base" points={base.join(" ")} />
      {facets.map((facet, index) => (
        // Opacity carries the height. It is the one value here not read from a
        // token, and it cannot be: a single accent has to cover the whole range,
        // so how much of it shows *is* the shading.
        <polygon
          key={index}
          className="plot-cell"
          points={facet.points}
          style={{ fillOpacity: 0.22 + facet.shade * 0.46 }}
        />
      ))}

      <text className="plot-name" x={2} y={top - 6}>
        {data.value_label}
      </text>
      <text
        className="plot-name"
        x={frame.originX + halfWidth}
        y={frame.originY + halfDepth + 15}
        textAnchor="end"
      >
        {across.variable}
      </text>
      <text className="plot-name" x={frame.originX - halfWidth} y={frame.originY + halfDepth + 15}>
        {back.variable}
      </text>
    </svg>
  );
}
