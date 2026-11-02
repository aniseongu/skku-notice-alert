---
paths:
  - "src/**"
  - "tests/**"
  - "pyproject.toml"
---

# 파이썬 코드 규칙

- 파이썬 3.12 이상, `uv`로 관리한다. 실행은 `uv run skku-notice ...`, 의존성 추가는 `uv add <pkg>`(버전은 lock으로 고정).
- 패키지 배치는 `src/skku_notice/`. 모듈은 파이프라인 단계별로 나눈다: `fetch.py`, `parse.py`(게시판 종류별로 늘면 `sources/`), `rules.py`, `state.py`, `notify.py`, `cli.py`.
- 데이터는 `dataclass(frozen=True)`로 주고받는다(예: `Notice(source_id, article_no, title, category, url, posted_on, pinned)`).
- 네트워크와 파일 쓰기는 `fetch`, `notify`, `state` 저장에만 둔다. 나머지는 입력을 받아 값을 돌려주는 함수로 만들어 fixture로 테스트한다.
- 테스트는 네트워크를 쓰지 않는다. 실제 게시판 확인은 `--dry-run`으로 사람이 한다.
- 비밀은 환경변수로만 받는다: `NOTIFY_URLS`(Apprise URL, 쉼표 구분). 값은 로그에 찍지 않는다(앞 8자 정도만).
- 린트와 포맷은 ruff, 테스트는 pytest. `scripts/check.sh`가 둘 다 돈다.
- 주석은 "왜"만 짧게. 함수 이름과 타입 힌트로 "무엇"을 말한다.
- 다른 프로젝트에서 가져온 코드는 파일 머리에 `# 출처: <URL>`을 단다(D-006, 라이선스는 따지지 않음).
