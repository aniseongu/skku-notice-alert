# 공개 저장소 보안 점검 (2026-11-04)

## 결론과 범위

공개 저장소라는 이유만으로 키가 공개되는 것은 아니다. 현재 추적 파일과 로컬 Git 이력에서 아래 알려진 자격 증명 형식의 노출은 발견하지 않았다. 다만 이 결과는 모든 비밀과 개인 정보가 없다는 보증이 아니다. 공개 API에는 개인화된 판정 이유가 포함되며, Actions 캐시를 비공개 저장소로 설명한 부분은 바로잡아야 한다.

- 대상: `aniseongu/skku-notice-alert`, 점검 시작 HEAD `3e4c80a`.
- `.env`와 개인 `config/profile.yaml`은 읽지 않았다. 다른 사람 계정으로 로그인하거나 자격 증명을 유효성 검사 서버에 보내지 않았다.
- 스캐너는 로컬 정규식 검사다. gitleaks는 설치되어 있지 않았다. 커밋 140개, 중복을 제외한 blob 837개를 검사했다. 금지한 경로는 내용 검사에서 제외했다.
- 패턴: Google API key, GitHub fine-grained와 classic token, PEM private key, Google OAuth client secret, AWS access key ID, ntfy 공개 토픽 URL. 탐지 0건. 값과 전체 파일 내용은 로그에 출력하지 않았다.
- 정규식에 맞지 않는 비밀, 사진 속 문자열, 임의 비밀번호, 유출 후 폐기한 값, 원격 전용 refs와 CI 로그는 이 결과로 배제할 수 없다.

## 현재 GitHub 설정 확인

읽기 전용 API로 확인했다. 설정 자체는 바꾸지 않았다.

| 항목 | 상태 |
|---|---|
| 저장소 공개 여부 | public |
| GitHub secret scanning | enabled |
| Secret scanning push protection | enabled |
| 현재 조회되는 secret scanning alerts | 0건 |
| Non-provider patterns | disabled |
| Secret validity checks | disabled |
| Dependabot security updates | disabled |

[GitHub secret scanning 문서](https://docs.github.com/en/code-security/concepts/secret-security/secret-scanning)는 전체 Git 이력과 여러 협업 영역을 검사한다고 설명한다. 탐지된 토큰이 있다면 먼저 폐기하고 교체해야 한다. 탐지 0건은 무결함 인증이 아니다.

## 공개와 비공개의 경계

| 데이터 | 현재 경로와 의미 |
|---|---|
| 공개 게시판 공지와 본문 | `state/archive.json`과 Pages API. 누구나 읽을 수 있다. |
| 개인화 판정과 이유 | 공개 archive와 `api/v1/matched.json`. 개인 프로필 원문을 숨겨도 관심 분야와 조건이 추론될 수 있다. |
| API 키, Canvas 토큰, 캘린더 갱신 토큰 | GitHub Actions Secrets. 코드와 문서에 값을 적지 않는다. |
| GitHub 연결 토큰 | 사용하는 브라우저에 보관. 연결 QR과 URL fragment에도 전달되므로 화면 공유와 캡처에 주의한다. |
| 저장, 읽음과 관심 키워드 | GitHub Actions Variables와 기기 저장소. Variables는 Secrets와 같은 암호화 비밀 보관 기능이 아니다. 공개 파일로 export하는 것과는 구분된다. |
| Canvas 알림 상태 | 개인 과제와 강의 식별자, 알림 시각을 포함한다. 토큰이나 강의 본문은 없지만 민감하지 않은 공개 데이터라고 볼 수 없다. |

공개 정적 화면에서 개인화 판정을 보이게 하는 현재 설계는 사용자 전용 비공개 앱과 다르다. 개인 정보가 들어간 조건을 완전히 비공개로 쓰려면 인증된 API나 비공개 저장소에서 데이터를 제공하는 설계가 필요하다. 공개 저장소를 비공개로 바꾸기만 하고 Pages API를 계속 공개하면 이 경계는 해결되지 않는다.

## Canvas 캐시 보완

[GitHub 캐시 문서](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching)는 기본 브랜치 캐시를 PR과 fork에서 읽을 수 있으므로 민감한 값을 넣지 말라고 안내한다. 기존의 "private Actions cache" 설명은 잘못이다.

이번 보완 모듈 `canvas_cache.py`는 다음과 같이 동작한다.

- `CANVAS_TOKEN`과 용도 분리 문자열의 SHA-256으로 32바이트 키를 파생한다. 사람이 만든 비밀번호용 파생기가 아니라 충분히 긴 Canvas 토큰을 전제로 한다.
- [pyca cryptography의 Fernet](https://github.com/pyca/cryptography/blob/main/docs/fernet.rst)으로 인증 암호화한다. 캐시에는 `state/canvas.enc` 암호문만 넣고 평문은 러너 실행 중에만 쓴다.
- `open`은 먼저 오래된 평문을 지운다. 키 누락, 토큰 교체와 암호문 손상에서는 복호화한 상태를 남기지 않고 기존 수집기의 첫 실행 기준선 처리로 돌아간다.
- `seal`은 상태가 없으면 건너뛴다. 상태가 있는데 키가 없으면 실패하고 암호문을 만들지 않는다. 성공과 실패 모두 토큰, 원문과 상세 예외를 출력하지 않는다.
- 토큰 교체나 캐시 제거 후 일부 기존 항목의 리마인드가 빠질 수 있다. 캐시의 기밀성은 키의 기밀성과 함께 유지된다. Fernet 암호문은 생성 시각 메타데이터를 숨기지 않는다.

기존 평문 캐시가 있다면 새 코드만 배포해도 사라지지 않는다. 과거 평문 캐시 삭제와 workflow의 새 암호문 경로 적용은 별도 확인해야 한다. 이 문서는 모듈 검토 결과이며 실제 운영 적용 여부는 daily-log와 배포 기록을 기준으로 한다.

## AI 개발 파일의 공개 여부

`AGENTS.md`, `CLAUDE.md`, `.agents/`, `.claude/`는 실행에 꼭 필요한 파일이 아니다. 그 이름 자체는 취약점이 아니지만 로컬 경로, 작업 이력, 내부 운영 지침을 공개할 이유가 없다면 로컬에만 둘 수 있다. README의 AI 개발 안내는 제거했다.

[GitHub ignore 문서](https://docs.github.com/en/get-started/git-basics/ignoring-files)에 따라 이미 추적 중인 파일은 `.gitignore` 추가만으로 제외되지 않는다. 로컬 파일을 유지하려면 `git rm --cached`로 추적을 끊고 ignore한다. 이번 점검 담당자는 해당 명령과 과거 이력 재작성은 실행하지 않았다.

새 커밋에서 제외해도 과거 커밋에서는 읽을 수 있다. 일반 작업 지침을 감추기 위해 강제 push로 이력을 바꾸지는 않는다. 실제 자격 증명이 발견되면 [GitHub 민감 정보 제거 절차](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)에 따라 먼저 폐기와 교체를 하고, 필요한 범위의 이력 정리를 별도로 결정한다.

## 의존성 추가 점검

점검 시작의 `web/package-lock.json`을 `npm audit --json`으로 확인한 결과 11건이었다. high 1건, moderate 8건, low 2건이며 Vite 8.1.3의 high 항목과 PWA 빌드 의존성 사슬이 포함됐다. 이는 빌드 도구를 포함한 결과로, 정적 Pages에 모든 취약점이 그대로 실행된다는 뜻은 아니다. 반대로 무시해도 된다는 뜻도 아니다.

주 작업자가 Vite를 8.3.5로 올린 후 high는 0건이 됐고, 남은 결과는 moderate 8건과 low 2건이다. 잔여 항목은 PWA 빌드 의존성의 deepmerge 프로토타입 오염, glob 취소 처리와 minimatch 패턴 증폭, 그리고 해당 패키지에 의존하는 도구다. 현재 빌드의 파일 패턴과 병합 옵션은 저장소에서 정하며 일반 사용자 입력을 받는 정적 화면 실행 경로는 아니다. 그렇더라도 신뢰하지 않는 빌드 설정과 코드를 실행하면 위험하다. `npm audit fix --dry-run --json`의 안전 자동 수정 후보는 0건이었다. `npm audit fix --force`는 PWA plugin을 1.1.0으로 내리는 제안을 포함하므로 자동 적용하지 않았다. 이 문서 작성 담당자는 패키지를 변경하지 않았으며 주 작업자가 후속 조치와 빌드 및 PWA 재검증을 맡는다. 로컬 `.venv/lib/python3.13/site-packages`를 대상으로 `uvx pip-audit --path`를 실행한 결과, 조회된 알려진 취약점은 0건이었다. 이는 현재 설치 환경 검사이며 모든 플랫폼과 배포 환경의 감사나 전면적인 침투 테스트는 아니다.

확인한 주요 advisory 원문: [deepmerge](https://github.com/advisories/GHSA-gcqx-w48m-w2h4), [glob](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4), [minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249), [업데이트 전 Vite의 high 항목](https://github.com/advisories/GHSA-587h-7wmj-h5pm).

## 운영 반영 확인

- 기존 canvas-state 이름의 평문 캐시를 GitHub에서 조회한 결과 0개였다. 없는 캐시를 삭제하지 않았다.
- 암호문 안에 원래 수정 시각도 넣고 복원한다. 복호화가 마지막 수집 시각을 방금으로 바꾸어 매번 30분 제한에 걸리는 회귀를 테스트로 방지했다. 캐시 열기 단계의 I/O 오류는 공개 공지 수집 전체를 막지 않는다.
- AI 작업 지침과 인수인계 파일은 로컬에 남겨 두고 Git 추적을 해제한다. ignore는 과거 커밋을 삭제하지 않는다. 공개 이력 강제 재작성은 하지 않았다.
