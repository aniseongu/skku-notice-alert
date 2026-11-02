# HANDOFF - 현재 작업 상태

> 세션을 시작하면 실제 git 상태와 함께 확인한다. 마지막 갱신: 2026-11-02 Codex.

## 상태

- 마일스톤: M3 워크플로와 Pages 로컬 준비 완료. 실제 서버, 실제 알림, 하루 무인 실행 검증 전. M1 해외 접속 확인은 통과했다.
- 계획: `docs/plans/2026-11-02_m3-actions-pages.md`의 로컬 체크박스 완료. `site/api/v1/boards/<id>.json`, `feed.xml`, `deadlines.ics`는 남았다.
- 저장소와 Pages는 공개로 생성됨. `check-access`에서 두 게시판 200 확인. `Notice and Pages`는 Secrets를 넣기 전까지 꺼 둠.
- 이번 세션: 휴대폰 게시판 기본 선택 메뉴를 프로젝트 토큰 기반 메뉴로 교체. GitHub Primer 참고. 빈 목록 선택, 키보드 조작, 포커스 복귀를 확인하고 모바일 라이트와 다크, 데스크톱 캡처를 남김. 독립 디자인 평가 8.2/10.
- 검증: 웹 빌드, 실제 게시판 `--dry-run --no-ai --rules config/rules.example.yaml` 통과. `scripts/check.sh`는 102개 통과, 날짜 의존 Canvas 테스트 1개 실패.
- 미확인: 실제 웨일, 휴대폰 설치, 실제 Actions와 Pages 배포, 실제 ntfy, Gemini와 Canvas 호출.

## 사용자와 저장소 설정

- 공개 GitHub 저장소: https://github.com/aniseongu/skku-notice-alert
- Pages: https://aniseongu.github.io/skku-notice-alert/ (Actions 배포 켬, 아직 실제 배포 전)
- `NOTIFY_URLS` 등의 Secrets와 `INTEREST_KEYWORDS` Variable을 설정해야 한다. Pages Source는 GitHub Actions, Actions Workflow permissions는 Read and write.
- `Notice and Pages`를 켜고 수동 실행해 첫 기준선을 만든 뒤 예약 실행을 확인한다. push는 사용자가 요청할 때만 한다.

## 주의

- `.env`는 읽지 않았다. `config/rules.yaml`은 없어서 실제 게시판 확인에 예시 규칙을 명시했다.
- `state/canvas.json`은 공개 커밋 대신 Actions 캐시에 저장한다. 캐시가 사라지면 Canvas 기준선을 다시 만든다.
- Canvas 개인 데이터와 토큰은 공개 출력에 싣지 않는다. 공개 `matched.json`과 요약은 사용자 결정(D-007, D-012).

## 다음 3단계

1. Canvas 날짜 의존 테스트를 현재 날짜와 무관하게 고친다.
2. 사용자가 Secrets와 Variable을 설정한 뒤 `Notice and Pages`를 켜고 실행해 실제 알림과 Pages를 확인한다.
3. 남은 정적 API 파일과 캘린더, 피드를 생성하고 M3 완료 조건을 검증한다.
