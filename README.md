<div align="center">

<img src="web/public/icon-192.png" width="96" height="96" alt="성공 아이콘">

# 성공

성균관대 공지와 인턴 공고를 모아 보고, 해야 할 일을 챙기는 설치형 웹 앱

![version](https://img.shields.io/badge/version-0.1.0-124532)
![PWA](https://img.shields.io/badge/PWA-installable-124532)
![hosting](https://img.shields.io/badge/GitHub%20Pages-222222?logo=githubpages&logoColor=white)

</div>

**[성공 열기](https://aniseongu.github.io/skku-notice-alert/)**

휴대폰과 노트북 브라우저에서 열고 앱으로 설치할 수 있어요. 수집과 알림은 GitHub Actions에서 실행하므로 내 PC를 켜 둘 필요가 없어요. 성균관대학교의 공식 서비스는 아니에요.

## 기능

- 성대 공지, 인턴 공고, 저장한 글을 세 탭에서 확인해요.
- 최신순과 마감순, 게시판 필터, 읽지 않은 공지만 보기를 지원해요.
- 제목, 분류, 판정 이유로 검색해요. 전체 본문 검색은 아직 지원하지 않아요.
- 공지 본문과 이미지, 요약, 번역을 보고 원문을 바로 열어요. 아직 수집하지 못한 본문은 준비 상태를 표시해요.
- 관심 키워드와 개인 기준에 맞는 새 공지를 웹 푸시로 받아요. 수정된 공지와 마감 알림도 지원해요.
- 구글 캘린더에 학교 공지 전체와 저장한 인턴 공고의 남은 일정을 넣어요.
- 라이트와 다크 모드, 키보드 탐색, 오프라인에서 마지막으로 받은 목록을 지원해요.
- 성대 공지는 새 글 전체를 알리고, 인턴은 Gemini가 공개 본문과 공고 이미지를 읽고 IT 직무와 지원 가능성을 판단해 선별해요. 키나 본문이 준비되지 않으면 판정을 기다리고, 애매한 글은 목록에만 남겨요.
- 아이캠퍼스 개인 액세스 토큰을 연결하면 지금 할 수 있는 과제, 퀴즈와 미완료 강의 마감을 알려줘요. 강의는 임시 LearningX 인증으로 한 시간마다 확인해요. 브라우저 쿠키와 임시 인증은 저장하지 않아요. 수신 범위는 기기별로 달라요. 새 기기를 연결할 때 휴대폰은 요약과 마감, PC는 꺼짐을 기본으로 제안해요. 원하는 범위로 바꿀 수 있어요. 토큰은 한 번만 넣어 함께 써요. 개인 강의 내용은 공개 목록에 내보내지 않아요.

## 기술 구성

[![Python](https://img.shields.io/badge/Python-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Lit](https://img.shields.io/badge/Lit-324FFF?style=flat-square&logo=lit&logoColor=white)](https://lit.dev/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vite.dev/)
[![Gemini](https://img.shields.io/badge/Gemini-8E75B2?style=flat-square&logo=googlegemini&logoColor=white)](https://ai.google.dev/)
[![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-2088FF?style=flat-square&logo=githubactions&logoColor=white)](https://github.com/aniseongu/skku-notice-alert/actions)
[![GitHub Pages](https://img.shields.io/badge/GitHub_Pages-222222?style=flat-square&logo=githubpages&logoColor=white)](https://aniseongu.github.io/skku-notice-alert/)

| 영역 | 사용 기술 |
|---|---|
| 수집과 파싱 | Python, httpx, selectolax, nh3 |
| 판정과 요약 | Google Gen AI SDK, Gemini 본문 및 이미지 판정. 키가 없으면 인턴 판정 대기 |
| 이미지 글자 인식 | RapidOCR, ONNX Runtime |
| 화면 | TypeScript, Lit, Vite, Pretendard |
| 설치와 오프라인 | vite-plugin-pwa, Workbox |
| 알림 | pywebpush, Apprise |
| 실행과 배포 | uv, GitHub Actions, GitHub Pages |

공개 게시판에서 받은 글을 파싱하고 중복을 걸러 기준을 적용한 뒤 알림과 정적 API를 만들어요. 화면은 이 API를 읽어요. 참고한 오픈소스와 재사용한 부분은 [조사 기록](docs/research/open-source.md)에 정리했어요.

## 내 저장소에서 실행하기

1. 저장소를 준비하고 `Settings > Pages > Build and deployment > Source`를 **GitHub Actions**로 설정해요. 워크플로마다 필요한 권한을 선언하므로 저장소 전체의 기본 권한을 넓힐 필요는 없어요.
2. `Settings > Secrets and variables > Actions`에서 필요한 값을 등록해요. Pages가 열린 뒤에는 앱 설정에서 저장소를 연결해 키와 관심 키워드를 넣을 수도 있어요.
3. `Actions > Publish website > Run workflow`로 화면을 배포해요. 알림 키가 없어도 공개 화면을 배포할 수 있어요.
4. `Actions > Check overseas access > Run workflow`로 공개 게시판과 Canvas의 접근 상태를 확인해요.
5. `Actions > Notice and Pages > Run workflow`로 수집을 시작해요. **첫 실행에는 기준선만 만들고 알림을 보내지 않아요.** 이후 약 15분 간격으로 확인하며 Actions 사정에 따라 늦어질 수 있어요.
6. 앱 설정의 **이 기기 알림**에서 휴대폰과 노트북을 각각 연결해요. 웹 푸시는 최대 8대까지 등록해요.

| 종류 | 이름 | 용도 |
|---|---|---|
| Secret | `WEB_PUSH_PRIVATE_KEY` | 웹 푸시 발송용 VAPID 비밀키. 대응 공개키는 `web/public/web-push.json`에 둬요. |
| Secret, 앱이 저장 | `WEB_PUSH_SUB_1`부터 `WEB_PUSH_SUB_8` | 기기별 알림 구독 정보 |
| Secret, 선택 | `GEMINI_API_KEY` | Gemini 판정, 요약과 번역 |
| Secret, 선택 | `PROFILE_YAML` | 개인 프로필. 파일 대신 Secret에 넣어요. |
| Secret, 선택 | `CANVAS_TOKEN` | 아이캠퍼스 개인 액세스 토큰 |
| Secret, 선택 | `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` | 구글 캘린더 연결 |
| Secret, 선택 | `NOTIFY_URLS` | Apprise 추가 알림 경로 |
| Variable, 앱이 저장 | `INTEREST_KEYWORDS`, `MUTED_CATEGORIES` | 관심 키워드와 끈 분류 |
| Variable, 앱이 저장 | `SAVED_NOTICES`, `READ_NOTICES` | 저장한 글과 읽음 상태 |

GitHub 연결 토큰은 이 저장소 하나에만 접근하는 Fine-grained token을 사용해요. 앱 안내에 따라 필요한 Secrets와 Variables 권한만 부여해요. 다른 기기 연결 QR에는 연결 열쇠가 들어 있으니 공유하거나 캡처해서 올리지 마세요.

## 공개되는 정보

공개 저장소에는 코드와 게시판 목록, 공지 보관본이 올라가요. GitHub Pages의 JSON API에는 공지 본문, 요약과 개인화된 판정 이유도 포함돼요. 프로필 원문을 공개하지 않아도 판정 이유에서 관심 분야나 일부 조건이 드러날 수 있어요. 개인 판단을 비공개로 써야 한다면 공개 정적 API 구조를 그대로 사용하면 안 돼요.

키와 토큰, 알림 구독 주소는 GitHub Secrets에 넣고 커밋하지 마세요. `.env`, `config/profile.yaml`, `state/canvas.json`은 Git에서 제외해요. 아이캠퍼스 알림 상태는 토큰에서 파생한 키로 암호화해 캐시하고, 복호화한 상태는 실행 중인 러너에만 둬요. 토큰이 바뀌거나 캐시가 사라지면 기준선을 다시 만들어요. Actions 캐시 자체는 비밀 저장소가 아니므로 민감한 원문을 넣지 마세요. 공개 보안 점검 범위와 한계는 [점검 기록](docs/research/2026-11-04_public-security.md)에 있어요.

## 로컬 개발

Python 3.12 이상, uv와 Node.js가 필요해요.

```sh
uv sync --frozen
cp config/rules.example.yaml config/rules.yaml
uv run skku-notice --dry-run --all --no-canvas
scripts/check.sh
```

`--dry-run`은 알림과 상태 저장 없이 결과를 확인해요. 개인 규칙을 담은 `config/rules.yaml`은 커밋하기 전에 공개 가능한 내용인지 확인하세요.

```sh
cd web
npm ci
npm run dev
npm run build
npm test
```

`localhost`는 화면 개발용이에요. 실제 배포와 설치 검증은 [정식 사이트](https://aniseongu.github.io/skku-notice-alert/)에서 진행해요.
