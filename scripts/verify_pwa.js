// 정식 주소의 설치 정보, 서비스 워커, 오프라인과 화면 모드를 실제 브라우저에서 검사한다.
// OS에 설치한 Android/Windows PWA 확인을 대체하지 않는다.
async (page) => {
  const origin = 'https://aniseongu.github.io/skku-notice-alert/';
  const context = await page.context().browser().newContext({ viewport: { width: 412, height: 891 } });
  const p = await context.newPage();
  p.setDefaultTimeout(15000);
  const results = [];
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  async function check(name, fn) {
    try { const detail = await fn(); results.push({ name, pass: true, detail }); }
    catch (error) { results.push({ name, pass: false, error: error.message.split('\n').slice(0, 8).join('\n') }); }
  }
  try {
    await p.goto(`${origin}?tab=all`);
    await p.locator('.row').first().waitFor();
    await p.evaluate(() => navigator.serviceWorker.ready);
    await p.reload(); await p.locator('.row').first().waitFor();
    const session = await context.newCDPSession(p);
    const response = await p.request.get(`${origin}manifest.webmanifest`);
    const manifest = await response.json();
    await check('manifest 해석과 앱 범위', async () => {
      const details = await session.send('Page.getAppManifest');
      assert(details.errors.length === 0, '설치 정보 해석 오류');
      assert(manifest.name === '성공' && manifest.short_name === '성공', '앱 이름 불일치');
      assert(manifest.id === './' && manifest.start_url === './' && manifest.scope === './', '앱 식별자 변경');
      assert(manifest.display === 'standalone', '설치 모드');
      return { name: manifest.name, display: manifest.display };
    });
    await check('설치 가능성 검사', async () => {
      const details = await session.send('Page.getInstallabilityErrors');
      const appErrors = details.installabilityErrors.filter(error => error.errorId !== 'in-incognito');
      assert(appErrors.length === 0, JSON.stringify(appErrors));
      return { environmentLimits: details.installabilityErrors.filter(error => error.errorId === 'in-incognito') };
    });
    await check('설치 아이콘과 미리보기의 실제 크기', async () => {
      for (const item of [...manifest.icons, ...manifest.screenshots]) {
        const dimensions = await p.evaluate(async src => {
          const image = new Image(); image.src = src; await image.decode();
          return `${image.naturalWidth}x${image.naturalHeight}`;
        }, new URL(item.src, `${origin}manifest.webmanifest`).href);
        assert(dimensions === item.sizes, `이미지 크기 불일치: ${item.src}`);
      }
      assert(manifest.icons.some(i => i.purpose === 'maskable'), '마스크 아이콘 없음');
      assert(manifest.icons.some(i => i.purpose === 'monochrome'), '단색 아이콘 없음');
      return { icons: manifest.icons.length, screenshots: manifest.screenshots.length };
    });
    await check('서비스 워커 제어', async () => {
      assert(await p.evaluate(() => Boolean(navigator.serviceWorker.controller)), '서비스 워커 미적용');
    });
    await check('화면 모드와 상태 표시줄 색 동기화', async () => {
      await p.getByRole('button', { name: '설정', exact: true }).filter({ visible: true }).click();
      for (const label of ['어둡게', '밝게']) {
        await p.getByRole('radio', { name: label, exact: true }).click();
        await p.waitForFunction(() => {
          const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
          const c = canvas.getContext('2d'); c.fillStyle = getComputedStyle(document.body).backgroundColor;
          c.fillRect(0, 0, 1, 1);
          const bytes = [...c.getImageData(0, 0, 1, 1).data].slice(0, 3);
          const expected = '#' + bytes.map(b => b.toString(16).padStart(2, '0')).join('');
          return [...document.querySelectorAll('meta[name="theme-color"]')].every(m => m.content === expected);
        });
      }
      await p.getByRole('button', { name: '설정 닫기', exact: true }).filter({ visible: true }).click();
      await p.locator('.row').first().waitFor();
    });
    await check('오프라인에서 저장된 목록과 탐색', async () => {
      await context.setOffline(true); await p.reload();
      await p.locator('.row').first().waitFor();
      const count = await p.locator('.row').count();
      assert(count > 0, '저장된 목록 없음');
      await p.locator('.tabbar').getByRole('button', { name: '저장', exact: true }).click();
      await p.getByText('저장한 공지가 없어요', { exact: true }).waitFor();
      return { cachedNotices: count };
    });
  } finally {
    await context.setOffline(false); await context.close();
  }
  return { passed: results.filter(r => r.pass).length, failed: results.filter(r => !r.pass).length,
    actualInstalledDeviceVerified: false, results };
}
