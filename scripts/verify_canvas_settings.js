// GitHub API 응답을 제어해 실제 설정과 알림을 바꾸지 않고 저장과 복원을 확인한다.
async (page) => {
  const origin = 'https://aniseongu.github.io/skku-notice-alert/';
  const results = [];
  const variables = new Map([['CANVAS_ALERT_MODE', 'off']]);
  const context = await page.context().browser().newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
  const p = await context.newPage();
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  async function check(name, fn) {
    try { await fn(); results.push({ name, pass: true }); }
    catch (error) { results.push({ name, pass: false, error: error.message.split('\n').slice(0, 6).join('\n') }); }
  }
  await context.route('https://api.github.com/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const name = path.split('/').at(-1);
    let status = 200, json = {};
    if (path.endsWith('/actions/secrets')) json = { secrets: [] };
    else if (path.includes('/actions/variables')) {
      if (request.method() === 'GET') {
        if (variables.has(name)) json = { name, value: variables.get(name) };
        else status = 404;
      } else {
        const body = request.postDataJSON();
        const key = body.name || name;
        if (request.method() === 'POST' && variables.has(key)) status = 409;
        else { variables.set(key, body.value); status = request.method() === 'POST' ? 201 : 204; }
      }
    } else status = 404;
    await route.fulfill({ status, contentType: 'application/json', body: status === 204 ? '' : JSON.stringify(json) });
  });
  try {
    await p.goto(origin + '?view=settings');
    await check('노트북에서 연결 전 아캠 기본 끄기', async () => {
      const group = p.getByRole('radiogroup', { name: '아캠 알림', exact: true });
      assert(await group.getByRole('radio', { name: '끄기', exact: true }).getAttribute('aria-checked') === 'true', '기본값');
      assert(await group.getByRole('radio').first().isDisabled(), '미연결 변경 가능');
    });
    await p.getByRole('textbox', { name: 'GitHub 저장소', exact: true }).fill('aniseongu/skku-notice-alert');
    await p.getByLabel('GitHub 토큰', { exact: true }).fill('github_pat_fixture_only');
    await p.getByRole('button', { name: '연결하기', exact: true }).click();
    await p.getByText('연결했어요. 다음에 열 때도 연결돼 있어요', { exact: true }).waitFor();
    for (const [label, value] of [['하루 요약', 'summary'], ['요약과 마감', 'reminders'], ['끄기', 'off']]) {
      await check(`아캠 ${label} 저장과 재시작 복원`, async () => {
        await p.getByRole('radiogroup', { name: '아캠 알림', exact: true }).getByRole('radio', { name: label, exact: true }).click();
        await p.getByText('저장했어요. 다음 수집부터 모든 기기에 적용해요', { exact: true }).waitFor();
        assert(variables.get('CANVAS_ALERT_MODE') === value, '원격 변수 값');
        await p.reload();
        await p.getByText('연결했어요. 다음에 열 때도 연결돼 있어요', { exact: true }).waitFor();
        assert(await p.getByRole('radiogroup', { name: '아캠 알림', exact: true }).getByRole('radio', { name: label, exact: true }).getAttribute('aria-checked') === 'true', '선택 복원');
      });
    }
    await check('연결 키 분리와 노트북 입력 가능', async () => {
      assert(await p.getByLabel('Gemini 키', { exact: true }).count() === 0, '일반 설정 키 노출');
      assert(await p.getByLabel('구글 클라이언트 보안 비밀번호', { exact: true }).count() === 0, '일반 설정 비밀번호 노출');
      await p.getByRole('link', { name: '연결 키 설정하기', exact: true }).click();
      await p.getByLabel('아이캠퍼스 토큰', { exact: true }).waitFor();
      await p.getByLabel('아이캠퍼스 토큰', { exact: true }).fill('fixture-not-submitted');
      assert(await p.getByLabel('구글 클라이언트 보안 비밀번호', { exact: true }).count() === 1, '구글 키 화면');
      assert(await p.getByLabel('Gemini 키', { exact: true }).count() === 1, 'Gemini 키 화면');
    });
  } finally { await context.close(); }
  return { passed: results.filter(r => r.pass).length, failed: results.filter(r => !r.pass).length, mockedGitHub: true, results };
}
