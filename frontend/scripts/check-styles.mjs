#!/usr/bin/env node
/**
 * Fail if a class the components render has no rule in any stylesheet.
 *
 * Neither `tsc` nor the bundler can catch this: `className="dialog"` is just a
 * string, so a stylesheet that lost half its rules still typechecks and still
 * builds. This closes that gap -- it is the one check that would have caught a
 * truncated `styles.css` immediately rather than after a visual read of the
 * page.
 *
 * Written in Node rather than Python because it runs inside `npm run build`,
 * and that script also runs in the Docker web stage, which is `node:alpine`
 * and has no Python. A guard that only works on the author's machine is not a
 * guard.
 *
 * Only plain literal class names are checked. A name assembled at runtime is
 * matched per-word where the words are literal; interpolated fragments are
 * skipped rather than guessed at.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

// A class name we accept as literal: lowercase, digits and dashes. This
// deliberately excludes anything with a hole, quotes or capitals, so template
// fragments cannot be mistaken for names. A trailing dash means the name was
// cut off by an interpolation, so it is a prefix, not a name.
const NAME = /^(?:[a-z][a-z0-9-]*[a-z0-9]|[a-z])$/;

// `className="a b"`, a template literal, and `className={"a b"}`. The template
// form keeps whatever literal words sit outside the holes.
const CLASS_ATTR = /className=(?:"([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\})/g;

const HOLE = /\$\{[^}]*\}/g;

// Names that live only in markup we do not own, or are set on <html>/<body>
// from JS rather than rendered by a component.
const EXEMPT = new Set();

function walk(dir, suffix, out = []) {
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, suffix, out);
    else if (entry.endsWith(suffix)) out.push(full);
  }
  return out;
}

function definedClasses() {
  const css = walk(SRC, ".css")
    .filter((path) => dirname(path) === SRC)
    .map((path) => readFileSync(path, "utf8"))
    .join("");
  const found = new Set();
  for (const match of css.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)) found.add(match[1]);
  return found;
}

/** Every literal class name, mapped to the file that renders it. */
function renderedClasses() {
  const found = new Map();
  for (const path of walk(SRC, ".tsx")) {
    for (const match of readFileSync(path, "utf8").matchAll(CLASS_ATTR)) {
      // Drop the holes first. Their contents are expressions, and an identifier
      // inside one is not a class name.
      const text = [match[1], match[2], match[3]]
        .filter(Boolean)
        .join(" ")
        .replace(HOLE, " ");
      for (const word of text.split(/\s+/)) {
        if (NAME.test(word) && !found.has(word)) found.set(word, relative(SRC, path));
      }
    }
  }
  return found;
}

const defined = definedClasses();
const rendered = renderedClasses();
const missing = [...rendered.keys()]
  .filter((name) => !defined.has(name) && !EXEMPT.has(name))
  .sort();

if (missing.length > 0) {
  console.log(`${missing.length} rendered class(es) have no CSS rule:\n`);
  for (const name of missing) {
    console.log(`  .${name.padEnd(24)} rendered by src/${rendered.get(name)}`);
  }
  console.log("\nEither add a rule or stop rendering the class.");
  process.exit(1);
}

console.log(`styles ok: ${rendered.size} rendered classes all have rules`);
