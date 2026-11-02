// 화면 전체. 규칙은 docs/DESIGN.md, docs/design/ux-rules.md, docs/design/platforms.md.
// 그림자 DOM을 쓰지 않는다(전역 토큰과 글꼴을 그대로 받으려고). 학교 글자는 Lit 템플릿으로만 넣어 자동 이스케이프한다.
import { LitElement, html, nothing, type TemplateResult } from 'lit';
import {
  type IconName, type Judgement, type MatchedFile, type Notice, type NoticesFile, type Source,
  VERDICT_LABEL, boardName, cleanTitle, deadlineDetail, deadlineGroup, deadlinePassed, deadlineText,
  daysLeft, fetchJson, isMine, keywordMatches, koreanDate, postedGroup, safeUrl, todayKst,
} from './data';
import './settings-view';
import type { Theme } from './settings-view';

type Tab = 'mine' | 'deadline' | 'all';
type View = Tab | 'settings';
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'mine', label: '내 공지', icon: 'user-check' },
  { id: 'deadline', label: '마감 임박', icon: 'alarm' },
  { id: 'all', label: '전체', icon: 'list' },
];
const STALE_MS = 2 * 3600_000;
// 화면을 켜 둔 채로 있어도 15분 주기의 새 공지와 D-day가 바뀌도록 5분마다 다시 받는다.
const REFRESH_MS = 5 * 60_000;
const SOON_DAYS = 3;
const isTab = (value: string | null): value is Tab => TABS.some((t) => t.id === value);
const INTERACTIVE = 'a, button, input, textarea, select, [contenteditable]';
const wide = matchMedia('(min-width: 1080px)');
const browserTab = matchMedia('(display-mode: browser)');

interface InstallPrompt extends Event { prompt(): Promise<void> }

function remember(key: string, value?: string): string | null {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch { /* 사생활 보호 모드에서는 기억하지 않는다 */ }
  return value ?? null;
}

function loadKeywords(): string[] {
  try {
    const parsed = JSON.parse(remember('keywords') ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((w): w is string => typeof w === 'string') : [];
  } catch { return []; }
}

function applyTheme(theme: Theme) {
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

const icon = (name: IconName) => html`<svg class="i" aria-hidden="true"><use href="icons/sprite.svg#${name}"></use></svg>`;
const gearIcon = html`<svg class="i" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/>
  <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`;

export class NoticeApp extends LitElement {
  static properties = {
    notices: { state: true }, sources: { state: true }, matched: { state: true }, generatedAt: { state: true },
    view: { state: true }, board: { state: true }, keyword: { state: true }, keywords: { state: true }, query: { state: true },
    loading: { state: true }, failed: { state: true }, selectedId: { state: true }, install: { state: true },
    installHidden: { state: true }, toast: { state: true }, isWide: { state: true }, theme: { state: true },
  };

  notices: Notice[] = [];
  sources: Source[] = [];
  matched: MatchedFile | null = null;
  generatedAt: string | null = null;
  view: View = new URLSearchParams(location.search).get('view') === 'settings'
    ? 'settings' : [new URLSearchParams(location.search).get('tab'), remember('tab')].find(isTab) ?? 'mine';
  board = remember('board') ?? 'all';
  keyword: string | null = null;
  keywords = loadKeywords();
  query = '';
  loading = true;
  failed = false;
  selectedId: string | null = null;
  install: InstallPrompt | null = null;
  installHidden = remember('install-hidden') === '1';
  toast = '';
  isWide = wide.matches;
  theme: Theme = (['light', 'dark'].includes(remember('theme') ?? '') ? remember('theme') : 'auto') as Theme;
  private toastTimer = 0;
  // 상세 칸에 실제로 보이는 글(고른 글이 없으면 첫 글). 목록 행 표시와 맞춘다.
  private shownId: string | null = null;

  createRenderRoot() { return this; }

  connectedCallback() {
    super.connectedCallback();
    applyTheme(this.theme);
    this.refresh();
    wide.addEventListener('change', () => { this.isWide = wide.matches; });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.refresh(); });
    window.setInterval(() => { if (document.visibilityState === 'visible') this.refresh(); }, REFRESH_MS);
    window.addEventListener('keydown', (event) => this.onKey(event));
    window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); this.install = event as InstallPrompt; });
    window.addEventListener('appinstalled', () => { this.install = null; });
  }

  async refresh() {
    this.loading = true;
    try {
      const load = () => Promise.all([fetchJson<NoticesFile>('notices.json'), fetchJson<MatchedFile>('matched.json', true)]);
      let [notices, matched] = await load();
      // 두 파일은 같은 실행에서 함께 만들어진다. 한쪽만 저장본이면 한 번 더 받는다.
      if (matched && matched.generated_at !== notices!.generated_at) [notices, matched] = await load();
      this.notices = notices!.notices;
      this.sources = notices!.sources;
      this.generatedAt = notices!.generated_at;
      this.matched = matched;
      this.failed = false;
      if (!matched && this.view === 'mine' && !this.keywords.length) this.view = 'all';
      if (this.board !== 'all' && !this.sources.some((s) => s.id === this.board)) this.board = 'all';
    } catch (error) {
      console.error(error);
      this.failed = true;
      if (this.notices.length) this.showToast('목록을 새로 받지 못했어요. 잠시 뒤 다시 시도해 주세요');
    } finally {
      this.loading = false;
    }
  }

  private judgement(notice: Notice): Judgement | undefined { return this.matched?.items[notice.id]; }

  /** 이 글에 맞는 관심 키워드: 이 기기의 글자 매칭 + 서버의 글자 매칭 + Gemini가 뜻으로 맞춘 것 */
  private interests(notice: Notice): string[] {
    const judgement = this.judgement(notice);
    const text = `${notice.title} ${notice.category ?? ''} ${judgement?.ai?.reason ?? ''}`;
    const found = new Set(this.keywords.filter((word) => keywordMatches(word, text)));
    for (const word of [...(judgement?.interests ?? []), ...(judgement?.ai?.interests ?? [])]) {
      if (this.keywords.includes(word)) found.add(word);
    }
    return [...found];
  }

  private mine(notice: Notice): boolean { return isMine(this.judgement(notice)) || this.interests(notice).length > 0; }

  private filtered(): Notice[] {
    const query = this.query.trim().toLowerCase();
    return this.notices.filter((n) => {
      if (this.board !== 'all' && n.source_id !== this.board) return false;
      if (this.keyword && !this.interests(n).includes(this.keyword)) return false;
      if (!query) return true;
      return `${n.title} ${n.category ?? ''} ${this.judgement(n)?.ai?.reason ?? ''}`.toLowerCase().includes(query);
    });
  }

  private byTab(list: Notice[], tab: Tab): Notice[] {
    if (tab === 'mine') return list.filter((n) => this.mine(n));
    if (tab === 'deadline') {
      return list.filter((n) => n.deadline && !deadlinePassed(n.deadline))
        .sort((a, b) => Date.parse(a.deadline!) - Date.parse(b.deadline!));
    }
    return list;
  }

  private tab(): Tab { return this.view === 'settings' ? 'mine' : this.view; }
  private visible(): Notice[] { return this.byTab(this.filtered(), this.tab()); }

  private setView(view: View) {
    this.view = view;
    if (view !== 'settings') remember('tab', view);
    this.selectedId = null;
    window.scrollTo({ top: 0 });
    this.querySelector('.list-pane')?.scrollTo({ top: 0 });
  }

  private setBoard(board: string) { this.board = board; remember('board', board); }
  private setKeyword(word: string | null) {
    this.keyword = word;
    if (this.view === 'settings') this.view = 'all';
  }

  private setKeywords(words: string[]) {
    this.keywords = words;
    remember('keywords', JSON.stringify(words));
    if (this.keyword && !words.includes(this.keyword)) this.keyword = null;
  }

  private setTheme(theme: Theme) {
    this.theme = theme;
    remember('theme', theme);
    applyTheme(theme);
  }

  private async copyLink(notice: Notice) {
    try {
      await navigator.clipboard.writeText(safeUrl(notice.url));
      this.showToast('원문 링크를 복사했어요');
    } catch {
      this.showToast('복사하지 못했어요');
    }
  }

  private showToast(text: string) {
    this.toast = text;
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => { this.toast = ''; }, 3500);
  }

  private async runInstall() {
    if (!this.install) return;
    await this.install.prompt();
    this.install = null;
  }

  private hideInstall() { this.installHidden = true; remember('install-hidden', '1'); }

  private onKey(event: KeyboardEvent) {
    const target = event.target as Element | null;
    if (event.key === 'Escape' && target instanceof HTMLInputElement) { target.blur(); return; }
    if (target?.closest('input, textarea, select') || event.metaKey || event.ctrlKey || event.altKey) return;
    if (this.view === 'settings') return;
    // 단추나 링크에 포커스가 있으면 Enter는 그 요소의 기본 동작에 맡긴다.
    if (event.key === 'Enter' && target?.closest(INTERACTIVE)) return;
    const list = this.visible();
    const index = list.findIndex((n) => n.id === (this.selectedId ?? this.shownId));
    const move = (step: number) => {
      const next = list[Math.max(0, Math.min(list.length - 1, index + step))];
      if (!next) return;
      this.selectedId = next.id;
      this.updateComplete.then(() => this.querySelector(`[data-id="${CSS.escape(next.id)}"]`)?.scrollIntoView({ block: 'nearest' }));
    };
    const actions: Record<string, () => void> = {
      '/': () => this.querySelector<HTMLInputElement>('.search input')?.focus(),
      j: () => move(1), ArrowDown: () => move(1), k: () => move(-1), ArrowUp: () => move(-1),
      Enter: () => { const notice = list[index]; if (notice) window.open(safeUrl(notice.url), '_blank', 'noopener'); },
      r: () => this.refresh(), 1: () => this.setView('mine'), 2: () => this.setView('deadline'), 3: () => this.setView('all'),
    };
    const action = actions[event.key];
    if (action) { event.preventDefault(); action(); }
  }

  private onRow(event: MouseEvent, notice: Notice) {
    // 넓은 화면은 상세 칸에 먼저 보여 주고, 원문은 단추나 Enter로 연다(ux-rules 1절).
    if (!this.isWide || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    this.selectedId = notice.id;
  }

  updated() {
    if (this.view === 'settings') { document.title = '설정 - 성대 공지'; return; }
    const label = TABS.find((t) => t.id === this.view)!.label;
    document.title = this.notices.length ? `${label} ${this.visible().length} - 성대 공지` : '성대 공지';
  }

  render() {
    const filtered = this.filtered();
    const tabs = TABS.filter((t) => t.id !== 'mine' || this.matched || this.keywords.length);
    const counts = Object.fromEntries(tabs.map((t) => [t.id, this.byTab(filtered, t.id).length]));
    const list = this.visible();
    const settings = this.view === 'settings';
    const title = settings ? '설정' : this.keyword ? this.keyword : TABS.find((t) => t.id === this.view)!.label;
    const selected = settings ? undefined
      : this.notices.find((n) => n.id === this.selectedId) ?? (this.isWide ? list[0] : undefined);
    this.shownId = selected?.id ?? null;
    return html`
      <div class="wco-bar" aria-hidden="true"><img src="favicon.svg" alt="">성대 공지</div>
      <div class="app ${settings ? 'is-settings' : ''}">
        <aside class="sidebar" aria-label="탐색">
          <div class="pane-head brand"><img src="icon.svg" alt="">성대 공지</div>
          <nav class="side-group" aria-label="보기">
            ${tabs.map((t) => this.sideItem(t.label, counts[t.id], this.view === t.id && !this.keyword, () => { this.keyword = null; this.setView(t.id); }))}
          </nav>
          <p class="side-head">관심 키워드</p>
          <div class="side-group">
            ${this.keywords.map((word) => this.sideItem(word, this.notices.filter((n) => this.interests(n).includes(word)).length,
              this.keyword === word && !settings, () => this.setKeyword(this.keyword === word ? null : word)))}
            <button type="button" class="side-item add" @click=${() => this.setView('settings')}>${this.keywords.length ? '키워드 관리' : '키워드 추가'}</button>
          </div>
          <p class="side-head">게시판</p>
          <div class="side-group">
            ${[{ id: 'all', label: '모든 게시판' }, ...this.sources.map((s) => ({ id: s.id, label: boardName(s, s.id) }))]
              .map((b) => this.sideItem(b.label, null, this.board === b.id, () => this.setBoard(b.id)))}
          </div>
          <div class="side-foot">
            ${this.install ? html`<button type="button" class="side-item" @click=${this.runInstall}>앱으로 설치</button>` : nothing}
            ${this.sideItem('설정', null, settings, () => this.setView('settings'))}
          </div>
        </aside>

        <main class="list-pane">
          <header class="pane-head topbar glass">
            ${settings ? html`<button type="button" class="icon-button narrow-only back" aria-label="뒤로"
              @click=${() => this.setView((remember('tab') as Tab) ?? 'mine')}>
              <svg class="i" aria-hidden="true" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>` : nothing}
            <div class="topbar-text">
              <h1>${title}</h1>
              ${settings ? html`<p class="updated">키와 알림, 관심 키워드</p>` : this.updatedLine(list.length)}
            </div>
            ${settings ? nothing : html`
              <label class="search wide-only">${icon('search')}
                <input type="search" placeholder="공지 찾기" autocomplete="off" aria-label="공지 검색" .value=${this.query}
                  @input=${(e: Event) => { this.query = (e.target as HTMLInputElement).value; }}></label>
              <button type="button" class="icon-button" aria-label="새로고침" ?disabled=${this.loading} @click=${this.refresh}>${icon('refresh')}</button>`}
            ${settings ? nothing : html`<button type="button" class="icon-button narrow-only" aria-label="설정"
              @click=${() => this.setView('settings')}>${gearIcon}</button>`}
          </header>

          ${settings ? html`<settings-view .keywords=${this.keywords} .theme=${this.theme}
              @keywords-change=${(e: CustomEvent<string[]>) => this.setKeywords(e.detail)}
              @theme-change=${(e: CustomEvent<Theme>) => this.setTheme(e.detail)}></settings-view>` : html`
            <div class="tools narrow-only">
              <label class="search">${icon('search')}
                <input type="search" placeholder="제목, 분류, 판정 이유로 찾기" autocomplete="off" aria-label="공지 검색" .value=${this.query}
                  @input=${(e: Event) => { this.query = (e.target as HTMLInputElement).value; }}></label>
              <div class="chips" role="group" aria-label="관심 키워드">
                <button type="button" class="chip" aria-pressed=${String(!this.keyword)} @click=${() => this.setKeyword(null)}>전체</button>
                ${this.keywords.map((word) => html`<button type="button" class="chip" aria-pressed=${String(this.keyword === word)}
                  @click=${() => this.setKeyword(this.keyword === word ? null : word)}>${word}</button>`)}
                <button type="button" class="chip-add" @click=${() => this.setView('settings')}>+ 키워드</button>
              </div>
            </div>
            <div class="list-head narrow-only">
              <select class="board-select narrow-only" aria-label="게시판" .value=${this.board}
                @change=${(e: Event) => this.setBoard((e.target as HTMLSelectElement).value)}>
                <option value="all">모든 게시판</option>
                ${this.sources.map((s) => html`<option value=${s.id} ?selected=${this.board === s.id}>${boardName(s, s.id)}</option>`)}
              </select>
            </div>
            <div class="list" aria-live="polite" aria-busy=${this.loading ? 'true' : 'false'}>${this.listBody(list)}</div>`}
        </main>

        <aside class="detail-pane" aria-label="공지 상세">
          <div class="pane-head detail-head">
            ${selected ? html`
              <button type="button" class="ghost-button" @click=${() => this.copyLink(selected)}>링크 복사</button>
              <a class="solid-button" href=${safeUrl(selected.url)} target="_blank" rel="noopener">원문 열기</a>` : nothing}
          </div>
          ${selected ? this.detail(selected) : nothing}
        </aside>
      </div>

      ${this.install && !this.installHidden && browserTab.matches && !this.isWide && !settings ? html`
        <div class="install-bar" role="region" aria-label="앱 설치 안내">
          <p>홈 화면에 추가하면 앱처럼 바로 열 수 있어요</p>
          <button type="button" class="solid-button" @click=${this.runInstall}>설치</button>
          <button type="button" class="icon-button" aria-label="안내 닫기" @click=${this.hideInstall}>
            <svg class="i" aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
        </div>` : nothing}

      <nav class="tabbar glass" aria-label="보기" ?hidden=${settings}>
        ${tabs.map((t) => html`<button type="button" aria-current=${this.view === t.id ? 'page' : 'false'}
          @click=${() => { this.keyword = null; this.setView(t.id); }}>${icon(t.icon)}<span>${t.label}</span></button>`)}
      </nav>
      <div class="toast" role="status" ?hidden=${!this.toast}>${this.toast}</div>
    `;
  }

  private sideItem(label: string, count: number | null, active: boolean, onClick: () => void) {
    return html`<button type="button" class="side-item" aria-current=${active ? 'page' : 'false'} @click=${onClick}>
      <span>${label}</span>${count === null ? nothing : html`<span class="count">${count}</span>`}</button>`;
  }

  private updatedLine(count?: number) {
    if (this.loading && !this.generatedAt) return html`<p class="updated">불러오는 중</p>`;
    if (!this.generatedAt) return html`<p class="updated">업데이트 정보 없음</p>`;
    const stale = Date.now() - Date.parse(this.generatedAt) > STALE_MS;
    const time = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(this.generatedAt));
    const total = count === undefined ? '' : `, ${count}건`;
    return html`<p class="updated ${stale ? 'stale' : ''}">${time} 기준${total}${stale ? ', 확인이 늦어지고 있어요' : ''}</p>`;
  }

  private listBody(list: Notice[]): TemplateResult | TemplateResult[] {
    if (this.loading && !this.notices.length) {
      return html`<ol class="rows">${Array.from({ length: 6 }, () => html`
        <li class="row skeleton" aria-hidden="true"><span></span><span></span><span></span></li>`)}</ol>`;
    }
    if (this.failed && !this.notices.length) {
      return this.empty('목록을 불러오지 못했어요', '인터넷 연결을 확인하고 다시 시도해 주세요', '다시 시도', () => this.refresh());
    }
    if (!list.length) {
      if (this.query) return this.empty(`'${this.query}'에 맞는 공지가 없어요`, '다른 단어로 찾아보세요', '검색어 지우기', () => { this.query = ''; });
      if (this.keyword) return this.empty(`'${this.keyword}'에 맞는 공지가 아직 없어요`, '새 글이 오면 여기에 모여요');
      const empty = {
        mine: ['지금 챙길 공지가 없어요', '기준이나 관심 키워드에 맞는 새 글이 오면 여기 쌓여요'],
        deadline: ['다가오는 마감이 없어요', '제목에 마감일이 적힌 공지만 여기에 나와요'],
        all: ['이 게시판에 공지가 없어요', '다른 게시판을 골라 보세요'],
      }[this.tab()];
      return this.empty(empty[0], empty[1]);
    }
    const today = todayKst();
    const groups = new Map<string, Notice[]>();
    for (const notice of list) {
      const key = this.view === 'deadline' ? deadlineGroup(notice.deadline!, today) : postedGroup(notice.posted_on, today);
      groups.set(key, [...(groups.get(key) ?? []), notice]);
    }
    return [...groups].map(([title, items]) => html`
      <section class="group" aria-label=${title}>
        <h2 class="group-head">${title}</h2>
        <ol class="rows">${items.map((n) => this.row(n, today))}</ol>
      </section>`);
  }

  private empty(title: string, body: string, action?: string, onAction?: () => void) {
    return html`<div class="empty">${icon('ginkgo')}<strong>${title}</strong><p>${body}</p>
      ${action ? html`<button type="button" class="ghost-button" @click=${onAction}>${action}</button>` : nothing}</div>`;
  }

  private reasonLine(notice: Notice) {
    const ai = this.judgement(notice)?.ai;
    const interests = this.interests(notice);
    if (interests.length) {
      return html`<span class="reason"><b class="interest">관심 ${interests.join(', ')}</b>${ai && ai.verdict !== 'not_relevant' ? ai.reason : ''}</span>`;
    }
    return ai ? html`<span class="reason ${ai.verdict}"><b>${VERDICT_LABEL[ai.verdict]}</b>${ai.reason}</span>` : nothing;
  }

  private dday(notice: Notice, today: string) {
    if (!notice.deadline) return nothing;
    const passed = deadlinePassed(notice.deadline);
    const urgent = !passed && daysLeft(notice.deadline, today) <= SOON_DAYS;
    return html`<span class="dday ${urgent ? 'urgent' : ''} ${passed ? 'ended' : ''}">${deadlineText(notice.deadline, today)}</span>`;
  }

  private row(notice: Notice, today: string) {
    const ai = this.judgement(notice)?.ai;
    const source = this.sources.find((s) => s.id === notice.source_id);
    const dim = ai?.verdict === 'not_relevant' && !this.interests(notice).length;
    return html`<li>
      <a class="row ${dim ? 'dim' : ''}" href=${safeUrl(notice.url)} target="_blank" rel="noopener"
        data-id=${notice.id} aria-current=${this.isWide && this.shownId === notice.id ? 'true' : 'false'}
        @click=${(e: MouseEvent) => this.onRow(e, notice)}>
        <span class="meta"><span class="board">${boardName(source, notice.source_id)}</span>
          ${notice.category ? html`<span class="cat">${notice.category}</span>` : nothing}${notice.pinned ? html`<span class="cat">고정</span>` : nothing}</span>
        <span class="title">${cleanTitle(notice.title)}</span>
        <span class="sub">${notice.category ? html`<span class="sub-cat">${notice.category}${notice.pinned ? ', 고정' : ''}</span>` : nothing}${this.reasonLine(notice)}</span>
        ${this.dday(notice, today)}
      </a></li>`;
  }

  private detail(notice: Notice) {
    const judgement = this.judgement(notice);
    const ai = judgement?.ai;
    const source = this.sources.find((s) => s.id === notice.source_id);
    const interests = this.interests(notice);
    const today = todayKst();
    return html`
      <div class="detail">
        <p class="meta"><span>${boardName(source, notice.source_id)}</span>${notice.category ? html`<span>${notice.category}</span>` : nothing}</p>
        <h2 class="detail-title">${cleanTitle(notice.title)}</h2>
        <dl class="facts">
          ${interests.length ? html`<div><dt>관심</dt><dd><b class="interest">${interests.join(', ')}</b></dd></div>` : nothing}
          ${ai ? html`<div><dt>판정</dt><dd><b class="verdict ${ai.verdict}">${VERDICT_LABEL[ai.verdict]}</b> ${ai.reason}</dd></div>` : nothing}
          ${notice.deadline ? html`<div><dt>마감</dt><dd>${deadlineDetail(notice.deadline)} ${this.dday(notice, today)}</dd></div>` : nothing}
          <div><dt>게시일</dt><dd>${koreanDate(notice.posted_on)}</dd></div>
          ${judgement?.rule_name ? html`<div><dt>기준</dt><dd>${judgement.rule_name}</dd></div>` : nothing}
          ${judgement?.notified ? html`<div><dt>알림</dt><dd>휴대폰으로 보냈어요</dd></div>` : nothing}
        </dl>
        <p class="hint">j, k로 옮기고 Enter로 원문을 열어요</p>
      </div>`;
  }
}

customElements.define('notice-app', NoticeApp);
