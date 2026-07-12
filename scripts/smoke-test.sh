#!/usr/bin/env bash
set -euo pipefail

echo "=== FlowBench Smoke Test ==="
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

PASS=0
FAIL=0

_pass() { PASS=$((PASS+1)); echo "  PASS"; }
_fail() { FAIL=$((FAIL+1)); echo "  FAIL: $*"; }

cleanup() {
  if [ -n "${CLI_PID:-}" ]; then
    kill -INT "$CLI_PID" 2>/dev/null || true
    wait "$CLI_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# ---- Phase A: Managed CLI (flowbench start) ----
echo ""
echo "=== Phase A: Managed CLI ==="

# 1. Ensure ports are free
for port in 8000 3000; do
  if lsof -ti :"$port" &>/dev/null; then
    echo "ERROR: Port $port already in use"
    exit 1
  fi
done

echo "--- Starting flowbench start ---"
"$SCRIPT_DIR/.venv/bin/python" -m services.orchestrator.cli start &
CLI_PID=$!

# 2. Wait for backend
echo "Waiting for backend..."
BACKEND_OK=false
for i in $(seq 1 15); do
  if curl -sf http://127.0.0.1:8000/health > /dev/null 2>&1; then
    BACKEND_OK=true
    echo "Backend ready (attempt $i)"
    break
  fi
  sleep 1
done
$BACKEND_OK && _pass || _fail "Backend not reachable"

# 3. Verify backend health JSON
HEALTH=$(curl -sf http://127.0.0.1:8000/health)
echo "$HEALTH" | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert d['status'] == 'ok', f'Expected ok, got {d[\"status\"]}'
assert 'version' in d, 'Missing version field'
print(f'  version: {d[\"version\"]}')
" && _pass || _fail "Backend health JSON invalid"

# 4. Wait for frontend
echo "Waiting for frontend..."
FRONTEND_OK=false
for i in $(seq 1 20); do
  if curl -sf http://localhost:3000 > /dev/null 2>&1; then
    FRONTEND_OK=true
    echo "Frontend ready (attempt $i)"
    break
  fi
  sleep 2
done
$FRONTEND_OK && _pass || _fail "Frontend not reachable"

# 5. Verify frontend serves HTML
HTML=$(curl -sf http://localhost:3000)
echo "$HTML" | python3 -c "
import sys
html = sys.stdin.read()
assert '<!DOCTYPE html>' in html or '<html' in html, 'Frontend did not return HTML'
print(f'  {len(html)} bytes received')
" && _pass || _fail "Frontend HTML invalid"

# 6. Create a project
curl -sf -X POST http://127.0.0.1:8000/api/v1/actions/start_new_project \
  -H 'Content-Type: application/json' \
  -d '{"scope_content": "Smoke test project"}' | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert d['status'] == 'ok', f'Expected ok, got {d[\"status\"]}'
assert d['new_state'] == 'scope_ready', f'Expected scope_ready, got {d[\"new_state\"]}'
print(f'  new_state: {d[\"new_state\"]}')
" && _pass || _fail "Project creation failed"

# 7. Verify state persistence
curl -sf http://127.0.0.1:8000/api/v1/state | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert d['project_state'] == 'scope_ready', f'Expected scope_ready, got {d[\"project_state\"]}'
assert d['mode'] == 'new_build', f'Expected new_build, got {d[\"mode\"]}'
print(f'  project_state: {d[\"project_state\"]}')
print(f'  mode: {d[\"mode\"]}')
" && _pass || _fail "State persistence failed"

# 8. Clean shutdown via SIGINT, verify cleanup
echo "--- Shutting down ---"
kill -INT "$CLI_PID" 2>/dev/null || true

# Wait for CLI to exit
CLI_GONE=false
for i in $(seq 1 10); do
  if ! kill -0 "$CLI_PID" 2>/dev/null; then
    CLI_GONE=true
    echo "CLI exited (attempt $i)"
    break
  fi
  sleep 1
done
$CLI_GONE && _pass || _fail "CLI did not exit after SIGINT"

# Wait a moment for kernel to release ports
sleep 2

# Verify ports are released
PORTS_CLEAR=true
for port in 8000 3000; do
  if lsof -ti :"$port" &>/dev/null; then
    echo "  Port $port still in use"
    PORTS_CLEAR=false
  fi
done
$PORTS_CLEAR && _pass || _fail "Ports not released after cleanup"

# ---- Summary ----
echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
echo "=== All smoke tests passed ==="
