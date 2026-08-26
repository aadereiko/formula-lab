#!/usr/bin/env node
/**
 * Tests the offline engine, which is the only code in this app that produces an
 * *answer* without a server checking it.
 *
 * Self-contained on purpose: it bundles the TypeScript with esbuild in memory
 * and asserts against values taken from the API. No backend needs to be running,
 * so this belongs in `make test` rather than in a manual comparison script.
 *
 * The pole and the periodic cases below are regression tests, not examples. Both
 * were real bugs: bisection reported the pole of `v = d/t` at t = 0 as a root,
 * and a geometric probe ladder returned an answer exactly 2*pi away from the
 * server's for Snell's law.
 */

import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const bundle = await build({
  entryPoints: [join(root, "src/offline/index.ts")],
  bundle: true,
  write: false,
  format: "esm",
  platform: "neutral",
  logLevel: "error",
});
const source = bundle.outputFiles[0].text;
const engine = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));

const { analyzeOffline, evaluateOffline } = engine;

let failures = 0;
const check = (label, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    console.log(`  FAIL ${label}\n       got      ${a}\n       expected ${e}`);
    failures += 1;
  }
};
const throws = (label, fn, fragment) => {
  try {
    fn();
    console.log(`  FAIL ${label}: expected a rejection, got a result`);
    failures += 1;
  } catch (error) {
    if (!String(error.message).includes(fragment)) {
      console.log(`  FAIL ${label}: message was ${JSON.stringify(error.message)}`);
      failures += 1;
    }
  }
};

const solve = (expr, values, target, precision = 6) =>
  evaluateOffline(expr, values, precision, target).primary.formatted;

// -- analyze mirrors the API ------------------------------------------------
check("symbols order", analyzeOffline("F = m*a").symbols, ["F", "a", "m"]);
check("subject", analyzeOffline("F = m*a").subject, "F");
check("no subject for a compound left side", analyzeOffline("v^2 = 2*a*s").subject, null);
check("expression is not an equation", analyzeOffline("1/2 m v^2").is_equation, false);
check("functions from the source text", analyzeOffline("T = 2*pi*sqrt(L/g)").functions_used, ["sqrt"]);
check("pi is a value, not a variable", analyzeOffline("C = 2*pi*r").symbols, ["C", "r"]);
check("subscripts survive", analyzeOffline("v = v_0 + a*t").symbols, ["a", "t", "v", "v_0"]);
check("latex stacks a fraction", analyzeOffline("v = d/t").latex, "v = \\frac{d}{t}");

// -- evaluating ------------------------------------------------------------
check("implicit multiplication", evaluateOffline("1/2 m v^2", { m: "2", v: "3" }, 6, null).primary.formatted, "9");
check("power is right-associative", evaluateOffline("2^3^2", {}, 6, null).primary.formatted, "512");
check("unary minus", evaluateOffline("-3 + 1", {}, 6, null).primary.formatted, "-2");

// -- solving, against values the API produced ------------------------------
check("linear", solve("F = m*a", { m: "2", a: "3" }, "F"), "6");
check("linear, other direction", solve("F = m*a", { F: "6", a: "3" }, "m"), "2");
// The pole regression: t appears in a denominator, and f runs -inf -> +inf
// across t = 0, which every bracket test reads as a sign change.
check("unknown in a denominator", solve("v = d / t", { v: "3", d: "2" }, "t"), "0.666667");
check("denominator, again", solve("P = F / A", { P: "3", F: "2.5" }, "A"), "0.833333");
// The periodic regressions. Both come straight from the API. The second is the
// one that exposed the geometric ladder: it returned an answer exactly 2*pi out,
// because `[3, 10]` holds several roots of `sin` and bisection took whichever
// the sign test happened to bracket.
check("periodic", solve("n_1*sin(theta_1) = n_2*sin(theta_2)", { n_1: "2", n_2: "2.5", theta_2: "3" }, "theta_1"), "0.177328");
check("periodic, the 2*pi case", solve("n_1*sin(theta_1) = n_2*sin(theta_2)", { n_1: "2", n_2: "2.5", theta_2: "3.5" }, "theta_1"), "3.5955");
check("through a sqrt", solve("v = sqrt(2*G*M / r)", { M: "2.5", r: "3", v: "3.5" }, "G"), "7.35");
check("quadratic prefers the positive root", solve("E = 1/2*m*v^2", { E: "9", m: "2" }, "v"), "3");
check("pi is available", solve("C = 2*pi*r", { C: "6.28319" }, "r"), "1");

// -- honest failures -------------------------------------------------------
throws("a character the parser rejects", () => analyzeOffline("a $ b"), "not allowed");
throws("two equals signs", () => analyzeOffline("a = b = c"), "single '='");
throws("two blanks", () => solve("F = m*a", { m: "2" }, null), "Still blank");
throws("a value that is not a number", () => solve("F = m*a", { m: "x", a: "2" }, "F"), "not a number");
// A real-number solver cannot reach a complex answer, and says so rather than
// inventing one.
throws("complex answer", () => solve("v^2 = v_0^2 + 2*a*s", { a: "2", s: "2.5", v: "3" }, "v_0"), "Reconnect");

if (failures) {
  console.log(`\noffline engine: ${failures} check(s) failed`);
  process.exit(1);
}
console.log("offline ok: engine agrees with the API on every checked case");
