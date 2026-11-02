// 화면 전체. 규칙은 docs/DESIGN.md, docs/design/ux-rules.md, docs/design/platforms.md.
// 그림자 DOM을 쓰지 않는다(전역 토큰과 글꼴을 그대로 받으려고). 학교 글자는 Lit 템플릿으로만 넣어 자동 이스케이프한다.
import { LitElement, html, nothing, type TemplateResult } from 'lit';
import {
  type IconName, type Judgement, type MatchedFile, type Notice, type NoticesFile, type Source,
  VERDICT_LABEL, boardName, categoryIcon, deadlineDetail, deadlineGroup, deadlinePassed, deadlineText,
  daysLeft, fetchJson, isMine, koreanDate, postedGroup, safeUrl, todayKst,
} from './data';

type Tab = 'mine' | 'deadline' | 'all';
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'mine', label: '내 공지', icon: 'user-check' },
  { id: 'deadline', label: '마감 임박', icon: 'alarm' },
  { id: 'all', label: '전체', icon: 'list' },
];
const STALE_MS = 2 * 3600_000;
// 화면을 켜 둔 채로 있어도 15분 주기의 새 공지와 D-day가 바뀌도록 5분마다 다시 받는다.
const REFRESH_MS = 5 * 60_000;
const isTab = (value: string | null): value is Tab => TABS.some((t) => t.id === value);
const INTERACTIVE = 'a, button, input, textarea, select, [contenteditable]';
const SOON_DAYS = 3;
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

const icon = (name: IconName, label?: string) => html`<svg class="i" aria-hidden=${label ? 'false' : 'true'} role=${label ? 'img' : nothing}
  aria-label=${label ?? nothing}><use href="icons/sprite.svg#${name}"></use></svg>`;

export class NoticeApp extends LitElement {
  static properties = {
    notices: { state: true }, sources: { state: true }, matched: { state: true }, generatedAt: { state: true },
    tab: { state: true }, board: { state: true }, query: { state: true }, loading: { state: true },
    failed: { state: true }, selectedId: { state: true }, install: { state: true }, installHidden: { state: true },
    toast: { state: true }, isWide: { state: true },
  };

  notices: Notice[] = [];
  sources: Source[] = [];
  matched: MatchedFile | null = null;
  generatedAt: string | null = null;
  tab: Tab = [new URLSearchParams(location.search).get('tab'), remember('tab')].find(isTab) ?? 'mine';
  board = remember('board') ?? 'all';
  query = '';
  loading = true;
  failed = false;
  selectedId: string | null = null;
  install: InstallPrompt | null = null;
  installHidden = remember('install-hidden') === '1';
  toast = '';
  isWide = wide.matches;
  private toastTimer = 0;
  // 상세 칸에 실제로 보이는 글(고른 글이 없으면 첫 글). 목록 행 표시와 맞춘다.
  private shownId: string | null = null;

  createRenderRoot() { return this; }

  connectedCallback() {
    super.connectedCallback();
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
      if (!matched && this.tab === 'mine') this.tab = 'all';
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

  private filtered(): Notice[] {
    const query = this.query.trim().toLowerCase();
    return this.notices.filter((n) => {
      if (this.board !== 'all' && n.source_id !== this.board) return false;
      if (!query) return true;
      return `${n.title} ${n.category ?? ''} ${this.judgement(n)?.ai?.reason ?? ''}`.toLowerCase().includes(query);
    });
  }

  private byTab(list: Notice[], tab: Tab): Notice[] {
    if (tab === 'mine') return list.filter((n) => isMine(this.judgement(n)));
    if (tab === 'deadline') {
      return list.filter((n) => n.deadline && !deadlinePassed(n.deadline))
        .sort((a, b) => Date.parse(a.deadline!) - Date.parse(b.deadline!));
    }
    return list;
  }

  private visible(): Notice[] { return this.byTab(this.filtered(), this.tab); }

  private setTab(tab: Tab) {
    this.tab = tab;
    remember('tab', tab);
    this.selectedId = null;
    window.scrollTo({ top: 0 });
  }

  private setBoard(board: string) { this.board = board; remember('board', board); }

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
    const typing = target instanceof HTMLInputElement;
    if (event.key === 'Escape' && typing) { target.blur(); return; }
    if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
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
      '/': () => this.querySelector<HTMLInputElement>('#query')?.focus(),
      j: () => move(1), ArrowDown: () => move(1), k: () => move(-1), ArrowUp: () => move(-1),
      Enter: () => { const notice = list[index]; if (notice) window.open(safeUrl(notice.url), '_blank', 'noopener'); },
      r: () => this.refresh(), 1: () => this.setTab('mine'), 2: () => this.setTab('deadline'), 3: () => this.setTab('all'),
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
    const label = TABS.find((t) => t.id === this.tab)!.label;
    document.title = this.notices.length ? `${label} ${this.visible().length} - 성대 공지` : '성대 공지';
  }

  render() {
    const filtered = this.filtered();
    const tabs = TABS.filter((t) => t.id !== 'mine' || this.matched);
    const counts = Object.fromEntries(tabs.map((t) => [t.id, this.byTab(filtered, t.id).length]));
    const list = this.byTab(filtered, this.tab);
    const label = TABS.find((t) => t.id === this.tab)!.label;
    const selected = this.notices.find((n) => n.id === this.selectedId) ?? (this.isWide ? list[0] : undefined);
    this.shownId = selected?.id ?? null;
    return html`
      <div class="wco-bar" aria-hidden="true"><img src="favicon.svg" alt="">성대 공지</div>
      <div class="app">
        <aside class="sidebar">
          <div class="brand"><img src="icon.svg" alt="">성대 공지</div>
          <nav class="side-tabs" aria-label="보기">
            ${tabs.map((t) => html`<button type="button" class="side-tab" aria-current=${this.tab === t.id ? 'page' : 'false'}
              @click=${() => this.setTab(t.id)}>${icon(t.icon)}<span>${t.label}</span><span class="count">${counts[t.id]}</span></button>`)}
          </nav>
          <p class="side-head">게시판</p>
          <div class="side-boards">${this.boardButtons('side-board')}</div>
          ${this.install ? html`<button type="button" class="ghost-button side-install" @click=${this.runInstall}>앱으로 설치</button>` : nothing}
        </aside>

        <main class="main">
          <header class="topbar glass">
            <div class="topbar-text">
              <h1>${label}</h1>
              ${this.updatedLine()}
            </div>
            <button type="button" class="icon-button" aria-label="새로고침" ?disabled=${this.loading} @click=${this.refresh}>
              ${icon('refresh')}</button>
          </header>
          <div class="tools">
            <label class="search">
              ${icon('search')}
              <input id="query" type="search" placeholder="제목, 분류, 판정 이유로 찾기" autocomplete="off" aria-label="공지 검색"
                .value=${this.query} @input=${(e: Event) => { this.query = (e.target as HTMLInputElement).value; }}>
            </label>
            <div class="chips" role="group" aria-label="게시판">${this.boardButtons('chip')}</div>
          </div>
          <div class="list" aria-live="polite" aria-busy=${this.loading ? 'true' : 'false'}>${this.listBody(list)}</div>
        </main>

        <aside class="detail" aria-label="공지 상세">${selected ? this.detail(selected) : nothing}</aside>
      </div>

      ${this.install && !this.installHidden && browserTab.matches && !this.isWide ? html`
        <div class="install-bar" role="region" aria-label="앱 설치 안내">
          <p>홈 화면에 추가하면 앱처럼 바로 열 수 있어요</p>
          <button type="button" class="solid-button" @click=${this.runInstall}>앱으로 설치</button>
          <button type="button" class="icon-button" aria-label="안내 닫기" @click=${this.hideInstall}>
            <svg class="i" aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
        </div>` : nothing}

      <nav class="tabbar glass" aria-label="보기">
        ${tabs.map((t) => html`<button type="button" aria-current=${this.tab === t.id ? 'page' : 'false'} @click=${() => this.setTab(t.id)}>
          ${icon(t.icon)}<span>${t.label}</span></button>`)}
      </nav>
      <div class="toast" role="status" ?hidden=${!this.toast}>${this.toast}</div>
    `;
  }

  private boardButtons(kind: 'chip' | 'side-board') {
    const items = [{ id: 'all', label: '모든 게시판' }, ...this.sources.map((s) => ({ id: s.id, label: boardName(s, s.id) }))];
    return items.map((b) => html`<button type="button" class=${kind} aria-pressed=${this.board === b.id ? 'true' : 'false'}
      @click=${() => this.setBoard(b.id)}>${b.label}</button>`);
  }

  private updatedLine() {
    if (this.loading && !this.generatedAt) return html`<p class="updated">불러오는 중</p>`;
    if (!this.generatedAt) return html`<p class="updated">업데이트 정보 없음</p>`;
    const stale = Date.now() - Date.parse(this.generatedAt) > STALE_MS;
    const time = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(this.generatedAt));
    return html`<p class="updated ${stale ? 'stale' : ''}">${time} 기준${stale ? ', 확인이 늦어지고 있어요' : ''}</p>`;
  }

  private listBody(list: Notice[]): TemplateResult | TemplateResult[] {
    if (this.loading && !this.notices.length) {
      return html`<div class="group"><ol class="rows">${Array.from({ length: 5 }, () => html`
        <li class="row skeleton" aria-hidden="true"><span class="cat"></span><span class="body"><span></span><span></span><span></span></span></li>`)}
      </ol></div>`;
    }
    if (this.failed && !this.notices.length) {
      return this.empty('목록을 불러오지 못했어요', '인터넷 연결을 확인하고 다시 시도해 주세요', '다시 시도', () => this.refresh());
    }
    if (!list.length) {
      if (this.query) return this.empty(`'${this.query}'에 맞는 공지가 없어요`, '다른 단어로 찾아보세요', '검색어 지우기', () => { this.query = ''; });
      const empty = {
        mine: ['지금 챙길 공지가 없어요', '기준에 맞는 새 글이 오면 알림과 함께 여기 쌓여요'],
        deadline: ['다가오는 마감이 없어요', '제목에 마감일이 적힌 공지만 여기에 나와요'],
        all: ['이 게시판에 공지가 없어요', '다른 게시판을 골라 보세요'],
      }[this.tab];
      return this.empty(empty[0], empty[1]);
    }
    const today = todayKst();
    const groups = new Map<string, Notice[]>();
    for (const notice of list) {
      const key = this.tab === 'deadline' ? deadlineGroup(notice.deadline!, today) : postedGroup(notice.posted_on, today);
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

  private row(notice: Notice, today: string) {
    const judgement = this.judgement(notice);
    const ai = judgement?.ai;
    const source = this.sources.find((s) => s.id === notice.source_id);
    const urgent = notice.deadline && !deadlinePassed(notice.deadline) && daysLeft(notice.deadline, today) <= SOON_DAYS;
    return html`<li>
      <a class="row ${ai?.verdict === 'not_relevant' ? 'dim' : ''}" href=${safeUrl(notice.url)} target="_blank" rel="noopener"
        data-id=${notice.id} aria-current=${this.isWide && this.shownId === notice.id ? 'true' : 'false'}
        @click=${(e: MouseEvent) => this.onRow(e, notice)}>
        <span class="cat">${icon(categoryIcon(notice))}</span>
        <span class="body">
          <span class="meta">
            <span class="board">${boardName(source, notice.source_id)}</span>
            ${notice.category ? html`<span>${notice.category}</span>` : nothing}
            ${notice.pinned ? html`<span>고정</span>` : nothing}
            ${judgement?.priority === 'high' && isMine(judgement) ? html`<span class="important">중요</span>` : nothing}
          </span>
          <span class="title">${notice.title}</span>
          ${ai ? html`<span class="ai ${ai.verdict}"><b>${VERDICT_LABEL[ai.verdict]}</b>${ai.reason}</span>` : nothing}
        </span>
        <span class="side">
          ${notice.deadline ? html`<span class="dday ${urgent ? 'urgent' : ''} ${deadlinePassed(notice.deadline) ? 'ended' : ''}">
            ${deadlineText(notice.deadline, today)}</span>` : nothing}
          <span class="date">${notice.posted_on.slice(5).replace('-', '.')}</span>
        </span>
      </a></li>`;
  }

  private detail(notice: Notice) {
    const judgement = this.judgement(notice);
    const ai = judgement?.ai;
    const source = this.sources.find((s) => s.id === notice.source_id);
    const today = todayKst();
    return html`
      <div class="detail-inner">
        <span class="cat large">${icon(categoryIcon(notice))}</span>
        <p class="meta"><span class="board">${boardName(source, notice.source_id)}</span>${notice.category ? html`<span>${notice.category}</span>` : nothing}</p>
        <h2 class="detail-title">${notice.title}</h2>
        <dl class="facts">
          ${ai ? html`<div><dt>판정</dt><dd><b class="verdict ${ai.verdict}">${VERDICT_LABEL[ai.verdict]}</b> ${ai.reason}</dd></div>` : nothing}
          ${notice.deadline ? html`<div><dt>마감</dt><dd>${deadlineDetail(notice.deadline)}
            <span class="dday-inline ${!deadlinePassed(notice.deadline) && daysLeft(notice.deadline, today) <= SOON_DAYS ? 'urgent' : ''}">
            ${deadlineText(notice.deadline, today)}</span></dd></div>` : nothing}
          <div><dt>게시일</dt><dd>${koreanDate(notice.posted_on)}</dd></div>
          ${judgement?.rule_name ? html`<div><dt>기준</dt><dd>${judgement.rule_name}</dd></div>` : nothing}
          ${judgement?.notified ? html`<div><dt>알림</dt><dd>휴대폰으로 보냈어요</dd></div>` : nothing}
        </dl>
        <a class="solid-button wide" href=${safeUrl(notice.url)} target="_blank" rel="noopener">원문 열기</a>
        <p class="hint">j, k로 옮기고 Enter로 원문을 열어요</p>
      </div>`;
  }
}

customElements.define('notice-app', NoticeApp);
