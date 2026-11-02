# WORKFLOW - Claude와 Codex 함께 쓰기

사람용 요약이다. 에이전트용 규칙은 `AGENTS.md`가 정본이고, 정확한 명령은 스킬 `cross-agent`에 있다.

## 한눈에 보기

```
사용자: "M1 파서 만들어줘"
  |
  v
Claude Code (Opus 5.5)  계획 쓰기 (docs/plans), 명세와 완료 조건 정하기
  |
  |  codex exec ... --write  (구현 위임, 커밋 금지)
  v
Codex (gpt-6-sol)       src/, tests/ 구현, scripts/check.sh 통과까지
  |
  v
Claude Code             git diff 리뷰, --dry-run으로 실제 게시판 확인, 커밋, daily-log
  |
  v
(Claude가 직접 짠 코드면) Codex review --base <시작 hash>  교차 리뷰
```

## 역할

| 일 | 기본 담당 | 이유 |
|---|---|---|
| 계획, GOAL과 DECISIONS 갱신, 명세 | Claude | 사용자와 대화하며 정함 |
| 파서, 매칭, state, 알림 코드와 테스트 | Codex (gpt-6-sol, medium) | 토큰이 싸고 구현이 빠름 |
| diff 리뷰, 실제 실행 확인, 커밋 | Claude | 같은 모델의 자기 리뷰는 맹점을 공유함 |
| Claude가 짠 코드의 리뷰 | Codex (`review` 또는 `adversarial-review`) | 반대쪽이 본다 |
| 넓은 탐색, 로그 요약 | Claude 서브에이전트(sonnet, haiku) 또는 gpt-6-luna | 싸게 |

한쪽 한도가 떨어지면 지금 쓰는 도구가 구현하고, 리뷰는 한도가 돌아온 뒤 반대쪽이 한다. 미룬 리뷰는 HANDOFF에 적는다.

## 리뷰 시점

| 시점 | 무엇을 | 어떻게 |
|---|---|---|
| 의미 있는 변경 직후 | 그 작업의 diff | `review --base <작업 시작 hash>` |
| state 형식, 실패 처리, 워크플로 권한(`contents: write`), 비밀 처리 | 설계 자체 | `adversarial-review` + 초점 문구 |
| 마일스톤 마무리 | 마일스톤 전체 | 위와 같음. 결과는 daily-log에 요약 |

같은 diff에 리뷰를 반복하지 않는다(토큰 절약).

## 기록 체계

| 언제 | 어디에 |
|---|---|
| 무엇을 만들지 | `GOAL.md` (마일스톤) |
| 작업 전 | `docs/plans/YYYY-MM-DD_<topic>.md` (체크박스) |
| 작업 중, 멈출 때 | `HANDOFF.md` (현재 상태만, 덮어씀) |
| 작업 후 | `docs/daily-log/YYYY-MM-DD.md` (누적) |
| 영구 결정 | `docs/DECISIONS.md` (D-NNN) |
| 조사 | `docs/research/` |

## 토큰이 끊길 때

1. 끊기기 전에 스킬 `session-handoff`를 따른다. HANDOFF.md를 갱신하고 커밋한다.
2. 다른 도구를 열고 "이어서 해줘"라고 하면 HANDOFF.md, git log, 계획 체크박스 순서로 재개한다.
