// Playwright browser_run_code_unsafe의 filename으로 실행하는 정식 사이트 회귀 확인.
// 계정 연결과 발송 없이 격리된 브라우저 저장소에서 확인한다.
async (page) => {
  const origin = 'https://aniseongu.github.io/skku-notice-alert/';
  const results = [];
  const contexts = [];
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  async function check(name, fn) {
    try { await fn(); results.push({ name, pass: true }); }
    catch (error) { results.push({ name, pass: false, error: error.message.split('\n')[0] }); }
  }
  async function open(width, tab = 'all') {
    const context = await page.context().browser().newContext({
      serviceWorkers: 'block', viewport: { width, height: 900 },
    });
    contexts.push(context);
    const p = await context.newPage();
    p.on('pageerror', error => results.push({ name: '페이지 예외', pass: false, error: error.message }));
    p.setDefaultTimeout(6000);
    await p.goto(`${origin}?tab=${tab}`);
    await p.locator('.row').first().waitFor();
    return p;
  }
  try {
    const d = await open(1280);
    const sideTab = label => d.locator('.sidebar nav').getByRole('button', { name: new RegExp(`^${label}`) });
    await check('PC 탭 네 개 연속 이동', async () => {
      for (const [label, id] of [['인턴 공고', 'intern'], ['저장', 'saved'], ['성대 공지', 'all'], ['내 공지', 'mine']]) {
        await sideTab(label).click();
        assert(await d.locator('notice-app').evaluate(e => e.view) === id, id);
      }
    });
    await sideTab('성대 공지').click();
    await check('PC 선택한 글을 검색에서 제외', async () => {
      await d.locator('.row').nth(1).click();
      await d.locator('.search input').filter({ visible: true }).fill('일치하지않는검색어xyz');
      await d.getByText('다른 단어로 찾아보세요', { exact: true }).waitFor();
      assert(await d.locator('.detail-pane .detail-title').count() === 0, '이전 상세가 남음');
    });
    await check('검색어 지우고 목록 복구', async () => {
      await d.getByRole('button', { name: '검색어 지우기', exact: true }).click();
      await d.locator('.row').first().waitFor();
    });
    await check('정렬 선택 뒤 새로고침 유지', async () => {
      await d.locator('.sort-trigger').click();
      await d.getByRole('button', { name: '마감순', exact: true }).click();
      await d.reload();
      await d.locator('.sort-trigger').waitFor();
      assert((await d.locator('.sort-trigger').innerText()).trim() === '마감순', '정렬 유실');
    });
    await check('최신순으로 복귀', async () => {
      await d.locator('.sort-trigger').click();
      await d.getByRole('button', { name: '최신순', exact: true }).click();
      assert((await d.locator('.sort-trigger').innerText()).trim() === '최신순', '정렬 불일치');
    });
    await check('정렬 메뉴 방향키와 Esc 포커스 복귀', async () => {
      await d.locator('.sort-trigger').click();
      await d.keyboard.press('ArrowDown');
      await d.keyboard.press('Escape');
      assert(await d.locator('.sort-trigger').evaluate(e => e === document.activeElement), '포커스 유실');
      assert(await d.locator('#sort-options').count() === 0, '메뉴가 남음');
    });
    await check('사이드바 접기 뒤 새로고침 유지', async () => {
      const head = d.locator('[aria-controls="side-boards"]');
      await head.click(); await d.reload(); await head.waitFor();
      assert(await head.getAttribute('aria-expanded') === 'false', '접기 유실');
      await head.click();
    });
    await check('단축키 도움말 열고 Esc 닫기', async () => {
      await d.locator('h1').click(); await d.keyboard.press('?');
      await d.getByRole('dialog').waitFor(); await d.keyboard.press('Escape');
      await d.getByRole('dialog').waitFor({ state: 'hidden' });
    });
    await check('검색 중 숫자 키는 탭을 바꾸지 않음', async () => {
      await d.locator('h1').click(); await d.keyboard.press('/');
      assert(await d.locator('.search input').filter({ visible: true }).evaluate(e => e === document.activeElement), '검색 포커스');
      await d.keyboard.type('3');
      assert(await d.locator('notice-app').evaluate(e => e.view) === 'all', '탭 오작동');
      await d.locator('.search input').filter({ visible: true }).fill('');
      await d.keyboard.press('Escape');
    });
    await check('상세 칸 닫고 다시 열기', async () => {
      await d.getByRole('button', { name: '상세 칸 닫기', exact: true }).click();
      await d.getByRole('button', { name: '상세 칸 열기', exact: true }).click();
      await d.locator('.detail-pane .detail-title').waitFor();
    });
    await check('PC 설정 열고 닫기', async () => {
      await d.locator('.side-foot').getByRole('button', { name: '설정', exact: true }).click();
      await d.getByRole('button', { name: '설정 닫기', exact: true }).filter({ visible: true }).click();
      await d.waitForFunction(() => document.querySelector('notice-app').view === 'all');
    });

    const m = await open(412, 'intern');
    const mobileTab = label => m.locator('.tabbar').getByRole('button', { name: label, exact: true });
    await check('휴대폰 공지 열고 목록으로', async () => {
      await m.locator('.row').first().click();
      await m.getByRole('button', { name: '목록으로', exact: true }).click();
      await m.locator('.tabbar').waitFor({ state: 'visible' });
    });
    await check('앞으로 가기로 상세 복원', async () => {
      await m.goForward(); await m.locator('.reading').waitFor();
      await m.getByRole('button', { name: '목록으로', exact: true }).click();
    });
    await check('저장하고 목록으로 돌아오기', async () => {
      await m.locator('.row').first().click();
      await m.locator('.read-actions').getByRole('button', { name: '저장하기', exact: true }).click();
      await m.getByRole('button', { name: '목록으로', exact: true }).click();
      await mobileTab('저장').click(); await m.locator('.row').first().waitFor();
    });
    await check('저장 목록 새로고침 유지', async () => {
      await m.reload(); await m.locator('.row').first().waitFor();
      assert(await m.locator('notice-app').evaluate(e => e.view) === 'saved', '저장 탭 유실');
    });
    await check('저장 해제 후 빈 목록', async () => {
      await m.locator('.row').first().click();
      await m.locator('.read-actions').getByRole('button', { name: '저장 지우기', exact: true }).click();
      await m.getByRole('button', { name: '목록으로', exact: true }).click();
      await m.getByText('저장한 공지가 없어요', { exact: true }).waitFor();
    });
    await mobileTab('성대 공지').click();
    await check('게시판 필터와 인턴 탭 교차 이동', async () => {
      await m.locator('.board-trigger:not(.sort-trigger)').click();
      await m.locator('.board-option:not(.sort-option)').nth(1).click();
      const ids = await m.locator('.row').evaluateAll(es => es.map(e => e.dataset.id.split('/')[0]));
      assert(ids.length > 0 && new Set(ids).size === 1, '게시판 필터 불일치');
      await mobileTab('인턴 공고').click(); await m.locator('.row').first().waitFor();
      await mobileTab('성대 공지').click();
    });
    await check('게시판 메뉴 Tab 이탈 시 닫기', async () => {
      await m.locator('.board-trigger:not(.sort-trigger)').click();
      await m.locator('.board-option:not(.sort-option)').last().focus();
      await m.keyboard.press('Tab');
      await m.locator('#board-options').waitFor({ state: 'detached' });
    });
    await check('메뉴 바깥 클릭으로 닫기', async () => {
      await m.locator('.board-trigger:not(.sort-trigger)').click();
      await m.locator('h1').click();
      await m.locator('#board-options').waitFor({ state: 'detached' });
    });
    await check('미입력 연결에서 안내 표시', async () => {
      await m.getByRole('button', { name: '설정', exact: true }).filter({ visible: true }).click();
      await m.getByRole('button', { name: '연결하기', exact: true }).click();
      await m.getByText('저장소는 아이디/저장소 이름으로, 토큰은 github_pat_로 시작하는 값을 넣어 주세요', { exact: true }).waitFor();
    });
    await check('화면 모드 변경과 설정 닫기', async () => {
      await m.getByRole('radio', { name: '어둡게', exact: true }).click();
      await m.getByRole('button', { name: '설정 닫기', exact: true }).filter({ visible: true }).click();
      assert(await m.evaluate(() => document.documentElement.dataset.theme === 'dark'), '화면 모드 미반영');
      await m.reload(); await m.locator('.row').first().waitFor();
      assert(await m.evaluate(() => document.documentElement.dataset.theme === 'dark'), '화면 모드 유실');
    });
    await check('320px로 축소해도 가로 넘침 없음', async () => {
      await m.setViewportSize({ width: 320, height: 891 });
      assert(!await m.evaluate(() => document.documentElement.scrollWidth > innerWidth), '가로 넘침');
      await m.setViewportSize({ width: 412, height: 891 });
    });
    await check('원문 열기는 별도 탭의 유효한 주소', async () => {
      await m.locator('.row').first().click();
      const link = m.locator('.read-actions').getByRole('link', { name: '원문 열기', exact: true });
      assert(/^https:\/\//.test(await link.getAttribute('href')), '잘못된 원문 주소');
      assert(await link.getAttribute('target') === '_blank', '새 탭 아님');
      const target = await link.getAttribute('href');
      await m.context().route(target, route => route.fulfill({ status: 200, body: '원문 이동 확인' }));
      const popupPromise = m.waitForEvent('popup'); await link.click();
      const popup = await popupPromise; await popup.waitForLoadState();
      assert(popup.url() === target, '원문 주소 불일치'); await popup.close();
    });

    // 서버 상태별 문구는 실제 계정이나 공개 데이터를 바꾸지 않고 응답만 제어한다.
    const s = await open(412, 'intern');
    let status = 'pending';
    await s.route('**/api/v1/notices/*/*.json', route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({
        body_status: status, body: status === 'ready' ? '검증용 본문' : null,
        body_html: null, images: [], attachments: [], fetched_at: null,
      }),
    }));
    for (const [value, expected] of [
      ['pending', '본문을 준비하고 있어요. 먼저 원문을 볼 수 있어요'],
      ['retrying', '본문을 다시 가져올 예정이에요. 먼저 원문을 볼 수 있어요'],
      ['unavailable', '본문을 가져오지 못했어요. 원문에서 확인해 주세요'],
      ['ready', '검증용 본문'],
    ]) {
      await check(`본문 상태 ${value}`, async () => {
        status = value; await s.reload(); await s.locator('.row').first().click();
        await s.getByText(expected, { exact: true }).waitFor();
      });
    }
  } finally {
    for (const context of contexts) await context.close();
  }
  return { passed: results.filter(r => r.pass).length, failed: results.filter(r => !r.pass).length, results };
}
