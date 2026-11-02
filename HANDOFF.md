# HANDOFF - 현재 작업 상태

> 어느 AI 도구든 세션을 시작하면 이 파일부터 읽고, 멈추기 전에 갱신한다(스킬 `session-handoff`).
> **현재 상태만** 적는다. 지난 이력은 `docs/daily-log/`와 git log에 있다. 40줄 이내로 유지한다.
> 마지막 갱신: 2026-11-02 Claude Code (Opus 5.5)

## 상태

- 마일스톤: M1 코드 완료(1단계 해외 접속 확인만 남음), M2 진행 중
- 계획: `docs/plans/2026-11-02_m2-notify-ai-web.md` (4/7)
- 완료: 파서, 규칙, state, dry-run(M1). ntfy 알림, Gemini 판정, archive, api/v1 export(Codex). PWA 화면(Claude, `web/`).
  디자인 정본 `docs/DESIGN.md`, 규칙 `docs/design/`. 결정 D-008(Gemini), D-010(API 형식), D-011(화면 구성).
- 검증: `scripts/check.sh` 통과, `cd web && npm run build` 통과, 예시 데이터로 휴대폰과 데스크톱 화면 확인.
  **확인 못 함**: 실제 Gemini 호출, 실제 ntfy 알림 수신, 휴대폰과 Windows에 설치한 PWA.

## 사용자가 할 일

- [ ] ntfy 앱 설치, 추측하기 어려운 토픽 이름 정하기. `.env`에 `NOTIFY_URLS=ntfys://<토픽>` (저장소에 적지 않는다)
- [ ] Google AI Studio에서 Gemini API 키 발급, `.env`에 `GEMINI_API_KEY=`
- [ ] `config/profile.example.yaml`을 `config/profile.yaml`로, `config/rules.example.yaml`을 `config/rules.yaml`로 복사해 고치기
- [ ] (M3 전) GitHub 저장소 만들기, 공개 여부와 API 공개 범위 D-007 가, 나, 다 중 하나

## 알아 둘 것

- 화면 미리보기: `cd web && npx vite` 후 `http://127.0.0.1:5173/?api=sample/api/v1` (api 인자는 개발 서버에서만 먹는다)
- 아이콘은 `uv run --no-project --with resvg-py python scripts/build_icons.py`로만 만든다. 결과 파일을 손으로 고치지 않는다.
- export는 `web/dist`를 복사하므로 export 전에 `npm run build`가 필요하다. M3 워크플로에 Node 단계 추가.

## 다음 3단계

1. 사용자 준비물이 오면 `uv run skku-notice` 실제 실행 1회(첫 실행은 기준선만) 뒤, 새 글로 알림 1건 받고 누르면 원문 열리는지 확인
2. M3: 저장소 만들고 Actions(15분, concurrency, state 커밋) + Pages(웹 빌드, export) 워크플로. 러너에서 skku.edu 접속 확인 포함
3. M4 후보(웨일 아캠 플러스에서): 마감 단계 리마인드와 중복 방지, 묶음 알림, 게시판 일부 실패 표시
