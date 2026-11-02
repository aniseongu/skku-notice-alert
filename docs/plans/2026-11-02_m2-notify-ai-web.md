# M2 실제 알림 + Gemini 판정 + 정적 API와 PWA 화면

- 상태: 진행 중
- 마일스톤: M2 (GOAL.md), M3의 정적 API 형식과 M5의 화면을 앞당김
- 작성: 2026-11-02, Claude Code (Opus 5.5)
- 시작 hash: e504df4
- 완료 조건:
  1. `uv run skku-notice`(dry-run 아님)가 새 글 중 규칙 또는 Gemini가 해당이라고 본 글을 ntfy로 보내고, 누르면 원문이 열린다(사용자가 휴대폰에서 확인).
  2. `GEMINI_API_KEY`가 없거나 Gemini가 실패해도 규칙 결과만으로 알림이 간다.
  3. `uv run skku-notice --dry-run --all --from-fixtures --export site`가 `site/api/v1/notices.json`, `matched.json`을 아래 형식대로 쓰고 `web/`을 `site/`로 복사한다.
  4. `site/`를 로컬 서버로 열면 PWA가 목록, 필터, AI 판정, 마감을 보여 준다(Claude가 Playwright로 확인).

## 배경

- 사용자 지시: "프론트는 claude가 하고 나머지를 codex한테 맡기자", "나한테 해당되는건지 아닌지 판단 가능한 것" "gemini api key 활용", Gemini 프로필은 "자세한 프로필"로 선택.
- M1 dry-run에서 규칙이 "DS교과지원 TA 모집", "변호사시험 시험관리원(재학생) 모집"처럼 해당될 수 있는 글을 놓쳤다. 규칙만으로는 "나에게 해당"을 판정하기 어렵다.

## 분담 (파일 단위로 나눠 동시에 고치지 않는다)

| 누가 | 파일 |
|---|---|
| Codex | `src/skku_notice/` (notify.py, judge.py, export.py, archive, cli 확장), `tests/`, `pyproject.toml`, `config/ai.yaml`, `config/profile.example.yaml`, `.env.example`, `.gitignore` |
| Claude | `web/` (index.html, app.js, style.css, manifest.webmanifest, sw.js, icon.svg), `web/sample/` 예시 JSON, 문서 |

## 파이프라인 (한 실행)

`fetch` > `parse` > 게시판 state 없으면 기준선 저장만 > 새 글 > `exclude_title` 제외 > `rules` 매칭 > `judge`(Gemini) > 알릴지 결정 > `notify` > `state` 저장 > `archive` 갱신 > `export`

- 판정 대상: 공통 제외어에 걸리지 않은 **모든 새 글**(규칙에 안 맞은 글도). 한 실행에서 한 번의 요청으로 묶어 보내고 `max_per_run`(기본 30)을 넘으면 나머지는 규칙만으로 처리.
- 알릴지 결정:
  - 규칙 맞음 + AI relevant/maybe: 규칙 priority로 알림
  - 규칙 맞음 + AI not_relevant: **알림은 보내되** priority를 low로 내리고 AI 이유를 붙인다(누락보다 중복, AGENTS.md 2절)
  - 규칙 안 맞음 + AI relevant: default로 알림 / maybe: low로 알림 / not_relevant: `skipped`
  - AI 실패나 키 없음: 규칙 결과만 (M1과 같음)
- 알림 내용(ntfy): 제목 `[게시판 이름] 글 제목`, 본문 AI 이유 한 줄 + 마감(있으면) + 규칙 이름, 클릭 URL 원문, priority high=4 default=3 low=2.

## Gemini 판정 (D-008)

- SDK `google-genai`, 모델은 `config/ai.yaml`의 `model`(기본 무료 등급의 Flash-Lite 계열, 구현 시 ai.google.dev pricing 페이지에서 무료 모델 ID 확인). 구조화 출력(JSON schema)으로 받는다.
- 입력: 프로필(`config/profile.yaml`, 로컬 전용이며 gitignore. Actions에서는 Secret `PROFILE_YAML`) + 글 목록(게시판 이름, 분류, 제목, 게시일). 본문은 M4.
- 출력(글마다): `verdict`(relevant, maybe, not_relevant), `reason`(한국어 한 문장, 40자 안팎), `article_no`.
- 키: 환경변수 `GEMINI_API_KEY`만. 로그에 찍지 않는다. 429와 네트워크 오류는 1회 재시도 후 포기하고 규칙 결과로.
- 테스트는 네트워크 없이 가짜 클라이언트로.

## API v1 형식 (D-010, 한 번 정하면 바꾸지 않는다)

`site/api/v1/notices.json` (공개해도 되는 것만):

```json
{
  "version": 1,
  "generated_at": "2026-11-02T19:00:00+09:00",
  "sources": [{"id": "cse-notice", "name": "소프트웨어학과 공지", "url": "https://cse.skku.edu/cse/notice.do"}],
  "notices": [
    {
      "id": "cse-notice/227923",
      "source_id": "cse-notice",
      "article_no": "227923",
      "title": "[현대백화점그룹] 2026 하반기 신입사원 채용(~11.12(목))",
      "category": "채용/모집",
      "url": "https://cse.skku.edu/cse/notice.do?mode=view&articleNo=227923",
      "posted_on": "2026-11-02",
      "pinned": false,
      "deadline": "2026-11-12T23:59:00+09:00",
      "first_seen": "2026-11-02T19:00:00+09:00"
    }
  ]
}
```

`site/api/v1/matched.json` (개인 판정, 공개 저장소면 내보내지 않는 선택지가 있다, D-007):

```json
{
  "version": 1,
  "generated_at": "2026-11-02T19:00:00+09:00",
  "items": {
    "cse-notice/227923": {
      "rule_name": "인턴과 현장실습",
      "priority": "default",
      "reasons": ["category:채용/모집", "title_any:인턴"],
      "ai": {"verdict": "relevant", "reason": "소프트웨어학과 재학생 지원 가능한 인턴", "model": "gemini-..."},
      "notified": true
    }
  }
}
```

- `category`, `deadline`, `first_seen`, `rule_name`, `ai`는 null일 수 있다. `notices`는 `posted_on` 내림차순(고정 글 포함), 최근 300건.
- 기록 보관: `state/archive.json`(봇 전용)에 최근 300건의 Notice와 판정을 둔다. export는 이것으로 만든다. `--dry-run`은 archive를 쓰지 않고, `--dry-run --export`는 이번 실행 결과만으로 만든다.

## 화면 (D-009, Claude)

- PWA: 빌드 없는 HTML, CSS, JS. Beer CSS(Material 3, CDN, 버전 고정). 안드로이드 크롬 "홈 화면에 추가"로 설치.
- 탭: "나에게 해당"(규칙 또는 AI relevant/maybe) / 전체 / 마감 임박. 게시판 필터, 검색. 카드에 AI 이유, 마감 D-day, 누르면 원문.
- `matched.json`이 없으면(공개 배포에서 뺀 경우) 판정 없이 전체 목록만.
- 서비스 워커는 앱 껍데기만 캐시하고 JSON은 네트워크 우선(오래된 목록 표시 방지).
- 푸시는 ntfy가 맡는다(PWA 웹 푸시는 서버가 필요해서 하지 않음).

## 범위 밖

GitHub Actions와 Pages 배포(M3, 원격 저장소 필요), feed.xml과 deadlines.ics, 본문 읽기, 마감 리마인드(M4).

## 단계

- [ ] 1. 결정 기록: D-008(Gemini), D-009(PWA), D-010(API v1). (Claude)
- [ ] 2. Codex: notify.py(Apprise, ntfy), judge.py, archive, export.py, cli 실제 실행 경로. 테스트. (Codex)
- [ ] 3. Claude: `web/` PWA와 `web/sample/` 예시 JSON. (Claude)
- [ ] 4. Claude 리뷰, `scripts/check.sh`, fixture로 export 후 화면 확인(Playwright).
- [ ] 5. 사용자: ntfy 앱 설치와 토픽, Gemini 키 발급, `.env`와 `config/profile.yaml` 작성.
- [ ] 6. 실제 실행 1회: 테스트 토픽으로 알림 1건 받고 누르면 원문 열림 확인(사용자).
- [ ] 7. daily-log, 커밋, Codex 교차 리뷰(`review --base e504df4`), HANDOFF.

## 위험과 되돌리기

- AI가 relevant를 남발하면 알림이 많아진다: `max_per_run`과 maybe를 low로 두는 것으로 완화. 많으면 프로필과 프롬프트를 고친다.
- 첫 실제 실행은 기준선만 저장해야 한다(알림 폭탄 방지). 6단계 전에 `state/`가 비어 있는지 본다.
- 되돌리기: 단계별 커밋이라 `git revert <hash>`.

## 진행 메모

- 2026-11-02: 계획 작성. Gemini 무료 등급은 입력이 제품 개선에 쓰일 수 있다(pricing 페이지 "Used to improve our products: Yes"). 사용자가 자세한 프로필을 선택.
