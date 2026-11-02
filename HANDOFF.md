# HANDOFF - 현재 작업 상태

> 어느 AI 도구든 세션을 시작하면 이 파일부터 읽고, 멈추기 전에 갱신한다(스킬 `session-handoff`).
> **현재 상태만** 적는다. 지난 이력은 `docs/daily-log/`와 git log에 있다. 40줄 이내로 유지한다.
> 마지막 갱신: 2026-11-02 Claude Code (Opus 5.5)

## 상태

- 마일스톤: M0 뼈대 (GOAL.md)
- 계획: `docs/plans/2026-11-02_m1-local-mvp.md` (0/8)
- 완료: 저장소 구조, 규칙, 스킬, 조사 문서, 게시판 HTML fixture 2개(2026-11-02 저장).
- 진행 중: 없음. 코드는 아직 없다(`src/skku_notice/__init__.py`만 있음).
- 결정 대기: D-001(실행 방식), D-002(알림 채널)는 "제안" 상태다. 사용자가 확정하면 상태를 "확정"으로 바꾼다.

## 사용자가 할 일

- [ ] D-001, D-002 제안 확인 (GitHub Actions + Apprise + ntfy)
- [ ] 휴대폰과 PC에 ntfy 앱 설치, 추측하기 어려운 토픽 이름 정하기 (저장소에 적지 않는다)
- [ ] `config/rules.example.yaml`을 `config/rules.yaml`로 복사하고 내 기준으로 고치기
- [ ] (M3 전) GitHub 저장소 만들지, 공개/비공개 결정 (비공개면 Actions 무료 시간 확인, D-001)

## 알아 둘 것

- 남의 코드는 적극 가져다 쓴다. 라이선스별 기준은 D-006 (`docs/research/open-source.md`).
- GitHub Actions 러너(미국 IP)에서 skku.edu 접속이 되는지 아직 확인 안 함. M1 계획 1단계에 있다.

## 다음 3단계

1. M1 계획 1단계: 러너에서 접속 확인용 최소 워크플로 또는 해외 IP 확인
2. 파서와 fixture 테스트 (Codex 구현, Claude 리뷰)
3. rules 매칭과 `--dry-run` CLI
