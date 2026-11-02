# Git 커밋 규칙

사용자 상시 지시(WhaleExtentions에서 이어짐): "각각 뭘 수정했는지 알기 위해서 git에 커밋은 계속 해줘야해."

- 의미 있는 변경 하나가 끝나면 **묻지 않고 바로 커밋한다.** 세션 끝에 몰아서 하지 않는다.
- 메시지는 Conventional Commits 형식이고 본문은 한국어로 쓴다. scope는 `core`, `parser`, `notify`, `rules`, `ci`, `repo` 중 하나다.
  ```
  feat(parser): 성대 CMS 목록 파서와 fixture 테스트
  fix(notify): ntfy 클릭 URL에 articleNo 누락 수정
  chore(ci): 예약 실행 간격 30분으로 변경
  docs(repo): HANDOFF 갱신
  ```
  type은 feat, fix, refactor, perf, docs, chore, test를 쓴다.
- 본문에는 "왜"와 "어떻게 검증했는지"(pytest만인지, `--dry-run`으로 실제 게시판을 봤는지, 실제 알림을 받았는지)를 한두 줄 적는다.
- 같은 작업에서 고친 daily-log와 HANDOFF.md는 해당 커밋에 함께 넣어도 된다.
- 커밋 전에 `git status --short`로 `.env`, `config/rules.yaml`(개인 기준, 비밀 아님이지만 사용자 선택), 큰 파일이 섞이지 않았는지 본다.
- `state/` 변경은 Actions 봇 커밋(`chore(state): ...`)만 한다. 사람이나 에이전트는 state를 손으로 커밋하지 않는다.
- **push는 사용자가 요청할 때만 한다.** `--force`와 `reset --hard`는 확인 후에만 한다.
- Codex가 만든 변경도 같은 규칙을 따른다. 리뷰 지적을 고쳤으면 `fix(<scope>): address review - ...`로 남긴다.
