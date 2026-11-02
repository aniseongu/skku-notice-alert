# 디자인 근거 자료 (2026-11-02 조사)

사용자가 준 링크와 그 안에서 찾은 것. 가져다 쓴 것과 안 쓴 것, 이유를 남긴다.

| 자료 | 무엇 | 가져온 것 | 안 쓴 것과 이유 |
|---|---|---|---|
| [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) (topics/ui-design 1위, 14.4만 별) | Claude용 UI 디자인 스킬, `design` 스킬과 스타일 데이터 | `styles.csv`의 Glassmorphism(blur 10~20px, 흰색 15~30%), Liquid Glass 규칙(유리는 탐색에만) | 외부 스크립트 실행은 안 함. 데이터만 읽음 |
| [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) (topics/ui-design 2위) | "AI 티 안 나게" 에이전트 스킬 | app-screens의 "한 화면 한 질문", critique 채점 기준 | 사진 4장 이상 같은 랜딩용 기준은 목록 앱에 안 맞음 |
| [calmtiger86/calm-design](https://github.com/calmtiger86/calm-design) | 한국어 우선 안티 슬롭 디자인 스킬 | 문서 먼저 쓰는 절차, 다이얼, ai-tells-blocklist, pre-flight, typography-ko, 네카라쿠배당토직야 9곳 DESIGN.md | Tailwind CDN, lucide(웨일 DESIGN이 lucide를 대표 세트로 막음) |
| [kwakseongjae/oh-my-design](https://github.com/kwakseongjae/oh-my-design) `design-md/toss` | 토스 DESIGN.md(TDS 공식 문서 기반 측정) | 회색 단계 `#f9fafb`..`#191f28`, 그림자 대신 평평한 색 레이어, 버튼 반경 8/10/14/16, 본문 16/24 | 토스 파랑 `#3182f6`(우리 강조는 성대 진녹), Toss Product Sans(배포 불가, Pretendard로 대체) |
| [브런치 "AI가 만든 티를 없애는 랜딩페이지 디자인 꿀팁"](https://brunch.co.kr/@acc9b16b9f0f430/240) | DESIGN.md, 폰트, 레퍼런스, 순차 승인 | 기준 문서부터 준다, 제안하고 승인받아 하나씩 고친다 | getdesign.md에는 토스가 없어 oh-my-design으로 대신 |
| [pwa-builder/pwa-starter](https://github.com/pwa-builder/pwa-starter) | Vite, Lit, vite-plugin-pwa, Workbox, Web Awesome 스타터 | Vite 구성, vite-plugin-pwa, Lit, manifest(`display_override`, `launch_handler`, `shortcuts`) | Web Awesome 컴포넌트(기본 모양이 강해 템플릿 티), 라우터(화면 하나), Azure 배포 |
| [topics/pwa](https://github.com/topics/pwa) | PWA 저장소 모음 | GoogleChrome/lighthouse(접근성 감사) | Ionic, Quasar, Capacitor(나중에 APK가 필요하면 Capacitor) |
| [wasabeef/awesome-android-ui](https://github.com/wasabeef/awesome-android-ui) | 안드로이드 UI 라이브러리 목록 | 없음 | 대부분 View(XML) 시대 라이브러리, PWA라 해당 없음 |
| [penpot/penpot](https://github.com/penpot/penpot) | 오픈소스 디자인 도구 | 없음 | 화면 하나짜리 개인 도구에 시안 도구는 과함 |
| topics website-design, webdesign, modern-web | 템플릿 모음 | 없음 | 포트폴리오, 식당 템플릿 위주 |
| WhaleExtentions `docs/DESIGN.md`, 아캠 플러스 아이콘 | 사용자 웨일 확장의 디자인 원칙 | 금지 목록, OKLCH와 `light-dark()` 토큰, 움직임 기본 끔, 아이콘 생성 방식, 아캠 플러스 아이콘 원본 | 웨일 강제 다크 대응(night-guard)은 PWA에 필요 없음 |
| [web.dev Learn PWA: App design](https://web.dev/learn/pwa/app-design) | 설치 앱 설계 지침 | display-mode, 안전 영역, overscroll, user-select, theme-color | |

아캠 플러스 아이콘 원본은 삼성학술정보관 사진([Srobidx, CC BY-SA 4.0](https://commons.wikimedia.org/wiki/File:Samsung_Library-Front.jpg))에서 윤곽을 딴 것이다.
