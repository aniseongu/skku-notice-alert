# 비슷한 프로젝트와 쓸 오픈소스 (2026-11-02 조사)

## 인턴 본문 재사용 (2026-11-03, Codex)

- `hg111911190-sketch/skku-notice`의 [jobs.py](https://github.com/hg111911190-sketch/skku-notice/blob/main/jobs.py)의 `LK_DETAIL`, `linkareer_detail`, `jasoseol_detail`을 확인했다. 링커리어 공개 GraphQL 쿼리와 자소설닷컴의 Next.js 데이터 추출 방식을 재사용하고, 기존 안전한 HTML 정제와 공고 번호 검증을 덧붙였다.
- 두 사이트 공개 상세와 링커리어 본문 API를 실제 확인했다. 참고 코드의 대량 페이지 수집과 외부 이미지 OCR 대신 게시판별 5건과 기존 요청 간격을 쓴다.

## 화면 참고 (2026-11-02, Codex)

- [GitHub Primer ActionMenu](https://github.com/primer/react/tree/main/packages/react/src/ActionMenu)와 [ActionList](https://github.com/primer/react/tree/main/packages/react/src/ActionList): 단일 선택 메뉴의 현재 항목 표시, 선택 후 메뉴 닫기와 단추로 포커스 반환을 참고했다. React 코드는 가져오지 않고 Lit 화면에 맞춰 구현했다. 색, 글꼴, 반경은 이 프로젝트의 `docs/DESIGN.md` 토큰을 쓴다.

조사: Claude Code (Opus 5.5), 웹 검색과 GitHub API. 버전과 라이선스는 구현할 때 다시 확인하고 `pyproject.toml`에 정확한 버전을 고정한다.

## 1. 먼저 볼 것 (구현 전에 코드를 읽는다)

`gh api`로 존재, 별, 마지막 push, 라이선스를 2026-11-02에 확인했다. 별이 모두 적은 개인 프로젝트라 "검증된 코드"는 아니다. 테스트로 확인하며 가져온다.

| 순위 | 저장소 | 대상 | 방식 | push | 라이선스 | 가져올 것 |
|---|---|---|---|---|---|---|
| 1 | [tsungmnli/skku-notice-api](https://github.com/tsungmnli/skku-notice-api) | 성대 notice01 (**같은 CMS**) | Python, FastAPI, Postgres, k8s CronJob | 2026-10 | 없음 | `app/crawler/parser.py`(articleNo, 고정 글, 분류, 첨부, 구조 변경 시 ParseError), `deadline.py`(제목 마감 추출, 날짜만 있으면 23:59 KST), `categories.py`, `fetch.py`, `config.py`(지연, UA) |
| 2 | [hg111911190-sketch/skku-notice](https://github.com/hg111911190-sketch/skku-notice) | 성대 게시판 4개 (같은 CMS) | Python 표준 라이브러리, **Actions 매시 + JSON 커밋**, Pages | 2026-11 | 없음 | `scrape.py`의 SOURCES 목록, `jobs_rules.py`와 `test_jobs_rules.py`(키워드, 자격 규칙과 예시 테스트), `.ics` 마감 캘린더 |
| 3 | [khj1870-robotics/st-notice-alert](https://github.com/khj1870-robotics/st-notice-alert) | 서울과기대 | Python, Actions `monitor.yml`, `seen.json` 커밋 | 2026-10 | 없음 | 우리 구조와 가장 가까운 최소판. 중복 판정, URL 정규화 대조용 |
| 4 | [ssapgun/notice-watch](https://github.com/ssapgun/notice-watch) | 학교와 대학원 페이지 | Python, requests, bs4, SQLite, `config.yaml` | 2026-11 | 없음 | 선언형 대상 목록, 첫 실행 "모두 읽음" 기준선, 텔레그램, `.ics` |
| 5 | [kw-service/kw-notice-v1](https://github.com/kw-service/kw-notice-v1) | 광운대 | Kotlin 안드로이드 앱 + AWS Lambda 파이썬 크롤러, FCM | 2022-07 | **MIT** | 수정된 글 감지, 분류별 구독 설계, 앱 UX(즐겨찾기, 필터). 유일하게 그대로 복사해도 되는 쓸모 있는 코드 |
| 6 | [KNUTICE/KNUTICE-SERVER-Kotlin](https://github.com/KNUTICE/KNUTICE-SERVER-Kotlin) | 한국교통대 | Kotlin Spring + 안드로이드, iOS, FCM 토픽, Gemini 요약 | 2026-11 | 없음 | 분류별 토픽 구독, 알림 문구, AI 요약 아이디어 (M4) |
| 7 | [skhoon4u/SKKU_notice](https://github.com/skhoon4u/SKKU_notice) | 성대 | 크롬 확장 팝업 | 2023-12 | 없음 | 브라우저 팝업으로 보는 방식 (D-001 대안의 선례) |
| 8 | [eunsukimme/PKNU-notice-parser](https://github.com/eunsukimme/PKNU-notice-parser) | 부경대 | Python, Slack | 2019-09 | MIT | 작은 파싱과 알림 루프 예제 |

그 밖에 본 것: [DoomPtrl/skkuNoticeBot](https://github.com/DoomPtrl/skkuNoticeBot)(성대, 텔레그램, 2023), [jeddchoi/SKKU_CS_Notice_bot](https://github.com/jeddchoi/SKKU_CS_Notice_bot)(성대 소프트웨어학과, Selenium, 2018),
[dosp74/iNoti](https://github.com/dosp74/iNoti)(광운대, 키워드 이메일), [younghoh/MyNoticeBot](https://github.com/younghoh/MyNoticeBot)(Slack), 아주대 텔레그램, 디스코드 봇(asitisdev), 시립대, 세종대, 한성대 앱.
서울대, 고려대, 연세대, 한양대 등은 검색에서 나오지 않았다. ntfy를 쓰는 학교 프로젝트도 없었다.

### 결론

- 성대 CMS 파서와 마감 추출은 1번을, 실행 구조(Actions와 JSON 커밋)와 규칙 테스트는 2번을 본떠 만든다.
- 라이선스는 따지지 않고 가져다 쓴다(D-006). 가져온 파일 머리에 `# 출처: <URL>`만 남긴다.
- API 2단계(D-007)는 1번의 FastAPI, Postgres 구조를 그대로 가져와 시작한다.
- RSSHub에는 성대 경로가 없다(검색으로 확인). 나중에 우리 파서를 RSSHub 경로로 기여하는 것은 선택 과제다.
- [palewi.re First GitHub Scraper](https://palewi.re/docs/first-github-scraper/)는 Actions 예약 실행과 결과 커밋의 정석 튜토리얼이다.

## 2. 쓸 오픈소스 (후보)

| 이름 | 용도 | 라이선스(조사 시점) | 비고 |
|---|---|---|---|
| [Apprise](https://github.com/caronc/apprise) | 알림 보내기 (ntfy, 텔레그램, 디스코드, 이메일, 윈도우 토스트 등 URL 하나로) | BSD-2-Clause | D-002 핵심 |
| [ntfy](https://github.com/binwiederhier/ntfy) | 휴대폰, PC 알림 수신 앱과 서버 | Apache-2.0 / GPL-2.0 | 클릭 URL, 우선순위, 태그 지원 |
| [httpx](https://github.com/encode/httpx) | HTTP 요청 (타임아웃, 재시도 쉬움) | BSD-3-Clause | requests로 대체 가능 |
| [selectolax](https://github.com/rushter/selectolax) | 빠른 HTML 파싱 (CSS 셀렉터) | MIT | 익숙하면 BeautifulSoup4로 |
| [PyYAML](https://github.com/yaml/pyyaml) | `config/*.yaml` 읽기 | MIT | |
| [pytest](https://github.com/pytest-dev/pytest), [ruff](https://github.com/astral-sh/ruff) | 테스트, 린트 | MIT | `scripts/check.sh` |
| [uv](https://github.com/astral-sh/uv) | 파이썬 버전, 의존성, 실행 | MIT/Apache-2.0 | Actions에는 `astral-sh/setup-uv` |
| [changedetection.io](https://github.com/dgtlmoon/changedetection.io) | 코드 없이 페이지 변화 감시 | Apache-2.0 | 대안 (D-001). 급하면 이것부터 써 볼 수 있음 |

## 3. 아이디어 메모 (M4 이후)

- 마감일 추출: 제목의 `~11.12(목)`, `(11.16.(월) 13:00 ...)` 형태를 정규식으로 읽어 리마인드.
- 본문까지 읽어 키워드 매칭 (요청 수가 늘어나므로 새 글에만, `crawling.md` 상한 안에서).
- 매칭 결과를 RSS로도 내보내기(feedgen) 해서 RSS 리더로 보기.
- LLM으로 "나에게 해당되는 공지인지" 판정: 규칙 기반이 부족할 때만, 비용과 개인정보를 보고 결정.

## 사용성 비교 추가 (2026-11-03)

학교 공지 앱과 범용 수집기의 기능, 우리 화면의 UX 기준 검토 및 우선순위는 [공지 서비스 사용성 검토](2026-11-03_notice-service-ux-review.md)에 정리했다. KNUTICE, KW 알리미, SKKU 공지 모아보기, FreshRSS, Miniflux와 changedetection.io의 원본을 확인했다.

## LearningX Alert 휴대폰 알림 참고 (2026-11-04, Codex)

- 공개 안내 https://learningx-alert.com/guide/home-screen/ 에서 홈 화면 웹 앱의 브라우저 푸시, 기기별 등록, 시험 알림까지 이어지는 흐름을 확인했다. iPhone은 홈 화면에서 연 앱에 알림을 허용하는 안내를 제공하고 Android는 Chrome의 알림 등록을 안내한다.
- https://learningx-alert.com/terms/ 와 https://learningx-alert.com/guide/canvas-token/ 에서 Canvas 개인 토큰으로 연결, 과목별 선택, 알림 시각 설정, 미완료 과제와 퀴즈 및 강의 마감 알림을 확인했다.
- GitHub 저장소 검색에서 실제 운영 저장소 https://github.com/hjkim24/learningx-alert-web 를 찾았다. README의 운영 주소가 일치한다. learningx_alert/learningx.py의 sessionless_launch, LTI 양식과 xn_api_token 사용은 아캠 플러스와 같은 흐름이다. accounts/collection.py의 완료 상태 명시 판정과 비공개 강의 제외를 재사용하고 회귀 검사를 추가했다.
- 성공에 적용: 기기별 수신을 유지하고 현재 할 수 없는 퀴즈는 요약에서 제외한다. 임시 LearningX 인증으로 강의 마감을 확인한다. 실제 휴대폰 수신은 설정의 시험 알림으로 기기에서 확인한다.
