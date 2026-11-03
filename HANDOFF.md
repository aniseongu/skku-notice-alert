# HANDOFF - 현재 작업 상태

> 세션을 시작하면 실제 git 상태와 함께 확인한다. 마지막 갱신: 2026-11-03 Claude.

## 상태

- 정식 사이트: https://aniseongu.github.io/skku-notice-alert/ . 화면 확인은 이 주소에서만 한다(로컬 주소로 확인하지 않음).
- 알림: 기기별 웹 푸시(`WEB_PUSH_SUB_1..8`, D-019). PC는 예전 칸 `WEB_PUSH_SUBSCRIPTION`, 휴대폰은 `WEB_PUSH_SUB_1`. 테스트 발송 성공. ntfy는 쓰지 않는다.
- 수집: GitHub 예약(cron)이 이 저장소에서 한 번도 시작되지 않아 이어 달리기(D-020)로 바꿨다. 첫 이어 달리기 실행 41582935484의 수집 성공, 다음 실행 자동 호출은 확인 중.
- 설정 화면: 토큰 암호화 기억(D-017), 키는 "입력돼 있어요" 잠금, 키워드, 저장, 읽음, 끈 분류는 GitHub 변수로 기기 간 동기화(D-018), QR로 다른 기기 연결(확인 단추, 같은 저장소만).
- 기능: 공지 저장, 읽은 글 표시, 분류별 알림 끄기, 마감 캘린더(`deadlines.ics`), RSS(`feed.xml`), 휴대폰 공유.
- 디자인: 전체 검토 6.8 → 7.8(정식 주소 기준). 남은 지적은 daily-log 2026-11-03 10, 11절.

## 주의

- `NOTIFY_URLS` Secret 삭제는 권한 검사(Secret-Store Writes)로 막혀 사용자가 직접 해야 한다: `gh secret delete NOTIFY_URLS`. 지우기 전까지 ntfy로도 보낸다.
- 개인 내용(`config/profile.yaml`, Secrets 값)은 문서나 커밋에 넣지 않는다. `.env`는 읽지 않는다.
- Canvas state는 Actions 캐시. 아이캠퍼스 토큰은 아직 입력되지 않았다.

## 다음 3단계

1. 이어 달리기가 13분 뒤 스스로 다음 실행을 부르고, 그 실행이 수집하는지 확인한다(`gh run list --workflow notice-and-pages.yml`).
2. 남은 공지 본문이 채워지는지, 새 글 알림이 휴대폰과 PC에 오는지, 알림을 눌러 원문이 열리는지 확인한다.
3. 디자인 남은 지적(PC 행 높이, 설정 PC 폭) 정리, 사용자가 아이캠퍼스 토큰 입력.
