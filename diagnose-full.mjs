import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

// 收集信息
const errors = [];
const warnings = [];
const networkErrors = [];

page.on('console', msg => {
  if (msg.type() === 'error') errors.push(msg.text());
  if (msg.type() === 'warning') warnings.push(msg.text());
});
page.on('pageerror', err => errors.push(err.message));
page.on('requestfailed', req => networkErrors.push(`${req.url()} - ${req.failure()?.errorText}`));

// ===== 测试 1：首页加载 =====
console.log('=== 测试 1：首页加载 ===');
const start = Date.now();
const resp = await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 45000 });
const loadTime = Date.now() - start;

await page.waitForTimeout(5000);

const domInfo = await page.evaluate(() => {
  const next = document.getElementById('__next');
  const hasNextRoot = !!next;
  const hasReactFiber = next ? Object.keys(next).some(k => k.startsWith('__reactFiber') || k.startsWith('__reactProps')) : false;
  const innerHtml = document.body.innerHTML;
  return {
    hasNextRoot,
    hasReactFiber,
    hasLoadingSpinner: innerHtml.includes('spinner') || innerHtml.includes('zen-spinner'),
    hasLoginForm: innerHtml.includes('login') || innerHtml.includes('password') || innerHtml.includes('username'),
    pageTitle: document.title,
  };
});
const bodyText = await page.textContent('body');
const currentUrl = page.url();
const respStatus = resp?.status();

console.log(JSON.stringify({
  test: 'homepage',
  status: respStatus,
  loadTime: `${loadTime}ms`,
  url: currentUrl,
  bodyTextLength: bodyText.length,
  ...domInfo,
}, null, 2));

// ===== 测试 2：Login API 测试 =====
console.log('');
console.log('=== 测试 2：Login API 测试 ===');

const apiContext = page.request;
const apiResp = await apiContext.post('http://localhost:3000/api/auth/login', {
  data: { username: 'admin', password: 'umami' },
  headers: { 'Content-Type': 'application/json' }
});
const loginData = await apiResp.json();
console.log(JSON.stringify({
  test: 'login-api',
  status: apiResp.status(),
  hasToken: !!loginData.token,
  hasUser: !!loginData.user,
  tokenPrefix: loginData.token ? loginData.token.substring(0, 20) + '...' : null,
}, null, 2));

// ===== 测试 3：Screenshot =====
await page.screenshot({ path: '/tmp/homepage-state.png', fullPage: true });
console.log(`Screenshot saved: /tmp/homepage-state.png`);

// ===== 测试 4：错误汇总 =====
console.log('');
console.log('=== 测试 4：错误汇总 ===');
console.log(JSON.stringify({
  consoleErrors: errors,
  consoleWarnings: warnings,
  networkErrors,
}, null, 2));

await browser.close();
