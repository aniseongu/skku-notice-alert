# 성대 게시판 구조 (2026-11-02 확인)

확인 방법: `curl -A "Mozilla/5.0"`으로 목록 페이지를 받아 마크업을 봤다. 저장본은 `tests/fixtures/`에 있다.
학교가 화면을 바꾸면 이 문서와 fixture를 같이 갱신한다(스킬 `add-board`).

## 공통

- 두 게시판 모두 같은 학교 CMS다. 목록은 서버에서 HTML로 그려져 나온다(자바스크립트 렌더링 불필요).
- `robots.txt`: 두 도메인 모두 `User-agent: *`에 Disallow 없음(2026-11-02).
- 상세 글 URL: 목록 페이지 기준 상대경로 `?mode=view&articleNo=<숫자>&article.offset=0&articleLimit=10`.
  고유 키는 `articleNo`만 쓰고 나머지 쿼리는 버린다. 원문 링크는 `<게시판 URL>?mode=view&articleNo=<숫자>`로 만든다.
- 목록 쿼리: `?mode=list&articleLimit=<개수>&article.offset=<시작>`. 기본 10개. `articleLimit=50`을 줘도 전체 공지에서 15개(고정 5 + 10)만 왔다. 상한이 있는 듯하니 1페이지만 쓴다.

## 한 글의 마크업

```html
<ul class="board-list-wrap">
  <li class=" ">
    <dl class="board-list-content-wrap ">
      <dt class="board-list-content-title board-list-content-top">   <!-- -top 이 붙으면 상단 고정 글 -->
        <span class="c-board-list-category">[행사/세미나]</span>
        <a href="?mode=view&amp;articleNo=141498&amp;..." title="자세히 보기"> 제목 </a>
        <span class="c-board-list-new">NEW</span>
      </dt>
      <dd class="board-list-content-info">
        <ul>
          <li> 공지 </li>            <!-- 고정 글은 "공지", 일반 글은 "No.1364" -->
          <li>방민정</li>            <!-- 작성자 또는 부서 -->
          <li>2026-11-02</li>        <!-- 게시일 (시각 없음) -->
          <li>조회수<span class="board-mg-l10">529</span></li>
        </ul>
      </dd>
    </dl>
    <div class="board-list-etc-wrap"><ul><li class="c-board-file-icon board-list-file">...</li></ul></div>  <!-- 첨부 있음 -->
  </li>
</ul>
```

## 게시판별 차이

| id | URL | 1페이지 글 수 | 고정 글 | 분류(그날 본 것) |
|---|---|---|---|---|
| `skku-notice01` | https://www.skku.edu/skku/campus/skk_comm/notice01.do | 15 | 5 | 일반, 장학, 채용/모집, 취업, 학사, 행사/세미나 |
| `cse-notice` | https://cse.skku.edu/cse/notice.do | 10 | 0 | 장학, 채용/모집, 행사/세미나 |

- 분류 필터 링크(`srCategoryId1=<번호>`)가 페이지에 있다. 분류 번호 목록은 아직 정리하지 않았다(필요하면 M4).
- 제목 안에 마감이 들어가는 경우가 많다: `(~11.12(목))`, `(11.16.(월) 13:00 메일 제출자 限)`.

## 파서가 지켜야 할 것

- 고정 글은 매 실행 다시 나온다. 키 중복 판정으로 걸러지므로 따로 빼지 않는다.
- 제목은 앞뒤 공백과 줄바꿈을 정리한다. HTML 엔티티(`&amp;`)를 풀어 둔다.
- 글이 0건으로 파싱되면 구조 변경으로 보고 실패 처리한다(D-005).
