@AGENTS.md
@HANDOFF.md

# Claude Code 전용 메모

공통 규칙은 위의 AGENTS.md가 전부다. 아래는 Claude Code에만 해당하는 내용이다.

- **Codex 호출**은 슬래시 커맨드를 `Skill`로 부를 수 없다. companion 스크립트를 Bash로 직접 부른다. 정확한 명령은 스킬 `cross-agent`에 있다.
- **역할**: 코드 구현은 Codex에 맡기고(`task --write`), Claude는 계획, 명세, diff 리뷰, 실제 실행 확인, 커밋을 한다.
  Codex 한도가 떨어졌으면 Claude가 직접 구현하고, 리뷰는 한도가 돌아온 뒤 Codex에 맡긴다.
- **서브에이전트 모델**: 넓은 탐색은 `Explore`(또는 `model: "sonnet"`)에 맡기고 결론만 받는다. 단순 조회는 `haiku`로 한다.
- **skill-creator**: 새 스킬을 만들거나 고칠 때는 `anthropic-skills:skill-creator`를 따른다.
  결과물은 `.agents/skills/<name>/`에 두고 `.claude/skills/<name>` 심링크를 추가한다.
- **context7**: 플러그인으로 연결되어 있다. Apprise, httpx, selectolax, PyYAML, GitHub Actions 문서를 여기서 확인한다.
- 토큰이 부족해지면 `/codex:transfer`로 넘길 수 있다. 그 전에 HANDOFF.md 갱신과 커밋을 먼저 한다(스킬 `session-handoff`).
