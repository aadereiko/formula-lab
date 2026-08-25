#!/usr/bin/env bash
# Start the API and the web app together, and shut both down on Ctrl-C.
set -euo pipefail

cd "$(dirname "$0")"

API_PORT="${FORMULA_LAB_PORT:-7731}"
WEB_PORT=7732

if [[ ! -x backend/.venv/bin/python ]]; then
  echo "backend/.venv is missing -- run 'make install' first." >&2
  exit 1
fi
if [[ ! -x frontend/node_modules/.bin/vite ]]; then
  echo "frontend/node_modules is missing -- run 'make install' first." >&2
  exit 1
fi

pids=()
cleanup() {
  trap - INT TERM EXIT
  for pid in ${pids[@]+"${pids[@]}"}; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

echo "API  -> http://127.0.0.1:${API_PORT}"
echo "Web  -> http://localhost:${WEB_PORT}"
echo "Ctrl-C stops both."
echo

# Launch each server as a single process rather than through a wrapper: `npm run
# dev` would leave Vite running as a grandchild that outlives the kill below.
(cd backend && FORMULA_LAB_PORT="$API_PORT" exec .venv/bin/python -m app.main) &
pids+=($!)

(cd frontend && FORMULA_LAB_API_PORT="$API_PORT" exec node_modules/.bin/vite --host 127.0.0.1) &
pids+=($!)

# Plain `wait`, not `wait -n`: macOS ships bash 3.2, which has no -n.
wait
