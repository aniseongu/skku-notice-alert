# 웹과 설치 앱(PWA)의 차이

> 같은 코드가 네 가지 환경에서 돈다. 환경마다 빠지는 것(주소창, 뒤로 가기, 당겨서 새로고침)과 생기는 것(노치, 제목 표시줄)이 달라서 따로 설계한다.
> 근거: web.dev "Learn PWA: App design"(2026-11-02 확인), MDN Window Controls Overlay, pwa-builder/pwa-starter의 manifest.

| 환경 | 판별 | 다른 점 |
|---|---|---|
| 휴대폰 브라우저 탭 | `(display-mode: browser)` + 좁은 폭 | 주소창이 있다. 설치 안내를 보여 줄 수 있는 유일한 곳 |
| 휴대폰 설치 앱 | `(display-mode: standalone)` | 주소창, 뒤로 가기, 새로고침 단추가 없다. 상태 표시줄과 노치, 제스처 막대가 화면을 덮는다 |
| PC 브라우저 탭 | `(display-mode: browser)` + 넓은 폭, `(hover: hover)` | 마우스와 키보드. hover 상태와 단축키 |
| Windows 설치 앱 | `(display-mode: window-controls-overlay)` 또는 standalone | 창 크기를 마음대로 줄인다(200x100까지). 제목 표시줄 자리를 앱이 쓴다 |

## 휴대폰 설치 앱 (standalone)

- 안전 영역: `viewport-fit=cover`를 켜고 상단 바에 `padding-top: env(safe-area-inset-top)`, 하단 탭 바에 `env(safe-area-inset-bottom)`을 더한다.
- 새로고침: 브라우저 새로고침이 없으므로 상단 바 단추와 앱으로 돌아올 때 자동 갱신(`visibilitychange`)을 둔다.
- 당겨서 새로고침: 안드로이드 크롬 standalone에서 화면 전체가 다시 로드되는 것을 막는다(`overscroll-behavior-y: contain`). 대신 위 단추를 쓴다.
- 글자 선택: 탭 바, 칩, 단추는 `user-select: none`. 공지 제목과 이유는 선택할 수 있게 둔다(web.dev: 내용 선택까지 막지 말 것).
- 상태 표시줄 색: `<meta name="theme-color">`를 라이트와 다크 각각 `--bg` 값으로. manifest의 `theme_color`, `background_color`도 같은 색(첫 화면 깜빡임 방지).
- 원문 링크: `target="_blank"`로 열면 안드로이드는 앱 안 Custom Tab으로 연다. 닫으면 목록으로 돌아온다. 뒤로 가기 단추를 따로 만들 필요가 없다(화면이 하나뿐).
- 설치 안내를 숨긴다.
- `<title>`이 앱 전환 화면에 보이므로 탭을 바꿀 때 "마감 임박 4 - 성대 공지"처럼 갱신한다.

## 휴대폰 브라우저 탭 (설치 전)

- 하단 탭 바 위에 한 번만 설치 안내 줄: "홈 화면에 추가하면 알림 기록을 앱처럼 볼 수 있어요" + "앱으로 설치" + 닫기.
  `beforeinstallprompt`가 온 경우에만 보이고, 닫으면 `localStorage`에 기억한다. iOS 사파리는 이 이벤트가 없어서 보이지 않는다.
- 주소창이 접히고 펴지므로 높이는 `100dvh`.

## PC 브라우저 탭

- 넓은 폭에서는 사이드바와 상세 칸(DESIGN 6절). hover는 `@media (hover: hover)` 안에서 배경색만 바꾼다.
- 키보드 단축키(ux-rules 5절)와 포커스 표시. 행을 고르면 상세 칸, Enter로 원문.
- 설치 안내는 사이드바 아래 작은 단추로만("앱으로 설치"), `beforeinstallprompt`가 있을 때.

## Windows 설치 앱 (Edge, Chrome)

- manifest `display_override: ["window-controls-overlay", "standalone"]`(pwa-starter와 같음). 사용자가 제목 표시줄을 접으면 앱이 그 자리를 쓴다.
- 그때 상단 바를 `env(titlebar-area-x)`, `env(titlebar-area-width)`, `env(titlebar-area-height)` 안에 두고, 빈 곳은 `app-region: drag`(창 끌기), 단추와 검색칸은 `app-region: no-drag`.
- 창이 좁아지면 모바일 배치로 그대로 내려간다(같은 반응형 기준). 200px 폭에서도 깨지지 않는지 본다.
- `launch_handler: { client_mode: "focus-existing" }`: 이미 열린 창이 있으면 새 창을 띄우지 않는다.
- 바로가기(`shortcuts`): 작업 표시줄 아이콘 우클릭에 "성대 공지", "마감순 보기", "인턴 공고", "저장". 휴대폰에서는 아이콘 길게 누르기.

## 오프라인과 갱신

- 서비스 워커는 vite-plugin-pwa(Workbox)가 빌드 때 만든다. 앱 껍데기는 미리 저장, 공지 JSON은 네트워크 우선(5초 넘으면 저장본), 글꼴 조각은 캐시 우선.
- 새 버전이 배포되면 자동으로 갈아끼운다(`registerType: autoUpdate`). 공지 데이터는 15분마다 바뀌지만 화면 코드는 드물게 바뀐다.
- 오프라인에서 저장본을 보여 줄 때는 상단 바의 "기준" 시각이 그대로 오래된 시각을 말해 준다(따로 배너를 만들지 않는다).

## 확인 방법

- 휴대폰 모양: Playwright로 390x844, `colorScheme` light와 dark. standalone은 `?display=standalone`이 아니라 실제 설치로만 확인되므로 사용자 휴대폰 확인 항목으로 남긴다.
- Windows 설치 앱: 사용자 PC Edge에서 설치, 제목 표시줄 접기 확인(사용자 확인 항목).
- PWA 감사: `npx lighthouse <url> --only-categories=accessibility,best-practices`(topics/pwa 상위 도구, GoogleChrome/lighthouse). Lighthouse 12부터 PWA 항목은 빠졌으므로 설치 조건은 Chrome 개발자 도구 Application 탭으로 본다.

## 휴대폰 방향 설정 (2026-11-04)

- manifest에서 orientation을 지정하지 않고 Screen Orientation API로 잠그지 않는다. OS의 자동 회전과 회전 잠금 설정을 따른다.
- 세로와 가로에서 목록, 상세와 설정을 사용할 수 있어야 한다. 브라우저 viewport 검사는 실제 기기의 OS 회전 잠금 검증과 구분한다.
