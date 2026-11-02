# 토큰 절약 규칙

사용자 지시(WhaleExtentions에서 이어짐): "토큰을 최대한 덜 쓰는 방향으로". Claude와 Codex 모두 지킨다.

## 읽기

- **게시판 HTML(`tests/fixtures/*.html`, 실시간으로 받은 페이지)을 통째로 읽지 않는다.** 한 페이지가 6만에서 12만 바이트다.
  필요한 부분만: `grep -n 'board-list' <file> | head`, 또는 짧은 파이썬으로 `board-list-wrap` 뒤 2,000자만 출력한다.
- 일반 소스도 `rg -n`으로 위치를 먼저 찾고 해당 범위만 읽는다(`Read` offset/limit, `sed -n 'a,bp'`).
- 이미 읽은 파일은 다시 읽지 않는다. 수정 직후 검증 목적으로 다시 읽지 않는다.
- 문서는 필요한 절만 읽는다. daily-log는 오늘 파일만, 과거 기록은 검색으로 찾는다.

## 실행

- `scripts/check.sh`는 성공하면 조용하다. 출력이 없으면 성공이므로 같은 확인을 반복하지 않는다.
- 긴 출력은 `| tail -20`이나 `| grep -E 'FAIL|Error'`로 줄인다. `git diff`는 `--stat`부터 본다.
- 실제 게시판 확인은 `--dry-run` 한 번이면 충분하다. 반복 실행은 학교 서버에도 부담이다(`crawling.md`).

## 위임 (Claude 기준)

- 여러 파일을 훑는 탐색은 서브에이전트(Explore 또는 sonnet/haiku)에 맡기고 결론만 받는다.
- Codex 리뷰는 `--background`로 돌리고 결과는 요약만 가져온다. 같은 diff에 리뷰를 반복하지 않는다.

## 문서 쓰기

- AGENTS.md는 150줄 이내로 유지한다(모든 세션에 로드되므로). 상세는 rules와 skills로 내린다.
- HANDOFF.md는 40줄 이내, 현재 상태만 적는다. 이력은 daily-log로 보낸다.
