#!/usr/bin/env bash
# 린트와 테스트. 성공하면 아무것도 출력하지 않는다(토큰 절약). 실패하면 원인만 보여 주고 1로 끝난다.
set -uo pipefail
cd "$(dirname "$0")/.."

out=$(uvx --quiet ruff check --quiet src tests 2>&1) || { echo "[ruff]"; echo "$out" | tail -30; exit 1; }

if [ -d tests ] && ls tests/test_*.py >/dev/null 2>&1; then
  out=$(uv run --quiet --with pytest pytest -q 2>&1); rc=$?
  # 5 = 모은 테스트 없음. 그 외 0이 아니면 실패
  if [ $rc -ne 0 ] && [ $rc -ne 5 ]; then echo "[pytest]"; echo "$out" | tail -30; exit 1; fi
fi
