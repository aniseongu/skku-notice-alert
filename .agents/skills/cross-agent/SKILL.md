---
name: cross-agent
description: Claude Code와 Codex 오케스트레이션. 누가 구현하고 누가 리뷰하는지, 상황별 모델 선택(Opus/Sonnet/Haiku, gpt-6-sol/gpt-6-luna, astra는 요청 시에만), Claude에서 Codex를 부르는 정확한 명령(codex-companion review, adversarial-review, codex exec 구현 위임), Codex에서 Claude를 부르는 명령(claude -p). 구현을 맡기거나, 교차 리뷰를 하거나, 막혀서 다른 AI 의견이 필요할 때 사용한다.
---

# Claude와 Codex 오케스트레이션

## 역할 기본값

- **Codex가 구현하고 Claude가 명세, 리뷰, 실제 확인, 커밋을 한다**(사용자 선호, WhaleExtentions에서 이어짐).
- 한쪽 한도가 떨어지면 지금 사용자가 쓰는 도구가 구현한다. 리뷰는 반대쪽이 한다(같은 모델의 자기 리뷰는 맹점을 공유).
- 위임한 결과는 그대로 받지 않는다. `git diff`로 다시 읽고 판단한다. 커밋은 Claude(또는 그 세션의 메인 도구)가 한다.
- 두 에이전트가 같은 파일을 동시에 고치지 않게 파일 단위로 나눈다.

## 모델 선택표

| 상황 | Claude Code 쪽 | Codex 쪽 |
|---|---|---|
| 일상 구현, 버그 수정 | Opus 5.5 (메인) | `gpt-6-sol`, effort `medium` (기본값) |
| 넓은 탐색, 로그 요약, 단순 조회 | 서브에이전트 `sonnet` / `haiku` | `gpt-6-luna`, effort `low` |
| 일반 diff 리뷰 | `claude -p --model sonnet` | `gpt-6-sol` |
| 위험 변경 리뷰(state 형식, 실패 처리, 워크플로 권한, 비밀 처리) | `claude -p --model opus` | `gpt-6-sol` + effort `high` |
| 막혔을 때 2nd opinion | Codex `gpt-6-sol` high | `claude -p --model opus` |

**`gpt-6-astra`는 쓰지 않는다**(사용자 피드백: 토큰을 너무 많이 씀). 사용자가 명시적으로 요청할 때만, 올리기 전에 묻는다.
리뷰 범위는 좁게(`--base`를 작업 시작 hash로, 초점 문구에 파일명). 저장소 전체 리뷰는 피한다.

---

## A. Claude Code에서 Codex 부르기

슬래시 커맨드(`/codex:review` 등)는 사용자가 직접 칠 때만 동작한다. Claude는 companion 스크립트를 Bash로 실행한다.

```zsh
CX=$(ls -d ~/.claude/plugins/cache/openai-codex/codex/*/scripts/codex-companion.mjs | sort -V | tail -1)
```

| 목적 | 명령 |
|---|---|
| 커밋 전 작업트리 리뷰 | `node "$CX" review --background --scope working-tree` |
| 커밋된 범위 리뷰 | `node "$CX" review --background --base <작업 시작 hash>` |
| 초점 있는 적대적 리뷰 | `node "$CX" adversarial-review --background --model gpt-6-sol --base <hash> "<초점: 파일명과 걱정거리>"` |
| 진행 확인 / 결과 | `node "$CX" status` / `node "$CX" result <job-id>` |

### 구현 위임 (쓰기)

companion의 `task --background`는 Claude의 Bash 호출이 끝나면 함께 끊길 수 있다(WhaleExtentions 2026-10-26 경험).
긴 구현은 `codex exec`를 Bash `run_in_background`로 돌린다. **`< /dev/null` 필수**(없으면 stdin을 기다리며 멈춤).

```zsh
codex exec -m gpt-6-sol -c model_reasoning_effort=medium -s workspace-write \
  -c sandbox_workspace_write.network_access=true -C "$PWD" \
  -o /tmp/codex-<topic>.md "<프롬프트>" < /dev/null
```

- 시작 1에서 3분 뒤 `~/.codex/sessions/**/rollout-*.jsonl`이 새로 생겨 커지는지 본다. 10분 넘게 진전이 없으면 취소하고 범위를 좁혀 다시 맡긴다.
- `review`는 내장 리뷰어라 초점 문구를 받지 않는다. 초점이 필요하면 `adversarial-review`.
- 가용성만 확인하려면 `node "$CX" setup --json`. `adversarial-review`를 `--help` 용도로 돌리지 않는다(실제 리뷰가 돈다).

### 위임 프롬프트에 반드시 넣을 것

Codex의 새 스레드는 이 대화를 모른다.

1. "AGENTS.md를 먼저 읽고 따르라" + 관련 rules 파일(`crawling.md`, `python-style.md`)
2. 바꿀 파일과 건드리지 말 것(`state/`, `config/rules.yaml`, 워크플로 권한)
3. 완료 조건, `scripts/check.sh` 통과, 보고 형식(변경 파일, 검증, 미검증)
4. "커밋하지 말 것. 커밋은 Claude가 diff를 검토한 뒤 한다"

---

## B. Codex에서 Claude Code 부르기

```zsh
# 리뷰 (읽기 전용)
claude -p --model sonnet --permission-mode plan \
  "AGENTS.md를 따르는 리뷰어로서 git diff <base>..HEAD 를 리뷰하라. 버그, 실패 처리(D-005), 비밀 노출, 학교 서버 요청 수(crawling.md)만 지적하고 파일:줄과 근거를 달아라. 코드를 고치지 마라."

# 위험 변경 리뷰
claude -p --model opus --permission-mode plan "<같은 형식>"
```

- `claude`는 네트워크를 쓴다. Codex 샌드박스 안에서는 승인(escalation)을 요청해서 실행한다.
- 출력이 길면 `--output-format json`으로 받아 `.result`만 쓴다.

---

## 리뷰 결과 처리 (양쪽 공통)

- 리뷰어의 보고를 그대로 믿지 않는다. 지적마다 실제 코드를 확인한다.
- 타당하면 고치고 `fix(<scope>): address review - ...`로 커밋한다. 아니면 daily-log에 "리뷰 지적 X는 Y 때문에 반영 안 함" 한 줄.
- 같은 diff에 리뷰를 두 번 이상 돌리지 않는다. 수정 후 재리뷰는 위험 변경일 때만.
