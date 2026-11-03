# skku-notice-alert

성균관대 공지 게시판(전체 공지, 소프트웨어학과 공지)을 15분마다 읽고, **내가 정한 기준에 맞는 글만** 휴대폰과 PC에 알림으로 보낸다.
알림을 누르면 원문이 열린다. PC가 꺼져 있어도 GitHub Actions에서 돈다. 같은 데이터를 JSON API로도 낸다.

- 진행 상황은 [HANDOFF.md](HANDOFF.md), 목표는 [GOAL.md](GOAL.md).
- 구조: Python, httpx, selectolax, 웹 푸시(pywebpush), GitHub Actions, GitHub Pages. 결정 이유는 [docs/DECISIONS.md](docs/DECISIONS.md).
- 참고한 프로젝트: [docs/research/open-source.md](docs/research/open-source.md).

## 사이트 열기

휴대폰과 PC에서는 [성대 공지](https://aniseongu.github.io/skku-notice-alert/)를 연다. PC를 켜 두거나 로컬 서버를 실행할 필요가 없다. 브라우저에서 앱으로 설치하면 아이콘으로 열 수 있다.

`Publish website`가 화면을 GitHub Pages에 배포한다. `main`에 `web/` 변경을 push하면 자동 실행되며, Actions에서 수동으로 실행할 수도 있다. 알림 키 없이도 배포할 수 있다. 공개 archive가 있으면 그 판정과 본문을 사용하고, 첫 배포에는 공개 게시판 목록을 읽어 표시한다. 공지 자동 수집과 알림은 아래 `Notice and Pages` 설정을 마친 뒤 켠다.

`localhost` 주소는 화면을 개발할 때만 쓴다.

## 쓰는 법 (M2 이후)

1. 사이트 설정의 "이 기기 알림"에서 휴대폰과 PC마다 "알림 받기"를 누른다(기기 8대까지, D-019). 알림은 브라우저 웹 푸시로 온다.
2. Apprise 주소로도 받고 싶으면 선택으로 `NOTIFY_URLS`를 넣는다(기본은 쓰지 않는다).
3. `config/rules.example.yaml`을 `config/rules.yaml`로 복사해 기준을 고친다.
4. `uv run skku-notice --dry-run --all`로 어떤 글이 올지 미리 본다.

## 실제로 돌리기 (M3)

1. 이 코드를 **공개** GitHub 저장소에 올린다. `Settings > Pages > Build and deployment > Source`를 **GitHub Actions**로 설정한다. `Settings > Actions > General > Workflow permissions`에서 `Read and write permissions`를 선택해 봇이 `state/`를 push할 수 있게 한다.
2. `Settings > Secrets and variables > Actions`에 아래 키를 등록한다. 첫 배포 전에는 GitHub 화면에서 등록하고, Pages가 열린 뒤에는 앱의 **설정** 화면에서 키와 관심 키워드를 저장할 수도 있다. 앱 설정을 쓰려면 화면 안내에 따라 GitHub 토큰을 연결한다.

   | 종류 | 이름 | 용도 |
   |---|---|---|
   | Secret, 필수 | `WEB_PUSH_PRIVATE_KEY` | 웹 푸시 발송 키(VAPID). 공개키는 `web/public/web-push.json`. |
   | Secret, 앱이 저장 | `WEB_PUSH_SUB_1`..`8` | 기기별 알림 구독. 설정의 "알림 받기"가 빈 칸에 저장한다. |
   | Secret, 선택 | `NOTIFY_URLS` | Apprise 알림 주소. 쓰지 않으면 비워 둔다. |
   | Secret, 선택 | `GEMINI_API_KEY` | 판정과 요약. 없으면 규칙으로 처리한다. |
   | Secret, 선택 | `PROFILE_YAML` | Gemini용 프로필 YAML 본문. 저장소에 올리지 않는다. |
   | Secret, 선택 | `CANVAS_TOKEN` | 아이캠퍼스 알림. Canvas 내용은 Pages와 공개 커밋에 넣지 않는다. |
   | Variable, 선택 | `INTEREST_KEYWORDS` | 관심 키워드. |
   | Variable, 앱이 저장 | `MUTED_CATEGORIES`, `SAVED_NOTICES`, `READ_NOTICES` | 끈 분류, 저장한 공지, 읽은 글(D-018). |

3. `Actions > Check overseas access > Run workflow`를 먼저 실행해 두 게시판과 Canvas 주소의 HTTP 상태 코드와 크기를 확인한다. 각 주소를 한 번씩만 요청한다. 해외 러너에서 막히면 예약 실행 설정을 다시 검토해야 한다.
4. `Actions > Notice and Pages > Run workflow`를 수동 실행한다. **첫 실행은 게시판별 기준선만 저장하고 공지 알림을 보내지 않는다.** Canvas도 첫 실행에는 기준선만 만든다. `state/seen.json`과 `state/archive.json`은 봇이 커밋한다. 이후 15분 간격 예약 실행에서 새 글을 처리한다. 예약 실행은 정시보다 늦을 수 있다.
5. `https://<계정>.github.io/<저장소>/`를 휴대폰과 PC 브라우저에서 열고 앱으로 설치한다. 공지 목록과 상세, 내 공지 판정, 요약은 공개 Pages에 올라간다. 다른 사람도 이 데이터를 볼 수 있다. `config/rules.yaml`을 저장소에 커밋하면 그 규칙도 공개된다. 워크플로는 파일이 없으면 `config/rules.example.yaml`을 사용한다.

Canvas 알림 상태는 공개 저장소 대신 Actions 캐시에 보관한다. 캐시가 삭제되면 다음 실행에서 Canvas 기준선을 다시 만들기 때문에 일부 리마인드가 빠질 수 있다. 실제 알림 수신과 Pages 설치는 저장소를 만든 뒤 확인해야 한다.

## AI로 개발하기

Claude Code와 Codex가 번갈아 작업한다. 규칙 정본은 [AGENTS.md](AGENTS.md), 역할 분담은 [docs/WORKFLOW.md](docs/WORKFLOW.md).
새 세션에서는 "HANDOFF 보고 이어서 해줘"라고 하면 된다.
