# AGENTS.md - skku-notice-alert

성균관대 공지 게시판을 주기적으로 읽고, **사용자가 정한 기준에 맞는 글만** 휴대폰과 PC로 알려 주는 개인 프로젝트다.
알림을 누르면 원문이 열려서 바로 신청할 수 있어야 한다.
Claude Code와 Codex가 번갈아 작업한다. **이 파일이 정본**이다. `CLAUDE.md`는 이 파일을 import하고 Claude 전용 메모만 덧붙인다.

## 0. 세션 시작 시 (어느 도구든)

1. `HANDOFF.md`를 읽는다. 이전 세션(다른 AI 도구일 수 있음)이 멈춘 지점이다.
2. `git log --oneline -10`과 `git status --short`로 실제 상태를 확인한다. HANDOFF와 다르면 git이 맞다.
3. `GOAL.md`에서 지금 마일스톤을 확인하고, 해당 계획(`docs/plans/`)의 남은 체크박스부터 이어 간다.

## 1. 구조

```
GOAL.md                 무엇을 만들고 언제 끝났다고 보는지 (마일스톤, 완료 조건)
config/sources.yaml     감시할 게시판 목록 (URL, 파서 종류, 주기)
config/rules.yaml       사용자 알림 기준 (키워드, 분류, 제외어). 예시는 rules.example.yaml
src/skku_notice/        코드 (아래 모듈 경계)
tests/fixtures/         실제 게시판 HTML 저장본. 파서 테스트는 네트워크 없이 이것으로 돈다
state/                  이미 알린 글 기록 (Actions가 커밋). 사람이 손으로 고치지 않는다
site/                   정적 API 출력 (api/v1/*.json, feed.xml, deadlines.ics). Actions가 만들어 Pages로 낸다 (M3, D-007)
web/                    PWA 화면 (Vite, Lit, vite-plugin-pwa). 빌드 결과 web/dist를 export가 site/로 복사한다 (D-011)
api/                    FastAPI 서버 (M5, D-007 2단계). 그 전까지 없다
.github/workflows/      주기 실행 (M3에서 만든다)
scripts/check.sh        정적 검사와 테스트. 성공하면 조용하다
docs/plans/             작업 전 계획 (체크박스) - YYYY-MM-DD_<topic>.md
docs/daily-log/         작업 후 기록 - YYYY-MM-DD.md
docs/research/          조사 결과 (오픈소스, 게시판 구조)
docs/DECISIONS.md       영구 설계 결정 (D-NNN)
docs/WORKFLOW.md        Claude와 Codex 역할 분담, 리뷰 루프
.agents/skills/         공용 스킬 정본 (Codex가 읽음). .claude/skills/는 심링크
.claude/rules/          상세 규칙 (Claude는 자동 로드, Codex는 6절 표를 보고 읽는다)
```

### 모듈 경계 (파이프라인)

`fetch` (HTML 받기) 다음 `parse` (글 목록으로) 다음 `dedupe` (state와 비교) 다음 `match` (rules 적용) 다음 `notify` (Apprise로 보내기) 다음 `state` 저장 다음 `export` (정적 API 파일 쓰기).
API 응답 형식(JSON 필드 이름)은 한 번 정하면 바꾸지 않는다. 바꿔야 하면 `api/v2/`를 새로 만든다.
각 단계는 순수 함수에 가깝게 만들고, 네트워크는 `fetch`와 `notify`에만 둔다. 그래야 fixture로 전부 테스트된다.

## 2. 절대 규칙

- **비밀(알림 URL, 토큰, ntfy 토픽 이름)은 코드, 로그, 문서, 커밋에 남기지 않는다.** 로컬은 `.env`, Actions는 Secrets로만 받는다. `.env`는 읽지 않는다.
  ntfy 공개 서버의 토픽 이름은 사실상 비밀번호다(아는 사람은 누구나 구독 가능).
- **학교 서버를 배려한다.** 게시판당 요청은 실행 1회에 목록 1페이지가 기본이고, 주기는 15분보다 짧게 하지 않는다. 상세: `.claude/rules/crawling.md`
- 로그인이 필요한 페이지(킹고, GLS)는 다루지 않는다. 예외는 아이캠퍼스(Canvas)의 **개인 액세스 토큰 API**뿐이고, 알림에만 쓰며 공개 출력(`site/`)에 내보내지 않는다(D-012). 범위를 더 바꾸려면 사용자에게 먼저 묻는다.
- **첫 실행은 알림을 보내지 않는다.** state가 비어 있으면 현재 글을 모두 "본 것"으로 저장만 한다(알림 폭탄 방지).
- **알림 누락보다 드문 중복을 택한다**(적어도 한 번 전달). 알림 실패는 재시도하고, 알림 뒤 state 저장이 실패한 드문 경우의 중복은 감수한다. 순서와 실패 처리는 D-005를 따른다.
- **커밋은 의미 있는 변경마다 바로 한다**(묻지 않음). push는 사용자 확인 후에만 한다. 상세: `.claude/rules/git-commit.md`
- `rm -rf`, `git reset --hard`, `git push --force`, state 파일 초기화는 사용자 확인 후에만 한다.
- **다른 프로젝트 코드를 라이선스 따지지 말고 적극 가져다 쓴다**(사용자 지시 2026-11-02: "라이선스 신경쓰지말고 그냥 막 활용해"). 직접 짜기 전에 `docs/research/open-source.md`부터 본다.
  가져온 파일 맨 위에 `# 출처: <URL>` 한 줄만 남긴다(나중에 원본과 비교하거나 고칠 때 쓰려고). D-006

## 3. 토큰 절약 (중요) - 상세: `.claude/rules/token-economy.md`

- `tests/fixtures/*.html`은 통째로 읽지 않는다. `grep -n`이나 짧은 파이썬으로 필요한 줄만 본다.
- 스크립트는 성공하면 조용하다. 출력이 없으면 성공이다. 같은 확인을 반복하지 않는다.
- 탐색은 `rg -n`으로 위치부터 찾고 필요한 줄만 읽는다. 문서는 목차와 해당 절만 읽는다.

## 4. 작업 루프 (상세: 스킬 `feature-change`)

1. 계획: 30분 넘는 작업이나 되돌리기 어려운 작업(state 형식, 워크플로 권한)이면 `docs/plans/`에 체크박스 계획부터 쓴다.
2. 수정: 누가 짜는가는 `docs/WORKFLOW.md`를 따른다. 기본은 Codex가 구현하고 Claude가 리뷰한다.
3. 검증: `scripts/check.sh`(ruff, pytest)를 돌리고, 실제 게시판에 대해 `--dry-run`으로 한 번 돌려 본다.
   정적 검사 통과는 동작한다는 증거가 아니다. 실제 알림을 받아 보지 못했으면 못 했다고 적는다.
4. 기록: `docs/daily-log/<오늘>.md`에 항목을 추가하고, 설계 결정이 있었으면 `docs/DECISIONS.md`에 남긴다.
5. 커밋: `<type>(<scope>): <요약>`. scope는 `core`, `parser`, `notify`, `rules`, `ci`, `repo` 중 하나다.
6. 리뷰: 의미 있는 diff는 교차 리뷰한다(Claude가 짰으면 Codex가, Codex가 짰으면 Claude가). 스킬 `cross-agent`

## 5. 세션 종료 / 토큰이 떨어질 때 (스킬 `session-handoff`)

남은 토큰이 적거나 작업을 멈출 때는 **먼저** `HANDOFF.md`를 갱신하고 커밋한다.
목표, 완료한 것(검증 방법 포함), 진행 중인 지점, 실패한 시도, 다음 3단계를 적는다.

## 6. 규칙 파일 색인 (Codex는 해당 작업 전에 읽는다)

| 파일 | 언제 |
|---|---|
| `.claude/rules/git-commit.md` | 커밋할 때 |
| `.claude/rules/token-economy.md` | 항상 (요약은 3절) |
| `.claude/rules/docs-logging.md` | daily-log, plans, DECISIONS, HANDOFF를 쓸 때 |
| `.claude/rules/crawling.md` | `fetch`, `parse`, `config/sources.yaml`, 워크플로 주기를 다룰 때 |
| `.claude/rules/python-style.md` | `src/`, `tests/`를 고칠 때 |
| `docs/DESIGN.md`, `docs/design/*.md` | `web/`(화면), 아이콘, 알림 문구를 고칠 때. 고친 뒤 `docs/design/review-log.md` 절차로 캡처하고 평가받는다 |

## 7. 도구

- 공용 스킬 (`.agents/skills/`): `feature-change`(표준 작업 절차), `add-board`(게시판 추가), `tune-rules`(알림 기준 조정),
  `cross-agent`(Claude와 Codex 호출, 리뷰), `session-handoff`(인수인계), `systematic-debugging`(버그 원인 찾기)
- 라이브러리 문서는 기억에 의존하지 말고 context7로 확인한다(Apprise, httpx, selectolax, GitHub Actions 등).
- 셸은 zsh다. 스크립트는 `bash` shebang으로 **실행**하고 `source`하지 않는다. 파이썬은 `uv`로 관리한다.
