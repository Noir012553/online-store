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

const readPositiveInt = (name, fallback) => {
  const value = Number.parseInt(process.env[name], 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

const SCRAPER_CONFIG = Object.freeze({
  navigationTimeoutMs: readPositiveInt('SCRAPER_NAVIGATION_TIMEOUT_MS', 15000),
  domContentLoadedTimeoutMs: readPositiveInt('SCRAPER_DOMCONTENTLOADED_TIMEOUT_MS', 3000),
  selectorTimeoutMs: readPositiveInt('SCRAPER_SELECTOR_TIMEOUT_MS', 7000),
  expandableClickTimeoutMs: readPositiveInt('SCRAPER_EXPANDABLE_CLICK_TIMEOUT_MS', 2000),
  expandableSettleMs: readPositiveInt('SCRAPER_EXPANDABLE_SETTLE_MS', 300),
});

const isNavigationTimeout = error => /timeout|ERR_(?:TIMED_OUT|CONNECTION_TIMED_OUT)/i.test(
  String(error?.message || error),
);

const getPageContent = async page => {
  if (!page || page.isClosed()) return '';
  return page.content().catch(() => '');
};

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
        await buttons.nth(index).click({ timeout: SCRAPER_CONFIG.expandableClickTimeoutMs });
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
    await page.route('**/*', route => {
      if (['image', 'media', 'font'].includes(route.request().resourceType())) {
        return route.abort();
      }
      return route.continue();
    });
    try {
      await page.goto(url, { waitUntil: 'commit', timeout: SCRAPER_CONFIG.navigationTimeoutMs });
    } catch (error) {
      if (!isNavigationTimeout(error)) throw error;
      return getPageContent(page);
    }
    await page.waitForLoadState('domcontentloaded', {
      timeout: SCRAPER_CONFIG.domContentLoadedTimeoutMs,
    }).catch(() => {});
    await page.waitForSelector('.news-html-content, h1, h3', {
      timeout: SCRAPER_CONFIG.selectorTimeoutMs,
    }).catch(() => {});
    baselineHtml = await getPageContent(page);
    if (!await clickExpandableButtons(page)) return baselineHtml;
    await page.waitForTimeout(SCRAPER_CONFIG.expandableSettleMs);
    return getPageContent(page) || baselineHtml;
  } catch (error) {
    if (!baselineHtml) baselineHtml = await getPageContent(page);
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
