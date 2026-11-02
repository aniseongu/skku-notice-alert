# M3 GitHub Actions와 Pages 배포

- 상태: 완료 (로컬 준비 범위, M3 전체는 미완료)
- 마일스톤: M3 (GOAL.md)
- 작성: 2026-11-02, Codex (GPT-6)
- 시작 hash: fc1af51
- 완료 조건: 두 워크플로의 문법과 로컬 검사 통과, 공개 Pages 배포 절차 문서화. 실제 알림과 Pages 설치는 저장소가 생긴 뒤 확인.

## 배경

PC가 꺼져도 게시판을 15분마다 확인하고, 공개 Pages에 공지와 판정, 요약, PWA를 내보낸다. Canvas 데이터, 프로필, 키는 내보내지 않는다.

## 가져올 코드

`docs/research/open-source.md`의 GitHub Scraper와 유사 저장소는 구조 참고 대상이다. 이번 작업은 GitHub 공식 액션을 조합하므로 파일 복사는 없다.

## 범위 밖

저장소 생성, push, 실제 Actions 실행, 실제 알림 수신, `boards/<id>.json`, `feed.xml`과 `deadlines.ics` 생성 기능 구현.

## 단계

- [x] 1. D-007 사용자 결정을 확정하고 CLI, export, OCR 모델 경로와 액션 버전을 확인한다.
- [x] 2. 예약 실행, state push 재시도, Pages 배포와 해외 접속 확인 워크플로를 작성한다.
- [x] 3. README에 실제 설정 및 첫 실행 절차를 적고 GOAL.md의 M3 완료 조건과 대조한다.
- [x] 4. actionlint 또는 YAML 검사, ruff, pytest, 빌드와 안전한 로컬 확인을 한다.
- [x] 5. daily-log와 HANDOFF를 갱신하고 Claude 검토를 위해 미커밋으로 남긴다.

## 위험과 되돌리기

첫 실행의 state push가 실패하면 다음 실행에서 기준선을 다시 만들 수 있다. 봇 push 실패는 최대 3회 재시도하고, 남은 실패는 작업 실패로 표시한다. 워크플로 변경은 Claude 검토 후 커밋하며 필요하면 해당 커밋을 되돌린다.

## 진행 메모

- 2026-11-02: 로컬 RapidOCR 3.10.0 코드에서 모델 위치 `rapidocr/models` 확인. GitHub 릴리스에서 액션 버전 확인.
- 2026-11-02: `gh api repos/<owner>/<action>/releases/latest` 확인 결과 checkout v7.0.1, setup-uv v10.3.3, setup-node v7.1.0, cache v6.1.0, upload-pages-artifact v5.0.0, deploy-pages v5.0.1. 각 최신 메이저를 사용하되 setup-uv에는 `v10` 태그가 없어 존재하는 `v10.3.3`으로 고정했다.
- 2026-11-02: D-007의 `boards/<id>.json`과 GOAL.md의 `feed.xml`, `deadlines.ics`는 현재 `export_site()`가 만들지 않는다. M3 완료 조건으로 남겨 두고 실제 배포와 함께 후속 작업이 필요하다.
