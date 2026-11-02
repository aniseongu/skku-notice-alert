---
name: feature-change
description: skku-notice-alert에서 기능 추가, 버그 수정, 동작 변경을 하는 표준 절차. 범위 확정, 계획, Codex 구현 위임, diff 리뷰, check.sh, --dry-run 실제 게시판 확인, 실제 알림 확인, daily-log, 커밋, 교차 리뷰까지. "파서 만들어줘", "알림이 두 번 와", "마감 리마인드 넣어줘"처럼 코드가 바뀌는 요청이면 먼저 이 스킬을 따른다.
---

# 기능 변경 절차

작은 수정이면 1, 3, 4, 6, 7, 8로 끝난다.

## 1. 범위 확정

- `GOAL.md`의 어느 마일스톤에 해당하는지 본다. 범위 밖(로그인 페이지, 자동 신청 등)이면 멈추고 사용자에게 묻는다.
- `HANDOFF.md`에 진행 중인 작업이 있으면 그것부터 이어 갈지 확인한다.
- 시작 hash를 기억한다: `git rev-parse --short HEAD` (교차 리뷰의 `--base`로 쓴다).

## 2. 계획 (큰 작업만)

- 30분이 넘거나 state 형식, 실패 처리, 워크플로 권한, 알림 채널을 바꾸면 `docs/plans/YYYY-MM-DD_<topic>.md`를 `TEMPLATE.md`로 만든다.
- 완료 조건은 측정 가능하게: "fixture로 15건 파싱", "`--dry-run`에서 장학 글 2건 출력", "휴대폰에 알림 1건, 누르면 원문".

## 3. 구현

- 직접 짜기 전에 `docs/research/open-source.md`에서 가져다 쓸 코드가 있는지 본다(D-006). 성대 CMS 파서와 마감 추출은 tsungmnli/skku-notice-api부터.
- 기본은 Codex에 위임한다(스킬 `cross-agent`의 "구현 위임"). 프롬프트에 넣을 것:
  1. "AGENTS.md를 먼저 읽고 따르라", 관련 rules 파일 이름
  2. 바꿀 파일과 건드리지 말 것(state/, .github/workflows의 권한, config/rules.yaml)
  3. 완료 조건, `scripts/check.sh` 통과, 보고 형식(변경 파일, 검증, 미검증)
  4. "커밋하지 말 것"
- Codex 한도가 없으면 직접 짠다. 그때는 6단계에서 Codex 리뷰가 필수다(한도가 돌아온 뒤라도).

## 4. 검증

```zsh
scripts/check.sh                       # ruff + pytest, 성공하면 조용함
uv run skku-notice --dry-run           # 실제 게시판 1회, 알림 보내지 않고 매칭 결과만 출력 (M1 이후)
```

- `--dry-run`은 state를 쓰지 않아야 한다. 확인할 것: 게시판별 파싱 건수, 새 글 판정, 매칭된 글과 이유.
- 알림 경로를 바꿨으면 테스트용 ntfy 토픽으로 실제 알림 1건을 받아 보고, 누르면 원문이 열리는지 사용자에게 확인받는다.
- 확인하지 못한 것은 "확인 못 함"으로 적는다.

## 5. 리뷰 (위임한 경우)

- `git diff --stat`부터 보고, 핵심 파일만 읽는다. 확인할 것: 네트워크가 fetch와 notify 밖으로 새지 않았는지, 비밀이 로그에 찍히지 않는지, 실패 시 state 처리(D-005), 테스트가 네트워크를 안 쓰는지.

## 6. 기록과 커밋

- `docs/daily-log/<오늘>.md`에 항목 추가, 결정이 있었으면 `docs/DECISIONS.md`.
- 커밋: `<type>(<scope>): <요약>` (`.claude/rules/git-commit.md`).
- 계획 체크박스, 마일스톤이 끝났으면 `GOAL.md` 체크박스도 바꾼다.

## 7. 교차 리뷰

- 코드를 짠 쪽의 반대 도구가 리뷰한다. `review --base <시작 hash>` 또는 위험 변경이면 `adversarial-review`.
- 지적은 실제 코드로 확인하고, 반영했으면 `fix(<scope>): address review - ...`, 안 했으면 daily-log에 이유 한 줄.

## 8. HANDOFF

- 멈추거나 마일스톤이 끝나면 `HANDOFF.md`를 덮어쓰고 커밋한다(스킬 `session-handoff`).
