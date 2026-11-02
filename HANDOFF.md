# HANDOFF - 현재 작업 상태

> 어느 AI 도구든 세션을 시작하면 이 파일부터 읽는다. 현재 상태만 적고 40줄 이내로 유지한다.
> 마지막 갱신: 2026-11-02 Codex (GPT-6)

## 상태

- 마일스톤: M3 워크플로 로컬 준비 완료, 실제 서버 검증 전. M1 해외 접속 확인과 M2 실제 알림 수신도 남음.
- 계획: `docs/plans/2026-11-02_m3-actions-pages.md` (5/5, 로컬 범위 완료). M3 전체 완료 조건은 아직 미충족.
- 미커밋 변경: `.github/workflows/notice.yml`, `check-access.yml`, `.gitignore`, `README.md`, `GOAL.md`, `docs/DECISIONS.md`, M3 계획, 오늘 daily-log, 이 파일. 사용자 지시로 커밋과 push 금지, Claude 검토 후 커밋.
- 사용자 결정: 공개 저장소와 공개 Pages에 판정(`matched.json`)과 요약까지 게시. Canvas 데이터, 프로필, 키는 공개하지 않음(D-007 확정, D-012).
- 검증: `actionlint` v1.7.12, PyYAML 파싱, ruff, pytest 103개, `npm run build`, 빈 archive의 `export_site()` PWA/API v1 복사 통과.
- 확인 못 함: 실제 Actions, Pages, 해외 러너 접속, 실제 ntfy, 실제 Gemini와 Canvas, 휴대폰과 웨일 설치.

## 사용자가 할 일

- [ ] 공개 GitHub 저장소를 만들고 작업을 검토한 뒤 커밋, push.
- [ ] `NOTIFY_URLS` 등 Secrets와 `INTEREST_KEYWORDS` Variable을 설정(README). Pages Source는 GitHub Actions, Actions Workflow permissions는 Read and write.
- [ ] `Check overseas access`를 먼저 실행한 뒤 `Notice and Pages`를 수동 실행해 첫 기준선을 만든다.

## 알아 둘 것

- RapidOCR 모델은 설치 패키지의 `rapidocr/models`에 저장됨을 3.10.0 코드로 확인했다. 워크플로가 `uv sync --frozen` 뒤 해당 경로를 캐시한다.
- `state/canvas.json`은 공개 커밋 대신 Actions 캐시에 저장한다. 캐시가 삭제되면 Canvas 기준선을 다시 만들어 리마인드가 빠질 수 있다.
- `config/rules.yaml`이 없으면 워크플로가 예시 규칙을 복사한다. 저장소에 규칙을 커밋하면 공개된다.
- `export_site()`는 PWA와 `api/v1` JSON을 만들지만 D-007의 `boards/<id>.json`, GOAL.md의 `feed.xml`, `deadlines.ics`는 아직 만들지 않는다. M3 완료로 표시하지 않았다.
- `.env`는 읽지 않았고 실제 CLI 실행은 하지 않았다. 실제 서버 검증은 저장소가 생긴 뒤에만 가능하다.

## 다음 3단계

1. Claude가 워크플로 권한, 비밀 처리, Canvas 상태, Pages 경로를 리뷰하고 지적을 반영한다.
2. 검토 후 커밋과 push, 저장소 설정을 완료하고 `check-access`와 `notice`를 순서대로 실행한다.
3. 실제 알림과 Pages 설치를 확인하고 `boards/<id>.json`, `feed.xml`, `deadlines.ics` 생성 기능을 채운 뒤 M3 완료 여부를 판단한다.
