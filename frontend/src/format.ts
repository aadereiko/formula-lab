/**
 * The shortest string that reads back as exactly this number.
 *
 * Constants are the reason this exists. Their real precision ranges from three
 * significant figures (`g_moon`) to seventeen (`k_e`), so any fixed digit count
 * is wrong in both directions at once: `toExponential(6)` printed `G` as
 * `6.674300e-11`, inventing two significant figures it does not have, while
 * printing `c` as `2.997925e+08` and throwing away three it does.
 *
 * `String` and argument-less `toExponential` both produce the shortest form
 * that round-trips, so neither can lie about precision. Taking whichever is
 * shorter is what keeps `mu_0` off the screen as `0.00000125663706212` without
 * rounding it.
 */
export function formatExact(value: number): string {
  if (!Number.isFinite(value)) return String(value);

  const plain = String(value);
  // Two-digit exponents, so a column of values stays aligned.
  const exponential = value.toExponential().replace(/e([+-])(\d)$/, "e$10$2");
  return exponential.length < plain.length ? exponential : plain;
}
