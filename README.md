# skku-notice-alert

성균관대 공지 게시판(전체 공지, 소프트웨어학과 공지)을 15분마다 읽고, **내가 정한 기준에 맞는 글만** 휴대폰과 PC에 알림으로 보낸다.
알림을 누르면 원문이 열린다. PC가 꺼져 있어도 GitHub Actions에서 돈다. 같은 데이터를 JSON API로도 낸다.

- 지금 상태: 뼈대만 있음 (M0). 진행 상황은 [HANDOFF.md](HANDOFF.md), 목표는 [GOAL.md](GOAL.md).
- 구조: Python, httpx, selectolax, Apprise, ntfy, GitHub Actions, GitHub Pages. 결정 이유는 [docs/DECISIONS.md](docs/DECISIONS.md).
- 참고한 프로젝트: [docs/research/open-source.md](docs/research/open-source.md).

## 쓰는 법 (M2 이후)

1. 휴대폰과 PC에 ntfy 앱을 설치하고 추측하기 어려운 토픽을 구독한다.
2. `.env.example`을 `.env`로 복사하고 `NOTIFY_URLS`에 `ntfys://<토픽>`을 넣는다.
3. `config/rules.example.yaml`을 `config/rules.yaml`로 복사해 기준을 고친다.
4. `uv run skku-notice --dry-run --all`로 어떤 글이 올지 미리 본다.

## AI로 개발하기

Claude Code와 Codex가 번갈아 작업한다. 규칙 정본은 [AGENTS.md](AGENTS.md), 역할 분담은 [docs/WORKFLOW.md](docs/WORKFLOW.md).
새 세션에서는 "HANDOFF 보고 이어서 해줘"라고 하면 된다.
