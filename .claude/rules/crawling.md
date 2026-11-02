---
paths:
  - "src/skku_notice/fetch*.py"
  - "src/skku_notice/parse*.py"
  - "src/skku_notice/sources/**"
  - "config/sources.yaml"
  - ".github/workflows/**"
---

# 게시판 읽기 규칙 (학교 서버 배려와 견고함)

## 요청 예절

- 실행 1회에 게시판당 **목록 1페이지 1회**가 기본이다. 1페이지의 고정 아닌 글이 모두 새 글이면 놓친 글이 있을 수 있으니 `article.offset`을 늘려 최대 2페이지 더 읽는다(첫 실행 제외, D-005).
- 본문(상세 글) 요청은 새 글이면서 규칙이 본문을 요구할 때만, 실행당 게시판별 최대 5건.
- 게시판 사이에는 1초 이상 쉰다. 동시 요청하지 않는다.
- 예약 실행 간격은 15분보다 짧게 하지 않는다. 개발 중 실제 게시판 확인도 몇 번이면 충분하다. 파서 개발은 fixture로 한다.
- User-Agent는 정직하게: `skku-notice-alert/<버전> (+<저장소 URL 또는 연락처>)`. 브라우저인 척하지 않는다. 막히면 사용자에게 알린다.
- 타임아웃 10초, 재시도는 최대 2회(지수 백오프). 5xx나 연결 실패가 계속되면 그 게시판만 건너뛰고 다음 실행에 맡긴다.
- `robots.txt`가 바뀌어 막으면 따른다. `docs/research/skku-board-structure.md`에 확인 날짜를 적는다.
- 로그인, 쿠키, 세션이 필요한 페이지는 다루지 않는다.

## 파서 견고함

- 셀렉터는 한 곳(파서 모듈 상단 상수 또는 `config/sources.yaml`)에 모은다.
- 글 0건, 필수 값(articleNo, 제목) 누락은 **예외로 올린다.** 조용히 빈 목록을 돌려주지 않는다(빈 목록은 "새 글 없음"과 구분이 안 됨).
- 날짜는 `YYYY-MM-DD` 문자열을 `date`로 바꾼다. 시각은 없으니 "처음 본 시각"은 실행 시각을 쓴다.
- 상대 URL은 게시판 URL 기준으로 풀고, 원문 링크는 `?mode=view&articleNo=<n>`만 남긴다.

## fixture

- 학교 화면이 바뀌면 새 HTML을 `tests/fixtures/<id>_list_<YYYY-MM-DD>.html`로 **추가**하고 옛 것도 남긴다(두 구조 모두 테스트).
- fixture에 개인정보가 섞이지 않았는지 본다(공개 게시판 목록이라 보통 작성 부서명 정도다).
