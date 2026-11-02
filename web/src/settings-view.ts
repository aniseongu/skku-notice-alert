// 설정 화면. 규칙은 docs/design/ux-rules.md 2-2절: 한 열, 왼쪽 이름과 도움말, 오른쪽 입력, 1px 구분선, 카드 없음.
import { LitElement, html, nothing, type TemplateResult } from 'lit';
import {
  GitHubError, REPO_PATTERN, checkGeminiKey, listSecrets, newTopic, saveSecret, saveVariable, sendTestNotification,
} from './github';

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
    label: 'Gemini API 키',
    help: '나에게 해당하는 공지인지 판정해요. 무료예요',
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
    label: 'Canvas 토큰',
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
      '이름, 학번, 전화번호, 주소는 적지 않아요',
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

const savedDate = (iso: string) =>
  new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' }).format(new Date(iso));

export class SettingsView extends LitElement {
  static properties = {
    keywords: { attribute: false }, theme: { attribute: false },
    topic: { state: true }, repo: { state: true }, token: { state: true }, values: { state: true },
    saved: { state: true }, status: { state: true }, open: { state: true }, reveal: { state: true }, busy: { state: true },
    keywordDraft: { state: true },
  };

  keywords: string[] = [];
  theme: Theme = 'auto';
  // 토픽은 아는 사람 누구나 구독할 수 있는 비밀이라 브라우저에 남기지 않는다(메모리에만, 화면을 닫으면 잊는다).
  topic = '';
  repo = remember('github-repo') ?? '';
  token = '';
  values: Record<string, string> = {};
  saved: Record<string, string> = {};
  status: Record<string, { ok: boolean; text: string }> = {};
  open: Record<string, boolean> = {};
  reveal: Record<string, boolean> = {};
  busy = '';
  keywordDraft = '';

  createRenderRoot() { return this; }

  private emit(name: string, detail: unknown) { this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true })); }
  private setStatus(key: string, ok: boolean, text: string) { this.status = { ...this.status, [key]: { ok, text } }; }
  private connected() { return REPO_PATTERN.test(this.repo) && this.token.length > 0; }

  private setTopic(value: string) { this.topic = value.trim(); }

  private async testNotification() {
    if (!/^[\w-]{6,64}$/.test(this.topic)) { this.setStatus('topic', false, '토픽 이름은 영문, 숫자, -, _로 6자 이상이에요'); return; }
    this.busy = 'topic';
    try {
      const ok = await sendTestNotification(this.topic);
      this.setStatus('topic', ok, ok ? '보냈어요. 휴대폰과 PC에 알림이 왔는지 봐 주세요' : 'ntfy가 받지 않았어요. 잠시 뒤 다시 해 주세요');
    } catch {
      this.setStatus('topic', false, '인터넷 연결을 확인해 주세요');
    } finally { this.busy = ''; }
  }

  private async connect() {
    remember('github-repo', this.repo);
    if (!this.connected()) { this.setStatus('github', false, '저장소는 아이디/저장소 이름, 토큰은 github_pat_로 시작해요'); return; }
    this.busy = 'github';
    try {
      this.saved = await listSecrets(this.repo, this.token);
      this.setStatus('github', true, '연결했어요. 아래 키를 저장할 수 있어요');
    } catch (error) {
      this.setStatus('github', false, error instanceof GitHubError ? error.message : '인터넷 연결을 확인해 주세요');
    } finally { this.busy = ''; }
  }

  private async save(name: string, value: string) {
    if (!value.trim()) { this.setStatus(name, false, '값을 넣어 주세요'); return; }
    this.busy = name;
    try {
      await saveSecret(this.repo, this.token, name, value.trim());
      this.saved = { ...this.saved, [name]: new Date().toISOString() };
      this.values = { ...this.values, [name]: '' };
      this.setStatus(name, true, '저장했어요. 다음 실행부터 써요');
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
      this.setStatus(name, ok, ok ? '키가 맞아요' : '키가 맞지 않아요. 다시 복사해 주세요');
    } catch {
      this.setStatus(name, false, '확인하지 못했어요. 인터넷 연결을 봐 주세요');
    } finally { this.busy = ''; }
  }

  private async saveKeywords() {
    this.busy = 'keywords';
    try {
      await saveVariable(this.repo, this.token, 'INTEREST_KEYWORDS', this.keywords.join('\n'));
      this.setStatus('keywords', true, '알림 기준에도 넣었어요');
    } catch (error) {
      this.setStatus('keywords', false, error instanceof GitHubError ? error.message : '저장하지 못했어요');
    } finally { this.busy = ''; }
  }

  private addKeyword() {
    const word = this.keywordDraft.trim().replace(/\s+/g, ' ');
    if (word && !this.keywords.includes(word)) this.emit('keywords-change', [...this.keywords, word]);
    this.keywordDraft = '';
  }

  // 키 값은 클립보드에 넣지 않는다(클립보드 기록에 남는다). 이름만 있는 양식을 복사하고 값은 사용자가 직접 붙여 넣는다.
  private envText() {
    return ['NOTIFY_URLS=ntfys://', ...KEY_FIELDS.filter((f) => !f.multiline).map((f) => `${f.secret}=`)].join('\n');
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
          <h2 id="s-github" class="settings-head">GitHub</h2>
          <div class="box">
          <div class="setting">
            <div class="setting-text">
              <p class="setting-name">저장소와 토큰</p>
              <p class="setting-help">알림을 15분마다 돌리는 저장소예요. 아래 키들은 여기로 암호화해 보내고 이 브라우저에는 저장하지 않아요. 토큰도 화면을 닫으면 잊어요</p>
            </div>
            <div class="setting-control">
              <input class="input" type="text" autocomplete="off" spellcheck="false" aria-label="저장소" placeholder="아이디/저장소 이름"
                .value=${this.repo} @input=${(e: Event) => { this.repo = (e.target as HTMLInputElement).value.trim(); }}>
              <div class="inline">
                <input class="input" type="password" autocomplete="off" spellcheck="false" aria-label="GitHub 토큰" placeholder="github_pat_로 시작하는 토큰"
                  .value=${this.token} @input=${(e: Event) => { this.token = (e.target as HTMLInputElement).value.trim(); }}>
                <button type="button" class="ghost-button" ?disabled=${this.busy === 'github'} @click=${this.connect}>
                  ${this.busy === 'github' ? '연결 중' : '연결'}</button>
              </div>
              ${this.note('github')}
              ${this.guide('github', [
                html`${link('https://github.com/settings/personal-access-tokens/new', 'GitHub 새 토큰 화면')}을 열어요(Fine-grained token)`,
                '"Repository access"에서 "Only select repositories"를 고르고 이 저장소 하나만 골라요',
                '"Permissions"에서 Secrets와 Variables를 "Read and write"로 바꿔요. 다른 권한은 주지 않아요',
                '만료일을 정하고 만든 토큰을 복사해 위 칸에 넣어요',
                '저장소가 아직 없으면 아래 ".env 양식 복사"로 컴퓨터에서 먼저 써요',
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
              <p class="setting-name">ntfy 토픽</p>
              <p class="setting-help">휴대폰과 PC가 같은 이름을 구독하면 알림이 와요. 이름을 아는 사람은 누구나 받을 수 있어서 비밀번호처럼 다뤄요.
                이 화면을 닫으면 지워지니 휴대폰 앱과 GitHub에 먼저 넣어 두세요</p>
            </div>
            <div class="setting-control">
              <div class="inline">
                <input class="input" type="text" autocomplete="off" spellcheck="false" aria-label="ntfy 토픽"
                  placeholder="skku-로 시작하는 긴 이름" .value=${this.topic} @change=${(e: Event) => this.setTopic((e.target as HTMLInputElement).value)}>
                <button type="button" class="ghost-button" @click=${() => this.setTopic(newTopic())}>새로 만들기</button>
              </div>
              <div class="inline">
                <button type="button" class="ghost-button" ?disabled=${this.busy === 'topic' || !this.topic} @click=${this.testNotification}>
                  ${this.busy === 'topic' ? '보내는 중' : '테스트 알림 보내기'}</button>
                <button type="button" class="solid-button" ?disabled=${!this.connected() || !this.topic || this.busy === 'NOTIFY_URLS'}
                  @click=${() => this.save('NOTIFY_URLS', `ntfys://${this.topic}`)}>GitHub에 저장</button>
              </div>
              ${!this.topic ? html`<p class="field-note">토픽을 먼저 만들거나 붙여 넣으면 테스트와 저장을 할 수 있어요</p>`
                : !this.connected() ? html`<p class="field-note">GitHub에 연결하면 저장할 수 있어요</p>` : nothing}
              ${this.saved.NOTIFY_URLS ? html`<p class="setting-saved">${savedDate(this.saved.NOTIFY_URLS)}에 저장됨</p>` : nothing}
              ${this.note('NOTIFY_URLS')}
              ${this.note('topic')}
              ${this.guide('phone', [
                'Play 스토어에서 "ntfy"를 설치해요',
                html`앱에서 + 를 누르고 토픽 이름에 <b class="mono-free">${this.topic || '위의 이름'}</b>을 넣어 구독해요. 서버는 ntfy.sh 그대로 둬요`,
                'Galaxy는 설정 > 애플리케이션 > ntfy > 배터리에서 "제한 없음"을 골라야 알림이 늦지 않아요',
                '"테스트 알림 보내기"로 알림이 오는지 확인해요',
              ], '휴대폰(Galaxy)에서 받는 방법')}
              ${this.guide('pc', [
                html`웨일에서 ${link('https://ntfy.sh/app', 'ntfy.sh/app')}을 열고 "구독 추가"에 같은 토픽 이름을 넣어요`,
                '알림 허용을 묻으면 "허용"을 눌러요. 설정 탭에서 "백그라운드 알림"을 켜요',
                '주소창 오른쪽의 앱 설치 단추로 설치하면 창을 닫아도 웨일이 켜져 있는 동안 알림이 와요',
                '알림이 오지 않으면 ntfy 탭을 고정해 두세요(웨일의 웹 푸시 지원 여부는 아직 확인 중이에요)',
              ], 'Windows(웨일)에서 받는 방법')}
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
              <button type="button" class="ghost-button" @click=${this.copyEnv}>.env 양식 복사</button>
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
                <button type="button" class="ghost-button" @click=${this.addKeyword}>추가</button>
              </div>
              ${this.keywords.length ? html`<ul class="keyword-list">${this.keywords.map((word) => html`
                <li><span>${word}</span><button type="button" class="text-button" aria-label="${word} 지우기"
                  @click=${() => this.emit('keywords-change', this.keywords.filter((w) => w !== word))}>지우기</button></li>`)}</ul>` : nothing}
              <button type="button" class="ghost-button" ?disabled=${!this.connected() || this.busy === 'keywords'} @click=${this.saveKeywords}>
                알림 기준에도 넣기</button>
              ${this.connected() ? this.note('keywords') : html`<p class="field-note">GitHub에 연결하면 휴대폰 알림에도 써요</p>`}
            </div>
          </div>
          </div>
        </section>

        <section aria-labelledby="s-view">
          <h2 id="s-view" class="settings-head">화면</h2>
          <div class="box">
          <div class="setting">
            <div class="setting-text"><p class="setting-name">테마</p><p class="setting-help">고르면 바로 바뀌어요</p></div>
            <div class="setting-control">
              <div class="segmented" role="radiogroup" aria-label="테마">
                ${(['auto', 'light', 'dark'] as Theme[]).map((value) => html`
                  <button type="button" role="radio" aria-checked=${String(this.theme === value)}
                    @click=${() => this.emit('theme-change', value)}>${{ auto: '기기 설정', light: '밝게', dark: '어둡게' }[value]}</button>`)}
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
    const onInput = (e: Event) => { this.values = { ...this.values, [name]: (e.target as HTMLInputElement).value }; };
    return html`
      <div class="setting">
        <div class="setting-text">
          <p class="setting-name">${field.label}</p>
          <p class="setting-help">${field.help}</p>
          ${this.saved[name] ? html`<p class="setting-saved">${savedDate(this.saved[name])}에 저장됨</p>` : nothing}
        </div>
        <div class="setting-control">
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
            ${name === 'GEMINI_API_KEY' ? html`<button type="button" class="ghost-button" ?disabled=${this.busy === name} @click=${() => this.check(name)}>확인</button>` : nothing}
            <button type="button" class="solid-button" ?disabled=${!this.connected() || this.busy === name} @click=${() => this.save(name, value)}>
              ${this.busy === name ? '저장 중' : 'GitHub에 저장'}</button>
          </div>
          ${this.connected() ? nothing : html`<p class="field-note">위에서 GitHub에 연결하면 저장할 수 있어요</p>`}
          ${this.note(name)}
          ${this.guide(name, field.steps, field.multiline ? '쓰는 방법' : '받는 방법')}
        </div>
      </div>`;
  }
}

customElements.define('settings-view', SettingsView);
