# Canvas(아이캠퍼스) 강의, 과제, 퀴즈 알림

- 상태: 진행 중
- 마일스톤: M4 앞당김 (GOAL.md)
- 작성: 2026-11-02, Claude Code (Opus 5.5)
- 시작 hash: 7fdf7ae
- 완료 조건: `CANVAS_TOKEN`이 있을 때 `uv run skku-notice --dry-run --canvas-fixtures tests/fixtures/canvas`가 남은 강의, 과제, 퀴즈 개수와 보낼 알림(요약, 마감 단계)을 출력한다. 테스트는 네트워크 없이 통과. 실제 토큰으로 dry-run 1회는 사용자 확인 뒤.

## 배경

- 사용자: "canvas key를 활용해서 강의나 과제가 몇개남았는지 알림뜨는거도 이걸로 가능하게", Canvas 연동 선택지에서 "넣기, 알림만" 선택(D-012).
- 웨일 확장 아캠 플러스(`WhaleExtentions/extensions/icampus-check`)가 브라우저에서 같은 일을 한다. PC가 꺼져 있어도 휴대폰으로 받으려고 Actions로 옮긴다.
- 참고 서비스: learningx-alert.com (Canvas 토큰, 정한 시각 요약, 휴대폰 푸시와 Discord, Slack).

## 가져올 코드 (D-006)

| 우리 파일 | 원본 | 고칠 점 |
|---|---|---|
| `src/skku_notice/canvas.py` | 아캠 플러스 `executescript.js`, `script.js`, `secrets.js`의 Canvas와 LearningX API 호출(`https://canvas.skku.edu`, Bearer 토큰, 즐겨찾기 과목, 할 일) | httpx, 토큰은 환경변수 `CANVAS_TOKEN`만 |
| `src/skku_notice/canvas_alerts.py` | 아캠 플러스 `notify.js`의 `ALLOWED_LEADS`, `notifyDeadline`(놓친 단계는 가장 작은 하나만), `wasNotified`(키와 단계, 30일 TTL), `showDailySummary`(18시 이후면 내일까지), `remainingText` | 순수 함수로. 시각은 KST |

## 동작

- 대상: 즐겨찾기 과목의 미완료 과제, 퀴즈, 강의(동영상) 중 마감이 지나지 않은 것. 제출 완료, 시청 완료는 뺀다.
- 하루 요약: `config/canvas.yaml`의 `summary_time`(기본 09:00) 이후 첫 실행에서 하루 한 번. 예: "오늘 마감 2개, 이번 주 5개 남았어요". 없으면 보내지 않는다(알림 피로).
- 마감 리마인드: `leads`(기본 1440분, 180분 전). 놓친 단계는 가장 작은 단계 하나만 보내고 큰 단계는 보낸 것으로 친다. 처음 실행은 이미 지난 단계를 보낸 것으로 기록만.
- 알림 문구(아캠 플러스 3줄 규칙): 제목 "과제 마감까지 3시간 남았어요", 본문 항목 이름, 다음 줄 "과목, 11월 12일(목) 23:59 마감". 클릭 URL은 Canvas 항목 주소. 아이콘 종류는 `alarm`.
- 보내기는 기존 notify(Apprise, `NOTIFY_URLS`). 토큰 거절(401)은 같은 문제를 한 번만 알리고(`notifiedProblem`), 복구되면 초기화.

## 비밀과 공개 범위 (D-012)

- `CANVAS_TOKEN`은 `.env`와 GitHub Secrets에만. 로그, 예외 메시지, state에 토큰이나 요청 헤더를 남기지 않는다.
- 과제와 강의 목록은 `site/`로 내보내지 않는다. state에는 항목 키와 보낸 단계, 시각만 저장한다(제목은 저장하지 않는다).
- 새 state 파일 `state/canvas.json`: `{"version": 1, "notified": {"<키>|<단계>": "<보낸 시각>"}, "summary_sent_on": "YYYY-MM-DD", "problem": null}`. 30일 지난 기록은 지운다.

## 범위 밖

강의 자동 시청, 제출, 성적 조회, 메시지함. 화면(PWA)에 과제 표시.

## 단계

- [ ] 1. D-012, AGENTS.md 2절 규칙 수정 (Claude)
- [ ] 2. canvas.py, canvas_alerts.py, cli 연결, 테스트(가짜 Canvas 응답 fixture) (Codex)
- [ ] 3. Claude 리뷰: 토큰 노출, 요청 수, 첫 실행, 중복 방지
- [ ] 4. 사용자 토큰으로 dry-run 1회, 실제 알림 1건 (사용자 확인)
- [ ] 5. daily-log, 커밋, 교차 리뷰

## 위험과 되돌리기

- 토큰은 계정 전체 권한이다. 새면 아이캠퍼스 설정에서 즉시 폐기하고 새로 만든다.
- 해외 IP(Actions)에서 canvas.skku.edu 접속이 막힐 수 있다. M3에서 함께 확인.
- 요청 수: 실행당 과목 수만큼 요청이 늘어난다. 15분마다 전부 읽지 말고 요약과 리마인드에 필요한 시각에만 갱신하는 방법을 2단계에서 정한다(최소 30분 간격).
