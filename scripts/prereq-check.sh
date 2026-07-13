#!/usr/bin/env bash
set -euo pipefail

PASS=0
FAIL=0
check() {
  if "$@" > /dev/null 2>&1; then
    echo "  ✓ $1"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $1"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== FlowBench Prerequisite Check ==="
echo ""
echo "--- Python toolchain ---"
check uv --version
check uv run python3 --version
check uv run python3 -c "import fastapi"
check uv run python3 -c "import pydantic"
check uv run python3 -c "import uvicorn"
check uv run python3 -c "import click"
echo ""
echo "--- Frontend toolchain ---"
check pnpm --version
check pnpm --prefix apps/web install --frozen-lockfile --dry-run 2>/dev/null || check test -d apps/web/node_modules
echo ""
echo "--- OpenCode ---"
check command -v opencode
if ! command -v opencode > /dev/null 2>&1; then
  echo "      Install: curl -LsSf https://opencode.ai/install.sh | sh"
fi
if [ -f "$HOME/.config/opencode/opencode.json" ]; then
  echo "  ✓ OpenCode config found at ~/.config/opencode/opencode.json"
  PASS=$((PASS + 1))
else
  echo "  ⚠ No default model config found at ~/.config/opencode/opencode.json"
  echo "      Configure a model there or via another OpenCode-supported method (see OpenCode docs)."
  echo "      This is a warning — OpenCode may still work if configured elsewhere."
fi
echo ""
echo "Passed: $PASS  Failed: $FAIL"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "Missing dependencies. Install them:"
  echo "  curl -LsSf https://astral.sh/uv/install.sh | sh    # Install uv"
  echo "  corepack enable && corepack prepare pnpm@latest --activate  # Install pnpm"
  echo "  uv sync                                              # Install Python deps"
  echo "  cd apps/web && pnpm install                          # Install frontend deps"
  echo "  curl -LsSf https://opencode.ai/install.sh | sh       # Install OpenCode"
  exit 1
fi
echo "All prerequisites satisfied."
