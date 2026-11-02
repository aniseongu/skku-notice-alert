---
name: add-board
description: 감시할 게시판을 새로 추가하거나, 학교가 화면을 바꿔 기존 게시판 파싱이 깨졌을 때 고치는 절차. 학과, 단과대, 기관 공지 URL을 받아 마크업을 확인하고 fixture 저장, config/sources.yaml 등록, 파서 재사용 또는 새 파서, 테스트까지. "OO학과 공지도 추가해줘", "공지가 0건으로 나와", "파싱이 깨졌어"일 때 사용한다.
---

# 게시판 추가와 구조 변경 대응

## 1. 마크업 확인 (토큰 절약: 통째로 읽지 않는다)

```zsh
D=$(mktemp -d); curl -sL -A "skku-notice-alert/dev" -o "$D/page.html" "<URL>"
grep -c 'board-list-content-wrap' "$D/page.html"     # 0보다 크면 성대 CMS 계열
grep -oE 'articleNo=[0-9]+' "$D/page.html" | head -3
python3 -c "import sys,re;s=open(sys.argv[1],encoding='utf-8',errors='ignore').read();i=s.find('board-list-wrap');print(re.sub(r'\s+',' ',s[i:i+1500]))" "$D/page.html"
```

- `robots.txt`도 본다: `curl -s <도메인>/robots.txt | head`.
- 같은 학교 CMS(`board-list-wrap`, `?mode=view&articleNo=`)면 기존 파서(`kind: skku-cms`)를 그대로 쓴다.
- 다른 구조(학과 자체 워드프레스, 그누보드 등)면 `docs/research/open-source.md`에서 그 CMS용 파서를 먼저 찾는다. 없으면 새 `kind`를 만든다.
- 자바스크립트로 목록을 그리는 사이트면(HTML에 글이 없음) 네트워크 탭의 JSON API를 찾는다. 브라우저 자동화는 마지막 수단이다.

## 2. fixture와 설정

- 받은 HTML을 `tests/fixtures/<id>_list_<YYYY-MM-DD>.html`로 저장한다. 구조 변경 대응이면 옛 fixture는 지우지 않는다.
- `config/sources.yaml`에 항목을 추가한다(`id`는 소문자와 하이픈, 바꾸면 state 키가 바뀌므로 한 번 정하면 유지).
- `docs/research/skku-board-structure.md`의 게시판 표에 한 줄 추가한다(글 수, 고정 글, 분류).

## 3. 테스트

- 새 fixture로 파싱 건수, 첫 글의 articleNo와 제목, 고정 글 표시를 확인하는 테스트를 추가한다.
- 구현은 스킬 `feature-change` 3단계처럼 Codex에 맡겨도 된다.

## 4. 주의

- 새 게시판을 처음 켤 때도 "첫 실행은 알림 없음" 규칙이 게시판 단위로 적용되는지 확인한다(그 게시판 state가 비어 있으면 저장만).
- 커밋: `feat(parser): <게시판 이름> 추가` 또는 `fix(parser): <게시판> 구조 변경 대응`.
