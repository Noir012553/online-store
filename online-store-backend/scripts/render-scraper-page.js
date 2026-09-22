const Module = require('module');
const path = require('path');

const loadPlaywright = () => {
  const globalModulePaths = [
    process.env.NODE_PATH,
    process.env.APPDATA && path.join(process.env.APPDATA, 'npm', 'node_modules'),
    process.env.SystemRoot && path.join(process.env.SystemRoot, 'system32', 'node_modules'),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'nodejs', 'node_modules'),
    '/usr/local/lib/node_modules',
    '/usr/lib/node_modules',
  ].filter(Boolean);

  process.env.NODE_PATH = [...new Set(globalModulePaths)].join(path.delimiter);
  Module._initPaths();
  return require('playwright');
};

const NAVIGATION_TIMEOUT_MS = Number(process.env.SCRAPER_NAVIGATION_TIMEOUT_MS || 20000);

const isNavigationTimeout = error => /timeout|ERR_(?:TIMED_OUT|CONNECTION_TIMED_OUT)/i.test(
  String(error?.message || error),
);

const clickExpandableButtons = async page => {
  const patterns = [
    /xem thêm/i,
    /xem tất cả thông số/i,
    /thông số kỹ thuật/i,
    /specification/i,
  ];

  for (const pattern of patterns) {
    if (page.isClosed()) return false;
    const buttons = page.getByRole('button', { name: pattern });
    const count = Math.min(await buttons.count(), 5);
    for (let index = 0; index < count; index += 1) {
      if (page.isClosed()) return false;
      try {
        await buttons.nth(index).click({ timeout: 3000 });
      } catch (error) {
        if (page.isClosed()) return false;
      }
    }
  }
  return !page.isClosed();
};

const renderPage = async url => {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  let baselineHtml = '';
  let page;
  try {
    page = await browser.newPage({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    });
    try {
      await page.goto(url, { waitUntil: 'commit', timeout: NAVIGATION_TIMEOUT_MS });
    } catch (error) {
      if (!isNavigationTimeout(error)) throw error;
      return await page.content().catch(() => '');
    }
    await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
    await page.waitForSelector('.news-html-content, h1, h3', { timeout: 10000 }).catch(() => {});
    baselineHtml = await page.content();
    if (!await clickExpandableButtons(page)) return baselineHtml;
    await page.waitForTimeout(500);
    return page.isClosed() ? baselineHtml : await page.content();
  } catch (error) {
    if (!baselineHtml && page && !page.isClosed()) {
      baselineHtml = await page.content().catch(() => '');
    }
    if (baselineHtml) return baselineHtml;
    throw error;
  } finally {
    await browser.close().catch(() => {});
  }
};

const url = process.argv[2];
if (!url) {
  console.error('Missing product URL');
  process.exit(2);
}

renderPage(url)
  .then(html => process.stdout.write(html))
  .catch(error => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
