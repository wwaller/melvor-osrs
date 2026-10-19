#!/bin/bash
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
python3 "$REPO/tools/core.py" >/dev/null
log="$(mktemp)"
status=0
for test in "$REPO"/core/test/*.test.mjs "$REPO"/*/dev/*.test.mjs; do
  [ -e "$test" ] || continue
  if node --test "$test" >"$log" 2>&1; then
    echo "ok    ${test#$REPO/}"
  else
    echo "FAIL  ${test#$REPO/}"
    grep -E "^not ok|error:" "$log" | head -5
    status=1
  fi
done
exit $status
