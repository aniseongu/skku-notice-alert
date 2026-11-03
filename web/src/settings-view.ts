// 설정 화면. 규칙은 docs/design/ux-rules.md 2-2절: 한 열, 왼쪽 이름과 도움말, 오른쪽 입력, 1px 구분선, 카드 없음.
import { LitElement, html, nothing, type TemplateResult } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import {
  GitHubError, REPO_PATTERN, checkGeminiKey, deleteSecret, listSecrets, readVariable, saveSecret, saveVariable,
} from './github';
import { forgetToken, loadToken, readSavedSecrets, rememberSavedSecrets, storeToken } from './settings-storage';
import { GoogleError, connectGoogleCalendar, validClientId } from './google-calendar';
import { browserPushEnabled, connectBrowserPush, disconnectBrowserPush, pushConfiguration, supportsBrowserPush, testBrowserNotification } from './browser-push';

export type Theme = 'auto' | 'light' | 'dark';

interface KeyField {
  secret: string;
  label: string;
  help: string;
  placeholder: string;
  multiline?: boolean;
  steps: (string | TemplateResult)[];
}

const link = (href: string, text: string) => html`<a href=${href} target="_blank" rel="noopener">${text}</a>`;

const KEY_FIELDS: KeyField[] = [
  {
    secret: 'GEMINI_API_KEY',
    label: 'Gemini 키',
    help: '나에게 맞는 공지인지 Gemini가 골라 줘요. 무료예요',
    placeholder: 'AIza로 시작하는 키',
    steps: [
      html`${link('https://aistudio.google.com/apikey', 'Google AI Studio의 API 키 화면')}을 열고 Google 계정으로 로그인해요`,
      '"API 키 만들기"를 누르고, 프로젝트를 고르라고 하면 새 프로젝트를 만들어요',
      '만들어진 키를 복사해서 아래 칸에 붙여 넣고 "확인"을 눌러요',
      '무료 등급은 보낸 내용이 Google 제품 개선에 쓰일 수 있어요. 프로필에 이름, 학번, 연락처는 넣지 마세요',
    ],
  },
  {
    secret: 'CANVAS_TOKEN',
    label: '아이캠퍼스 토큰',
    help: '아이캠퍼스 강의, 과제, 퀴즈 마감을 알려요',
    placeholder: '아이캠퍼스에서 만든 액세스 토큰',
    steps: [
      html`${link('https://canvas.skku.edu/profile/settings', '아이캠퍼스(Canvas) 설정')}에 로그인해요. 왼쪽 "계정"에서 "설정"으로 가도 돼요`,
      '"승인된 통합" 아래 "새 액세스 토큰"을 눌러요',
      '용도에 "성대 공지 알림", 만료일은 학기 끝 날짜로 적고 "토큰 생성"을 눌러요',
      '토큰은 이때 한 번만 보여요. 바로 복사해서 붙여 넣어요. 잃어버렸거나 샌 것 같으면 같은 화면에서 지우고 새로 만들어요',
    ],
  },
  {
    secret: 'PROFILE_YAML',
    label: '내 프로필',
    help: 'Gemini가 지원 자격을 판단할 때 써요',
    placeholder: 'department: 소프트웨어학과\nyear: 3\nenrollment_status: 재학',
    multiline: true,
    steps: [
      '학과, 학년, 재학 상태, 캠퍼스, 복수전공, 관심 분야, 받고 싶은 공지와 받기 싫은 공지를 적어요',
      '형식은 프로젝트의 config/profile.example.yaml 파일과 같아요',
      'Google로 보내는 내용이라 이름, 학번, 전화번호, 주소는 빼고 적어요',
    ],
  },
];

const remember = (key: string, value?: string | null) => {
  try {
    if (value === undefined) return localStorage.getItem(key);
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* 저장 못 해도 화면은 돈다 */ }
  return null;
};


export class SettingsView extends LitElement {
  static properties = {
    keywords: { attribute: false }, theme: { attribute: false }, categories: { attribute: false }, muted: { state: true },
    repo: { state: true }, token: { state: true }, values: { state: true },
    saved: { state: true }, status: { state: true }, open: { state: true }, reveal: { state: true }, busy: { state: true },
    keywordDraft: { state: true }, editing: { state: true }, browserNotifications: { state: true }, linked: { state: true },
    qr: { state: true }, handoff: { state: true },
  };

  keywords: string[] = [];
  // 지금 목록에 있는 분류(notice-app이 넘긴다)와 알림을 끈 분류(Actions 변수 MUTED_CATEGORIES, D-018).
  categories: string[] = [];
  muted: string[] = [];
  theme: Theme = 'auto';
  repo = remember('github-repo') ?? '';
  // 사용자 요청(2026-11-03)으로 연결 토큰은 이 기기에 암호화해 기억한다(D-017). 키 값은 남기지 않는다.
  token = '';
  linked = false;
  // 다른 기기 연결 QR(SVG). 1분 뒤 지운다.
  qr = '';
  // QR 주소로 받은 연결. 사용자가 "연결하기"를 누르기 전에는 쓰지 않는다(남의 저장소로 몰래 연결되는 것을 막는다).
  handoff: { repo: string; token: string } | null = null;
  private qrTimer = 0;
  // GitHub에 있는 키워드(모든 기기 공용)와 같은지 비교해 바뀐 것만 저장한다.
  private syncedKeywords: string | null = null;
  values: Record<string, string> = {};
  saved: Record<string, string> = readSavedSecrets(this.repo);
  editing: Record<string, boolean> = {};
  status: Record<string, { ok: boolean; text: string }> = {};
  open: Record<string, boolean> = {};
  reveal: Record<string, boolean> = {};
  busy = '';
  keywordDraft = '';
  browserNotifications = false;

  createRenderRoot() { return this; }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('beforeunload', this.warnUnsaved);
    browserPushEnabled().then((enabled) => { this.browserNotifications = enabled; }).catch(() => {});
    if (!this.takeHandoff()) loadToken().then((token) => {
      if (token && !this.token) { this.token = token; if (this.connected()) this.connect(); }
    });
    if (!this.repo) pushConfiguration().then((config) => {
      if (!this.repo) { this.setRepo(config.repository); remember('github-repo', config.repository); }
    }).catch(() => {});
  }

  disconnectedCallback() {
    window.removeEventListener('beforeunload', this.warnUnsaved);
    super.disconnectedCallback();
  }

  private warnUnsaved = (event: BeforeUnloadEvent) => {
    if (!Object.values(this.values).some((value) => value.trim())) return;
    event.preventDefault();
    event.returnValue = '';
  };

  private emit(name: string, detail: unknown) { this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true })); }
  private setStatus(key: string, ok: boolean, text: string) { this.status = { ...this.status, [key]: { ok, text } }; }
  // 저장소 하나에만 권한을 주는 Fine-grained 토큰만 받는다. classic 토큰(ghp_)은 모든 저장소에 닿는다.
  private connected() { return REPO_PATTERN.test(this.repo) && this.token.startsWith('github_pat_'); }

  private setRepo(repo: string) {
    if (this.repo === repo) return;
    this.repo = repo;
    this.saved = readSavedSecrets(repo);
    this.editing = {};
    this.status = {};
  }

  private closeEdit(name: string) {
    this.editing = { ...this.editing, [name]: false };
    this.values = { ...this.values, [name]: '' };
    this.reveal = { ...this.reveal, [name]: false };
    const status = { ...this.status };
    delete status[name];
    this.status = status;
  }


  private async toggleBrowserNotifications() {
    if (!this.connected()) { this.setStatus('browser-push', false, '위에서 GitHub에 한 번 연결하면 이 기기의 알림을 켤 수 있어요'); return; }
    this.busy = 'browser-push';
    try {
      if (this.browserNotifications) {
        await disconnectBrowserPush(this.repo, this.token);
        this.browserNotifications = false;
        this.setStatus('browser-push', true, '이 기기 알림을 껐어요. 다른 기기는 그대로 받아요');
      } else {
        await connectBrowserPush(this.repo, this.token);
        this.browserNotifications = true;
        this.setStatus('browser-push', true, '연결했어요. 앱을 닫아도 브라우저가 켜져 있으면 알림을 받아요');
      }
    } catch (error) {
      this.setStatus('browser-push', false, error instanceof Error ? error.message : '알림을 연결하지 못했어요');
    } finally { this.busy = ''; }
  }

  private async testBrowserNotifications() {
    try {
      await testBrowserNotification();
      this.setStatus('browser-push', true, '테스트 알림을 띄웠어요. Windows 알림도 켜져 있는지 확인해 주세요');
    } catch (error) {
      this.setStatus('browser-push', false, error instanceof Error ? error.message : '테스트 알림을 띄우지 못했어요');
    }
  }

  private async connect() {
    remember('github-repo', this.repo);
    if (!this.connected()) { this.setStatus('github', false, '저장소는 아이디/저장소 이름으로, 토큰은 github_pat_로 시작하는 값을 넣어 주세요'); return; }
    this.busy = 'github';
    const repo = this.repo;
    const token = this.token;
    try {
      const saved = await listSecrets(repo, token);
      rememberSavedSecrets(repo, saved);
      await storeToken(token);
      if (this.repo === repo) {
        this.saved = saved;
        this.linked = true;
        await this.pullKeywords(repo, token);
        const muted = await readVariable(repo, token, 'MUTED_CATEGORIES');
        this.muted = (muted ?? '').split(/[,\n]/).map((w) => w.trim()).filter(Boolean);
        this.setStatus('github', true, '연결했어요. 다음에 열 때도 연결돼 있어요');
      }
    } catch (error) {
      // 만료되거나 지운 토큰은 기억하지 않는다. 인터넷 오류면 다음에 다시 시도한다.
      if (error instanceof GitHubError) { await forgetToken(); this.token = ''; this.linked = false; }
      this.setStatus('github', false, error instanceof GitHubError ? `${error.message}. 새 토큰을 넣어 주세요` : '인터넷 연결을 확인해 주세요');
    } finally { this.busy = ''; }
  }

  // 다른 기기의 QR로 열면 주소 # 뒤에 저장소와 토큰이 온다. # 뒤는 서버로 가지 않고, 읽자마자 주소에서 지운다.
  private takeHandoff(): boolean {
    const params = new URLSearchParams(location.hash.slice(1));
    const token = params.get('token');
    if (!token) return false;
    history.replaceState(history.state, '', location.pathname + location.search);
    const repo = params.get('repo') ?? '';
    if (!token.startsWith('github_pat_') || !REPO_PATTERN.test(repo)) {
      this.setStatus('github', false, 'QR이 올바르지 않아요. 연결된 기기에서 QR을 다시 띄워 주세요');
      return true;
    }
    // 이 사이트를 배포한 저장소가 아니면 받지 않는다. 같아도 사용자가 확인해야 연결한다.
    pushConfiguration().then((config) => {
      if (config.repository === repo) this.handoff = { repo, token };
      else this.setStatus('github', false, '이 사이트의 저장소가 아닌 QR이라 연결하지 않았어요');
    }).catch(() => this.setStatus('github', false, 'QR을 확인하지 못했어요. 잠시 뒤 다시 찍어 주세요'));
    loadToken().then((saved) => { if (saved && !this.token) { this.token = saved; if (this.connected()) this.connect(); } });
    return true;
  }

  private acceptHandoff() {
    const handoff = this.handoff;
    if (!handoff) return;
    this.handoff = null;
    this.setRepo(handoff.repo);
    remember('github-repo', handoff.repo);
    this.token = handoff.token;
    this.connect();
  }

  private async showHandoff() {
    // QR 그리는 코드는 이때만 불러온다(첫 화면을 가볍게).
    const { renderSVG } = await import('uqr');
    const url = new URL(document.baseURI);
    url.search = '?view=settings';
    url.hash = new URLSearchParams({ repo: this.repo, token: this.token }).toString();
    this.qr = renderSVG(url.href, { border: 1 });
    clearTimeout(this.qrTimer);
    this.qrTimer = window.setTimeout(() => { this.qr = ''; }, 60_000);
  }

  private hideHandoff() { clearTimeout(this.qrTimer); this.qr = ''; }

  private async disconnect() {
    this.hideHandoff();
    await forgetToken();
    this.token = '';
    this.linked = false;
    this.syncedKeywords = null;
    this.setStatus('github', true, '연결을 끊었어요. 저장한 키는 GitHub에 그대로 있어요');
  }

  private async save(name: string, value: string) {
    if (!value.trim()) { this.setStatus(name, false, '키를 먼저 붙여 넣어 주세요'); return; }
    this.busy = name;
    const repo = this.repo;
    const token = this.token;
    try {
      await saveSecret(repo, token, name, value.trim());
      const saved = { ...readSavedSecrets(repo), [name]: new Date().toISOString() };
      rememberSavedSecrets(repo, saved);
      if (this.repo === repo) {
        this.saved = saved;
        this.closeEdit(name);
        this.setStatus(name, true, '저장했어요. 다음 실행부터 써요');
      }
    } catch (error) {
      this.setStatus(name, false, error instanceof GitHubError ? error.message : '저장하지 못했어요');
    } finally { this.busy = ''; }
  }

  private async check(name: string) {
    const value = this.values[name]?.trim() ?? '';
    if (!value) { this.setStatus(name, false, '키를 먼저 붙여 넣어 주세요'); return; }
    this.busy = name;
    try {
      const ok = await checkGeminiKey(value);
      this.setStatus(name, ok, ok ? '키가 맞아요' : '키를 다시 복사해 붙여 넣어 주세요');
    } catch {
      this.setStatus(name, false, '확인하지 못했어요. 인터넷 연결을 봐 주세요');
    } finally { this.busy = ''; }
  }

  // GitHub 값이 있으면 그것을 따른다. 없으면 이 기기의 키워드를 올린다.
  private async pullKeywords(repo: string, token: string) {
    const remote = await readVariable(repo, token, 'INTEREST_KEYWORDS');
    const words = (remote ?? '').split(/[,\n]/).map((w) => w.trim()).filter(Boolean);
    if (words.length) {
      this.syncedKeywords = words.join('\n');
      if (words.join('\n') !== this.keywords.join('\n')) this.emit('keywords-change', words);
    } else if (this.keywords.length) {
      await this.saveKeywords();
    } else {
      this.syncedKeywords = '';
    }
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has('keywords') && this.linked && this.syncedKeywords !== null
      && this.keywords.join('\n') !== this.syncedKeywords) this.saveKeywords();
  }

  private async saveKeywords() {
    const value = this.keywords.join('\n');
    try {
      await saveVariable(this.repo, this.token, 'INTEREST_KEYWORDS', value);
      this.syncedKeywords = value;
      this.setStatus('keywords', true, '모든 기기에 저장했어요');
    } catch (error) {
      this.setStatus('keywords', false, error instanceof GitHubError ? `${error.message}. 다시 바꾸면 또 저장해요` : '인터넷 연결을 확인해 주세요');
    }
  }

  private async toggleCategory(category: string) {
    if (!this.linked) { this.setStatus('muted', false, 'GitHub에 연결하면 바꿀 수 있어요'); return; }
    const before = this.muted;
    this.muted = before.includes(category) ? before.filter((c) => c !== category) : [...before, category];
    try {
      await saveVariable(this.repo, this.token, 'MUTED_CATEGORIES', this.muted.join('\n'));
      this.setStatus('muted', true, this.muted.includes(category) ? `${category} 알림을 껐어요` : `${category} 알림을 켰어요`);
    } catch (error) {
      this.muted = before;
      this.setStatus('muted', false, error instanceof GitHubError ? error.message : '인터넷 연결을 확인해 주세요');
    }
  }

  private addKeyword() {
    const word = this.keywordDraft.trim().replace(/\s+/g, ' ');
    if (word && !this.keywords.includes(word)) this.emit('keywords-change', [...this.keywords, word]);
    this.keywordDraft = '';
  }

  // 키 값은 클립보드에 넣지 않는다(클립보드 기록에 남는다). 이름만 있는 양식을 복사하고 값은 사용자가 직접 붙여 넣는다.
  private envText() {
    return KEY_FIELDS.filter((f) => !f.multiline).map((f) => `${f.secret}=`).join('\n');
  }

  private async connectGoogle() {
    const clientId = (this.values.GOOGLE_CLIENT_ID ?? '').trim();
    const secret = (this.values.GOOGLE_CLIENT_SECRET ?? '').trim();
    if (!this.linked) { this.setStatus('google', false, '위 연결에서 GitHub에 먼저 연결해 주세요'); return; }
    if (!validClientId(clientId)) { this.setStatus('google', false, '클라이언트 ID는 .apps.googleusercontent.com으로 끝나요'); return; }
    if (secret.length < 10) { this.setStatus('google', false, '클라이언트 보안 비밀번호를 붙여 넣어 주세요'); return; }
    this.busy = 'google';
    try {
      await connectGoogleCalendar(this.repo, this.token, clientId, secret);
      this.values = { ...this.values, GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' };
      this.saved = { ...this.saved, GOOGLE_REFRESH_TOKEN: new Date().toISOString() };
      rememberSavedSecrets(this.repo, this.saved);
      this.setStatus('google', true, '연결했어요. 15분 안에 "성대 공지" 캘린더에 마감이 들어가요');
    } catch (error) {
      this.setStatus('google', false, error instanceof GoogleError || error instanceof GitHubError ? error.message : '연결하지 못했어요');
    } finally { this.busy = ''; }
  }

  private async disconnectGoogle() {
    this.busy = 'google';
    try {
      // 갱신 토큰과 비밀번호만 지운다. 이미 넣은 일정과 캘린더는 구글에 남는다.
      await deleteSecret(this.repo, this.token, 'GOOGLE_REFRESH_TOKEN').catch(() => {});
      await deleteSecret(this.repo, this.token, 'GOOGLE_CLIENT_SECRET').catch(() => {});
      const saved = { ...this.saved };
      delete saved.GOOGLE_REFRESH_TOKEN;
      delete saved.GOOGLE_CLIENT_SECRET;
      this.saved = saved;
      rememberSavedSecrets(this.repo, saved);
      this.setStatus('google', true, '연결을 끊었어요. 넣어 둔 일정은 구글 캘린더에 남아요');
    } finally { this.busy = ''; }
  }

  // 마감 캘린더(deadlines.ics)와 RSS(feed.xml)는 Actions가 15분마다 새로 쓴다(GOAL.md M3).
  private feedUrl(name: string) { return new URL(name, document.baseURI).href; }

  private async copyFeed(key: string, name: string) {
    try {
      await navigator.clipboard.writeText(this.feedUrl(name));
      this.setStatus(key, true, '주소를 복사했어요');
    } catch {
      this.setStatus(key, false, '복사하지 못했어요');
    }
  }

  private async copyEnv() {
    try {
      await navigator.clipboard.writeText(this.envText());
      this.setStatus('env', true, '양식을 복사했어요. .env 파일에 붙여 넣고 = 뒤에 값을 하나씩 넣어요');
    } catch {
      this.setStatus('env', false, '복사하지 못했어요');
    }
  }

  private note(key: string) {
    const status = this.status[key];
    return status ? html`<p class="field-note ${status.ok ? 'ok' : 'error'}" role="status">${status.text}</p>` : nothing;
  }

  private guide(key: string, steps: (string | TemplateResult)[], title = '받는 방법') {
    const opened = Boolean(this.open[key]);
    return html`
      <button type="button" class="text-button" aria-expanded=${String(opened)}
        @click=${() => { this.open = { ...this.open, [key]: !opened }; }}>${opened ? '닫기' : title}</button>
      ${opened ? html`<ol class="steps">${steps.map((step) => html`<li>${step}</li>`)}</ol>` : nothing}`;
  }

  render() {
    return html`
      <div class="settings">
        <section aria-labelledby="s-github">
          <h2 id="s-github" class="settings-head">연결</h2>
          <div class="box">
          <div class="setting">
            <div class="setting-text">
              <p class="setting-name">GitHub 저장소</p>
              <p class="setting-help">15분마다 공지를 확인하는 내 저장소예요. 아래 키는 이 저장소로 암호화해 보내고 브라우저에는 남기지 않아요. 연결은 이 기기에 기억해요</p>
            </div>
            <div class="setting-control">
              ${this.handoff ? html`
                <p class="setting-saved">QR로 이 기기를 ${this.handoff.repo}에 연결할까요?</p>
                <p class="field-note">내가 다른 기기에서 띄운 QR일 때만 연결해 주세요</p>
                <div class="inline">
                  <button type="button" class="solid-button" @click=${this.acceptHandoff}>연결하기</button>
                  <button type="button" class="ghost-button" @click=${() => { this.handoff = null; }}>취소</button>
                </div>` : nothing}
              ${this.linked ? html`
                <p class="setting-saved">${this.repo}에 연결돼 있어요</p>
                <div class="inline">
                  <button type="button" class="ghost-button" ?disabled=${this.busy === 'github'} @click=${this.connect}>
                    ${this.busy === 'github' ? '확인 중' : '저장 상태 새로 보기'}</button>
                  <button type="button" class="ghost-button" @click=${this.disconnect}>연결 끊기</button>
                </div>
                ${this.qr ? html`
                  <div class="qr" role="img" aria-label="다른 기기 연결 QR">${unsafeHTML(this.qr)}</div>
                  <p class="field-note">다른 휴대폰이나 PC의 카메라로 찍으면 그 기기가 바로 연결돼요. 연결 열쇠가 들어 있으니 다른 사람에게 보여 주지 마세요. 1분 뒤 사라져요</p>
                  <button type="button" class="text-button" @click=${this.hideHandoff}>QR 닫기</button>
                ` : html`<button type="button" class="text-button" @click=${this.showHandoff}>다른 기기 연결하기</button>`}
              ` : html`
              <input class="input" type="text" autocomplete="off" spellcheck="false" aria-label="저장소" placeholder="아이디/저장소 이름"
                .value=${this.repo} @input=${(e: Event) => this.setRepo((e.target as HTMLInputElement).value.trim())}>
              <div class="inline">
                <input class="input" type="password" autocomplete="off" spellcheck="false" aria-label="GitHub 토큰" placeholder="github_pat_로 시작하는 토큰"
                  .value=${this.token} @input=${(e: Event) => { this.token = (e.target as HTMLInputElement).value.trim(); }}>
                <button type="button" class="ghost-button" ?disabled=${this.busy === 'github'} @click=${this.connect}>
                  ${this.busy === 'github' ? '연결 중' : '연결하기'}</button>
              </div>
              `}
              ${this.note('github')}
              ${this.guide('github', [
                html`${link('https://github.com/settings/personal-access-tokens/new', 'GitHub 새 토큰 화면')}을 열어요(Fine-grained token)`,
                '"Repository access"에서 "Only select repositories"를 고르고 이 저장소 하나만 골라요',
                '"Permissions"에서 Secrets와 Variables를 "Read and write"로 바꿔요. 다른 권한은 주지 않아요',
                '만료일을 정하고 만든 토큰을 복사해 위 칸에 넣어요',
                '저장소가 아직 없으면 아래 ".env 양식 복사하기"로 컴퓨터에서 먼저 써요',
              ])}
            </div>
          </div>

          </div>
        </section>

        <section aria-labelledby="s-notify">
          <h2 id="s-notify" class="settings-head">알림 받을 곳</h2>
          <div class="box">
          <div class="setting">
            <div class="setting-text">
              <p class="setting-name">이 기기 알림</p>
              <p class="setting-help">앱과 탭을 닫아도 브라우저가 켜져 있으면 휴대폰이나 PC 알림으로 받아요. 소리는 기기의 알림 설정을 따라요.</p>
            </div>
            <div class="setting-control">
              ${this.browserNotifications ? html`<p class="setting-saved">알림을 받고 있어요</p>` : html`<p class="field-note">알림이 꺼져 있어요</p>`}
              <div class="inline">
                <button type="button" class="ghost-button" ?disabled=${this.busy === 'browser-push' || !supportsBrowserPush()}
                  @click=${this.toggleBrowserNotifications}>${this.busy === 'browser-push' ? '연결 중' : this.browserNotifications ? '알림 끄기' : '알림 받기'}</button>
                ${this.browserNotifications ? html`<button type="button" class="ghost-button" @click=${this.testBrowserNotifications}>테스트 알림 띄우기</button>` : nothing}
              </div>
              ${!supportsBrowserPush() ? html`<p class="field-note">최신 브라우저에서 알림을 연결해 주세요</p>` : nothing}
              ${this.note('browser-push')}
              <p class="field-note">한 번 연결하면 계속 받아요. 휴대폰과 PC에서 각각 켜면 모두 받아요.</p>
            </div>
          </div>
          <div class="setting">
            <div class="setting-text">
              <p class="setting-name">알림 받을 분류</p>
              <p class="setting-help">켠 분류의 글만 알림으로 받아요. 끈 분류도 관심 키워드나 내 정보에 맞는 글은 알려요</p>
            </div>
            <div class="setting-control">
              ${this.categories.length ? html`<div class="chips" role="group" aria-label="알림 받을 분류">
                ${this.categories.map((category) => html`<button type="button" class="chip" aria-pressed=${String(!this.muted.includes(category))}
                  ?disabled=${!this.linked} @click=${() => this.toggleCategory(category)}>${category}</button>`)}
              </div>` : html`<p class="field-note">공지를 불러오면 분류가 보여요</p>`}
              ${this.linked ? this.note('muted') : html`<p class="field-note">GitHub에 연결하면 바꿀 수 있어요</p>`}
            </div>
          </div>
          </div>
        </section>

        <section aria-labelledby="s-keys">
          <h2 id="s-keys" class="settings-head">연결 키</h2>
          <div class="box">
          ${KEY_FIELDS.map((field) => this.keyRow(field))}

          <div class="setting">
            <div class="setting-text">
              <p class="setting-name">컴퓨터에서 먼저 쓰기</p>
              <p class="setting-help">저장소를 만들기 전에는 프로젝트 폴더의 .env 파일에 키를 적어요</p>
            </div>
            <div class="setting-control">
              <button type="button" class="ghost-button" @click=${this.copyEnv}>.env 양식 복사하기</button>
              ${this.note('env')}
            </div>
          </div>
          </div>
        </section>

        <section aria-labelledby="s-keywords">
          <h2 id="s-keywords" class="settings-head">관심 키워드</h2>
          <div class="box">
          <div class="setting">
            <div class="setting-text">
              <p class="setting-name">키워드</p>
              <p class="setting-help">맞는 공지를 "관심"으로 표시하고 내 공지에 올려요. 글자가 없어도 뜻이 맞으면 Gemini가 찾아요</p>
            </div>
            <div class="setting-control">
              <div class="inline">
                <input class="input" type="text" autocomplete="off" aria-label="새 키워드" placeholder="예: 겨울방학 인턴" .value=${this.keywordDraft}
                  @input=${(e: Event) => { this.keywordDraft = (e.target as HTMLInputElement).value; }}
                  @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter' && !e.isComposing) this.addKeyword(); }}>
                <button type="button" class="ghost-button" @click=${this.addKeyword}>추가하기</button>
              </div>
              ${this.keywords.length ? html`<ul class="keyword-list">${this.keywords.map((word) => html`
                <li><span>${word}</span><button type="button" class="text-button" aria-label="${word} 삭제"
                  @click=${() => this.emit('keywords-change', this.keywords.filter((w) => w !== word))}>삭제</button></li>`)}</ul>` : nothing}
              ${this.linked ? this.note('keywords') : html`<p class="field-note">위에서 GitHub에 연결하면 모든 기기에서 같은 키워드를 써요</p>`}
            </div>
          </div>
          </div>
        </section>

        <section aria-labelledby="s-feeds">
          <h2 id="s-feeds" class="settings-head">캘린더와 피드</h2>
          <div class="box">
          <div class="setting">
            <div class="setting-text">
              <p class="setting-name">구글 캘린더 자동 연결</p>
              <p class="setting-help">내 공지와 저장한 공지의 마감을 "성대 공지" 캘린더에 15분마다 맞춰 넣어요. 기기를 꺼 둬도 돼요. 마감 30분 전에 구글 알림이 울려요</p>
            </div>
            <div class="setting-control">
              ${this.saved.GOOGLE_REFRESH_TOKEN ? html`
                <p class="setting-saved">연결돼 있어요</p>
                <button type="button" class="ghost-button" ?disabled=${this.busy === 'google' || !this.linked} @click=${this.disconnectGoogle}>연결 끊기</button>
              ` : html`
                <input class="input" type="text" autocomplete="off" spellcheck="false" aria-label="구글 클라이언트 ID" placeholder="클라이언트 ID (apps.googleusercontent.com으로 끝나요)"
                  .value=${this.values.GOOGLE_CLIENT_ID ?? ''} @input=${(e: Event) => { this.values = { ...this.values, GOOGLE_CLIENT_ID: (e.target as HTMLInputElement).value }; }}>
                <input class="input" type="password" autocomplete="off" spellcheck="false" aria-label="구글 클라이언트 보안 비밀번호" placeholder="클라이언트 보안 비밀번호"
                  .value=${this.values.GOOGLE_CLIENT_SECRET ?? ''} @input=${(e: Event) => { this.values = { ...this.values, GOOGLE_CLIENT_SECRET: (e.target as HTMLInputElement).value }; }}>
                <button type="button" class="solid-button" ?disabled=${this.busy === 'google' || !this.linked} @click=${this.connectGoogle}>
                  ${this.busy === 'google' ? '연결 중' : '구글 캘린더 연결하기'}</button>
                ${this.linked ? nothing : html`<p class="field-note">GitHub에 연결하면 쓸 수 있어요</p>`}
              `}
              ${this.note('google')}
              ${this.guide('google', [
                html`${link('https://console.cloud.google.com/apis/credentials', 'Google Cloud 사용자 인증 정보')}를 열어요. 아캠 플러스 때 만든 프로젝트를 그대로 써도 돼요`,
                html`${link('https://console.cloud.google.com/apis/library/calendar-json.googleapis.com', 'Google Calendar API')}를 "사용"으로 켜요`,
                '"OAuth 클라이언트 ID"의 웹 애플리케이션을 열거나 새로 만들어요',
                '"승인된 자바스크립트 원본"에 https://aniseongu.github.io 를 넣어요',
                `"승인된 리디렉션 URI"에 ${new URL('oauth-callback.html', document.baseURI).href} 를 넣어요`,
                html`${link('https://console.cloud.google.com/auth/audience', 'OAuth 대상')}에서 게시 상태를 "프로덕션"으로 바꿔요. "테스트"면 7일마다 연결이 끊겨요`,
                '클라이언트 ID와 보안 비밀번호를 위 칸에 붙여 넣고 연결하기를 눌러요. "확인되지 않은 앱" 화면이 나오면 고급, 이동을 눌러요(내가 만든 앱이에요)',
              ], '연결하는 방법')}
            </div>
          </div>
          <div class="setting">
            <div class="setting-text">
              <p class="setting-name">마감 캘린더</p>
              <p class="setting-help">마감일이 있는 공지를 휴대폰과 PC 캘린더에 띄워요. 한 번 구독하면 새 마감도 저절로 들어와요</p>
            </div>
            <div class="setting-control">
              <div class="inline">
                <a class="ghost-button" target="_blank" rel="noopener"
                  href=${`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(this.feedUrl('deadlines.ics').replace(/^https:/, 'webcal:'))}`}>구글 캘린더에 추가하기</a>
                <a class="ghost-button" href=${this.feedUrl('deadlines.ics').replace(/^https:/, 'webcal:')}>캘린더 앱으로 열기</a>
              </div>
              <button type="button" class="text-button" @click=${() => this.copyFeed('calendar', 'deadlines.ics')}>주소 복사하기</button>
              ${this.note('calendar')}
            </div>
          </div>
          <div class="setting">
            <div class="setting-text">
              <p class="setting-name">RSS 피드</p>
              <p class="setting-help">피드 앱(Feedly, Inoreader 등)에서 새 공지를 받아 봐요</p>
            </div>
            <div class="setting-control">
              <button type="button" class="ghost-button" @click=${() => this.copyFeed('feed', 'feed.xml')}>피드 주소 복사하기</button>
              ${this.note('feed')}
            </div>
          </div>
          </div>
        </section>

        <section aria-labelledby="s-view">
          <h2 id="s-view" class="settings-head">화면</h2>
          <div class="box">
          <div class="setting">
            <div class="setting-text"><p class="setting-name">화면 모드</p><p class="setting-help">자동은 휴대폰과 PC 설정을 따라요</p></div>
            <div class="setting-control">
              <div class="segmented" role="radiogroup" aria-label="화면 모드">
                ${(['auto', 'light', 'dark'] as Theme[]).map((value) => html`
                  <button type="button" role="radio" aria-checked=${String(this.theme === value)}
                    @click=${() => this.emit('theme-change', value)}>${{ auto: '자동', light: '밝게', dark: '어둡게' }[value]}</button>`)}
              </div>
            </div>
          </div>
          </div>
        </section>
      </div>`;
  }

  private keyRow(field: KeyField) {
    const name = field.secret;
    const shown = Boolean(this.reveal[name]);
    const value = this.values[name] ?? '';
    const locked = Boolean(this.saved[name]) && !this.editing[name];
    const onInput = (e: Event) => { this.values = { ...this.values, [name]: (e.target as HTMLInputElement).value }; };
    return html`
      <div class="setting">
        <div class="setting-text">
          <p class="setting-name">${field.label}</p>
          <p class="setting-help">${field.help}</p>
          ${this.saved[name] ? html`<p class="setting-saved">입력돼 있어요</p>` : nothing}
        </div>
        <div class="setting-control">
          ${locked ? html`
            <p class="field-note">저장한 값은 숨겨 두었어요</p>
            <button type="button" class="ghost-button" @click=${() => { this.editing = { ...this.editing, [name]: true }; }}>수정하기</button>
          ` : html`
          ${field.multiline
            ? html`<textarea class="input" rows="5" autocomplete="off" spellcheck="false" aria-label=${field.label}
                placeholder=${field.placeholder} .value=${value} @input=${onInput}></textarea>`
            : html`<div class="inline">
                <input class="input" type=${shown ? 'text' : 'password'} autocomplete="off" spellcheck="false" aria-label=${field.label}
                  placeholder=${field.placeholder} .value=${value} @input=${onInput}>
                <button type="button" class="ghost-button" aria-pressed=${String(shown)}
                  @click=${() => { this.reveal = { ...this.reveal, [name]: !shown }; }}>${shown ? '숨기기' : '보기'}</button>
              </div>`}
          <div class="inline">
            ${name === 'GEMINI_API_KEY' ? html`<button type="button" class="ghost-button" ?disabled=${this.busy === name} @click=${() => this.check(name)}>키 확인하기</button>` : nothing}
            <button type="button" class="solid-button" ?disabled=${!this.connected() || this.busy === name} @click=${() => this.save(name, value)}>
              ${this.busy === name ? '저장 중' : 'GitHub에 저장하기'}</button>
            ${this.saved[name] ? html`<button type="button" class="ghost-button" ?disabled=${this.busy === name}
              @click=${() => this.closeEdit(name)}>닫기</button>` : nothing}
          </div>
          ${this.connected()
            ? value.trim() ? html`<p class="field-note">아직 저장하지 않았어요. GitHub에 저장하기를 눌러 주세요</p>` : nothing
            : html`<p class="field-note">위에서 GitHub에 연결한 뒤 저장해 주세요. 입력한 내용은 아직 저장하지 않았어요</p>`}
          `}
          ${this.note(name)}
          ${this.guide(name, field.steps, field.multiline ? '쓰는 방법' : '받는 방법')}
        </div>
      </div>`;
  }
}

customElements.define('settings-view', SettingsView);
