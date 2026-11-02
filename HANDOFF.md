# HANDOFF - 현재 작업 상태

> 세션을 시작하면 실제 git 상태와 함께 확인한다. 마지막 갱신: 2026-11-02 Codex.

> 정식 Pages 배포 완료. 사용자는 로컬 서버 없이 https://aniseongu.github.io/skku-notice-alert/ 로 접속한다. `Publish website` 실행 41460818001 성공, HTTP 200과 실제 공지 25건, 최신 게시판 메뉴 확인. `Notice and Pages`는 Secrets 준비 전까지 꺼 둔다.

## 상태

- 마일스톤: M3 워크플로와 Pages 로컬 준비 완료. 실제 서버, 실제 알림, 하루 무인 실행 검증 전. M1 해외 접속 확인은 통과했다.
- 계획: `docs/plans/2026-11-02_m3-actions-pages.md`의 로컬 체크박스 완료. `site/api/v1/boards/<id>.json`, `feed.xml`, `deadlines.ics`는 남았다.
- 저장소와 Pages는 공개로 생성됨. `check-access`에서 두 게시판 200 확인. `Notice and Pages`는 Secrets를 넣기 전까지 꺼 둠.
- 이번 세션: 휴대폰 게시판 기본 선택 메뉴를 프로젝트 토큰 기반 메뉴로 교체. GitHub Primer 참고. 빈 목록 선택, 키보드 조작, 포커스 복귀를 확인하고 모바일 라이트와 다크, 데스크톱 캡처를 남김. 독립 디자인 평가 8.2/10.
- 검증: 웹 빌드, 실제 게시판 `--dry-run --no-ai --rules config/rules.example.yaml` 통과. `scripts/check.sh`는 102개 통과, 날짜 의존 Canvas 테스트 1개 실패.
- 실제 Actions와 Pages 배포를 확인했고 웨일에 정식 주소를 열었다. 미확인: 휴대폰 설치, 실제 ntfy, Gemini와 Canvas 호출.

## 사용자와 저장소 설정

- 공개 GitHub 저장소: https://github.com/aniseongu/skku-notice-alert
- Pages: https://aniseongu.github.io/skku-notice-alert/ (배포 완료, PC가 꺼져도 접속 가능)
- `NOTIFY_URLS` 등의 Secrets와 `INTEREST_KEYWORDS` Variable을 설정해야 한다. Pages Source는 GitHub Actions, Actions Workflow permissions는 Read and write.
- `Notice and Pages`를 켜고 수동 실행해 첫 기준선을 만든 뒤 예약 실행을 확인한다. push는 사용자가 요청할 때만 한다.

## 주의

- 자소서 폴더 근거로 `config/profile.yaml` 개인 초안을 작성했다(git 제외). 웨일 정식 사이트의 내 프로필 칸에도 입력했지만 GitHub Secrets 저장은 하지 않았다. 사용자에게는 미확인 항목과 관심 분야 기반 선호 초안임을 안내했다. 개인 내용은 문서나 커밋에 복사하지 않는다.
- `.env`는 읽지 않았다. `config/rules.yaml`은 없어서 실제 게시판 확인에 예시 규칙을 명시했다.
- `state/canvas.json`은 공개 커밋 대신 Actions 캐시에 저장한다. 캐시가 사라지면 Canvas 기준선을 다시 만든다.
- Canvas 개인 데이터와 토큰은 공개 출력에 싣지 않는다. 공개 `matched.json`과 요약은 사용자 결정(D-007, D-012).

## 다음 3단계

1. Pages 화면의 설정에서 알림 키와 관심 키워드를 준비한다. 화면 변경은 main push 시 자동 배포된다. 현재 데이터는 첫 배포 시 수집한 목록이다.
2. Canvas 날짜 의존 테스트 수정, Secrets와 Variable 설정 후 `Notice and Pages`의 실제 알림을 확인한다. Claude 한도 소진으로 이번 워크플로 교차 리뷰는 한도가 돌아오면 한다.
3. 남은 정적 API 파일과 캘린더, 피드를 생성하고 M3 완료 조건을 검증한다.
